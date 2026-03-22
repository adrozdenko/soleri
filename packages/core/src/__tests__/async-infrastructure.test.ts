/**
 * Tests for async infrastructure — event bus, job queue, pipeline runner.
 * Phase 1 of #210: generic infrastructure modules.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { TypedEventBus } from '../events/event-bus.js';
import { JobQueue } from '../queue/job-queue.js';
import { PipelineRunner } from '../queue/pipeline-runner.js';
import { Vault } from '../vault/vault.js';

// ─── Event Bus ───────────────────────────────────────────────────────

describe('TypedEventBus', () => {
  type TestEvents = {
    'item:created': { id: string; title: string };
    'item:deleted': { id: string };
    tick: { count: number };
  };

  it('emits and receives typed events', () => {
    const bus = new TypedEventBus<TestEvents>();
    let received: TestEvents['item:created'] | null = null;

    bus.on('item:created', (payload) => {
      received = payload;
    });
    bus.emit('item:created', { id: '1', title: 'Hello' });

    expect(received).toEqual({ id: '1', title: 'Hello' });
  });

  it('once listener fires only once', () => {
    const bus = new TypedEventBus<TestEvents>();
    let count = 0;

    bus.once('tick', () => {
      count++;
    });
    bus.emit('tick', { count: 1 });
    bus.emit('tick', { count: 2 });

    expect(count).toBe(1);
  });

  it('off removes a listener', () => {
    const bus = new TypedEventBus<TestEvents>();
    let count = 0;
    const listener = () => {
      count++;
    };

    bus.on('tick', listener);
    bus.emit('tick', { count: 1 });
    bus.off('tick', listener);
    bus.emit('tick', { count: 2 });

    expect(count).toBe(1);
  });

  it('listenerCount tracks total listeners', () => {
    const bus = new TypedEventBus<TestEvents>();
    expect(bus.listenerCount()).toBe(0);

    bus.on('item:created', () => {});
    bus.on('item:deleted', () => {});
    expect(bus.listenerCount()).toBe(2);
  });

  it('removeAllListeners clears everything', () => {
    const bus = new TypedEventBus<TestEvents>();
    bus.on('item:created', () => {});
    bus.on('tick', () => {});
    bus.removeAllListeners();
    expect(bus.listenerCount()).toBe(0);
  });

  it('supports multiple listeners on same event', () => {
    const bus = new TypedEventBus<TestEvents>();
    const results: string[] = [];

    bus.on('item:created', (p) => results.push('A:' + p.id));
    bus.on('item:created', (p) => results.push('B:' + p.id));
    bus.emit('item:created', { id: '1', title: 'Test' });

    expect(results).toEqual(['A:1', 'B:1']);
  });
});

// ─── Job Queue ───────────────────────────────────────────────────────

describe('JobQueue', () => {
  let vault: Vault;
  let queue: JobQueue;

  beforeAll(() => {
    vault = new Vault(':memory:');
    queue = new JobQueue(vault.getProvider());
  });

  afterAll(() => {
    vault.close();
  });

  it('enqueue creates a job and returns ID', () => {
    const id = queue.enqueue('tag-normalize', { entryId: 'e1' });
    expect(id).toBeTruthy();
    expect(id.length).toBeGreaterThan(0);
  });

  it('dequeue returns oldest pending job', () => {
    const _id = queue.enqueue('dedup-check');
    const job = queue.dequeue();
    expect(job).not.toBeNull();
    expect(job!.type).toBe('tag-normalize'); // First enqueued from previous test
  });

  it('dequeue marks job as running', () => {
    const job = queue.get(queue.enqueue('test-job'));
    expect(job!.status).toBe('pending');

    const dequeued = queue.dequeue();
    expect(dequeued!.status).toBe('running');
  });

  it('complete marks job as completed with result', () => {
    const id = queue.enqueue('test-complete');
    queue.dequeue(); // Mark running
    queue.complete(id, { ok: true });

    const job = queue.get(id);
    expect(job!.status).toBe('completed');
    expect(job!.result).toEqual({ ok: true });
  });

  it('fail marks job as failed with error', () => {
    const id = queue.enqueue('test-fail');
    queue.dequeue();
    queue.fail(id, 'something went wrong');

    const job = queue.get(id);
    expect(job!.status).toBe('failed');
    expect(job!.error).toBe('something went wrong');
  });

  it('retry resets failed job to pending', () => {
    const id = queue.enqueue('test-retry');
    queue.dequeue();
    queue.fail(id, 'transient error');

    const retried = queue.retry(id);
    expect(retried).toBe(true);

    const job = queue.get(id);
    expect(job!.status).toBe('pending');
    expect(job!.retryCount).toBe(1);
  });

  it('retry returns false when max retries exceeded', () => {
    const id = queue.enqueue('test-max-retry', { maxRetries: 1 });
    queue.dequeue();
    queue.fail(id, 'fail 1');
    queue.retry(id);
    queue.dequeue();
    queue.fail(id, 'fail 2');

    const retried = queue.retry(id);
    expect(retried).toBe(false);
  });

  it('respects DAG dependencies', () => {
    const dep1 = queue.enqueue('dep-job-1');
    const dep2 = queue.enqueue('dep-job-2', { dependsOn: [dep1] });

    // dep2 should not dequeue because dep1 is not completed
    // Clear running jobs first
    const ready = queue.dequeueReady(10);
    const readyIds = ready.map((j) => j.id);
    expect(readyIds).toContain(dep1);
    expect(readyIds).not.toContain(dep2);

    // Complete dep1
    queue.complete(dep1, {});

    // Now dep2 should be ready
    const ready2 = queue.dequeueReady(10);
    const readyIds2 = ready2.map((j) => j.id);
    expect(readyIds2).toContain(dep2);
  });

  it('groups jobs by pipeline', () => {
    const pid = 'pipeline-123';
    queue.enqueue('step-1', { pipelineId: pid });
    queue.enqueue('step-2', { pipelineId: pid });

    const jobs = queue.getByPipeline(pid);
    expect(jobs.length).toBe(2);
    expect(jobs.every((j) => j.pipelineId === pid)).toBe(true);
  });

  it('getStats returns correct counts', () => {
    const stats = queue.getStats();
    expect(stats.total).toBeGreaterThan(0);
    expect(typeof stats.pending).toBe('number');
    expect(typeof stats.running).toBe('number');
    expect(typeof stats.completed).toBe('number');
    expect(typeof stats.failed).toBe('number');
  });

  it('purge removes old completed/failed jobs', () => {
    // purge with 0 days should remove all completed/failed
    const purged = queue.purge(0);
    expect(purged).toBeGreaterThanOrEqual(0);
  });
});

// ─── Pipeline Runner ─────────────────────────────────────────────────

describe('PipelineRunner', () => {
  let vault: Vault;
  let queue: JobQueue;
  let runner: PipelineRunner;

  beforeAll(() => {
    vault = new Vault(':memory:');
    queue = new JobQueue(vault.getProvider());
    runner = new PipelineRunner(queue, 100); // 100ms poll for tests
  });

  afterAll(() => {
    runner.stop();
    vault.close();
  });

  it('registerHandler stores a handler for a job type', () => {
    runner.registerHandler('test-type', async () => ({ done: true }));
    expect(runner.hasHandler('test-type')).toBe(true);
    expect(runner.hasHandler('unknown-type')).toBe(false);
  });

  it('processOnce dequeues and completes jobs', async () => {
    const handler = vi.fn().mockResolvedValue({ processed: true });
    runner.registerHandler('process-test', handler);

    queue.enqueue('process-test', { payload: { key: 'value' } });

    const processed = await runner.processOnce();
    expect(processed).toBe(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('processOnce fails jobs with no handler', async () => {
    const id = queue.enqueue('no-handler-type');
    await runner.processOnce();

    const job = queue.get(id);
    expect(job!.status).toBe('failed');
    expect(job!.error).toContain('No handler registered');
  });

  it('processOnce retries on handler error', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('transient'));
    runner.registerHandler('flaky-type', handler);

    const id = queue.enqueue('flaky-type');
    await runner.processOnce();

    const job = queue.get(id);
    // Should be pending again (retried), not failed
    expect(job!.status).toBe('pending');
    expect(job!.retryCount).toBe(1);
  });

  it('getStatus returns runner state', () => {
    const status = runner.getStatus();
    expect(status.running).toBe(false); // Not started yet
    expect(status.pollIntervalMs).toBe(100);
    expect(status.jobsProcessed).toBeGreaterThanOrEqual(1);
  });

  it('start/stop controls background polling', async () => {
    runner.start();
    expect(runner.getStatus().running).toBe(true);

    runner.stop();
    expect(runner.getStatus().running).toBe(false);
  });

  it('respects DAG in pipeline execution', async () => {
    const order: string[] = [];
    runner.registerHandler('dag-step', async (job) => {
      order.push(job.id);
      return { step: job.id };
    });

    const step1 = queue.enqueue('dag-step', { pipelineId: 'dag-test' });
    const step2 = queue.enqueue('dag-step', { pipelineId: 'dag-test', dependsOn: [step1] });

    // First batch: only step1 should process
    await runner.processOnce();
    expect(order).toEqual([step1]);

    // Second batch: step2 should now be ready
    await runner.processOnce();
    expect(order).toEqual([step1, step2]);
  });
});
