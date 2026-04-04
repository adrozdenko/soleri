import { describe, it, expect } from 'vitest';
import {
  calculateDriftScore,
  computeExecutionSummary,
  buildReconciliationReport,
  buildAutoReconcileInput,
} from './reconciliation-engine.js';
import type { DriftItem, PlanTask } from './planner-types.js';

describe('reconciliation-engine', () => {
  describe('calculateDriftScore', () => {
    it('returns 100 for no drift items', () => {
      expect(calculateDriftScore([])).toBe(100);
    });
    it('deducts by impact weight', () => {
      const items: DriftItem[] = [
        { type: 'skipped', description: 'x', impact: 'medium', rationale: 'r' },
      ];
      expect(calculateDriftScore(items)).toBe(90);
    });
    it('accumulates multiple items', () => {
      const items: DriftItem[] = [
        { type: 'skipped', description: 'x', impact: 'high', rationale: 'r' },
        { type: 'modified', description: 'y', impact: 'low', rationale: 'r' },
      ];
      expect(calculateDriftScore(items)).toBe(75);
    });
    it('floors at 0', () => {
      const items: DriftItem[] = Array.from({ length: 10 }, () => ({
        type: 'skipped' as const,
        description: 'x',
        impact: 'high' as const,
        rationale: 'r',
      }));
      expect(calculateDriftScore(items)).toBe(0);
    });
  });

  describe('computeExecutionSummary', () => {
    it('returns zeros for empty tasks', () => {
      const summary = computeExecutionSummary([]);
      expect(summary.totalDurationMs).toBe(0);
      expect(summary.tasksCompleted).toBe(0);
      expect(summary.avgTaskDurationMs).toBe(0);
    });
    it('counts task statuses correctly', () => {
      const tasks: PlanTask[] = [
        { id: 't1', title: '', description: '', status: 'completed', updatedAt: 0 },
        { id: 't2', title: '', description: '', status: 'skipped', updatedAt: 0 },
        { id: 't3', title: '', description: '', status: 'failed', updatedAt: 0 },
        { id: 't4', title: '', description: '', status: 'pending', updatedAt: 0 },
      ];
      const summary = computeExecutionSummary(tasks);
      expect(summary.tasksCompleted).toBe(1);
      expect(summary.tasksSkipped).toBe(1);
      expect(summary.tasksFailed).toBe(1);
    });
    it('computes average duration from tasks with metrics', () => {
      const tasks: PlanTask[] = [
        {
          id: 't1',
          title: '',
          description: '',
          status: 'completed',
          updatedAt: 0,
          metrics: { durationMs: 100 },
        },
        {
          id: 't2',
          title: '',
          description: '',
          status: 'completed',
          updatedAt: 0,
          metrics: { durationMs: 200 },
        },
        { id: 't3', title: '', description: '', status: 'completed', updatedAt: 0 }, // no metrics
      ];
      const summary = computeExecutionSummary(tasks);
      expect(summary.totalDurationMs).toBe(300);
      expect(summary.avgTaskDurationMs).toBe(150);
    });
  });

  describe('buildReconciliationReport', () => {
    it('builds a report with accuracy score', () => {
      const before = Date.now();
      const report = buildReconciliationReport('plan-1', {
        actualOutcome: 'Done',
        driftItems: [{ type: 'skipped', description: 'x', impact: 'low', rationale: 'r' }],
      });
      expect(report.planId).toBe('plan-1');
      expect(report.accuracy).toBe(95);
      expect(report.driftItems).toHaveLength(1);
      expect(report.summary).toBe('Done');
      expect(report.reconciledAt).toBeGreaterThanOrEqual(before);
      expect(report.reconciledAt).toBeLessThanOrEqual(Date.now());
    });
    it('defaults to empty drift items', () => {
      const report = buildReconciliationReport('plan-2', { actualOutcome: 'OK' });
      expect(report.accuracy).toBe(100);
      expect(report.driftItems).toEqual([]);
    });
  });

  describe('buildAutoReconcileInput', () => {
    it('allows auto-reconcile when all tasks completed', () => {
      const tasks: PlanTask[] = [
        { id: 't1', title: 'A', description: '', status: 'completed', updatedAt: 0 },
        { id: 't2', title: 'B', description: '', status: 'completed', updatedAt: 0 },
      ];
      const result = buildAutoReconcileInput(tasks);
      expect(result.canAutoReconcile).toBe(true);
      expect(result.input?.actualOutcome).toContain('2/2 tasks completed');
    });
    it('rejects when tasks are in progress', () => {
      const tasks: PlanTask[] = [
        { id: 't1', title: 'A', description: '', status: 'in_progress', updatedAt: 0 },
      ];
      expect(buildAutoReconcileInput(tasks).canAutoReconcile).toBe(false);
    });
    it('rejects when too many pending/failed tasks', () => {
      const tasks: PlanTask[] = [
        { id: 't1', title: 'A', description: '', status: 'failed', updatedAt: 0 },
        { id: 't2', title: 'B', description: '', status: 'failed', updatedAt: 0 },
        { id: 't3', title: 'C', description: '', status: 'pending', updatedAt: 0 },
      ];
      expect(buildAutoReconcileInput(tasks).canAutoReconcile).toBe(false);
    });
    it('generates drift items for skipped and failed tasks', () => {
      const tasks: PlanTask[] = [
        { id: 't1', title: 'A', description: '', status: 'completed', updatedAt: 0 },
        { id: 't2', title: 'B', description: '', status: 'skipped', updatedAt: 0 },
        { id: 't3', title: 'C', description: '', status: 'failed', updatedAt: 0 },
      ];
      const result = buildAutoReconcileInput(tasks);
      expect(result.canAutoReconcile).toBe(true);
      expect(result.input?.driftItems).toHaveLength(2);
      expect(result.input?.driftItems?.[0].type).toBe('skipped');
      expect(result.input?.driftItems?.[1].type).toBe('modified');
    });
    it('generates drift items for pending tasks', () => {
      const tasks: PlanTask[] = [
        { id: 't1', title: 'Done', description: '', status: 'completed', updatedAt: 0 },
        { id: 't2', title: 'Not started', description: '', status: 'pending', updatedAt: 0 },
      ];
      const result = buildAutoReconcileInput(tasks);
      expect(result.canAutoReconcile).toBe(true);
      expect(result.input?.driftItems?.[0].impact).toBe('low');
    });
  });
});
