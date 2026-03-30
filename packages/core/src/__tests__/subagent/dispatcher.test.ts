import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubagentDispatcher } from '../../subagent/dispatcher.js';
import { RuntimeAdapterRegistry } from '../../adapters/registry.js';
import type { RuntimeAdapter } from '../../adapters/types.js';
import type { SubagentTask } from '../../subagent/types.js';

function createMockRegistry() {
  const registry = new RuntimeAdapterRegistry();
  const mockAdapter: RuntimeAdapter = {
    type: 'mock',
    execute: vi.fn().mockResolvedValue({ exitCode: 0, summary: 'done' }),
    testEnvironment: vi.fn().mockResolvedValue({ available: true }),
  };
  registry.register('mock', mockAdapter);
  registry.setDefault('mock');
  return { registry, mockAdapter };
}

function makeTask(overrides: Partial<SubagentTask> & { taskId: string }): SubagentTask {
  return {
    prompt: 'do something',
    workspace: '/tmp/test',
    ...overrides,
  };
}

describe('SubagentDispatcher', () => {
  let dispatcher: SubagentDispatcher;
  let mockAdapter: RuntimeAdapter;

  beforeEach(() => {
    const { registry, mockAdapter: adapter } = createMockRegistry();
    mockAdapter = adapter;
    dispatcher = new SubagentDispatcher({ adapterRegistry: registry });
  });

  it('constructor accepts config with adapterRegistry', () => {
    const { registry } = createMockRegistry();
    const d = new SubagentDispatcher({ adapterRegistry: registry });
    expect(d).toBeDefined();
  });

  it('dispatch() with empty tasks returns aggregate with 0 tasks', async () => {
    const result = await dispatcher.dispatch([]);
    expect(result.totalTasks).toBe(0);
    expect(result.status).toBe('all-passed');
    expect(result.results).toEqual([]);
  });

  it('dispatch() calls adapter.execute() for each task', async () => {
    const tasks = [makeTask({ taskId: 'a' }), makeTask({ taskId: 'b' })];

    await dispatcher.dispatch(tasks, { parallel: false });
    expect(mockAdapter.execute).toHaveBeenCalledTimes(2);
  });

  it('dispatch() respects parallel=false option (sequential)', async () => {
    const callOrder: string[] = [];
    (mockAdapter.execute as ReturnType<typeof vi.fn>).mockImplementation(async (ctx) => {
      callOrder.push(ctx.runId);
      return { exitCode: 0, summary: 'ok' };
    });

    const tasks = [makeTask({ taskId: 'first' }), makeTask({ taskId: 'second' })];

    await dispatcher.dispatch(tasks, { parallel: false });
    expect(callOrder).toHaveLength(2);
    // In sequential mode, first task should complete before second starts
    expect(callOrder[0]).toContain('first');
    expect(callOrder[1]).toContain('second');
  });

  it('dispatch() handles adapter failure gracefully', async () => {
    (mockAdapter.execute as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Adapter crashed'),
    );

    const tasks = [makeTask({ taskId: 'fail-task' })];
    const result = await dispatcher.dispatch(tasks);

    expect(result.totalTasks).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results[0].error).toContain('Adapter crashed');
  });

  it('dispatch() claims and releases tasks', async () => {
    const tasks = [makeTask({ taskId: 'claim-test' })];
    await dispatcher.dispatch(tasks);

    // After dispatch, the task should be released (available again)
    // We verify by dispatching the same task again successfully
    const result = await dispatcher.dispatch(tasks);
    expect(result.completed).toBe(1);
  });

  it('dispatch() uses concurrency control in parallel mode', async () => {
    let concurrentCount = 0;
    let maxConcurrent = 0;

    (mockAdapter.execute as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      concurrentCount++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCount);
      await new Promise((resolve) => setTimeout(resolve, 50));
      concurrentCount--;
      return { exitCode: 0, summary: 'ok' };
    });

    const tasks = [
      makeTask({ taskId: 'c1' }),
      makeTask({ taskId: 'c2' }),
      makeTask({ taskId: 'c3' }),
      makeTask({ taskId: 'c4' }),
      makeTask({ taskId: 'c5' }),
    ];

    await dispatcher.dispatch(tasks, { parallel: true, maxConcurrent: 2 });
    // Max concurrent should not exceed 2
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('dispatch() resolves dependencies correctly (task B depends on task A)', async () => {
    const callOrder: string[] = [];
    (mockAdapter.execute as ReturnType<typeof vi.fn>).mockImplementation(async (ctx) => {
      callOrder.push(ctx.runId);
      return { exitCode: 0, summary: 'ok' };
    });

    const tasks = [makeTask({ taskId: 'B', dependencies: ['A'] }), makeTask({ taskId: 'A' })];

    await dispatcher.dispatch(tasks, { parallel: true });
    // A should execute before B
    const aIndex = callOrder.findIndex((r) => r.includes('-A-'));
    const bIndex = callOrder.findIndex((r) => r.includes('-B-'));
    expect(aIndex).toBeLessThan(bIndex);
  });

  it('dispatch() handles deadlocked dependencies', async () => {
    const tasks = [
      makeTask({ taskId: 'X', dependencies: ['Y'] }),
      makeTask({ taskId: 'Y', dependencies: ['X'] }),
    ];

    const result = await dispatcher.dispatch(tasks, { parallel: true });
    // Both tasks should fail due to unresolvable dependencies
    expect(result.failed).toBe(2);
    expect(result.results.every((r) => r.error?.includes('Unresolvable dependencies'))).toBe(true);
  });

  it('cleanup() clears all state', async () => {
    const tasks = [makeTask({ taskId: 'cleanup-test' })];
    await dispatcher.dispatch(tasks);

    // cleanup should not throw
    dispatcher.cleanup();
  });

  it('reapOrphans() returns ReapResult with empty arrays when no processes tracked', () => {
    // reapOrphans delegates to the internal OrphanReaper
    // Without registering processes, it should return empty reaped/alive
    const result = dispatcher.reapOrphans();
    expect(result).toEqual({ reaped: [], alive: [] });
  });

  it('dispatch() stops on first failure in sequential mode', async () => {
    let callCount = 0;
    (mockAdapter.execute as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return { exitCode: 1, summary: 'failed' };
      }
      return { exitCode: 0, summary: 'ok' };
    });

    const tasks = [makeTask({ taskId: 'first' }), makeTask({ taskId: 'second' })];

    const result = await dispatcher.dispatch(tasks, { parallel: false });
    // Only the first task should have been executed
    expect(callCount).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.failed).toBe(1);
  });

  it('dispatch() invokes onTaskUpdate callback', async () => {
    const updates: Array<[string, string]> = [];

    const tasks = [makeTask({ taskId: 'cb-test' })];
    await dispatcher.dispatch(tasks, {
      parallel: false,
      onTaskUpdate: (taskId, status) => updates.push([taskId, status]),
    });

    expect(updates.length).toBeGreaterThanOrEqual(1);
    expect(updates[0][0]).toBe('cb-test');
  });

  // ── Timeout + process killing ─────────────────────────────────────

  it('dispatch() returns timeout error when task exceeds timeout', async () => {
    vi.useFakeTimers();

    (mockAdapter.execute as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {}), // never resolves
    );

    const tasks = [makeTask({ taskId: 'timeout-task' })];
    const dispatchPromise = dispatcher.dispatch(tasks, { parallel: false, timeout: 1000 });

    await vi.advanceTimersByTimeAsync(1000);

    const result = await dispatchPromise;
    expect(result.failed).toBe(1);
    expect(result.results[0].error).toBe('Task timed out');

    vi.useRealTimers();
  });

  it('dispatch() passes onMeta callback to adapter for pid reporting', async () => {
    let capturedOnMeta: ((meta: Record<string, unknown>) => void) | undefined;

    (mockAdapter.execute as ReturnType<typeof vi.fn>).mockImplementation(async (ctx) => {
      capturedOnMeta = ctx.onMeta;
      // Simulate adapter reporting its PID
      ctx.onMeta?.({ pid: 42 });
      return { exitCode: 0, summary: 'done' };
    });

    const tasks = [makeTask({ taskId: 'meta-test' })];
    const result = await dispatcher.dispatch(tasks, { parallel: false });

    expect(capturedOnMeta).toBeDefined();
    expect(result.results[0].pid).toBe(42);
    expect(result.completed).toBe(1);
  });

  it('dispatch() kills child process on timeout when pid is reported', async () => {
    vi.useFakeTimers();

    const killSpy = vi.spyOn(process, 'kill');
    let sigkillSent = false;
    killSpy.mockImplementation((_pid: number, signal?: string | number) => {
      if (signal === 0) {
        // Process alive until SIGKILL
        if (sigkillSent) {
          const err = new Error('No such process') as NodeJS.ErrnoException;
          err.code = 'ESRCH';
          throw err;
        }
        return true;
      }
      if (signal === 'SIGTERM') return true;
      if (signal === 'SIGKILL') {
        sigkillSent = true;
        return true;
      }
      return true;
    });

    (mockAdapter.execute as ReturnType<typeof vi.fn>).mockImplementation(async (ctx) => {
      // Report PID immediately
      ctx.onMeta?.({ pid: 9876 });
      // Then hang forever (simulate stuck process)
      return new Promise(() => {});
    });

    const tasks = [makeTask({ taskId: 'kill-test' })];
    const dispatchPromise = dispatcher.dispatch(tasks, { parallel: false, timeout: 500 });

    // Trigger the timeout
    await vi.advanceTimersByTimeAsync(500);

    const result = await dispatchPromise;
    expect(result.failed).toBe(1);
    expect(result.results[0].error).toBe('Task timed out');
    expect(result.results[0].pid).toBe(9876);

    // Verify SIGTERM was sent
    expect(killSpy).toHaveBeenCalledWith(9876, 'SIGTERM');

    // Advance past the 5s grace period to trigger SIGKILL escalation
    await vi.advanceTimersByTimeAsync(5_000);
    expect(killSpy).toHaveBeenCalledWith(9876, 'SIGKILL');

    killSpy.mockRestore();
    vi.useRealTimers();
  });

  it('dispatch() does not attempt kill when no pid is reported', async () => {
    vi.useFakeTimers();

    const killSpy = vi.spyOn(process, 'kill');
    killSpy.mockImplementation(() => true);

    (mockAdapter.execute as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {}), // never resolves, no pid reported
    );

    const tasks = [makeTask({ taskId: 'no-pid-task' })];
    const dispatchPromise = dispatcher.dispatch(tasks, { parallel: false, timeout: 500 });

    await vi.advanceTimersByTimeAsync(500);

    const result = await dispatchPromise;
    expect(result.failed).toBe(1);
    expect(result.results[0].error).toBe('Task timed out');

    // No SIGTERM or SIGKILL should have been sent (only signal-0 checks from reaper are possible)
    const termCalls = killSpy.mock.calls.filter((c) => c[1] === 'SIGTERM' || c[1] === 'SIGKILL');
    expect(termCalls).toHaveLength(0);

    killSpy.mockRestore();
    vi.useRealTimers();
  });
});
