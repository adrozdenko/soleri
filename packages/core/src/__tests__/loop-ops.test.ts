import { describe, it, expect, beforeEach } from 'vitest';
import { LoopManager } from '../loop/loop-manager.js';
import type { LoopConfig } from '../loop/types.js';

describe('LoopManager', () => {
  let manager: LoopManager;

  beforeEach(() => {
    manager = new LoopManager();
  });

  // ─── startLoop ─────────────────────────────────────────────────

  it('starts a loop and returns initial state', () => {
    const config: LoopConfig = {
      mode: 'token-migration',
      prompt: 'Migrate all hardcoded colors to semantic tokens',
      maxIterations: 20,
      targetScore: 95,
    };

    const state = manager.startLoop(config);

    expect(state.id).toMatch(/^loop-\d+$/);
    expect(state.config).toEqual(config);
    expect(state.iterations).toEqual([]);
    expect(state.status).toBe('active');
    expect(state.startedAt).toBeTruthy();
    expect(state.completedAt).toBeUndefined();
  });

  it('throws if a loop is already active', () => {
    manager.startLoop({
      mode: 'custom',
      prompt: 'first loop',
      maxIterations: 5,
    });

    expect(() =>
      manager.startLoop({
        mode: 'custom',
        prompt: 'second loop',
        maxIterations: 5,
      }),
    ).toThrow(/Loop already active/);
  });

  // ─── isActive ──────────────────────────────────────────────────

  it('reports active state correctly', () => {
    expect(manager.isActive()).toBe(false);

    manager.startLoop({
      mode: 'contrast-fix',
      prompt: 'Fix contrast',
      maxIterations: 10,
    });

    expect(manager.isActive()).toBe(true);
  });

  // ─── iterate ───────────────────────────────────────────────────

  it('records iterations with incrementing numbers', () => {
    manager.startLoop({
      mode: 'component-build',
      prompt: 'Build button',
      maxIterations: 20,
    });

    const iter1 = manager.iterate({ passed: false, validationScore: 60 });
    expect(iter1.iteration).toBe(1);
    expect(iter1.passed).toBe(false);
    expect(iter1.validationScore).toBe(60);
    expect(iter1.timestamp).toBeTruthy();

    const iter2 = manager.iterate({
      passed: true,
      validationScore: 95,
      validationResult: 'All checks pass',
    });
    expect(iter2.iteration).toBe(2);
    expect(iter2.passed).toBe(true);
    expect(iter2.validationResult).toBe('All checks pass');
  });

  it('throws if iterating with no active loop', () => {
    expect(() => manager.iterate({ passed: true })).toThrow(/No active loop/);
  });

  it('auto-closes loop on max iterations with failing result', () => {
    manager.startLoop({
      mode: 'custom',
      prompt: 'Limited loop',
      maxIterations: 3,
    });

    manager.iterate({ passed: false, validationScore: 30 });
    manager.iterate({ passed: false, validationScore: 50 });
    const iter3 = manager.iterate({ passed: false, validationScore: 70 });

    expect(iter3.passed).toBe(false);
    expect(manager.isActive()).toBe(false);

    const history = manager.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe('max-iterations');
    expect(history[0].completedAt).toBeTruthy();
    expect(history[0].iterations).toHaveLength(3);
  });

  it('does NOT auto-close on max iterations if last iteration passes', () => {
    manager.startLoop({
      mode: 'custom',
      prompt: 'Might pass at the end',
      maxIterations: 2,
    });

    manager.iterate({ passed: false, validationScore: 40 });
    // This passes, so auto-close should NOT trigger
    manager.iterate({ passed: true, validationScore: 100 });

    // Loop should still be active (user must call completeLoop explicitly)
    expect(manager.isActive()).toBe(true);
  });

  // ─── completeLoop ──────────────────────────────────────────────

  it('completes an active loop', () => {
    manager.startLoop({
      mode: 'plan-iteration',
      prompt: 'Iterate plan to A+',
      maxIterations: 10,
    });

    manager.iterate({ passed: false, validationScore: 70 });
    manager.iterate({ passed: true, validationScore: 95 });

    const completed = manager.completeLoop();

    expect(completed.status).toBe('completed');
    expect(completed.completedAt).toBeTruthy();
    expect(completed.iterations).toHaveLength(2);
    expect(manager.isActive()).toBe(false);
  });

  it('throws if completing with no active loop', () => {
    expect(() => manager.completeLoop()).toThrow(/No active loop to complete/);
  });

  // ─── cancelLoop ────────────────────────────────────────────────

  it('cancels an active loop', () => {
    manager.startLoop({
      mode: 'token-migration',
      prompt: 'Migrate tokens',
      maxIterations: 20,
    });

    manager.iterate({ passed: false, validationScore: 30 });

    const cancelled = manager.cancelLoop();

    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.completedAt).toBeTruthy();
    expect(cancelled.iterations).toHaveLength(1);
    expect(manager.isActive()).toBe(false);
  });

  it('throws if cancelling with no active loop', () => {
    expect(() => manager.cancelLoop()).toThrow(/No active loop to cancel/);
  });

  // ─── getStatus ─────────────────────────────────────────────────

  it('returns null when no loop is active', () => {
    expect(manager.getStatus()).toBeNull();
  });

  it('returns the active loop state', () => {
    const config: LoopConfig = {
      mode: 'contrast-fix',
      prompt: 'Fix contrast',
      maxIterations: 15,
    };
    manager.startLoop(config);

    const status = manager.getStatus();
    expect(status).not.toBeNull();
    expect(status!.config.mode).toBe('contrast-fix');
    expect(status!.status).toBe('active');
  });

  // ─── getHistory ────────────────────────────────────────────────

  it('returns empty history initially', () => {
    expect(manager.getHistory()).toEqual([]);
  });

  it('accumulates completed loops in history', () => {
    // First loop — complete
    manager.startLoop({ mode: 'custom', prompt: 'loop 1', maxIterations: 10 });
    manager.iterate({ passed: true, validationScore: 100 });
    manager.completeLoop();

    // Second loop — cancel
    manager.startLoop({ mode: 'custom', prompt: 'loop 2', maxIterations: 10 });
    manager.cancelLoop();

    // Third loop — max-iterations
    manager.startLoop({ mode: 'custom', prompt: 'loop 3', maxIterations: 1 });
    manager.iterate({ passed: false, validationScore: 10 });

    const history = manager.getHistory();
    expect(history).toHaveLength(3);
    expect(history[0].status).toBe('completed');
    expect(history[1].status).toBe('cancelled');
    expect(history[2].status).toBe('max-iterations');
  });

  it('returns a copy of history (not internal array reference)', () => {
    manager.startLoop({ mode: 'custom', prompt: 'test', maxIterations: 10 });
    manager.completeLoop();

    const history1 = manager.getHistory();
    const history2 = manager.getHistory();
    expect(history1).not.toBe(history2);
    expect(history1).toEqual(history2);
  });

  // ─── can start a new loop after completing one ─────────────────

  it('allows starting a new loop after completing the previous', () => {
    manager.startLoop({ mode: 'custom', prompt: 'first', maxIterations: 5 });
    manager.completeLoop();

    const second = manager.startLoop({ mode: 'custom', prompt: 'second', maxIterations: 5 });
    expect(second.status).toBe('active');
    expect(manager.isActive()).toBe(true);
  });

  it('allows starting a new loop after cancelling the previous', () => {
    manager.startLoop({ mode: 'custom', prompt: 'first', maxIterations: 5 });
    manager.cancelLoop();

    const second = manager.startLoop({ mode: 'custom', prompt: 'second', maxIterations: 5 });
    expect(second.status).toBe('active');
  });
});

describe('createLoopOps', () => {
  // Integration-style tests using the ops factory directly.
  // We create a minimal runtime mock with just the loop manager.

  let manager: LoopManager;
  let ops: Awaited<ReturnType<typeof import('../runtime/loop-ops.js').createLoopOps>>;

  beforeEach(async () => {
    manager = new LoopManager();
    const { createLoopOps } = await import('../runtime/loop-ops.js');
    // Minimal runtime mock — only `loop` is needed for loop ops
    const mockRuntime = { loop: manager } as import('../runtime/types.js').AgentRuntime;
    ops = createLoopOps(mockRuntime);
  });

  function findOp(name: string) {
    const op = ops.find((o) => o.name === name);
    if (!op) throw new Error(`Op not found: ${name}`);
    return op;
  }

  it('exports 7 loop ops', () => {
    expect(ops).toHaveLength(7);
    const names = ops.map((o) => o.name).sort();
    expect(names).toEqual([
      'loop_cancel',
      'loop_complete',
      'loop_history',
      'loop_is_active',
      'loop_iterate',
      'loop_start',
      'loop_status',
    ]);
  });

  it('loop_start creates a new loop with default max iterations', async () => {
    const op = findOp('loop_start');
    const result = (await op.handler({
      mode: 'token-migration',
      prompt: 'Migrate tokens',
    })) as Record<string, unknown>;

    expect(result.started).toBe(true);
    expect(result.loopId).toMatch(/^loop-\d+$/);
    expect(result.mode).toBe('token-migration');
    expect(result.maxIterations).toBe(20);
    expect(result.targetScore).toBe(95);
  });

  it('loop_start uses custom max iterations and target score', async () => {
    const op = findOp('loop_start');
    const result = (await op.handler({
      mode: 'custom',
      prompt: 'Custom task',
      maxIterations: 5,
      targetScore: 80,
    })) as Record<string, unknown>;

    expect(result.maxIterations).toBe(5);
    expect(result.targetScore).toBe(80);
  });

  it('loop_iterate records results', async () => {
    await findOp('loop_start').handler({ mode: 'custom', prompt: 'Test' });

    const result = (await findOp('loop_iterate').handler({
      passed: false,
      validationScore: 50,
      validationResult: 'Needs work',
    })) as Record<string, unknown>;

    expect(result.iteration).toBe(1);
    expect(result.passed).toBe(false);
    expect(result.validationScore).toBe(50);
    expect(result.loopActive).toBe(true);
  });

  it('loop_status returns null when no loop active', async () => {
    const result = (await findOp('loop_status').handler({})) as Record<string, unknown>;
    expect(result.active).toBe(false);
    expect(result.loop).toBeNull();
  });

  it('loop_status returns active loop data', async () => {
    await findOp('loop_start').handler({
      mode: 'contrast-fix',
      prompt: 'Fix contrast issues',
    });

    const result = (await findOp('loop_status').handler({})) as Record<string, unknown>;
    expect(result.active).toBe(true);
    const loop = result.loop as Record<string, unknown>;
    expect((loop.config as Record<string, unknown>).mode).toBe('contrast-fix');
  });

  it('loop_cancel cancels the active loop', async () => {
    await findOp('loop_start').handler({ mode: 'custom', prompt: 'Test' });

    const result = (await findOp('loop_cancel').handler({})) as Record<string, unknown>;
    expect(result.cancelled).toBe(true);
    expect(result.status).toBe('cancelled');

    const status = (await findOp('loop_is_active').handler({})) as Record<string, unknown>;
    expect(status.active).toBe(false);
  });

  it('loop_complete marks the loop as completed', async () => {
    await findOp('loop_start').handler({ mode: 'custom', prompt: 'Test' });
    await findOp('loop_iterate').handler({ passed: true, validationScore: 100 });

    const result = (await findOp('loop_complete').handler({})) as Record<string, unknown>;
    expect(result.completed).toBe(true);
    expect(result.status).toBe('completed');
  });

  it('loop_history returns past loops', async () => {
    // Complete a loop
    await findOp('loop_start').handler({ mode: 'custom', prompt: 'Loop 1' });
    await findOp('loop_complete').handler({});

    // Cancel a loop
    await findOp('loop_start').handler({ mode: 'custom', prompt: 'Loop 2' });
    await findOp('loop_cancel').handler({});

    const result = (await findOp('loop_history').handler({})) as Record<string, unknown>;
    expect(result.count).toBe(2);
    const loops = result.loops as Array<Record<string, unknown>>;
    expect(loops[0].status).toBe('completed');
    expect(loops[1].status).toBe('cancelled');
  });

  it('loop_is_active returns false when no loop', async () => {
    const result = (await findOp('loop_is_active').handler({})) as Record<string, unknown>;
    expect(result.active).toBe(false);
  });

  it('assigns correct auth levels', () => {
    const readOps = ['loop_status', 'loop_history', 'loop_is_active'];
    const writeOps = ['loop_start', 'loop_iterate', 'loop_cancel', 'loop_complete'];

    for (const name of readOps) {
      expect(findOp(name).auth).toBe('read');
    }
    for (const name of writeOps) {
      expect(findOp(name).auth).toBe('write');
    }
  });
});
