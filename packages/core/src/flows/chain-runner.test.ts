/**
 * ChainRunner — colocated contract tests.
 *
 * Contract:
 * - execute() runs steps sequentially, resolving $variable references between steps
 * - Gates pause (user-approval) or fail (auto-test) execution
 * - resume()/approve() continues from paused gate
 * - getInstance()/list() retrieve persisted state
 * - State persists to SQLite via PersistenceProvider
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChainRunner, type DispatchFn } from './chain-runner.js';
import type { ChainDef } from './chain-types.js';
import type { PersistenceProvider } from '../persistence/types.js';

// ---------------------------------------------------------------------------
// Mock persistence provider (in-memory)
// ---------------------------------------------------------------------------

function createMockProvider(): PersistenceProvider {
  const store = new Map<string, Record<string, unknown>>();

  return {
    backend: 'sqlite' as const,
    execSql: vi.fn(),
    run: vi.fn((sql: string, params?: unknown[]) => {
      if (sql.includes('INSERT OR REPLACE') && Array.isArray(params)) {
        store.set(params[0] as string, {
          id: params[0],
          chain_id: params[1],
          chain_name: params[2],
          status: params[3],
          current_step: params[4],
          paused_at_gate: params[5],
          input: params[6],
          context: params[7],
          step_outputs: params[8],
          steps_completed: params[9],
          total_steps: params[10],
          created_at: params[11],
          updated_at: params[12],
        });
      }
      return { changes: 1, lastInsertRowid: 1 };
    }),
    get: vi.fn((_sql: string, params?: unknown[]) => {
      if (Array.isArray(params)) {
        return store.get(params[0] as string) ?? undefined;
      }
      return undefined;
    }),
    all: vi.fn((_sql: string, _params?: unknown[]) => {
      return [...store.values()];
    }),
    transaction: vi.fn((fn) => fn()),
    ftsSearch: vi.fn(() => []),
    ftsRebuild: vi.fn(),
    close: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function twoStepChain(): ChainDef {
  return {
    id: 'test-chain',
    name: 'Test Chain',
    steps: [
      { id: 'step-1', op: 'vault_search', params: { query: 'test' }, output: 'search' },
      { id: 'step-2', op: 'brain_recommend', params: { context: '$search' } },
    ],
  };
}

function gatedChain(gate: 'user-approval' | 'auto-test'): ChainDef {
  return {
    id: 'gated-chain',
    steps: [
      { id: 'step-1', op: 'op-a', gate },
      { id: 'step-2', op: 'op-b' },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChainRunner', () => {
  let provider: PersistenceProvider;
  let runner: ChainRunner;

  beforeEach(() => {
    provider = createMockProvider();
    runner = new ChainRunner(provider);
  });

  it('initializes the chain_instances table on construction', () => {
    expect(provider.execSql).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS chain_instances'),
    );
  });

  describe('execute', () => {
    it('runs all steps to completion', async () => {
      const dispatch: DispatchFn = vi.fn(async () => ({ result: 'ok' }));
      const instance = await runner.execute(twoStepChain(), { q: 'hello' }, dispatch);

      expect(instance.status).toBe('completed');
      expect(instance.stepsCompleted).toBe(2);
      expect(instance.totalSteps).toBe(2);
      expect(instance.stepOutputs).toHaveLength(2);
    });

    it('stores step results in context for $variable resolution', async () => {
      const dispatch: DispatchFn = vi.fn(async (op) => {
        if (op === 'vault_search') return { items: ['a', 'b'] };
        return { recommendation: 'use-a' };
      });

      const instance = await runner.execute(twoStepChain(), {}, dispatch);

      expect(instance.context['step-1']).toEqual({ items: ['a', 'b'] });
      expect(instance.context['search']).toEqual({ items: ['a', 'b'] });
    });

    it('passes resolved $variable params to subsequent steps', async () => {
      const dispatch: DispatchFn = vi.fn(async (op) => {
        if (op === 'vault_search') return { found: true };
        return {};
      });

      await runner.execute(twoStepChain(), {}, dispatch);

      // Second call should have resolved $search to the first step's result
      expect(dispatch).toHaveBeenCalledTimes(2);
      const secondCallParams = (dispatch as ReturnType<typeof vi.fn>).mock.calls[1][1];
      expect(secondCallParams.context).toEqual({ found: true });
    });

    it('marks instance as failed when a step throws', async () => {
      const dispatch: DispatchFn = vi.fn(async () => {
        throw new Error('kaboom');
      });

      const instance = await runner.execute(twoStepChain(), {}, dispatch);

      expect(instance.status).toBe('failed');
      expect(instance.stepsCompleted).toBe(0);
      expect(instance.stepOutputs[0].status).toBe('failed');
    });

    it('starts from a specific step when startFromStep is provided', async () => {
      const dispatch: DispatchFn = vi.fn(async () => ({ ok: true }));
      const instance = await runner.execute(twoStepChain(), {}, dispatch, undefined, 'step-2');

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(instance.stepsCompleted).toBe(1);
    });

    it('assigns input to context.input', async () => {
      const dispatch: DispatchFn = vi.fn(async () => ({}));
      const input = { url: 'https://example.com' };
      const instance = await runner.execute(twoStepChain(), input, dispatch);

      expect(instance.context['input']).toEqual(input);
    });
  });

  describe('gates', () => {
    it('pauses on user-approval gate', async () => {
      const dispatch: DispatchFn = vi.fn(async () => ({ done: true }));
      const instance = await runner.execute(gatedChain('user-approval'), {}, dispatch);

      expect(instance.status).toBe('paused');
      expect(instance.pausedAtGate).toBe('step-1');
      expect(instance.stepsCompleted).toBe(1);
      // step-2 should NOT have been called
      expect(dispatch).toHaveBeenCalledTimes(1);
    });

    it('fails on auto-test gate when step returns error', async () => {
      const dispatch: DispatchFn = vi.fn(async () => ({ error: 'bad data' }));
      const instance = await runner.execute(gatedChain('auto-test'), {}, dispatch);

      expect(instance.status).toBe('failed');
      expect(dispatch).toHaveBeenCalledTimes(1);
    });

    it('passes auto-test gate when step returns clean result', async () => {
      const dispatch: DispatchFn = vi.fn(async () => ({ data: 'clean' }));
      const instance = await runner.execute(gatedChain('auto-test'), {}, dispatch);

      expect(instance.status).toBe('completed');
      expect(instance.stepsCompleted).toBe(2);
    });

    it('uses custom gateCheck for vault-check gate', async () => {
      const chain: ChainDef = {
        id: 'vault-gated',
        steps: [
          { id: 's1', op: 'op-a', gate: 'vault-check' },
          { id: 's2', op: 'op-b' },
        ],
      };
      const dispatch: DispatchFn = vi.fn(async () => ({ ok: true }));
      const gateCheck = vi.fn(async () => ({ passed: false, message: 'vault says no' }));

      const instance = await runner.execute(chain, {}, dispatch, gateCheck);

      expect(instance.status).toBe('failed');
      expect(gateCheck).toHaveBeenCalledWith('vault-check', 's1', { ok: true });
    });
  });

  describe('resume / approve', () => {
    it('resumes a paused chain from the next step', async () => {
      const dispatch: DispatchFn = vi.fn(async () => ({ ok: true }));
      const chain = gatedChain('user-approval');
      const paused = await runner.execute(chain, {}, dispatch);

      expect(paused.status).toBe('paused');

      const resumed = await runner.approve(paused.id, chain, dispatch);

      expect(resumed.status).toBe('completed');
      expect(resumed.stepsCompleted).toBe(2);
    });

    it('throws when resuming a non-existent instance', async () => {
      const dispatch: DispatchFn = vi.fn(async () => ({}));
      await expect(runner.resume('nope', twoStepChain(), dispatch)).rejects.toThrow(
        'Chain instance not found',
      );
    });

    it('throws when resuming a completed (non-paused) chain', async () => {
      const dispatch: DispatchFn = vi.fn(async () => ({}));
      const instance = await runner.execute(twoStepChain(), {}, dispatch);

      await expect(runner.resume(instance.id, twoStepChain(), dispatch)).rejects.toThrow(
        'not paused',
      );
    });
  });

  describe('getInstance / list', () => {
    it('returns null for unknown instance', () => {
      expect(runner.getInstance('unknown-id')).toBeNull();
    });

    it('retrieves a persisted instance by ID', async () => {
      const dispatch: DispatchFn = vi.fn(async () => ({}));
      const instance = await runner.execute(twoStepChain(), {}, dispatch);

      const retrieved = runner.getInstance(instance.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.chainId).toBe('test-chain');
    });

    it('lists instances ordered by updated_at', async () => {
      const dispatch: DispatchFn = vi.fn(async () => ({}));
      await runner.execute(twoStepChain(), {}, dispatch);
      await runner.execute(twoStepChain(), {}, dispatch);

      const list = runner.list();
      expect(list.length).toBe(2);
    });
  });
});
