/**
 * Tests for capability probes — including the new agent-declared probe filtering
 * that will be introduced in task 2 of plan-1775482177429-3rseb0.
 *
 * The `agent-declared probes` describe block is intentionally red:
 * `runProbes` does not yet accept a `probeNames` filter argument.
 */

import { describe, it, expect, vi } from 'vitest';
import { runProbes } from './probes.js';
import type { AgentRuntime } from '../runtime/types.js';

// ---------------------------------------------------------------------------
// Minimal runtime stub
// ---------------------------------------------------------------------------

function makeRuntime(overrides: Partial<AgentRuntime> = {}): AgentRuntime {
  return {
    vault: { stats: vi.fn().mockReturnValue({ totalEntries: 5 }) },
    brain: { getVocabularySize: vi.fn().mockReturnValue(10) },
    projectRegistry: { list: vi.fn().mockReturnValue([]) },
    ...overrides,
  } as unknown as AgentRuntime;
}

// ---------------------------------------------------------------------------
// Existing behavior — no filter
// ---------------------------------------------------------------------------

describe('runProbes', () => {
  it('returns all probe results when called without filter', async () => {
    const runtime = makeRuntime();
    const results = await runProbes(runtime, '/tmp/no-such-path');

    expect(typeof results.vault).toBe('boolean');
    expect(typeof results.brain).toBe('boolean');
    expect(typeof results.designSystem).toBe('boolean');
    expect(typeof results.sessionStore).toBe('boolean');
    expect(typeof results.projectRules).toBe('boolean');
    expect(typeof results.active).toBe('boolean');
    expect(typeof results.test).toBe('boolean');
  });

  it('vault probe is true when vault.stats returns totalEntries >= 0', async () => {
    const runtime = makeRuntime();
    const results = await runProbes(runtime, '/tmp/no-such-path');
    expect(results.vault).toBe(true);
  });

  it('brain probe is true when brain.getVocabularySize returns > 0', async () => {
    const runtime = makeRuntime();
    const results = await runProbes(runtime, '/tmp/no-such-path');
    expect(results.brain).toBe(true);
  });

  it('active probe is always true', async () => {
    const runtime = makeRuntime();
    const results = await runProbes(runtime, '/tmp/no-such-path');
    expect(results.active).toBe(true);
  });

  it('sessionStore probe is always true', async () => {
    const runtime = makeRuntime();
    const results = await runProbes(runtime, '/tmp/no-such-path');
    expect(results.sessionStore).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Agent-declared probes — NEW behavior (failing until task 2 is implemented)
  // ---------------------------------------------------------------------------

  describe('agent-declared probes', () => {
    it('only runs vault and brain probes when probeNames = [vault, brain]', async () => {
      const runtime = makeRuntime();

      // This call signature does not exist yet — runProbes(runtime, path, probeNames)
      // It will fail to type-check / throw at runtime until task 2 adds the parameter.
      const results = await (
        runProbes as (
          runtime: AgentRuntime,
          projectPath: string,
          probeNames: string[],
        ) => Promise<Record<string, boolean>>
      )(runtime, '/tmp/no-such-path', ['vault', 'brain']);

      expect(results['vault']).toBe(true);
      expect(results['brain']).toBe(true);

      // Probes NOT in the filter list must be false (skipped)
      expect(results['designSystem']).toBe(false);
      expect(results['sessionStore']).toBe(false);
      expect(results['projectRules']).toBe(false);
      expect(results['active']).toBe(false);
      expect(results['test']).toBe(false);
    });

    it('runs all probes when probeNames is omitted (current behavior preserved)', async () => {
      const runtime = makeRuntime();
      // No probeNames argument — must behave identically to the existing API.
      const results = await runProbes(runtime, '/tmp/no-such-path');

      // All keys present and typed as boolean
      const keys = [
        'vault',
        'brain',
        'designSystem',
        'sessionStore',
        'projectRules',
        'active',
        'test',
      ];
      for (const key of keys) {
        expect(typeof results[key as keyof typeof results]).toBe('boolean');
      }
    });
  });
});
