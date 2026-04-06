/**
 * probes — colocated contract tests.
 *
 * Contract:
 * - runProbes() runs all probes when no probeNames filter is provided
 * - runProbes() runs all probes when probeNames is an empty array
 * - runProbes() runs only the listed probes when probeNames is provided
 * - runProbes() sets skipped probes to false in the result
 * - runProbes() always returns a ProbeResults object with all keys present
 */

import { describe, it, expect, vi } from 'vitest';
import { runProbes } from './probes.js';
import type { AgentRuntime } from '../runtime/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRuntime(vaultAvailable = true): AgentRuntime {
  return {
    config: { agentId: 'test-agent' },
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
      getVocabularySize: vi.fn(() => 5),
    },
    projectRegistry: {
      list: vi.fn(() => []),
    },
  } as unknown as AgentRuntime;
}

const NON_EXISTENT_PATH = '/tmp/__soleri_probe_test_nonexistent__';

// ---------------------------------------------------------------------------
// backward-compatibility — no probeNames provided
// ---------------------------------------------------------------------------

describe('runProbes — no filter (backward compat)', () => {
  it('runs all probes and returns full ProbeResults when probeNames is omitted', async () => {
    const runtime = makeRuntime(true);
    const results = await runProbes(runtime, NON_EXISTENT_PATH);

    const keys: Array<keyof typeof results> = [
      'vault',
      'brain',
      'designSystem',
      'sessionStore',
      'projectRules',
      'active',
      'test',
    ];
    for (const key of keys) {
      expect(results).toHaveProperty(key);
      expect(typeof results[key]).toBe('boolean');
    }

    // vault probe should be true (vault available)
    expect(results.vault).toBe(true);
    // active and sessionStore are always true
    expect(results.active).toBe(true);
    expect(results.sessionStore).toBe(true);
  });

  it('runs all probes when probeNames is an empty array', async () => {
    const runtime = makeRuntime(true);
    const results = await runProbes(runtime, NON_EXISTENT_PATH, []);

    expect(results.vault).toBe(true);
    expect(results.active).toBe(true);
    expect(results.sessionStore).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// agent-declared probes
// ---------------------------------------------------------------------------

describe('agent-declared probes', () => {
  it('runs only the declared probes and sets others to false', async () => {
    const runtime = makeRuntime(true);
    const results = await runProbes(runtime, NON_EXISTENT_PATH, ['vault', 'active']);

    expect(results.vault).toBe(true);
    expect(results.active).toBe(true);

    // All non-declared probes must be false
    expect(results.brain).toBe(false);
    expect(results.designSystem).toBe(false);
    expect(results.sessionStore).toBe(false);
    expect(results.projectRules).toBe(false);
    expect(results.test).toBe(false);
  });

  it('returns all ProbeResults keys even when only one probe is declared', async () => {
    const runtime = makeRuntime(true);
    const results = await runProbes(runtime, NON_EXISTENT_PATH, ['sessionStore']);

    const keys: Array<keyof typeof results> = [
      'vault',
      'brain',
      'designSystem',
      'sessionStore',
      'projectRules',
      'active',
      'test',
    ];
    for (const key of keys) {
      expect(results).toHaveProperty(key);
    }

    expect(results.sessionStore).toBe(true);
    expect(results.vault).toBe(false);
    expect(results.brain).toBe(false);
    expect(results.active).toBe(false);
  });

  it('sets all probes to false when probeNames lists only unknown probe names', async () => {
    const runtime = makeRuntime(true);
    const results = await runProbes(runtime, NON_EXISTENT_PATH, ['nonexistent']);

    expect(results.vault).toBe(false);
    expect(results.brain).toBe(false);
    expect(results.designSystem).toBe(false);
    expect(results.sessionStore).toBe(false);
    expect(results.projectRules).toBe(false);
    expect(results.active).toBe(false);
    expect(results.test).toBe(false);
  });

  it('does not execute skipped probes — vault fn is never called when vault not in list', async () => {
    const runtime = makeRuntime(true);
    const results = await runProbes(runtime, NON_EXISTENT_PATH, ['active']);

    expect(results.active).toBe(true);
    expect(results.vault).toBe(false);
    // vault.stats should NOT have been called since vault was not in the list
    expect(runtime.vault.stats).not.toHaveBeenCalled();
  });

  it('runs multiple declared probes correctly', async () => {
    const runtime = makeRuntime(true);
    const results = await runProbes(runtime, NON_EXISTENT_PATH, [
      'vault',
      'brain',
      'sessionStore',
      'active',
    ]);

    expect(results.vault).toBe(true);
    expect(results.brain).toBe(true);
    expect(results.sessionStore).toBe(true);
    expect(results.active).toBe(true);

    expect(results.designSystem).toBe(false);
    expect(results.projectRules).toBe(false);
    expect(results.test).toBe(false);
  });
});
