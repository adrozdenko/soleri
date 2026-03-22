import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PipelineRunner } from './pipeline-runner.js';
import type { JobQueue, Job } from './job-queue.js';

// ─── Mock JobQueue ───────────────────────────────────────────────────

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    type: 'groom',
    status: 'running',
    entryId: null,
    payload: {},
    dependsOn: [],
    pipelineId: null,
    retryCount: 0,
    maxRetries: 3,
    result: null,
    error: null,
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    completedAt: null,
    ...overrides,
  };
}

function createMockQueue(jobs: Job[] = []): JobQueue {
  return {
    enqueue: vi.fn(),
    dequeue: vi.fn(),
    dequeueReady: vi.fn(() => {
      const batch = jobs.splice(0);
      return batch;
    }),
    complete: vi.fn(),
    fail: vi.fn(),
    retry: vi.fn(() => true),
    getStats: vi.fn(),
    getByPipeline: vi.fn(),
    get: vi.fn(),
    purge: vi.fn(),
  } as unknown as JobQueue;
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('PipelineRunner', () => {
  let runner: PipelineRunner;
  let mockQueue: JobQueue;

  afterEach(() => {
    runner?.stop();
  });

  describe('registerHandler', () => {
    it('registers a handler for a job type', () => {
      mockQueue = createMockQueue();
      runner = new PipelineRunner(mockQueue);
      runner.registerHandler('groom', vi.fn());
      expect(runner.hasHandler('groom')).toBe(true);
    });

    it('returns false for unregistered type', () => {
      mockQueue = createMockQueue();
      runner = new PipelineRunner(mockQueue);
      expect(runner.hasHandler('unknown')).toBe(false);
    });
  });

  describe('processOnce', () => {
    it('processes a batch of ready jobs', async () => {
      const handler = vi.fn().mockResolvedValue({ enriched: true });
      const job = makeJob({ type: 'groom' });
      mockQueue = createMockQueue([job]);
      runner = new PipelineRunner(mockQueue);
      runner.registerHandler('groom', handler);

      const processed = await runner.processOnce();
      expect(processed).toBe(1);
      expect(handler).toHaveBeenCalledWith(job);
      expect(mockQueue.complete).toHaveBeenCalledWith(job.id, { enriched: true });
    });

    it('fails jobs with no registered handler', async () => {
      const job = makeJob({ type: 'unregistered' });
      mockQueue = createMockQueue([job]);
      runner = new PipelineRunner(mockQueue);

      const processed = await runner.processOnce();
      expect(processed).toBe(0);
      expect(mockQueue.fail).toHaveBeenCalledWith(
        job.id,
        expect.stringContaining('No handler registered'),
      );
    });

    it('retries on handler error when retryable', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('transient'));
      const job = makeJob({ type: 'groom' });
      mockQueue = createMockQueue([job]);
      (mockQueue.retry as ReturnType<typeof vi.fn>).mockReturnValue(true);
      runner = new PipelineRunner(mockQueue);
      runner.registerHandler('groom', handler);

      await runner.processOnce();
      expect(mockQueue.retry).toHaveBeenCalledWith(job.id);
    });

    it('fails job when retry returns false (exhausted)', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('permanent'));
      const job = makeJob({ type: 'groom' });
      mockQueue = createMockQueue([job]);
      (mockQueue.retry as ReturnType<typeof vi.fn>).mockReturnValue(false);
      runner = new PipelineRunner(mockQueue);
      runner.registerHandler('groom', handler);

      await runner.processOnce();
      expect(mockQueue.fail).toHaveBeenCalledWith(job.id, 'permanent');
    });

    it('handles non-Error thrown values', async () => {
      const handler = vi.fn().mockRejectedValue('string-error');
      const job = makeJob({ type: 'groom' });
      mockQueue = createMockQueue([job]);
      (mockQueue.retry as ReturnType<typeof vi.fn>).mockReturnValue(false);
      runner = new PipelineRunner(mockQueue);
      runner.registerHandler('groom', handler);

      await runner.processOnce();
      expect(mockQueue.fail).toHaveBeenCalledWith(job.id, 'string-error');
    });

    it('returns 0 when no jobs are ready', async () => {
      mockQueue = createMockQueue([]);
      runner = new PipelineRunner(mockQueue);
      expect(await runner.processOnce()).toBe(0);
    });

    it('processes multiple jobs in one batch', async () => {
      const handler = vi.fn().mockResolvedValue('ok');
      const jobs = [
        makeJob({ id: 'j1', type: 'groom' }),
        makeJob({ id: 'j2', type: 'groom' }),
        makeJob({ id: 'j3', type: 'groom' }),
      ];
      mockQueue = createMockQueue(jobs);
      runner = new PipelineRunner(mockQueue);
      runner.registerHandler('groom', handler);

      const processed = await runner.processOnce(10);
      expect(processed).toBe(3);
      expect(handler).toHaveBeenCalledTimes(3);
    });
  });

  describe('start / stop', () => {
    it('start is idempotent', () => {
      mockQueue = createMockQueue();
      runner = new PipelineRunner(mockQueue, 100_000);
      runner.start();
      runner.start(); // second call should be a no-op
      const status = runner.getStatus();
      expect(status.running).toBe(true);
    });

    it('stop clears the interval', () => {
      mockQueue = createMockQueue();
      runner = new PipelineRunner(mockQueue, 100_000);
      runner.start();
      runner.stop();
      expect(runner.getStatus().running).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('returns initial status', () => {
      mockQueue = createMockQueue();
      runner = new PipelineRunner(mockQueue, 5000);
      const status = runner.getStatus();
      expect(status).toEqual({
        running: false,
        pollIntervalMs: 5000,
        tickCount: 0,
        jobsProcessed: 0,
        jobsFailed: 0,
        jobsRetried: 0,
        lastTickAt: null,
      });
    });

    it('tracks processed/failed/retried counts', async () => {
      const successHandler = vi.fn().mockResolvedValue('ok');
      const failHandler = vi.fn().mockRejectedValue(new Error('fail'));
      const successJob = makeJob({ id: 's1', type: 'success' });
      const failJob = makeJob({ id: 'f1', type: 'fail' });

      mockQueue = createMockQueue([successJob, failJob]);
      (mockQueue.retry as ReturnType<typeof vi.fn>).mockReturnValue(true);
      runner = new PipelineRunner(mockQueue);
      runner.registerHandler('success', successHandler);
      runner.registerHandler('fail', failHandler);

      await runner.processOnce();
      const status = runner.getStatus();
      expect(status.jobsProcessed).toBe(1);
      expect(status.jobsRetried).toBe(1);
    });
  });
});
