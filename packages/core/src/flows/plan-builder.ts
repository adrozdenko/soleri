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
  VaultRecommendation,
} from './types.js';
import { loadFlowById } from './loader.js';
import { runProbes } from './probes.js';
import { detectContext, applyContextOverrides } from './context-router.js';
import { chainToCapability } from '../capabilities/index.js';
import type { CapabilityRegistry } from '../capabilities/index.js';

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
  if (lower.startsWith('test')) return 'test';
  // recommend-* and get-stack-* have no hard requirements
  if (lower.startsWith('recommend') || lower.startsWith('get-stack')) return undefined;
  return undefined;
}

/**
 * Convert flow steps into plan steps.
 *
 * Resolution order for capability IDs:
 * 1. If the step has `needs:` (v2), use those capability IDs directly
 * 2. If the step only has `chains:` (v1), map via chainToCapability()
 * 3. chainToToolName() is still used for tool dispatch (fallback path)
 *
 * When an optional `registry` is provided, each resolved capability is
 * validated. Unavailable capabilities are recorded in the step's
 * `unavailableCapabilities` list (informational — pruning is separate).
 */
export function flowStepsToPlanSteps(
  flow: Flow,
  agentId: string,
  registry?: CapabilityRegistry,
): PlanStep[] {
  return flow.steps.map((step) => {
    // Tool names for dispatch fallback (always computed from chains)
    const tools = (step.chains ?? []).map((c) => chainToToolName(c, agentId));

    // Resolve capability IDs: prefer needs (v2), fall back to chains (v1)
    const capabilityIds: string[] = [];
    if (step.needs && step.needs.length > 0) {
      capabilityIds.push(...step.needs);
    } else if (step.chains) {
      for (const chain of step.chains) {
        const capId = chainToCapability(chain);
        if (capId && !capabilityIds.includes(capId)) {
          capabilityIds.push(capId);
        }
      }
    }

    // Probe-level requires (existing behavior, derived from chains)
    const requires: ProbeName[] = [];
    for (const chain of step.chains ?? []) {
      const req = chainToRequires(chain);
      if (req && !requires.includes(req)) requires.push(req);
    }

    // Validate capabilities against registry if provided
    const unavailableCapabilities: string[] = [];
    if (registry) {
      for (const capId of capabilityIds) {
        const resolved = registry.resolve(capId);
        if (!resolved.available) {
          unavailableCapabilities.push(capId);
        }
      }
    }

    const planStep: PlanStep = {
      id: step.id,
      name: step.name ?? step.id,
      tools,
      parallel: step.parallel ?? false,
      requires,
      output: step.output,
      status: 'pending',
    };

    // Attach capability metadata (non-breaking additions)
    if (capabilityIds.length > 0) {
      (planStep as PlanStep & { capabilities?: string[] }).capabilities = capabilityIds;
    }
    if (unavailableCapabilities.length > 0) {
      (planStep as PlanStep & { unavailableCapabilities?: string[] }).unavailableCapabilities =
        unavailableCapabilities;
    }

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
 * Map a capability ID (e.g. "vault.search") to the probe name that covers it.
 * Returns undefined for capability IDs that have no corresponding probe.
 */
export function capabilityToProbe(capId: string): ProbeName | undefined {
  if (capId.startsWith('vault.') || capId === 'vault') return 'vault';
  if (capId.startsWith('brain.') || capId === 'brain') return 'brain';
  if (capId.startsWith('design.') || capId.startsWith('component.') || capId.startsWith('token.'))
    return 'designSystem';
  if (capId.startsWith('session.')) return 'sessionStore';
  return undefined;
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
 * A vault entry that should influence plan structure.
 * critical severity OR anti-pattern type entries are surfaced as mandatory recommendations.
 */
export interface VaultConstraint {
  entryId: string;
  title: string;
  context?: string;
  mandatory: boolean;
  entryType?: 'pattern' | 'anti-pattern' | 'rule' | 'playbook';
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
  vaultConstraints: VaultConstraint[] = [],
): Promise<OrchestrationPlan> {
  const normalizedIntent = intent.toUpperCase();
  const flowId = INTENT_TO_FLOW[normalizedIntent] ?? 'BUILD-flow';
  const flow = loadFlowById(flowId);

  const probes = await runProbes(runtime, projectPath);

  // Map vault constraints to recommendations — surfaced to executor as knowledge context.
  // Anti-pattern entries are always mandatory regardless of the mandatory flag.
  const recommendations: VaultRecommendation[] = vaultConstraints.map((c) => ({
    entryId: c.entryId,
    title: c.title,
    ...(c.context ? { context: c.context } : {}),
    mandatory: c.mandatory || c.entryType === 'anti-pattern',
    entryType: c.entryType,
    source: 'vault' as const,
    strength: c.mandatory ? 100 : 80,
  }));

  // Detect context entities from prompt before any early returns — blocked plans
  // should still carry entity context so callers can surface useful information.
  const entities = { components: [] as string[], actions: [] as string[] };
  const contexts = prompt ? detectContext(prompt, entities) : [];

  let steps: PlanStep[] = [];
  let skipped: SkippedStep[] = [];
  const warnings: string[] = [];

  if (flow) {
    // Check blocking capabilities before pruning optional steps.
    // If any blocking capability maps to an unavailable probe, the plan cannot run.
    const blockingCaps = flow['on-missing-capability']?.blocking ?? [];
    const missingBlockers = blockingCaps.filter((capId) => {
      const probe = capabilityToProbe(capId);
      return probe !== undefined && !probes[probe];
    });

    if (missingBlockers.length > 0) {
      return {
        planId: randomUUID(),
        intent: normalizedIntent,
        flowId,
        steps: [],
        skipped: [],
        epilogue: [],
        warnings: [
          `Blocked: required capabilities unavailable — ${missingBlockers.join(', ')}. Resolve these before running this flow.`,
        ],
        summary: prompt ?? `${normalizedIntent} plan blocked`,
        estimatedTools: 0,
        blocked: true,
        ...(recommendations.length > 0 ? { recommendations } : {}),
        context: {
          intent: normalizedIntent,
          probes,
          entities,
          projectPath,
        },
      };
    }

    let allSteps = flowStepsToPlanSteps(flow, agentId);

    // Apply context-sensitive chain overrides (inject, skip, substitute) before pruning.
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
    ...(recommendations.length > 0 ? { recommendations } : {}),
    context: {
      intent: normalizedIntent,
      probes,
      entities,
      projectPath,
    },
  };
}
