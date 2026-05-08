/**
 * Tests for friction-metrics.ts — friction-pipeline instrumentation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLitePersistenceProvider } from '../persistence/sqlite-provider.js';
import {
  ensureFrictionMetricsSchema,
  logCreatePlanMetric,
  recordApprovalAttempt,
  queryFrictionAggregate,
} from './friction-metrics.js';

describe('friction-metrics', () => {
  let provider: SQLitePersistenceProvider;

  beforeEach(() => {
    provider = new SQLitePersistenceProvider(':memory:');
    ensureFrictionMetricsSchema(provider);
  });

  afterEach(() => {
    provider.close();
  });

  describe('ensureFrictionMetricsSchema', () => {
    it('is idempotent — repeat calls do not throw', () => {
      expect(() => ensureFrictionMetricsSchema(provider)).not.toThrow();
      expect(() => ensureFrictionMetricsSchema(provider)).not.toThrow();
    });
  });

  describe('logCreatePlanMetric', () => {
    it('inserts a row with the supplied fields', () => {
      logCreatePlanMetric(provider, {
        planId: 'plan-1',
        objectiveLen: 42,
        taskCount: 3,
        vaultSearchMs: 17,
      });

      const row = provider.get<{
        objective_len: number;
        task_count: number;
        vault_search_ms: number;
        grade_score: number | null;
        regrade_count: number;
      }>(
        `SELECT objective_len, task_count, vault_search_ms, grade_score, regrade_count
            FROM friction_metrics WHERE plan_id = ?`,
        ['plan-1'],
      );
      expect(row).toBeDefined();
      expect(row?.objective_len).toBe(42);
      expect(row?.task_count).toBe(3);
      expect(row?.vault_search_ms).toBe(17);
      expect(row?.grade_score).toBeNull();
      expect(row?.regrade_count).toBe(0);
    });

    it('ignores duplicate planId inserts (keeps the first row)', () => {
      logCreatePlanMetric(provider, {
        planId: 'plan-dup',
        objectiveLen: 10,
        taskCount: 1,
        vaultSearchMs: 5,
      });
      logCreatePlanMetric(provider, {
        planId: 'plan-dup',
        objectiveLen: 999,
        taskCount: 99,
        vaultSearchMs: 999,
      });
      const row = provider.get<{ objective_len: number }>(
        'SELECT objective_len FROM friction_metrics WHERE plan_id = ?',
        ['plan-dup'],
      );
      expect(row?.objective_len).toBe(10);
    });
  });

  describe('recordApprovalAttempt', () => {
    it('updates grade_score and bumps regrade_count', () => {
      logCreatePlanMetric(provider, {
        planId: 'plan-grade',
        objectiveLen: 100,
        taskCount: 5,
        vaultSearchMs: 8,
      });
      recordApprovalAttempt(provider, { planId: 'plan-grade', gradeScore: 87.5 });
      const after1 = provider.get<{ grade_score: number; regrade_count: number }>(
        'SELECT grade_score, regrade_count FROM friction_metrics WHERE plan_id = ?',
        ['plan-grade'],
      );
      expect(after1?.grade_score).toBe(87.5);
      expect(after1?.regrade_count).toBe(1);

      recordApprovalAttempt(provider, { planId: 'plan-grade', gradeScore: 92.0 });
      const after2 = provider.get<{ grade_score: number; regrade_count: number }>(
        'SELECT grade_score, regrade_count FROM friction_metrics WHERE plan_id = ?',
        ['plan-grade'],
      );
      expect(after2?.grade_score).toBe(92.0);
      expect(after2?.regrade_count).toBe(2);
    });

    it('is a no-op when the planId has no creation row', () => {
      expect(() =>
        recordApprovalAttempt(provider, { planId: 'plan-missing', gradeScore: 50 }),
      ).not.toThrow();
      const row = provider.get<{ plan_id: string }>(
        'SELECT plan_id FROM friction_metrics WHERE plan_id = ?',
        ['plan-missing'],
      );
      expect(row).toBeUndefined();
    });

    it('accepts null gradeScore for size-gate-skipped plans', () => {
      logCreatePlanMetric(provider, {
        planId: 'plan-skipped',
        objectiveLen: 30,
        taskCount: 2,
        vaultSearchMs: 3,
      });
      recordApprovalAttempt(provider, { planId: 'plan-skipped', gradeScore: null });
      const row = provider.get<{ grade_score: number | null; regrade_count: number }>(
        'SELECT grade_score, regrade_count FROM friction_metrics WHERE plan_id = ?',
        ['plan-skipped'],
      );
      expect(row?.grade_score).toBeNull();
      expect(row?.regrade_count).toBe(1);
    });
  });

  describe('queryFrictionAggregate', () => {
    it('returns zeroed aggregates on an empty table', () => {
      const agg = queryFrictionAggregate(provider, 7);
      expect(agg.count).toBe(0);
      expect(agg.medianObjectiveLen).toBe(0);
      expect(agg.medianTaskCount).toBe(0);
      expect(agg.p50VaultSearchMs).toBe(0);
      expect(agg.p95VaultSearchMs).toBe(0);
      expect(agg.gradeDistribution).toEqual({});
      expect(agg.avgRegradeCount).toBe(0);
      expect(agg.regradeRate).toBe(0);
    });

    it('aggregates median, percentiles, distribution, and regrade rate', () => {
      const samples = [
        { len: 10, tasks: 1, vault: 5, grade: 95 },
        { len: 20, tasks: 2, vault: 10, grade: 88 },
        { len: 30, tasks: 3, vault: 20, grade: 75 },
        { len: 40, tasks: 4, vault: 50, grade: 50 },
        { len: 50, tasks: 5, vault: 100, grade: null },
      ];
      let i = 0;
      for (const s of samples) {
        i++;
        logCreatePlanMetric(provider, {
          planId: `plan-${i}`,
          objectiveLen: s.len,
          taskCount: s.tasks,
          vaultSearchMs: s.vault,
        });
        recordApprovalAttempt(provider, { planId: `plan-${i}`, gradeScore: s.grade });
        if (i <= 2) {
          // 2 plans get a second approval attempt → regradeRate=2/5
          recordApprovalAttempt(provider, { planId: `plan-${i}`, gradeScore: s.grade });
        }
      }

      const agg = queryFrictionAggregate(provider, 7);
      expect(agg.count).toBe(5);
      // sorted lens [10,20,30,40,50] → idx floor(0.5*5)=2 → 30
      expect(agg.medianObjectiveLen).toBe(30);
      expect(agg.medianTaskCount).toBe(3);
      // sorted vault [5,10,20,50,100]
      expect(agg.p50VaultSearchMs).toBe(20);
      // idx floor(0.95*5)=4 → 100
      expect(agg.p95VaultSearchMs).toBe(100);
      expect(agg.gradeDistribution['A+']).toBe(1);
      expect(agg.gradeDistribution['B']).toBe(1);
      expect(agg.gradeDistribution['C']).toBe(1);
      expect(agg.gradeDistribution['F']).toBe(1);
      expect(agg.gradeDistribution['skipped']).toBe(1);
      // 2 plans got regrade_count=2, 3 plans got regrade_count=1
      expect(agg.avgRegradeCount).toBeCloseTo((2 + 2 + 1 + 1 + 1) / 5);
      // All 5 plans have regrade_count >= 1, so regradeRate = 1
      expect(agg.regradeRate).toBe(1);
    });

    it('respects the days window — older rows are excluded', () => {
      logCreatePlanMetric(provider, {
        planId: 'plan-old',
        objectiveLen: 99,
        taskCount: 9,
        vaultSearchMs: 99,
      });
      // Backdate the row beyond a 1-day window
      provider.run('UPDATE friction_metrics SET created_at = ? WHERE plan_id = ?', [
        Math.floor(Date.now() / 1000) - 5 * 24 * 60 * 60,
        'plan-old',
      ]);
      logCreatePlanMetric(provider, {
        planId: 'plan-new',
        objectiveLen: 5,
        taskCount: 1,
        vaultSearchMs: 1,
      });

      const agg = queryFrictionAggregate(provider, 1);
      expect(agg.count).toBe(1);
      expect(agg.medianObjectiveLen).toBe(5);
    });
  });
});
