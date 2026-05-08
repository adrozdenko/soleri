/**
 * friction-metrics — observability for plan-pipeline ceremony.
 *
 * Captures per-plan signals (objective length, task count, vault search latency,
 * grade score, regrade attempts) so post-change tuning can be validated against
 * actual ceremony ratios instead of guesses. Storage is a single SQLite table;
 * write paths are defensive — instrumentation never breaks the op being measured.
 */

import type { PersistenceProvider } from '../persistence/types.js';

export interface CreateMetric {
  planId: string;
  objectiveLen: number;
  taskCount: number;
  vaultSearchMs: number;
}

export interface ApprovalMetric {
  planId: string;
  /** Numeric grade score (0-100) when known; null when grading was skipped. */
  gradeScore: number | null;
}

export interface FrictionAggregate {
  /** Window the aggregate covers, in days. */
  days: number;
  /** Number of plan rows in the window. */
  count: number;
  /** Median of objectiveLen across plans in the window. */
  medianObjectiveLen: number;
  /** Median of taskCount across plans in the window. */
  medianTaskCount: number;
  /** 50th percentile of vault_search_ms. */
  p50VaultSearchMs: number;
  /** 95th percentile of vault_search_ms. */
  p95VaultSearchMs: number;
  /** Distribution by integer grade score bucket (e.g. "A", "B", ...). null grades grouped under "skipped". */
  gradeDistribution: Record<string, number>;
  /** Average regrade_count across plans. */
  avgRegradeCount: number;
  /** Fraction of plans with regrade_count > 0 (0..1). */
  regradeRate: number;
}

export function ensureFrictionMetricsSchema(provider: PersistenceProvider): void {
  provider.execSql(`
    CREATE TABLE IF NOT EXISTS friction_metrics (
      plan_id TEXT PRIMARY KEY,
      objective_len INTEGER NOT NULL,
      task_count INTEGER NOT NULL,
      vault_search_ms INTEGER NOT NULL DEFAULT 0,
      grade_score REAL,
      regrade_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS friction_metrics_created_at ON friction_metrics(created_at);
  `);
}

/** Record metrics for a freshly created plan. Idempotent on planId conflict (keeps the first row). */
export function logCreatePlanMetric(provider: PersistenceProvider, metric: CreateMetric): void {
  provider.run(
    `INSERT OR IGNORE INTO friction_metrics
       (plan_id, objective_len, task_count, vault_search_ms)
     VALUES (?, ?, ?, ?)`,
    [metric.planId, metric.objectiveLen, metric.taskCount, metric.vaultSearchMs],
  );
}

/**
 * Record an approval attempt: bumps regrade_count and stores the latest grade
 * score (null when the plan was below the size-gate and skipped grading).
 * No-op when the plan_id has no creation row yet (instrumentation is best-effort).
 */
export function recordApprovalAttempt(provider: PersistenceProvider, metric: ApprovalMetric): void {
  provider.run(
    `UPDATE friction_metrics
        SET grade_score = ?, regrade_count = regrade_count + 1
      WHERE plan_id = ?`,
    [metric.gradeScore, metric.planId],
  );
}

interface MetricRow {
  objective_len: number;
  task_count: number;
  vault_search_ms: number;
  grade_score: number | null;
  regrade_count: number;
}

/**
 * Aggregate friction metrics over the most recent `days` window.
 * Returns zeroed aggregates when no rows exist; never throws on an empty table.
 */
export function queryFrictionAggregate(
  provider: PersistenceProvider,
  days: number,
): FrictionAggregate {
  const cutoffSec = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
  const rows = provider.all<MetricRow>(
    `SELECT objective_len, task_count, vault_search_ms, grade_score, regrade_count
       FROM friction_metrics
      WHERE created_at >= ?`,
    [cutoffSec],
  );

  if (rows.length === 0) {
    return {
      days,
      count: 0,
      medianObjectiveLen: 0,
      medianTaskCount: 0,
      p50VaultSearchMs: 0,
      p95VaultSearchMs: 0,
      gradeDistribution: {},
      avgRegradeCount: 0,
      regradeRate: 0,
    };
  }

  const objectiveLens = rows.map((r) => r.objective_len).sort((a, b) => a - b);
  const taskCounts = rows.map((r) => r.task_count).sort((a, b) => a - b);
  const vaultSearches = rows.map((r) => r.vault_search_ms).sort((a, b) => a - b);

  const gradeDistribution: Record<string, number> = {};
  let regradeSum = 0;
  let regradedRows = 0;
  for (const r of rows) {
    const bucket = scoreToBucket(r.grade_score);
    gradeDistribution[bucket] = (gradeDistribution[bucket] ?? 0) + 1;
    regradeSum += r.regrade_count;
    if (r.regrade_count > 0) regradedRows++;
  }

  return {
    days,
    count: rows.length,
    medianObjectiveLen: percentile(objectiveLens, 0.5),
    medianTaskCount: percentile(taskCounts, 0.5),
    p50VaultSearchMs: percentile(vaultSearches, 0.5),
    p95VaultSearchMs: percentile(vaultSearches, 0.95),
    gradeDistribution,
    avgRegradeCount: regradeSum / rows.length,
    regradeRate: regradedRows / rows.length,
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

function scoreToBucket(score: number | null): string {
  if (score === null) return 'skipped';
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}
