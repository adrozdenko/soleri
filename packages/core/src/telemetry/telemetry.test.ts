import { describe, it, expect, beforeEach } from 'vitest';
import { Telemetry } from './telemetry.js';
import type { TelemetryStats } from './telemetry.js';

describe('Telemetry', () => {
  let tel: Telemetry;

  beforeEach(() => {
    tel = new Telemetry();
  });

  // ─── record ─────────────────────────────────────────────────────

  describe('record', () => {
    it('adds a call and increments totalCalls', () => {
      tel.record({ facade: 'vault', op: 'search', durationMs: 10, success: true });
      expect(tel.getStats().totalCalls).toBe(1);
    });

    it('auto-trims to 5000 when exceeding 10000 entries', () => {
      for (let i = 0; i < 10_001; i++) {
        tel.record({ facade: 'v', op: 'o', durationMs: 1, success: true });
      }
      expect(tel.getStats().totalCalls).toBe(5_000);
    });
  });

  // ─── getStats ───────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns zeroed stats when empty', () => {
      const stats = tel.getStats();
      expect(stats.totalCalls).toBe(0);
      expect(stats.successRate).toBe(1);
      expect(stats.avgDurationMs).toBe(0);
      expect(stats.callsByFacade).toEqual({});
      expect(stats.callsByOp).toEqual({});
      expect(stats.errorsByOp).toEqual({});
      expect(stats.slowestOps).toEqual([]);
      expect(stats.since).toBeLessThanOrEqual(Date.now());
    });

    it('computes successRate correctly', () => {
      tel.record({ facade: 'a', op: 'x', durationMs: 1, success: true });
      tel.record({ facade: 'a', op: 'x', durationMs: 1, success: true });
      tel.record({ facade: 'a', op: 'x', durationMs: 1, success: false, error: 'fail' });
      const stats = tel.getStats();
      // 2/3 ≈ 0.667
      expect(stats.successRate).toBe(0.667);
    });

    it('computes avgDurationMs', () => {
      tel.record({ facade: 'a', op: 'x', durationMs: 10, success: true });
      tel.record({ facade: 'a', op: 'x', durationMs: 30, success: true });
      expect(tel.getStats().avgDurationMs).toBe(20);
    });

    it('counts calls by facade', () => {
      tel.record({ facade: 'vault', op: 'search', durationMs: 1, success: true });
      tel.record({ facade: 'vault', op: 'capture', durationMs: 1, success: true });
      tel.record({ facade: 'brain', op: 'recommend', durationMs: 1, success: true });
      expect(tel.getStats().callsByFacade).toEqual({ vault: 2, brain: 1 });
    });

    it('counts calls by op', () => {
      tel.record({ facade: 'v', op: 'search', durationMs: 1, success: true });
      tel.record({ facade: 'v', op: 'search', durationMs: 1, success: true });
      tel.record({ facade: 'v', op: 'capture', durationMs: 1, success: true });
      expect(tel.getStats().callsByOp).toEqual({ search: 2, capture: 1 });
    });

    it('tracks errors by op', () => {
      tel.record({ facade: 'v', op: 'search', durationMs: 1, success: false, error: 'timeout' });
      tel.record({ facade: 'v', op: 'search', durationMs: 1, success: true });
      tel.record({ facade: 'v', op: 'capture', durationMs: 1, success: false, error: 'db' });
      expect(tel.getStats().errorsByOp).toEqual({ search: 1, capture: 1 });
    });

    it('returns slowest ops sorted desc, max 10', () => {
      tel.record({ facade: 'v', op: 'slow', durationMs: 500, success: true });
      tel.record({ facade: 'v', op: 'fast', durationMs: 5, success: true });
      tel.record({ facade: 'v', op: 'medium', durationMs: 50, success: true });
      const slowest = tel.getStats().slowestOps;
      expect(slowest[0].op).toBe('slow');
      expect(slowest[0].avgMs).toBe(500);
      expect(slowest[slowest.length - 1].op).toBe('fast');
    });

    it('limits slowestOps to top 10', () => {
      for (let i = 0; i < 15; i++) {
        tel.record({ facade: 'v', op: `op-${i}`, durationMs: i * 10, success: true });
      }
      expect(tel.getStats().slowestOps.length).toBe(10);
    });
  });

  // ─── getRecent ──────────────────────────────────────────────────

  describe('getRecent', () => {
    it('returns calls newest-first', () => {
      tel.record({ facade: 'v', op: 'first', durationMs: 1, success: true });
      tel.record({ facade: 'v', op: 'second', durationMs: 1, success: true });
      const recent = tel.getRecent();
      expect(recent[0].op).toBe('second');
      expect(recent[1].op).toBe('first');
    });

    it('respects limit param', () => {
      for (let i = 0; i < 100; i++) {
        tel.record({ facade: 'v', op: `op-${i}`, durationMs: 1, success: true });
      }
      expect(tel.getRecent(5).length).toBe(5);
    });

    it('defaults to 50', () => {
      for (let i = 0; i < 80; i++) {
        tel.record({ facade: 'v', op: `op-${i}`, durationMs: 1, success: true });
      }
      expect(tel.getRecent().length).toBe(50);
    });

    it('returns empty array when no calls recorded', () => {
      expect(tel.getRecent()).toEqual([]);
    });
  });

  // ─── reset ──────────────────────────────────────────────────────

  describe('reset', () => {
    it('clears all data', () => {
      tel.record({ facade: 'v', op: 'x', durationMs: 1, success: true });
      tel.reset();
      expect(tel.getStats().totalCalls).toBe(0);
      expect(tel.getRecent()).toEqual([]);
    });

    it('resets the since timestamp', () => {
      const before = tel.getStats().since;
      // Small delay to ensure timestamp differs
      tel.reset();
      expect(tel.getStats().since).toBeGreaterThanOrEqual(before);
    });
  });
});
