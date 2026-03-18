/**
 * Pipeline Runner — background polling loop for DAG job execution.
 *
 * Polls the job queue for ready jobs (dependencies completed),
 * dispatches them to registered handlers, and marks them complete/failed.
 *
 * Generic — handlers are registered by type, any module can add its own.
 */

import type { JobQueue, Job } from './job-queue.js';

// ─── Types ───────────────────────────────────────────────────────────

export type JobHandler = (job: Job) => Promise<unknown>;

export interface PipelineRunnerStatus {
  running: boolean;
  pollIntervalMs: number;
  tickCount: number;
  jobsProcessed: number;
  jobsFailed: number;
  jobsRetried: number;
  lastTickAt: string | null;
}

// ─── Class ───────────────────────────────────────────────────────────

export class PipelineRunner {
  private queue: JobQueue;
  private handlers = new Map<string, JobHandler>();
  private pollIntervalMs: number;
  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private tickCount = 0;
  private jobsProcessed = 0;
  private jobsFailed = 0;
  private jobsRetried = 0;
  private lastTickAt: string | null = null;
  private processing = false;

  constructor(queue: JobQueue, pollIntervalMs: number = 5000) {
    this.queue = queue;
    this.pollIntervalMs = pollIntervalMs;
  }

  /**
   * Register a handler for a job type. When a job of this type is dequeued,
   * the handler is called. Return value is stored as the job result.
   */
  registerHandler(type: string, handler: JobHandler): void {
    this.handlers.set(type, handler);
  }

  /**
   * Start background polling. Idempotent — calling start() twice is safe.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => this.tick(), this.pollIntervalMs);
  }

  /**
   * Stop background polling.
   */
  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Process one batch of ready jobs immediately (without waiting for poll).
   * Useful for testing or manual triggering.
   */
  async processOnce(batchSize: number = 5): Promise<number> {
    return this.processBatch(batchSize);
  }

  /**
   * Get runner status.
   */
  getStatus(): PipelineRunnerStatus {
    return {
      running: this.running,
      pollIntervalMs: this.pollIntervalMs,
      tickCount: this.tickCount,
      jobsProcessed: this.jobsProcessed,
      jobsFailed: this.jobsFailed,
      jobsRetried: this.jobsRetried,
      lastTickAt: this.lastTickAt,
    };
  }

  /**
   * Check if a handler is registered for a job type.
   */
  hasHandler(type: string): boolean {
    return this.handlers.has(type);
  }

  // ─── Internal ──────────────────────────────────────────────────────

  private tick(): void {
    if (this.processing) return; // Skip if previous tick still running
    this.tickCount++;
    this.lastTickAt = new Date().toISOString();
    this.processBatch(5).catch(() => {
      /* best-effort */
    });
  }

  private async processBatch(batchSize: number): Promise<number> {
    this.processing = true;
    let processed = 0;
    try {
      const jobs = this.queue.dequeueReady(batchSize);
      for (const job of jobs) {
        const handler = this.handlers.get(job.type);
        if (!handler) {
          this.queue.fail(job.id, `No handler registered for job type: ${job.type}`);
          this.jobsFailed++;
          continue;
        }

        try {
          const result = await handler(job);
          this.queue.complete(job.id, result);
          this.jobsProcessed++;
          processed++;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          const retried = this.queue.retry(job.id);
          if (retried) {
            this.jobsRetried++;
          } else {
            this.queue.fail(job.id, errorMsg);
            this.jobsFailed++;
          }
        }
      }
    } finally {
      this.processing = false;
    }
    return processed;
  }
}
