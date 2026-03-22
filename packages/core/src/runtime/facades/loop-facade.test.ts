import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createLoopFacadeOps } from './loop-facade.js';
import { captureOps, executeOp } from '../../engine/test-helpers.js';
import type { CapturedOp } from '../../engine/test-helpers.js';
import type { AgentRuntime } from '../types.js';

// ─── Mock LoopManager ──────────────────────────────────────────────

function makeMockLoop() {
  const activeLoop: { id: string; config: Record<string, unknown>; iterations: unknown[]; status: string; startedAt: string; completedAt?: string } = {
    id: 'loop-1',
    config: { mode: 'custom', prompt: 'test task', maxIterations: 20 },
    iterations: [],
    status: 'active',
    startedAt: new Date().toISOString(),
  };

  let isActive = false;
  const history: typeof activeLoop[] = [];

  return {
    startLoop: vi.fn().mockImplementation((config: Record<string, unknown>) => {
      isActive = true;
      activeLoop.config = config;
      activeLoop.iterations = [];
      activeLoop.status = 'active';
      return activeLoop;
    }),
    iterate: vi.fn().mockImplementation((params: Record<string, unknown>) => {
      const iter = {
        iteration: activeLoop.iterations.length + 1,
        passed: params.passed,
        validationScore: params.validationScore ?? null,
        validationResult: params.validationResult ?? null,
        timestamp: new Date().toISOString(),
      };
      activeLoop.iterations.push(iter);
      return iter;
    }),
    iterateWithGate: vi.fn().mockReturnValue({
      decision: 'block',
      reason: 'Loop continues',
      iteration: 1,
      prompt: 'Continue iterating',
    }),
    getStatus: vi.fn().mockImplementation(() => {
      return isActive ? activeLoop : null;
    }),
    cancelLoop: vi.fn().mockImplementation(() => {
      isActive = false;
      activeLoop.status = 'cancelled';
      activeLoop.completedAt = new Date().toISOString();
      history.push({ ...activeLoop });
      return activeLoop;
    }),
    getHistory: vi.fn().mockImplementation(() => history),
    isActive: vi.fn().mockImplementation(() => isActive),
    completeLoop: vi.fn().mockImplementation(() => {
      isActive = false;
      activeLoop.status = 'completed';
      activeLoop.completedAt = new Date().toISOString();
      history.push({ ...activeLoop });
      return activeLoop;
    }),
  };
}

function makeRuntime(loop = makeMockLoop()): AgentRuntime {
  return { loop } as unknown as AgentRuntime;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('loop-facade', () => {
  let ops: Map<string, CapturedOp>;
  let mockLoop: ReturnType<typeof makeMockLoop>;

  beforeEach(() => {
    mockLoop = makeMockLoop();
    ops = captureOps(createLoopFacadeOps(makeRuntime(mockLoop)));
  });

  it('registers all 9 ops', () => {
    expect(ops.size).toBe(9);
    const names = [...ops.keys()];
    expect(names).toContain('loop_start');
    expect(names).toContain('loop_iterate');
    expect(names).toContain('loop_iterate_gate');
    expect(names).toContain('loop_status');
    expect(names).toContain('loop_cancel');
    expect(names).toContain('loop_history');
    expect(names).toContain('loop_is_active');
    expect(names).toContain('loop_complete');
    expect(names).toContain('loop_anomaly_check');
  });

  it('has correct auth levels', () => {
    expect(ops.get('loop_start')!.auth).toBe('write');
    expect(ops.get('loop_iterate')!.auth).toBe('write');
    expect(ops.get('loop_iterate_gate')!.auth).toBe('write');
    expect(ops.get('loop_status')!.auth).toBe('read');
    expect(ops.get('loop_cancel')!.auth).toBe('write');
    expect(ops.get('loop_history')!.auth).toBe('read');
    expect(ops.get('loop_is_active')!.auth).toBe('read');
    expect(ops.get('loop_complete')!.auth).toBe('write');
    expect(ops.get('loop_anomaly_check')!.auth).toBe('read');
  });

  // ─── loop_start ────────────────────────────────────────────────

  it('loop_start creates a loop with defaults', async () => {
    const result = await executeOp(ops, 'loop_start', { mode: 'custom', prompt: 'build button' });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.started).toBe(true);
    expect(data.mode).toBe('custom');
    expect(data.maxIterations).toBe(20);
  });

  it('loop_start uses mode-specific defaults for token-migration', async () => {
    const result = await executeOp(ops, 'loop_start', { mode: 'token-migration', prompt: 'migrate tokens' });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.maxIterations).toBe(20);
    expect(data.targetScore).toBe(95);
  });

  it('loop_start respects custom maxIterations', async () => {
    const result = await executeOp(ops, 'loop_start', { mode: 'custom', prompt: 'test', maxIterations: 5 });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).maxIterations).toBe(5);
  });

  // ─── loop_iterate ──────────────────────────────────────────────

  it('loop_iterate records a passing iteration', async () => {
    await executeOp(ops, 'loop_start', { mode: 'custom', prompt: 'test' });
    const result = await executeOp(ops, 'loop_iterate', { passed: true, validationScore: 95 });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.passed).toBe(true);
    expect(data.validationScore).toBe(95);
  });

  it('loop_iterate records a failing iteration', async () => {
    await executeOp(ops, 'loop_start', { mode: 'custom', prompt: 'test' });
    const result = await executeOp(ops, 'loop_iterate', { passed: false, validationResult: 'score too low' });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).passed).toBe(false);
  });

  // ─── loop_iterate_gate ─────────────────────────────────────────

  it('loop_iterate_gate returns gate decision', async () => {
    await executeOp(ops, 'loop_start', { mode: 'custom', prompt: 'test' });
    const result = await executeOp(ops, 'loop_iterate_gate', { lastOutput: 'some LLM output' });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).decision).toBe('block');
  });

  it('loop_iterate_gate passes knowledge param', async () => {
    await executeOp(ops, 'loop_start', { mode: 'custom', prompt: 'test' });
    const knowledge = { items: ['learned X'], patternsApplied: ['P1'] };
    await executeOp(ops, 'loop_iterate_gate', { lastOutput: 'output', knowledge });
    expect(mockLoop.iterateWithGate).toHaveBeenCalledWith('output', knowledge, undefined);
  });

  // ─── loop_status ───────────────────────────────────────────────

  it('loop_status returns null when no active loop', async () => {
    const result = await executeOp(ops, 'loop_status', {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).active).toBe(false);
  });

  it('loop_status returns active loop info', async () => {
    await executeOp(ops, 'loop_start', { mode: 'custom', prompt: 'test' });
    const result = await executeOp(ops, 'loop_status', {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).active).toBe(true);
  });

  // ─── loop_cancel ───────────────────────────────────────────────

  it('loop_cancel cancels active loop', async () => {
    await executeOp(ops, 'loop_start', { mode: 'custom', prompt: 'test' });
    const result = await executeOp(ops, 'loop_cancel', {});
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.cancelled).toBe(true);
    expect(data.status).toBe('cancelled');
  });

  // ─── loop_history ──────────────────────────────────────────────

  it('loop_history returns empty initially', async () => {
    const result = await executeOp(ops, 'loop_history', {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).count).toBe(0);
  });

  it('loop_history includes cancelled loops', async () => {
    await executeOp(ops, 'loop_start', { mode: 'custom', prompt: 'test' });
    await executeOp(ops, 'loop_cancel', {});
    const result = await executeOp(ops, 'loop_history', {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).count).toBe(1);
  });

  // ─── loop_is_active ────────────────────────────────────────────

  it('loop_is_active returns false when idle', async () => {
    const result = await executeOp(ops, 'loop_is_active', {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).active).toBe(false);
  });

  it('loop_is_active returns true after start', async () => {
    await executeOp(ops, 'loop_start', { mode: 'custom', prompt: 'test' });
    const result = await executeOp(ops, 'loop_is_active', {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).active).toBe(true);
  });

  // ─── loop_complete ─────────────────────────────────────────────

  it('loop_complete marks loop as completed', async () => {
    await executeOp(ops, 'loop_start', { mode: 'custom', prompt: 'test' });
    const result = await executeOp(ops, 'loop_complete', {});
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.completed).toBe(true);
    expect(data.status).toBe('completed');
  });

  // ─── loop_anomaly_check ────────────────────────────────────────

  it('loop_anomaly_check reports no active loop', async () => {
    const result = await executeOp(ops, 'loop_anomaly_check', {});
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.active).toBe(false);
    expect(data.summary).toBe('No active loop');
  });
});
