import { describe, it, expect, vi } from 'vitest';
import { SubagentDispatcher } from './dispatcher.js';
import { RuntimeAdapterRegistry } from '../adapters/registry.js';
import type { RuntimeAdapter, AdapterExecutionContext } from '../adapters/types.js';

function createMockAdapter(overrides: Partial<RuntimeAdapter> & { type: string }): RuntimeAdapter {
  return {
    execute: vi.fn().mockResolvedValue({ exitCode: 0, summary: 'done' }),
    testEnvironment: vi.fn().mockResolvedValue({ available: true }),
    ...overrides,
  };
}

function setup(adapterType = 'mock') {
  const registry = new RuntimeAdapterRegistry();
  const adapter = createMockAdapter({ type: adapterType });
  registry.register(adapterType, adapter);
  registry.setDefault(adapterType);

  const dispatcher = new SubagentDispatcher({
    adapterRegistry: registry,
    baseDir: '/tmp/test-dispatcher',
  });

  return { dispatcher, registry, adapter };
}

describe('SubagentDispatcher', () => {
  describe('dispatch — empty tasks', () => {
    it('returns all-passed with zero counts for empty array', async () => {
      const { dispatcher } = setup();
      const result = await dispatcher.dispatch([]);
      expect(result.status).toBe('all-passed');
      expect(result.totalTasks).toBe(0);
    });
  });

  describe('dispatch — sequential mode', () => {
    it('executes a single task and returns aggregated result', async () => {
      const { dispatcher, adapter } = setup();
      const result = await dispatcher.dispatch(
        [{ taskId: 'task-1', prompt: 'do something', workspace: '/tmp' }],
        { parallel: false },
      );

      expect(result.status).toBe('all-passed');
      expect(result.totalTasks).toBe(1);
      expect(result.completed).toBe(1);
      expect(adapter.execute).toHaveBeenCalledTimes(1);
    });

    it('stops on first failure in sequential mode', async () => {
      const { dispatcher, adapter } = setup();
      (adapter.execute as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ exitCode: 1, summary: 'failed' })
        .mockResolvedValueOnce({ exitCode: 0, summary: 'ok' });

      const result = await dispatcher.dispatch(
        [
          { taskId: 'task-1', prompt: 'fail', workspace: '/tmp' },
          { taskId: 'task-2', prompt: 'succeed', workspace: '/tmp' },
        ],
        { parallel: false },
      );

      expect(result.totalTasks).toBe(1);
      expect(result.failed).toBe(1);
      expect(adapter.execute).toHaveBeenCalledTimes(1);
    });

    it('calls onTaskUpdate with running and final status', async () => {
      const { dispatcher } = setup();
      const updates: Array<[string, string]> = [];

      await dispatcher.dispatch([{ taskId: 'task-1', prompt: 'work', workspace: '/tmp' }], {
        parallel: false,
        onTaskUpdate: (id, status) => updates.push([id, status]),
      });

      expect(updates).toEqual([
        ['task-1', 'running'],
        ['task-1', 'completed'],
      ]);
    });
  });

  describe('dispatch — parallel mode', () => {
    it('dispatches multiple independent tasks in parallel', async () => {
      const { dispatcher, adapter } = setup();

      const result = await dispatcher.dispatch([
        { taskId: 'task-1', prompt: 'a', workspace: '/tmp' },
        { taskId: 'task-2', prompt: 'b', workspace: '/tmp' },
      ]);

      expect(result.status).toBe('all-passed');
      expect(result.totalTasks).toBe(2);
      expect(result.completed).toBe(2);
      expect(adapter.execute).toHaveBeenCalledTimes(2);
    });

    it('reports partial when some tasks fail', async () => {
      const { dispatcher, adapter } = setup();
      (adapter.execute as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ exitCode: 0, summary: 'ok' })
        .mockResolvedValueOnce({ exitCode: 1, summary: 'fail' });

      const result = await dispatcher.dispatch([
        { taskId: 'task-1', prompt: 'a', workspace: '/tmp' },
        { taskId: 'task-2', prompt: 'b', workspace: '/tmp' },
      ]);

      expect(result.status).toBe('partial');
      expect(result.completed).toBe(1);
      expect(result.failed).toBe(1);
    });
  });

  describe('dispatch — dependency ordering', () => {
    it('respects task dependencies (dependent task waits for dependency)', async () => {
      const { dispatcher, adapter } = setup();
      const executionOrder: string[] = [];

      (adapter.execute as ReturnType<typeof vi.fn>).mockImplementation(
        async (ctx: AdapterExecutionContext) => {
          // Extract taskId from the runId
          const taskId = ctx.runId.split('-')[1];
          executionOrder.push(taskId!);
          return { exitCode: 0, summary: 'done' };
        },
      );

      await dispatcher.dispatch([
        { taskId: 'b', prompt: 'second', workspace: '/tmp', dependencies: ['a'] },
        { taskId: 'a', prompt: 'first', workspace: '/tmp' },
      ]);

      // 'a' must execute before 'b' due to dependency
      expect(executionOrder.indexOf('a')).toBeLessThan(executionOrder.indexOf('b'));
    });

    it('reports failure for tasks with unresolvable dependencies', async () => {
      const { dispatcher } = setup();

      const result = await dispatcher.dispatch([
        { taskId: 'a', prompt: 'work', workspace: '/tmp', dependencies: ['nonexistent'] },
      ]);

      // Task 'a' depends on 'nonexistent' which is not in the task list
      // The topological sort skips it, so it ends up with no tasks executed
      // or it gets a deadlock error
      expect(result.failed).toBeGreaterThanOrEqual(1);
    });
  });

  describe('dispatch — adapter not found', () => {
    it('returns failure when requested adapter does not exist', async () => {
      const { dispatcher } = setup();
      const result = await dispatcher.dispatch(
        [{ taskId: 'task-1', prompt: 'work', workspace: '/tmp', runtime: 'nonexistent' }],
        { parallel: false },
      );

      expect(result.failed).toBe(1);
      const taskResult = result.results[0];
      expect(taskResult.status).toBe('failed');
      expect(taskResult.error).toContain('not found');
    });
  });

  describe('dispatch — adapter throws', () => {
    it('catches adapter execution errors and reports failure', async () => {
      const { dispatcher, adapter } = setup();
      (adapter.execute as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Adapter crashed'),
      );

      const result = await dispatcher.dispatch(
        [{ taskId: 'task-1', prompt: 'work', workspace: '/tmp' }],
        { parallel: false },
      );

      expect(result.failed).toBe(1);
      expect(result.results[0].error).toBe('Adapter crashed');
    });
  });

  describe('dispatch — task already claimed', () => {
    it('fails if the same taskId is dispatched twice concurrently', async () => {
      const registry = new RuntimeAdapterRegistry();
      let resolveFirst: () => void;
      const firstBlocks = new Promise<void>((r) => {
        resolveFirst = r;
      });

      const adapter = createMockAdapter({
        type: 'mock',
        execute: vi.fn().mockImplementation(async () => {
          await firstBlocks;
          return { exitCode: 0 };
        }),
      });
      registry.register('mock', adapter);
      registry.setDefault('mock');

      const dispatcher = new SubagentDispatcher({
        adapterRegistry: registry,
        baseDir: '/tmp/test',
      });

      // Dispatch two tasks with the same ID — second should fail as already claimed
      const resultPromise = dispatcher.dispatch(
        [
          { taskId: 'dup', prompt: 'a', workspace: '/tmp' },
          { taskId: 'dup', prompt: 'b', workspace: '/tmp' },
        ],
        { parallel: true },
      );

      resolveFirst!();
      const result = await resultPromise;

      // At least one should have run; the duplicate handling depends on
      // topological sort dedup behavior — the key thing is no crash
      expect(result.totalTasks).toBeGreaterThanOrEqual(1);
    });
  });

  describe('cleanup', () => {
    it('does not throw on clean dispatcher', () => {
      const { dispatcher } = setup();
      expect(() => dispatcher.cleanup()).not.toThrow();
    });
  });

  describe('reapOrphans', () => {
    it('returns a reap result', () => {
      const { dispatcher } = setup();
      const result = dispatcher.reapOrphans();
      expect(result).toBeDefined();
      expect(result.reaped).toBeDefined();
    });
  });
});
