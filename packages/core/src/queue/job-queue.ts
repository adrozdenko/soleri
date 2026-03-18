/**
 * Job Queue — SQLite-backed FIFO queue with DAG dependencies and retries.
 *
 * Generic infrastructure — not curator-specific. Reusable by agency, intake, etc.
 *
 * Features:
 * - Persistent jobs (survive process restarts)
 * - DAG dependency resolution (job B waits for job A)
 * - Pipeline grouping (group related jobs under one ID)
 * - Configurable retries with max limit
 * - Status tracking: pending → running → completed | failed
 */

import { randomUUID } from 'node:crypto';
import type { PersistenceProvider } from '../persistence/types.js';

// ─── Types ───────────────────────────────────────────────────────────

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Job {
  id: string;
  type: string;
  status: JobStatus;
  entryId: string | null;
  payload: Record<string, unknown>;
  dependsOn: string[];
  pipelineId: string | null;
  retryCount: number;
  maxRetries: number;
  result: unknown | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface JobQueueStats {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  total: number;
}

export interface EnqueueOptions {
  entryId?: string;
  payload?: Record<string, unknown>;
  dependsOn?: string[];
  pipelineId?: string;
  maxRetries?: number;
}

// ─── Class ───────────────────────────────────────────────────────────

export class JobQueue {
  private provider: PersistenceProvider;

  constructor(provider: PersistenceProvider) {
    this.provider = provider;
    this.initializeTable();
  }

  private initializeTable(): void {
    this.provider.execSql(`
      CREATE TABLE IF NOT EXISTS job_queue (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        entry_id TEXT,
        payload TEXT DEFAULT '{}',
        depends_on TEXT DEFAULT '[]',
        pipeline_id TEXT,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        result TEXT,
        error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        started_at TEXT,
        completed_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_job_queue_status ON job_queue(status);
      CREATE INDEX IF NOT EXISTS idx_job_queue_pipeline ON job_queue(pipeline_id);
    `);
  }

  /**
   * Enqueue a new job. Returns the job ID.
   */
  enqueue(type: string, options?: EnqueueOptions): string {
    const id = randomUUID().slice(0, 12);
    this.provider.run(
      `INSERT INTO job_queue (id, type, entry_id, payload, depends_on, pipeline_id, max_retries)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        type,
        options?.entryId ?? null,
        JSON.stringify(options?.payload ?? {}),
        JSON.stringify(options?.dependsOn ?? []),
        options?.pipelineId ?? null,
        options?.maxRetries ?? 3,
      ],
    );
    return id;
  }

  /**
   * Dequeue the oldest pending job with all dependencies completed.
   * Marks it as running. Returns null if no ready jobs.
   */
  dequeue(): Job | null {
    const ready = this.dequeueReady(1);
    return ready.length > 0 ? ready[0] : null;
  }

  /**
   * Dequeue up to `limit` pending jobs whose dependencies are all completed.
   */
  dequeueReady(limit: number = 10): Job[] {
    const rows = this.provider.all<JobRow>(
      "SELECT * FROM job_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?",
      [limit * 3], // Over-fetch to filter by deps
    );

    const ready: Job[] = [];
    for (const row of rows) {
      if (ready.length >= limit) break;
      const deps = JSON.parse(row.depends_on) as string[];
      if (deps.length === 0 || this.allDepsCompleted(deps)) {
        this.provider.run(
          "UPDATE job_queue SET status = 'running', started_at = datetime('now') WHERE id = ?",
          [row.id],
        );
        const job = rowToJob(row);
        job.status = 'running';
        ready.push(job);
      }
    }
    return ready;
  }

  /**
   * Mark a job as completed with an optional result.
   */
  complete(jobId: string, result?: unknown): void {
    this.provider.run(
      "UPDATE job_queue SET status = 'completed', completed_at = datetime('now'), result = ? WHERE id = ?",
      [result !== undefined ? JSON.stringify(result) : null, jobId],
    );
  }

  /**
   * Mark a job as failed with an error message.
   */
  fail(jobId: string, error: string): void {
    this.provider.run(
      "UPDATE job_queue SET status = 'failed', completed_at = datetime('now'), error = ? WHERE id = ?",
      [error, jobId],
    );
  }

  /**
   * Retry a failed job (resets to pending). Returns false if max retries exceeded.
   */
  retry(jobId: string): boolean {
    const row = this.provider.get<JobRow>('SELECT * FROM job_queue WHERE id = ?', [jobId]);
    if (!row) return false;
    if (row.retry_count >= row.max_retries) return false;

    this.provider.run(
      "UPDATE job_queue SET status = 'pending', retry_count = retry_count + 1, error = NULL, started_at = NULL, completed_at = NULL WHERE id = ?",
      [jobId],
    );
    return true;
  }

  /**
   * Get queue statistics.
   */
  getStats(): JobQueueStats {
    const rows = this.provider.all<{ status: string; count: number }>(
      'SELECT status, COUNT(*) as count FROM job_queue GROUP BY status',
    );
    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
      byStatus[row.status] = row.count;
      total += row.count;
    }
    return {
      pending: byStatus['pending'] ?? 0,
      running: byStatus['running'] ?? 0,
      completed: byStatus['completed'] ?? 0,
      failed: byStatus['failed'] ?? 0,
      total,
    };
  }

  /**
   * Get all jobs for a pipeline.
   */
  getByPipeline(pipelineId: string): Job[] {
    const rows = this.provider.all<JobRow>(
      'SELECT * FROM job_queue WHERE pipeline_id = ? ORDER BY created_at ASC',
      [pipelineId],
    );
    return rows.map(rowToJob);
  }

  /**
   * Get a single job by ID.
   */
  get(jobId: string): Job | null {
    const row = this.provider.get<JobRow>('SELECT * FROM job_queue WHERE id = ?', [jobId]);
    return row ? rowToJob(row) : null;
  }

  /**
   * Purge completed/failed jobs older than N days.
   */
  purge(olderThanDays: number = 30): number {
    const result = this.provider.run(
      "DELETE FROM job_queue WHERE status IN ('completed', 'failed') AND completed_at < datetime('now', ?)",
      [`-${olderThanDays} days`],
    );
    return result.changes;
  }

  // ─── Internal ──────────────────────────────────────────────────────

  private allDepsCompleted(deps: string[]): boolean {
    for (const depId of deps) {
      const row = this.provider.get<{ status: string }>(
        'SELECT status FROM job_queue WHERE id = ?',
        [depId],
      );
      if (!row || row.status !== 'completed') return false;
    }
    return true;
  }
}

// ─── Row Types ───────────────────────────────────────────────────────

interface JobRow {
  id: string;
  type: string;
  status: string;
  entry_id: string | null;
  payload: string;
  depends_on: string;
  pipeline_id: string | null;
  retry_count: number;
  max_retries: number;
  result: string | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

function rowToJob(row: JobRow): Job {
  return {
    id: row.id,
    type: row.type,
    status: row.status as JobStatus,
    entryId: row.entry_id,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    dependsOn: JSON.parse(row.depends_on) as string[],
    pipelineId: row.pipeline_id,
    retryCount: row.retry_count,
    maxRetries: row.max_retries,
    result: row.result ? JSON.parse(row.result) : null,
    error: row.error,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}
