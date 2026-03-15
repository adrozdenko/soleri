/**
 * Plan builder — converts intent + flow + probes into an OrchestrationPlan.
 */

import { randomUUID } from 'node:crypto';
import type { AgentRuntime } from '../runtime/types.js';
import type {
  Flow,
  PlanStep,
  SkippedStep,
  OrchestrationPlan,
  ProbeResults,
  ProbeName,
} from './types.js';
import { loadFlowById } from './loader.js';
import { runProbes } from './probes.js';
import { detectContext, applyContextOverrides } from './context-router.js';

// ---------------------------------------------------------------------------
// Intent → Flow mapping
// ---------------------------------------------------------------------------

export const INTENT_TO_FLOW: Record<string, string> = {
  BUILD: 'BUILD-flow',
  CREATE: 'BUILD-flow',
  FIX: 'FIX-flow',
  REVIEW: 'REVIEW-flow',
  PLAN: 'PLAN-flow',
  DESIGN: 'DESIGN-flow',
  ENHANCE: 'ENHANCE-flow',
  IMPROVE: 'ENHANCE-flow',
  EXPLORE: 'EXPLORE-flow',
  DELIVER: 'DELIVER-flow',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a chain name (e.g. "vault-search") to a tool name (e.g. "myagent_vault_search").
 */
export function chainToToolName(chain: string, agentId: string): string {
  return `${agentId}_${chain.replace(/-/g, '_')}`;
}

/**
 * Infer which probe capability a chain requires, or undefined if none.
 */
export function chainToRequires(chain: string): ProbeName | undefined {
  const lower = chain.toLowerCase();
  if (lower.startsWith('vault') || lower.startsWith('memory')) return 'vault';
  if (lower.startsWith('brain')) return 'brain';
  if (lower.startsWith('component') || lower.startsWith('token') || lower.startsWith('design'))
    return 'designSystem';
  if (lower.startsWith('session')) return 'sessionStore';
  // recommend-* and get-stack-* have no hard requirements
  if (lower.startsWith('recommend') || lower.startsWith('get-stack')) return undefined;
  return undefined;
}

/**
 * Convert flow steps into plan steps.
 */
export function flowStepsToPlanSteps(flow: Flow, agentId: string): PlanStep[] {
  return flow.steps.map((step) => {
    const tools = (step.chains ?? []).map((c) => chainToToolName(c, agentId));
    const requires: ProbeName[] = [];
    for (const chain of step.chains ?? []) {
      const req = chainToRequires(chain);
      if (req && !requires.includes(req)) requires.push(req);
    }

    const planStep: PlanStep = {
      id: step.id,
      name: step.name ?? step.id,
      tools,
      parallel: step.parallel ?? false,
      requires,
      status: 'pending',
    };

    if (step.gate) {
      const gate = step.gate;
      planStep.gate = {
        type: gate.type,
      };
      if ('condition' in gate && gate.condition) {
        planStep.gate.condition = gate.condition;
      }
      if ('min' in gate && gate.min !== undefined) {
        planStep.gate.min = gate.min;
      }
      if (gate['on-false']) {
        planStep.gate.onFail = {
          action: gate['on-false'].action,
          goto: gate['on-false'].goto,
          message: gate['on-false'].message,
        };
      }
    }

    return planStep;
  });
}

/**
 * Remove steps whose required capabilities are not available.
 */
export function pruneSteps(
  steps: PlanStep[],
  probes: ProbeResults,
): { kept: PlanStep[]; skipped: SkippedStep[] } {
  const kept: PlanStep[] = [];
  const skipped: SkippedStep[] = [];

  for (const step of steps) {
    const missingProbes = step.requires.filter((r) => !probes[r]);
    if (missingProbes.length > 0) {
      skipped.push({
        id: step.id,
        name: step.name,
        reason: `Missing capabilities: ${missingProbes.join(', ')}`,
      });
    } else {
      kept.push(step);
    }
  }

  return { kept, skipped };
}

/**
 * Build a full orchestration plan from intent, agent config, and runtime.
 */
export async function buildPlan(
  intent: string,
  agentId: string,
  projectPath: string,
  runtime: AgentRuntime,
  prompt?: string,
): Promise<OrchestrationPlan> {
  const normalizedIntent = intent.toUpperCase();
  const flowId = INTENT_TO_FLOW[normalizedIntent] ?? 'BUILD-flow';
  const flow = loadFlowById(flowId);

  const probes = await runProbes(runtime, projectPath);

  let steps: PlanStep[] = [];
  let skipped: SkippedStep[] = [];
  const warnings: string[] = [];

  if (flow) {
    let allSteps = flowStepsToPlanSteps(flow, agentId);

    // Context-sensitive chain routing: detect what's being built/fixed/reviewed
    // and apply chain overrides (inject, skip, substitute) before pruning.
    const entities = { components: [] as string[], actions: [] as string[] };
    const contexts = prompt ? detectContext(prompt, entities) : [];
    if (contexts.length > 0) {
      allSteps = applyContextOverrides(allSteps, contexts, flowId, agentId);
    }

    const pruneResult = pruneSteps(allSteps, probes);
    steps = pruneResult.kept;
    skipped = pruneResult.skipped;

    if (pruneResult.skipped.length > 0) {
      warnings.push(`${pruneResult.skipped.length} step(s) skipped due to missing capabilities.`);
    }
  } else {
    warnings.push(`Flow "${flowId}" not found — plan will have no steps.`);
  }

  if (!probes.vault) warnings.push('Vault unavailable — knowledge capture will be skipped.');
  if (!probes.brain) warnings.push('Brain has no vocabulary — recommendations may be limited.');

  const epilogue: string[] = [];
  if (probes.vault) epilogue.push('capture_knowledge');
  if (probes.sessionStore) epilogue.push('session_capture');

  return {
    planId: randomUUID(),
    intent: normalizedIntent,
    flowId,
    steps,
    skipped,
    epilogue,
    warnings,
    summary: prompt ?? `${normalizedIntent} plan with ${steps.length} step(s)`,
    estimatedTools: steps.reduce((acc, s) => acc + s.tools.length, 0),
    context: {
      intent: normalizedIntent,
      probes,
      entities: { components: [], actions: [] },
      projectPath,
    },
  };
}
