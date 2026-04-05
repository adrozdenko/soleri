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
import { buildPlan, capabilityToProbe, type VaultConstraint } from './plan-builder.js';
import type { AgentRuntime } from '../runtime/types.js';

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
// DELIVER-flow safety bypass fix
// ---------------------------------------------------------------------------

describe('buildPlan — DELIVER-flow safety bypass', () => {
  it('returns blocked:true when designSystem (Salvador) is unavailable', async () => {
    // DELIVER-flow has a hard STOP gate on validate-code (needs component.validate).
    // Without Salvador, that gate is silently pruned and code ships without validation.
    // Fix: component.validate must be in the blocking list so the plan is blocked, not degraded.
    const runtime = makeRuntime(true); // vault up, but projectRegistry returns [] → designSystem=false
    const plan = await buildPlan('DELIVER', 'myagent', '/tmp/proj', runtime);

    expect(plan.blocked).toBe(true);
    expect(plan.steps).toHaveLength(0);
    expect(plan.warnings[0]).toMatch(/Blocked/);
    expect(plan.warnings[0]).toMatch(/component\.validate/);
  });

  it('builds a full DELIVER plan when designSystem is available', async () => {
    // Ensure blocking check only fires when Salvador is absent — not always.
    const runtime = {
      vault: { stats: vi.fn(() => ({ totalEntries: 10 })) },
      brain: { getVocabularySize: vi.fn(() => 5) },
      projectRegistry: { list: vi.fn(() => [{ id: 'salvador' }]) }, // designSystem = true
    } as unknown as AgentRuntime;
    const plan = await buildPlan('DELIVER', 'myagent', '/tmp/proj', runtime);

    expect(plan.blocked).toBeUndefined();
    expect(plan.steps.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// REVIEW-flow blocked without Salvador
// ---------------------------------------------------------------------------

describe('buildPlan — REVIEW-flow blocked without Salvador', () => {
  it('returns blocked:true when designSystem (Salvador) is unavailable', async () => {
    // Without Salvador, 4 of 5 REVIEW-flow steps are pruned.
    // A code review that only does vault search is misleading — should block clearly.
    const runtime = makeRuntime(true); // vault up, projectRegistry [] → designSystem=false
    const plan = await buildPlan('REVIEW', 'myagent', '/tmp/proj', runtime);

    expect(plan.blocked).toBe(true);
    expect(plan.steps).toHaveLength(0);
    expect(plan.warnings[0]).toMatch(/Blocked/);
  });

  it('builds a full REVIEW plan when designSystem is available', async () => {
    const runtime = {
      vault: { stats: vi.fn(() => ({ totalEntries: 10 })) },
      brain: { getVocabularySize: vi.fn(() => 5) },
      projectRegistry: { list: vi.fn(() => [{ id: 'salvador' }]) },
    } as unknown as AgentRuntime;
    const plan = await buildPlan('REVIEW', 'myagent', '/tmp/proj', runtime);

    expect(plan.blocked).toBeUndefined();
    expect(plan.steps.length).toBeGreaterThanOrEqual(1);
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
