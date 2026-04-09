/**
 * Reconciliation engine — drift detection, accuracy scoring, and auto-reconciliation.
 * Extracted from planner.ts. All functions are pure (no persistence side-effects).
 */

import type {
  DriftItem,
  ReconciliationReport,
  ExecutionSummary,
  PlanTask,
} from './planner-types.js';

// ─── Drift Scoring ───────────────────────────────────────────────

/**
 * Severity weights for drift accuracy score calculation.
 * Score = 100 - sum(drift_items * weight_per_impact)
 * Ported from Salvador's plan-lifecycle-types.ts.
 */
export const DRIFT_WEIGHTS: Record<DriftItem['impact'], number> = {
  high: 20,
  medium: 10,
  low: 5,
};

/**
 * Calculate drift accuracy score from drift items.
 * Score = max(0, 100 - sum(weight_per_impact))
 * Ported from Salvador's calculateDriftScore.
 */
export function calculateDriftScore(items: ReadonlyArray<DriftItem>): number {
  let deductions = 0;
  for (const item of items) {
    deductions += DRIFT_WEIGHTS[item.impact];
  }
  return Math.max(0, 100 - deductions);
}

// ─── Execution Summary ───────────────────────────────────────────

/**
 * Compute aggregate execution summary from per-task metrics.
 * Pure function — does not mutate state.
 */
export function computeExecutionSummary(tasks: ReadonlyArray<PlanTask>): ExecutionSummary {
  let totalDurationMs = 0;
  let tasksCompleted = 0;
  let tasksSkipped = 0;
  let tasksFailed = 0;
  let tasksWithDuration = 0;

  for (const task of tasks) {
    if (task.status === 'completed') tasksCompleted++;
    else if (task.status === 'skipped') tasksSkipped++;
    else if (task.status === 'failed') tasksFailed++;

    if (task.metrics?.durationMs) {
      totalDurationMs += task.metrics.durationMs;
      tasksWithDuration++;
    }
  }

  return {
    totalDurationMs,
    tasksCompleted,
    tasksSkipped,
    tasksFailed,
    avgTaskDurationMs: tasksWithDuration > 0 ? Math.round(totalDurationMs / tasksWithDuration) : 0,
  };
}

// ─── Reconciliation ──────────────────────────────────────────────

export interface ReconcileInput {
  actualOutcome: string;
  driftItems?: DriftItem[];
  /** Who initiated the reconciliation. */
  reconciledBy?: 'human' | 'auto';
}

/**
 * Build a reconciliation report from drift items and outcome.
 * Pure function — returns report without mutating state.
 */
export function buildReconciliationReport(
  planId: string,
  input: ReconcileInput,
): ReconciliationReport {
  const driftItems = input.driftItems ?? [];
  const accuracy = calculateDriftScore(driftItems);

  return {
    planId,
    accuracy,
    driftItems,
    summary: input.actualOutcome,
    reconciledAt: Date.now(),
  };
}

// ─── Auto-Reconciliation ────────────────────────────────────────

export interface AutoReconcileResult {
  canAutoReconcile: boolean;
  input?: ReconcileInput;
}

/**
 * Determine if a plan can be auto-reconciled and build the reconciliation input.
 * Returns null input if auto-reconciliation is not possible.
 *
 * Rules:
 * - Can't auto-reconcile if tasks are still in progress
 * - Can't auto-reconcile if too many non-completed tasks (>2 pending + failed)
 */
export function buildAutoReconcileInput(tasks: ReadonlyArray<PlanTask>): AutoReconcileResult {
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const skipped = tasks.filter((t) => t.status === 'skipped').length;
  const failed = tasks.filter((t) => t.status === 'failed').length;
  const pending = tasks.filter((t) => t.status === 'pending').length;
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length;

  if (inProgress > 0) return { canAutoReconcile: false };
  if (pending + failed > 2) return { canAutoReconcile: false };

  const driftItems: DriftItem[] = [];

  for (const task of tasks) {
    if (task.status === 'skipped') {
      driftItems.push({
        type: 'skipped',
        description: `Task '${task.title}' was skipped`,
        impact: 'medium',
        rationale: 'Task not executed during plan implementation',
      });
    } else if (task.status === 'failed') {
      driftItems.push({
        type: 'modified',
        description: `Task '${task.title}' failed`,
        impact: 'high',
        rationale: 'Task execution failed',
      });
    } else if (task.status === 'pending') {
      driftItems.push({
        type: 'skipped',
        description: `Task '${task.title}' was never started`,
        impact: 'low',
        rationale: 'Task left in pending state',
      });
    }
  }

  return {
    canAutoReconcile: true,
    input: {
      actualOutcome:
        pending === 0 && skipped === 0 && failed === 0
          ? 'All tasks completed'
          : `Auto-reconciled: ${completed}/${tasks.length} tasks completed, ${skipped} skipped, ${pending} pending, ${failed} failed`,
      driftItems,
      reconciledBy: 'auto',
    },
  };
}
