/**
 * Unit tests for telemetry-ops — 2 ops: telemetry_errors, telemetry_slow_ops.
 */

import { describe, it, expect } from 'vitest';
import { captureOps, executeOp } from '../engine/test-helpers.js';
import { createTelemetryOps } from './telemetry-ops.js';
import type { AgentRuntime } from './types.js';

function makeTelemetryStub(
  stats: { errorsByOp: Record<string, number>; slowestOps: Array<{ op: string; avgMs: number }>; avgDurationMs: number },
  recent: Array<{ op: string; facade: string; success: boolean; error?: string; timestamp: number }>,
) {
  return {
    getStats: () => stats,
    getRecent: (_limit: number) => recent,
  };
}

describe('telemetry-ops', () => {
  describe('telemetry_errors', () => {
    it('returns empty when no errors', async () => {
      const telemetry = makeTelemetryStub(
        { errorsByOp: {}, slowestOps: [], avgDurationMs: 10 },
        [],
      );
      const ops = captureOps(createTelemetryOps({ telemetry } as unknown as AgentRuntime));
      const res = await executeOp(ops, 'telemetry_errors');

      expect(res.success).toBe(true);
      const data = res.data as { errorCount: number; errorsByOp: Record<string, number>; recentErrors: unknown[] };
      expect(data.errorCount).toBe(0);
      expect(data.recentErrors).toEqual([]);
      expect(data.errorsByOp).toEqual({});
    });

    it('returns recent errors grouped by op', async () => {
      const recent = [
        { op: 'vault_search', facade: 'vault', success: false, error: 'timeout', timestamp: 1000 },
        { op: 'vault_search', facade: 'vault', success: false, error: 'timeout', timestamp: 1001 },
        { op: 'brain_recommend', facade: 'brain', success: true, timestamp: 1002 },
        { op: 'plan_create', facade: 'plan', success: false, error: 'invalid', timestamp: 1003 },
      ];
      const telemetry = makeTelemetryStub(
        { errorsByOp: { vault_search: 2, plan_create: 1 }, slowestOps: [], avgDurationMs: 50 },
        recent,
      );
      const ops = captureOps(createTelemetryOps({ telemetry } as unknown as AgentRuntime));
      const res = await executeOp(ops, 'telemetry_errors');

      expect(res.success).toBe(true);
      const data = res.data as { errorCount: number; errorsByOp: Record<string, number>; recentErrors: Array<{ op: string }> };
      expect(data.errorCount).toBe(3);
      expect(data.errorsByOp).toEqual({ vault_search: 2, plan_create: 1 });
      expect(data.recentErrors).toHaveLength(3);
      expect(data.recentErrors[0].op).toBe('vault_search');
    });

    it('caps recentErrors at 20', async () => {
      const recent = Array.from({ length: 30 }, (_, i) => ({
        op: `op_${i}`, facade: 'test', success: false, error: 'err', timestamp: i,
      }));
      const telemetry = makeTelemetryStub(
        { errorsByOp: {}, slowestOps: [], avgDurationMs: 0 },
        recent,
      );
      const ops = captureOps(createTelemetryOps({ telemetry } as unknown as AgentRuntime));
      const res = await executeOp(ops, 'telemetry_errors');

      const data = res.data as { recentErrors: unknown[] };
      expect(data.recentErrors).toHaveLength(20);
    });
  });

  describe('telemetry_slow_ops', () => {
    it('filters by default threshold of 100ms', async () => {
      const telemetry = makeTelemetryStub(
        {
          errorsByOp: {},
          slowestOps: [
            { op: 'vault_search', avgMs: 200 },
            { op: 'brain_recommend', avgMs: 50 },
            { op: 'plan_create', avgMs: 150 },
          ],
          avgDurationMs: 133,
        },
        [],
      );
      const ops = captureOps(createTelemetryOps({ telemetry } as unknown as AgentRuntime));
      const res = await executeOp(ops, 'telemetry_slow_ops', {});

      expect(res.success).toBe(true);
      const data = res.data as { slowOps: Array<{ op: string; avgMs: number }>; avgDurationMs: number };
      expect(data.slowOps).toHaveLength(2);
      expect(data.slowOps.map((o) => o.op)).toEqual(['vault_search', 'plan_create']);
      expect(data.avgDurationMs).toBe(133);
    });

    it('respects custom threshold', async () => {
      const telemetry = makeTelemetryStub(
        {
          errorsByOp: {},
          slowestOps: [
            { op: 'a', avgMs: 300 },
            { op: 'b', avgMs: 200 },
            { op: 'c', avgMs: 100 },
          ],
          avgDurationMs: 200,
        },
        [],
      );
      const ops = captureOps(createTelemetryOps({ telemetry } as unknown as AgentRuntime));
      const res = await executeOp(ops, 'telemetry_slow_ops', { threshold: 250 });

      const data = res.data as { slowOps: Array<{ op: string }> };
      expect(data.slowOps).toHaveLength(1);
      expect(data.slowOps[0].op).toBe('a');
    });

    it('returns empty when no ops exceed threshold', async () => {
      const telemetry = makeTelemetryStub(
        { errorsByOp: {}, slowestOps: [{ op: 'fast', avgMs: 5 }], avgDurationMs: 5 },
        [],
      );
      const ops = captureOps(createTelemetryOps({ telemetry } as unknown as AgentRuntime));
      const res = await executeOp(ops, 'telemetry_slow_ops', { threshold: 100 });

      const data = res.data as { slowOps: unknown[] };
      expect(data.slowOps).toHaveLength(0);
    });
  });
});
