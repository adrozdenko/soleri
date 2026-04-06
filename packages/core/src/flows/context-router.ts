/**
 * Context-sensitive chain routing — the same intent routes to different chain
 * sequences depending on what's being built/fixed/reviewed.
 *
 * Building a Button follows a different workflow than building a Page layout.
 *
 * Overrides are loaded from *.flow.yaml files (overrides: section) instead of
 * being hardcoded here. The default flows directory is the package's built-in
 * data/flows/ folder. Pass an explicit `flowsDir` to use a custom directory.
 */

import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import type { PlanStep, ProbeName } from './types.js';
import type { FlowContextOverride } from './types.js';
import { loadAllFlows } from './loader.js';
import { chainToToolName, chainToRequires } from './plan-builder.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContextOverride {
  /** Compiled regex to match against prompt or entities */
  match: RegExp;
  /** Context label */
  context: string;
  /** Chain substitutions: original chain → replacement chain */
  chainOverrides?: Record<string, string>;
  /** Additional chains to inject before specific steps */
  injectBefore?: Record<string, string[]>;
  /** Additional chains to inject after specific steps */
  injectAfter?: Record<string, string[]>;
  /** Steps to skip in this context */
  skipSteps?: string[];
}

// ---------------------------------------------------------------------------
// Default flows directory (package built-in data/flows/)
// ---------------------------------------------------------------------------

/**
 * Resolve the built-in data/flows directory relative to this source file.
 * Works in both dev (src/) and compiled (dist/) layouts because the relative
 * path from flows/ to data/flows/ is the same in both cases: ../../data/flows.
 */
function defaultFlowsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', 'data', 'flows');
}

// ---------------------------------------------------------------------------
// Data-driven override map
// ---------------------------------------------------------------------------

/**
 * Build the flow-overrides map by loading all *.flow.yaml files from the
 * given directory and converting YAML FlowContextOverride → runtime ContextOverride.
 *
 * The conversion compiles the `match` string into a RegExp using `matchFlags`
 * (defaulting to `'i'` for case-insensitive matching).
 */
export function getFlowOverridesMap(flowsDir?: string): Record<string, ContextOverride[]> {
  const dir = flowsDir ?? defaultFlowsDir();
  const flows = loadAllFlows(dir);
  const map: Record<string, ContextOverride[]> = {};

  for (const flow of flows) {
    if (!flow.overrides || flow.overrides.length === 0) continue;

    map[flow.id] = flow.overrides.map(
      (yamlOverride: FlowContextOverride): ContextOverride => (Object.assign({match:new RegExp(yamlOverride.match,yamlOverride.matchFlags??`i`),context:yamlOverride.context}, yamlOverride.chainOverrides?{chainOverrides:yamlOverride.chainOverrides}:{}, yamlOverride.injectBefore?{injectBefore:yamlOverride.injectBefore}:{}, yamlOverride.injectAfter?{injectAfter:yamlOverride.injectAfter}:{}, yamlOverride.skipSteps?{skipSteps:yamlOverride.skipSteps}:{})),
    );
  }

  return map;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect which contexts apply to a prompt and entity set.
 * Returns an array of matching context labels.
 */
export function detectContext(
  prompt: string,
  entities: { components: string[]; actions: string[] },
  flowsDir?: string,
): string[] {
  const contexts: string[] = [];
  const searchText = [prompt, ...entities.components, ...entities.actions].join(' ');
  const overridesMap = getFlowOverridesMap(flowsDir);

  // Check all flow overrides — a prompt might match contexts across flows
  for (const overrides of Object.values(overridesMap)) {
    for (const override of overrides) {
      if (override.match.test(searchText) && !contexts.includes(override.context)) {
        contexts.push(override.context);
      }
    }
  }

  return contexts;
}

/**
 * Apply context overrides to a set of plan steps: chain substitutions,
 * injections (before/after), and step skipping.
 */
export function applyContextOverrides(
  steps: PlanStep[],
  contexts: string[],
  flowId: string,
  agentId: string = 'agent',
  flowsDir?: string,
): PlanStep[] {
  const overridesMap = getFlowOverridesMap(flowsDir);
  const overrides = overridesMap[flowId];
  if (!overrides || contexts.length === 0) return steps;

  // Collect active overrides for the detected contexts
  const active = overrides.filter((o) => contexts.includes(o.context));
  if (active.length === 0) return steps;

  // Aggregate all skip, inject-before, inject-after, and chain overrides
  const skipSet = new Set<string>();
  const injectBefore = new Map<string, string[]>();
  const injectAfter = new Map<string, string[]>();
  const chainSubs = new Map<string, string>();

  for (const ov of active) {
    if (ov.skipSteps) ov.skipSteps.forEach((s) => skipSet.add(s));
    if (ov.injectBefore) {
      for (const [stepId, chains] of Object.entries(ov.injectBefore)) {
        const existing = injectBefore.get(stepId) ?? [];
        injectBefore.set(stepId, [...existing, ...chains]);
      }
    }
    if (ov.injectAfter) {
      for (const [stepId, chains] of Object.entries(ov.injectAfter)) {
        const existing = injectAfter.get(stepId) ?? [];
        injectAfter.set(stepId, [...existing, ...chains]);
      }
    }
    if (ov.chainOverrides) {
      for (const [from, to] of Object.entries(ov.chainOverrides)) {
        chainSubs.set(from, to);
      }
    }
  }

  const result: PlanStep[] = [];

  for (const step of steps) {
    // 1. Skip steps
    if (skipSet.has(step.id)) continue;

    // 2. Inject before
    const beforeChains = injectBefore.get(step.id);
    if (beforeChains) {
      result.push(buildInjectedStep(step.id, 'before', beforeChains, agentId));
    }

    // 3. Apply chain substitutions to existing step
    let processed = step;
    if (chainSubs.size > 0) {
      const newTools = step.tools.map((tool) => {
        for (const [from, to] of chainSubs) {
          const fromTool = chainToToolName(from, agentId);
          if (tool === fromTool) return chainToToolName(to, agentId);
        }
        return tool;
      });
      if (newTools.some((t, i) => t !== step.tools[i])) {
        processed = { ...step, tools: newTools };
      }
    }

    result.push(processed);

    // 4. Inject after
    const afterChains = injectAfter.get(step.id);
    if (afterChains) {
      result.push(buildInjectedStep(step.id, 'after', afterChains, agentId));
    }
  }

  return result;
}

/**
 * Get all registered context overrides for a flow (useful for introspection).
 */
export function getFlowOverrides(flowId: string, flowsDir?: string): ContextOverride[] {
  return getFlowOverridesMap(flowsDir)[flowId] ?? [];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a synthetic PlanStep from injected chains.
 */
function buildInjectedStep(
  anchorStepId: string,
  position: 'before' | 'after',
  chains: string[],
  agentId: string,
): PlanStep {
  const tools = chains.map((c) => chainToToolName(c, agentId));
  const requires: ProbeName[] = [];
  for (const chain of chains) {
    const req = chainToRequires(chain);
    if (req && !requires.includes(req)) requires.push(req);
  }

  return {
    id: `ctx-${position}-${anchorStepId}`,
    name: `Context: ${chains.join(', ')} (${position} ${anchorStepId})`,
    tools,
    parallel: chains.length > 1,
    requires,
    status: 'pending',
  };
}
