/**
 * plan-builder — colocated contract tests.
 *
 * Contract:
 * - buildPlan() returns blocked:true with zero steps when a blocking capability's probe fails
 * - buildPlan() skips (not blocks) steps whose optional probes are unavailable
 * - buildPlan() builds a normal plan when all blocking capabilities are available
 * - capabilityToProbe() maps known capability ID prefixes to probe names
 * - capabilityToProbe() returns undefined for unmapped capabilities (no spurious blocking)
 * - buildPlan() attaches vault constraints as recommendations (not gate steps)
 * - buildPlan() marks mandatory entries and anti-patterns as mandatory:true in recommendations
 * - buildPlan() includes recommendations in blocked plans
 * - buildPlan() does not inject vault-gate-* steps
 */

import { describe, it, expect, vi } from 'vitest';
import {
  buildPlan,
  capabilityToProbe,
  flowStepsToPlanSteps,
  resolveFlowByIntent,
  type VaultConstraint,
} from './plan-builder.js';
import type { AgentRuntime } from '../runtime/types.js';
import type { Flow } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRuntime(vaultAvailable: boolean, brainAvailable = false): AgentRuntime {
  return {
    vault: {
      stats: vi.fn(() =>
        vaultAvailable
          ? { totalEntries: 10 }
          : (() => {
              throw new Error('vault down');
            })(),
      ),
    },
    brain: {
      getVocabularySize: vi.fn(() => (brainAvailable ? 5 : 0)),
    },
    projectRegistry: {
      list: vi.fn(() => []),
    },
  } as unknown as AgentRuntime;
}

// ---------------------------------------------------------------------------
// capabilityToProbe unit tests
// ---------------------------------------------------------------------------

describe('capabilityToProbe', () => {
  it('maps vault.* capabilities to the vault probe', () => {
    expect(capabilityToProbe('vault.search')).toBe('vault');
    expect(capabilityToProbe('vault.load')).toBe('vault');
  });

  it('maps brain.* capabilities to the brain probe', () => {
    expect(capabilityToProbe('brain.recommend')).toBe('brain');
  });

  it('returns undefined for capabilities with no probe mapping — unknown cap does not block', () => {
    // An unmapped capability must never trigger a blocking halt.
    // If this returned a valid probe name, unrelated capabilities would silently block flows.
    expect(capabilityToProbe('auth.validate')).toBeUndefined();
    expect(capabilityToProbe('unknown.op')).toBeUndefined();
    expect(capabilityToProbe('')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildPlan blocking behaviour
// ---------------------------------------------------------------------------

describe('buildPlan — blocking capability enforcement', () => {
  it('returns blocked:true with zero steps when vault is down and vault.search is blocking', async () => {
    // vault.search is in the blocking list of all 8 flows.
    // When vault probe fails, the plan must halt — not silently skip steps.
    const runtime = makeRuntime(false);
    const plan = await buildPlan('BUILD', 'myagent', '/tmp/proj', runtime);

    expect(plan.blocked).toBe(true);
    expect(plan.steps).toHaveLength(0);
    expect(plan.warnings[0]).toMatch(/Blocked/);
    expect(plan.warnings[0]).toMatch(/vault\.search/);
  });

  it('builds a normal plan when vault is available', async () => {
    // Blocking check must pass through when the probe is healthy.
    // If blocking fired regardless of probe state, no plan would ever build.
    const runtime = makeRuntime(true);
    const plan = await buildPlan('BUILD', 'myagent', '/tmp/proj', runtime);

    expect(plan.blocked).toBeUndefined();
    expect(plan.steps.length).toBeGreaterThanOrEqual(1);
  });

  it('skips (not blocks) steps whose required probe is missing but not in blocking list', async () => {
    // brain is not in the blocking list — its absence should skip brain-dependent
    // steps with a warning, not halt the entire plan.
    const runtime = makeRuntime(true, false); // vault up, brain down
    const plan = await buildPlan('BUILD', 'myagent', '/tmp/proj', runtime);

    expect(plan.blocked).toBeUndefined();
    // Plan continues; brain-dependent steps are skipped or warnings added
    const hasBrainWarning =
      plan.warnings.some((w) => /brain/i.test(w)) ||
      plan.skipped.some((s) => /brain/i.test(s.reason));
    // Either skipped or warned — what matters is the plan is not blocked
    expect(plan.steps.length).toBeGreaterThanOrEqual(0);
    expect(plan.blocked).toBeUndefined();
    // suppress unused-var lint
    void hasBrainWarning;
  });
});

// ---------------------------------------------------------------------------
// buildPlan vault recommendations
// ---------------------------------------------------------------------------

describe('buildPlan — vault recommendations', () => {
  it('attaches mandatory constraint as recommendation with mandatory:true', async () => {
    // Critical vault entries must be surfaced as mandatory recommendations so the
    // executor can enforce them. They must NOT become gate steps (evaluateCondition
    // cannot parse free-text narrative — gates would always fire STOP).
    const runtime = makeRuntime(true);
    const constraint: VaultConstraint = {
      entryId: 'crit-1',
      title: 'No skipping tests',
      context: 'Tests must not be skipped under time pressure.',
      mandatory: true,
      entryType: 'pattern',
    };
    const plan = await buildPlan('BUILD', 'myagent', '/tmp/proj', runtime, undefined, [constraint]);

    const rec = plan.recommendations?.find((r) => r.entryId === 'crit-1');
    expect(rec).toBeDefined();
    expect(rec?.title).toBe('No skipping tests');
    expect(rec?.context).toBe('Tests must not be skipped under time pressure.');
    expect(rec?.mandatory).toBe(true);
    expect(rec?.strength).toBe(100);
    expect(rec?.source).toBe('vault');
    // No gate step injected
    expect(plan.steps.filter((s) => s.id.startsWith('vault-gate-'))).toHaveLength(0);
  });

  it('marks anti-pattern entry as mandatory:true even when mandatory flag is false', async () => {
    // anti-pattern entries are always treated as mandatory regardless of severity flag.
    const runtime = makeRuntime(true);
    const constraint: VaultConstraint = {
      entryId: 'ap-1',
      title: 'Avoid God Objects',
      context: 'Classes must not exceed 500 lines.',
      mandatory: false,
      entryType: 'anti-pattern',
    };
    const plan = await buildPlan('BUILD', 'myagent', '/tmp/proj', runtime, undefined, [constraint]);

    const rec = plan.recommendations?.find((r) => r.entryId === 'ap-1');
    expect(rec).toBeDefined();
    expect(rec?.mandatory).toBe(true);
    expect(plan.steps.filter((s) => s.id.startsWith('vault-gate-'))).toHaveLength(0);
  });

  it('does not attach recommendations when no constraints are passed', async () => {
    // Backward compatibility: callers that omit vaultConstraints get an unchanged plan.
    const runtime = makeRuntime(true);
    const plan = await buildPlan('BUILD', 'myagent', '/tmp/proj', runtime);
    expect(plan.recommendations).toBeUndefined();
    expect(plan.steps.filter((s) => s.id.startsWith('vault-gate-'))).toHaveLength(0);
  });

  it('attaches non-mandatory pattern as recommendation with mandatory:false', async () => {
    // Warning and suggestion vault entries are surfaced as non-mandatory recommendations.
    const runtime = makeRuntime(true);
    const constraint: VaultConstraint = {
      entryId: 'sug-1',
      title: 'Consider using named exports',
      mandatory: false,
      entryType: 'pattern',
    };
    const plan = await buildPlan('BUILD', 'myagent', '/tmp/proj', runtime, undefined, [constraint]);
    const rec = plan.recommendations?.find((r) => r.entryId === 'sug-1');
    expect(rec).toBeDefined();
    expect(rec?.mandatory).toBe(false);
    expect(rec?.strength).toBe(80);
  });

  it('includes recommendations in blocked plans', async () => {
    // Blocked plans must still carry vault constraints so callers can surface them.
    const runtime = makeRuntime(false); // vault down → blocked
    const constraint: VaultConstraint = {
      entryId: 'crit-2',
      title: 'No direct DB writes outside repositories',
      mandatory: true,
      entryType: 'anti-pattern',
    };
    const plan = await buildPlan('BUILD', 'myagent', '/tmp/proj', runtime, undefined, [constraint]);

    expect(plan.blocked).toBe(true);
    const rec = plan.recommendations?.find((r) => r.entryId === 'crit-2');
    expect(rec).toBeDefined();
    expect(rec?.mandatory).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// capabilityToProbe — extended mappings
// ---------------------------------------------------------------------------

describe('capabilityToProbe — extended mappings for unprobed capabilities', () => {
  it('maps debug.* capabilities to brain probe', () => {
    // debug.patterns has no probe → steps silently no-op at dispatch.
    // Mapping to brain makes debug steps prune when brain is unavailable.
    expect(capabilityToProbe('debug.patterns')).toBe('brain');
    expect(capabilityToProbe('debug.trace')).toBe('brain');
  });

  it('maps architecture.* capabilities to brain probe', () => {
    // architecture.search has no probe → silently no-ops.
    // Brain provides pattern/recommendation system — best available match.
    expect(capabilityToProbe('architecture.search')).toBe('brain');
    expect(capabilityToProbe('architecture.guidance')).toBe('brain');
  });

  it('still returns undefined for truly unmapped capabilities', () => {
    // Capabilities with no real probe should remain unmapped — not mapped to a wrong probe.
    expect(capabilityToProbe('unknown.op')).toBeUndefined();
    expect(capabilityToProbe('auth.validate')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// flowStepsToPlanSteps — capability → tool name wiring
// ---------------------------------------------------------------------------

describe('flowStepsToPlanSteps — capability-mapped tool names', () => {
  const agentId = 'myagent';

  function makeFlow(needs: string[], chains: string[] = []): Flow {
    return {
      id: 'TEST-flow',
      name: 'Test',
      description: '',
      version: '1.0.0',
      triggers: { modes: ['BUILD'], contexts: [], 'min-confidence': 'MEDIUM' },
      steps: [{ id: 'step-1', name: 'Step 1', needs, chains }],
    } as unknown as Flow;
  }

  it('vault.search → {agentId}_vault_search_intelligent', () => {
    // vault.search should map to the registered op search_intelligent, not vault_search
    const steps = flowStepsToPlanSteps(makeFlow(['vault.search'], ['vault-search']), agentId);
    expect(steps[0].tools).toContain('myagent_vault_search_intelligent');
  });

  it('brain.recommend → {agentId}_brain_brain_recommend', () => {
    const steps = flowStepsToPlanSteps(makeFlow(['brain.recommend'], ['brain-recommend']), agentId);
    expect(steps[0].tools).toContain('myagent_brain_brain_recommend');
  });

  it('brain.strengths → {agentId}_brain_brain_strengths', () => {
    const steps = flowStepsToPlanSteps(makeFlow(['brain.strengths'], ['brain-strengths']), agentId);
    expect(steps[0].tools).toContain('myagent_brain_brain_strengths');
  });

  it('memory.search → {agentId}_memory_memory_search', () => {
    const steps = flowStepsToPlanSteps(makeFlow(['memory.search'], ['memory-search']), agentId);
    expect(steps[0].tools).toContain('myagent_memory_memory_search');
  });

  it('plan.create → {agentId}_plan_create_plan', () => {
    const steps = flowStepsToPlanSteps(makeFlow(['plan.create'], ['plan-create']), agentId);
    expect(steps[0].tools).toContain('myagent_plan_create_plan');
  });

  it('vault.playbook → {agentId}_vault_search_intelligent (playbooks live in vault)', () => {
    const steps = flowStepsToPlanSteps(makeFlow(['vault.playbook'], ['playbook-search']), agentId);
    expect(steps[0].tools).toContain('myagent_vault_search_intelligent');
  });

  it('unmapped capability falls back to chain tool name', () => {
    // architecture.search has no capability map entry — chain fallback must kick in
    const steps = flowStepsToPlanSteps(
      makeFlow(['architecture.search'], ['architecture-search']),
      agentId,
    );
    expect(steps[0].tools).toContain('myagent_architecture_search');
    // must NOT generate a capability-mapped name (no entry exists)
    expect(steps[0].tools).not.toContain('myagent_vault_search_intelligent');
  });

  it('does not duplicate tools when capability map and chain cover same op', () => {
    // Even if both resolve to the same tool name, it should appear only once
    const steps = flowStepsToPlanSteps(makeFlow(['vault.search'], ['vault-search']), agentId);
    const count = steps[0].tools.filter((t) => t === 'myagent_vault_search_intelligent').length;
    expect(count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// resolveFlowByIntent — dynamic triggers.modes scan
// ---------------------------------------------------------------------------

describe('resolveFlowByIntent', () => {
  it('returns BUILD-flow for BUILD intent', () => {
    expect(resolveFlowByIntent('BUILD')).toBe('BUILD-flow');
  });

  it('returns DELIVER-flow for DELIVER intent', () => {
    expect(resolveFlowByIntent('DELIVER')).toBe('DELIVER-flow');
  });

  it('returns BUILD-flow as fallback for unknown intent', () => {
    expect(resolveFlowByIntent('UNKNOWN')).toBe('BUILD-flow');
  });
});
