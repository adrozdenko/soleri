import { describe, it, expect, vi } from 'vitest';
import { createLoopOps } from './loop-ops.js';
import type { AgentRuntime } from './types.js';
import type { OpDefinition } from '../facades/types.js';

function makeMockRuntime() {
  return {
    loop: {
      startLoop: vi.fn().mockReturnValue({ id: 'loop-1' }),
      iterate: vi.fn().mockReturnValue({ iteration: 1, passed: false, validationScore: 70 }),
      iterateWithGate: vi.fn().mockReturnValue({ decision: 'block', reason: 'continue' }),
      getStatus: vi.fn().mockReturnValue({
        id: 'loop-1',
        config: { mode: 'custom', prompt: 'test' },
        iterations: [],
        status: 'active',
      }),
      cancelLoop: vi.fn().mockReturnValue({
        id: 'loop-1',
        iterations: [{ iteration: 1 }],
        status: 'cancelled',
      }),
      getHistory: vi.fn().mockReturnValue([
        {
          id: 'loop-0',
          config: { mode: 'custom', prompt: 'old' },
          iterations: [{ iteration: 1 }],
          status: 'completed',
          startedAt: '2024-01-01',
          completedAt: '2024-01-02',
        },
      ]),
      isActive: vi.fn().mockReturnValue(true),
      completeLoop: vi.fn().mockReturnValue({
        id: 'loop-1',
        iterations: [{ iteration: 1 }, { iteration: 2 }],
        status: 'completed',
      }),
    },
  } as unknown as AgentRuntime;
}

describe('createLoopOps', () => {
  let ops: OpDefinition[];
  let runtime: ReturnType<typeof makeMockRuntime>;

  function findOp(name: string): OpDefinition {
    const op = ops.find((o) => o.name === name);
    if (!op) throw new Error(`Op "${name}" not found`);
    return op;
  }

  describe('loop_start', () => {
    it('starts a loop with defaults for custom mode', async () => {
      runtime = makeMockRuntime();
      ops = createLoopOps(runtime);
      const result = (await findOp('loop_start').handler({
        mode: 'custom',
        prompt: 'fix the thing',
      })) as Record<string, unknown>;

      expect(runtime.loop.startLoop).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'custom', prompt: 'fix the thing', maxIterations: 20 }),
      );
      expect(result.started).toBe(true);
      expect(result.loopId).toBe('loop-1');
      expect(result.maxIterations).toBe(20);
      expect(result.targetScore).toBeNull();
    });

    it('uses mode-specific defaults for token-migration', async () => {
      runtime = makeMockRuntime();
      ops = createLoopOps(runtime);
      await findOp('loop_start').handler({ mode: 'token-migration', prompt: 'migrate' });
      expect(runtime.loop.startLoop).toHaveBeenCalledWith(
        expect.objectContaining({ maxIterations: 20, targetScore: 95 }),
      );
    });

    it('respects explicit maxIterations override', async () => {
      runtime = makeMockRuntime();
      ops = createLoopOps(runtime);
      await findOp('loop_start').handler({ mode: 'custom', prompt: 'test', maxIterations: 5 });
      expect(runtime.loop.startLoop).toHaveBeenCalledWith(
        expect.objectContaining({ maxIterations: 5 }),
      );
    });
  });

  describe('loop_iterate', () => {
    it('records iteration and returns status', async () => {
      runtime = makeMockRuntime();
      ops = createLoopOps(runtime);
      const result = (await findOp('loop_iterate').handler({
        passed: false,
        validationScore: 70,
      })) as Record<string, unknown>;

      expect(result.iteration).toBe(1);
      expect(result.passed).toBe(false);
      expect(result.loopActive).toBe(true);
    });
  });

  describe('loop_status', () => {
    it('returns active loop status', async () => {
      runtime = makeMockRuntime();
      ops = createLoopOps(runtime);
      const result = (await findOp('loop_status').handler({})) as Record<string, unknown>;
      expect(result.active).toBe(true);
      expect(result.loop).toBeTruthy();
    });

    it('returns inactive when no loop', async () => {
      runtime = makeMockRuntime();
      (runtime.loop.getStatus as ReturnType<typeof vi.fn>).mockReturnValue(null);
      ops = createLoopOps(runtime);
      const result = (await findOp('loop_status').handler({})) as Record<string, unknown>;
      expect(result.active).toBe(false);
      expect(result.loop).toBeNull();
    });
  });

  describe('loop_cancel', () => {
    it('cancels the active loop', async () => {
      runtime = makeMockRuntime();
      ops = createLoopOps(runtime);
      const result = (await findOp('loop_cancel').handler({})) as Record<string, unknown>;
      expect(result.cancelled).toBe(true);
      expect(result.loopId).toBe('loop-1');
      expect(result.status).toBe('cancelled');
    });
  });

  describe('loop_history', () => {
    it('returns formatted history', async () => {
      runtime = makeMockRuntime();
      ops = createLoopOps(runtime);
      const result = (await findOp('loop_history').handler({})) as Record<string, unknown>;
      expect(result.count).toBe(1);
      const loops = result.loops as Array<Record<string, unknown>>;
      expect(loops[0].id).toBe('loop-0');
      expect(loops[0].mode).toBe('custom');
      expect(loops[0].iterations).toBe(1);
    });
  });

  describe('loop_is_active', () => {
    it('returns active false when no loop', async () => {
      runtime = makeMockRuntime();
      (runtime.loop.isActive as ReturnType<typeof vi.fn>).mockReturnValue(false);
      ops = createLoopOps(runtime);
      const result = (await findOp('loop_is_active').handler({})) as Record<string, unknown>;
      expect(result.active).toBe(false);
    });
  });

  describe('loop_complete', () => {
    it('completes the active loop', async () => {
      runtime = makeMockRuntime();
      ops = createLoopOps(runtime);
      const result = (await findOp('loop_complete').handler({})) as Record<string, unknown>;
      expect(result.completed).toBe(true);
      expect(result.loopId).toBe('loop-1');
      expect(result.iterations).toBe(2);
    });
  });

  describe('loop_anomaly_check', () => {
    it('returns no anomalies for inactive loop', async () => {
      runtime = makeMockRuntime();
      (runtime.loop.getStatus as ReturnType<typeof vi.fn>).mockReturnValue(null);
      ops = createLoopOps(runtime);
      const result = (await findOp('loop_anomaly_check').handler({})) as Record<string, unknown>;
      expect(result.active).toBe(false);
      expect(result.summary).toBe('No active loop');
    });

    it('detects consecutive failures', async () => {
      runtime = makeMockRuntime();
      (runtime.loop.getStatus as ReturnType<typeof vi.fn>).mockReturnValue({
        id: 'loop-1',
        config: { mode: 'custom', prompt: 'test' },
        iterations: [
          { iteration: 1, passed: false, timestamp: '2024-01-01' },
          { iteration: 2, passed: false, timestamp: '2024-01-01' },
          { iteration: 3, passed: false, timestamp: '2024-01-01' },
        ],
        status: 'active',
      });
      ops = createLoopOps(runtime);
      const result = (await findOp('loop_anomaly_check').handler({})) as Record<string, unknown>;
      expect(result.active).toBe(true);
      expect(result.hasAnomalies).toBe(true);
      expect((result.anomalies as string[]).some((a) => a.includes('consecutive failing'))).toBe(
        true,
      );
    });
  });
});
