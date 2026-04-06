/**
 * Plan builder — converts intent + flow + probes into an OrchestrationPlan.
 *
 * TODO(scoring): Flow YAML files previously declared scoring.weights + formula blocks.
 * These were removed as dead code — buildPlan() and FlowExecutor never computed them.
 * Wiring up flow-level scoring requires: (1) reading weights from YAML, (2) aggregating
 * step outputs in FlowExecutor, (3) emitting a plan-level score in OrchestrationPlan.
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
import { loadFlowById, loadAllFlows } from './loader.js';
import { runProbes } from './probes.js';
import { detectContext, applyContextOverrides } from './context-router.js';
import { chainToCapability } from '../capabilities/index.js';
import type { CapabilityRegistry } from '../capabilities/index.js';
import { capabilityToToolName } from './capability-op-map.js';

// ---------------------------------------------------------------------------
// Intent → Flow mapping
// ---------------------------------------------------------------------------

/**
 * Dynamically resolve a flow ID by scanning each flow's `triggers.modes` array.
 * Falls back to `'BUILD-flow'` when no flow declares the given intent.
 */
export function resolveFlowByIntent(intent: string, flowsDir: string): string {
  const flows = loadAllFlows(flowsDir);
  const upper = intent.toUpperCase();
  const match = flows.find((f) => (f.triggers?.modes ?? []).some((m) => m.toUpperCase() === upper));
  return match?.id ?? 'BUILD-flow';
}

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
  if (lower.startsWith('session')) return 'sessionStore';
  if (lower.startsWith('test')) return 'test';
  // error-pattern-search and architecture-search rely on brain pattern/recommendation system
  if (lower.startsWith('error-pattern') || lower.startsWith('architecture')) return 'brain';
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
  capabilityMap?: Record<string, { facade: string; op: string }>,
): PlanStep[] {
  return flow.steps.map((step) => {
    // Priority 1: capability-mapped tools from needs: (correct registered op names)
    const capabilityTools: string[] = [];
    for (const capId of step.needs ?? []) {
      const toolName = capabilityToToolName(capId, agentId, capabilityMap);
      if (toolName) capabilityTools.push(toolName);
    }
    // Priority 2: chain tools as fallback for unmapped capabilities
    const chainTools = (step.chains ?? []).map((c) => chainToToolName(c, agentId));
    // Merge with deduplication — capability-mapped names take priority
    const tools = [...new Set([...capabilityTools, ...chainTools])];

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
  if (capId.startsWith('session.')) return 'sessionStore';
  // debug.* and architecture.* map to brain — both rely on brain pattern/recommendation system.
  // When brain is unavailable these steps cannot provide meaningful output.
  if (capId.startsWith('debug.') || capId.startsWith('architecture.')) return 'brain';
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
  probeNames?: string[],
  capabilityMap?: Record<string, { facade: string; op: string }>,
): Promise<OrchestrationPlan> {
  const normalizedIntent = intent.toUpperCase();
  const flowsDir = runtime.config?.flowsDir;

  if (!flowsDir) {
    return {
      planId: randomUUID(),
      intent: normalizedIntent,
      flowId: 'unknown',
      steps: [],
      skipped: [],
      epilogue: [],
      warnings: [
        "No flows directory configured. Set runtime.config.flowsDir to the agent's flows/ directory.",
      ],
      summary: prompt ?? `${normalizedIntent} plan blocked`,
      estimatedTools: 0,
      blocked: true,
      context: {
        intent: normalizedIntent,
        probes: {
          vault: false,
          brain: false,
          sessionStore: false,
          projectRules: false,
          active: false,
          test: false,
        },
        entities: { components: [], actions: [] },
        projectPath,
      },
    };
  }

  const flowId = resolveFlowByIntent(normalizedIntent, flowsDir);
  const flow = loadFlowById(flowId, flowsDir);

  const probes = await runProbes(runtime, projectPath, probeNames);

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

    let allSteps = flowStepsToPlanSteps(flow, agentId, undefined, capabilityMap);

    // Apply context-sensitive chain overrides (inject, skip, substitute) before pruning.
    if (contexts.length > 0) {
      allSteps = applyContextOverrides(allSteps, contexts, flowId, agentId);
    }

    const pruneResult = pruneSteps(allSteps, probes);
    steps = pruneResult.kept;
    skipped = pruneResult.skipped;

    if (pruneResult.skipped.length > 0) {
      const missingProbes = [
        ...new Set(
          pruneResult.skipped.flatMap(
            (s) =>
              (s as { reason?: string }).reason
                ?.match(/Missing capabilities: (.+)/)?.[1]
                ?.split(', ') ?? [],
          ),
        ),
      ];
      const majorityPruned = pruneResult.skipped.length > allSteps.length / 2;
      const severityPrefix = majorityPruned
        ? `⚠️  ${pruneResult.skipped.length} of ${allSteps.length} flow steps pruned`
        : `${pruneResult.skipped.length} step(s) skipped`;
      const capNote =
        missingProbes.length > 0
          ? ` — missing: ${missingProbes.join(', ')}. Connect the required subsystem to unlock these steps.`
          : ' due to missing capabilities.';
      warnings.push(`${severityPrefix}${capNote}`);
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
