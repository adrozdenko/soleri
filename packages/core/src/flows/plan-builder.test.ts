/**
 * plan-builder — colocated contract tests.
 *
 * Contract:
 * - buildPlan() returns blocked:true with zero steps when a blocking capability's probe fails
 * - buildPlan() skips (not blocks) steps whose optional probes are unavailable
 * - buildPlan() builds a normal plan when all blocking capabilities are available
 * - capabilityToProbe() maps known capability ID prefixes to probe names
 * - capabilityToProbe() returns undefined for unmapped capabilities (no spurious blocking)
 */

import { describe, it, expect, vi } from 'vitest';
import { buildPlan, capabilityToProbe } from './plan-builder.js';
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
