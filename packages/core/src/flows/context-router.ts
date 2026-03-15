/**
 * Context-sensitive chain routing — the same intent routes to different chain
 * sequences depending on what's being built/fixed/reviewed.
 *
 * Building a Button follows a different workflow than building a Page layout.
 */

import type { PlanStep, ProbeName } from './types.js';
import { chainToToolName, chainToRequires } from './plan-builder.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContextOverride {
  /** Pattern to match against prompt or entities */
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
// Context override definitions
// ---------------------------------------------------------------------------

const BUILD_OVERRIDES: ContextOverride[] = [
  {
    match: /\b(button|icon|badge|chip|tag|pill)\b/i,
    context: 'small-component',
    skipSteps: ['get-architecture'],
    injectBefore: {
      validate: ['button-semantics-check'],
    },
  },
  {
    match: /\b(page|layout|dashboard|screen|view)\b/i,
    context: 'large-component',
    injectBefore: {
      validate: ['responsive-patterns'],
    },
    injectAfter: {
      validate: ['performance-check'],
    },
  },
  {
    match: /\b(form|input|select|textarea|checkbox|radio|switch|dropdown)\b/i,
    context: 'form-component',
    injectBefore: {
      validate: ['defensive-design', 'accessibility-precheck'],
    },
  },
  {
    match: /\b(modal|dialog|sheet|drawer|popover|overlay|tooltip)\b/i,
    context: 'container-component',
    injectBefore: {
      validate: ['container-pattern-check', 'dialog-patterns'],
    },
  },
];

const FIX_OVERRIDES: ContextOverride[] = [
  {
    match: /\b(styl(e|ing)|color|token|theme|palette|css)\b/i,
    context: 'design-fix',
    injectBefore: {
      validate: ['contrast-check', 'token-validation'],
    },
  },
  {
    match: /\b(accessib|a11y|aria|screen.?reader|keyboard|focus)\b/i,
    context: 'a11y-fix',
    injectBefore: {
      validate: ['accessibility-audit'],
    },
  },
];

const REVIEW_OVERRIDES: ContextOverride[] = [
  {
    match: /\b(pr|pull.?request|diff|merge)\b/i,
    context: 'pr-review',
    injectAfter: {
      'check-rules': ['review-pr-design'],
    },
  },
  {
    match: /\b(architecture|import|dependency|structure)\b/i,
    context: 'architecture-review',
    injectAfter: {
      'check-rules': ['check-architecture'],
    },
  },
];

/**
 * Registry mapping flow IDs to their context overrides.
 */
const FLOW_OVERRIDES: Record<string, ContextOverride[]> = {
  'BUILD-flow': BUILD_OVERRIDES,
  'FIX-flow': FIX_OVERRIDES,
  'REVIEW-flow': REVIEW_OVERRIDES,
};

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
): string[] {
  const contexts: string[] = [];
  const searchText = [prompt, ...entities.components, ...entities.actions].join(' ');

  // Check all flow overrides — a prompt might match contexts across flows
  for (const overrides of Object.values(FLOW_OVERRIDES)) {
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
): PlanStep[] {
  const overrides = FLOW_OVERRIDES[flowId];
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
export function getFlowOverrides(flowId: string): ContextOverride[] {
  return FLOW_OVERRIDES[flowId] ?? [];
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
