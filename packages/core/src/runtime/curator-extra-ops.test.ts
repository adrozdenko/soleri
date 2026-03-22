/**
 * Colocated unit tests for curator-extra-ops.ts — mock-based, no real DB.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createCuratorExtraOps } from './curator-extra-ops.js';
import type { AgentRuntime } from './types.js';
import { captureOps } from '../engine/test-helpers.js';

function mockRuntime() {
  return {
    curator: {
      getVersionHistory: vi.fn().mockReturnValue([]),
      recordSnapshot: vi.fn().mockReturnValue({ recorded: true, historyId: 42 }),
      getQueueStats: vi.fn().mockReturnValue({ totalEntries: 5, groomedEntries: 3 }),
      enrichMetadata: vi.fn().mockReturnValue({ enriched: false, changes: [] }),
      detectContradictionsHybrid: vi.fn().mockResolvedValue({ contradictions: [], method: 'tfidf-only' }),
      consolidate: vi.fn(),
    },
    jobQueue: {
      enqueue: vi.fn().mockImplementation((type) => `job-${type}`),
      getStats: vi.fn().mockReturnValue({ pending: 0, running: 0 }),
    },
    pipelineRunner: {
      getStatus: vi.fn().mockReturnValue({ running: false, tickCount: 0 }),
      start: vi.fn(),
      stop: vi.fn(),
    },
  } as unknown as AgentRuntime;
}

describe('createCuratorExtraOps', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 9 ops with correct names', () => {
    const ops = createCuratorExtraOps(mockRuntime());
    expect(ops).toHaveLength(9);
    expect(ops.map((o) => o.name)).toEqual([
      'curator_entry_history',
      'curator_record_snapshot',
      'curator_queue_stats',
      'curator_enrich',
      'curator_hybrid_contradictions',
      'curator_pipeline_status',
      'curator_enqueue_pipeline',
      'curator_schedule_start',
      'curator_schedule_stop',
    ]);
  });

  describe('curator_entry_history', () => {
    it('returns history with count', async () => {
      const rt = mockRuntime();
      const history = [{ historyId: 1 }, { historyId: 2 }];
      (rt.curator.getVersionHistory as ReturnType<typeof vi.fn>).mockReturnValue(history);
      const ops = captureOps(createCuratorExtraOps(rt));
      const result = (await ops.get('curator_entry_history')!.handler({ entryId: 'e1' })) as {
        entryId: string;
        history: unknown[];
        count: number;
      };
      expect(result.entryId).toBe('e1');
      expect(result.count).toBe(2);
      expect(result.history).toBe(history);
    });
  });

  describe('curator_record_snapshot', () => {
    it('passes changedBy and changeReason to curator', async () => {
      const rt = mockRuntime();
      const ops = captureOps(createCuratorExtraOps(rt));
      await ops.get('curator_record_snapshot')!.handler({
        entryId: 'e1',
        changedBy: 'user',
        changeReason: 'manual',
      });
      expect(rt.curator.recordSnapshot).toHaveBeenCalledWith('e1', 'user', 'manual');
    });

    it('passes undefined for optional params', async () => {
      const rt = mockRuntime();
      const ops = captureOps(createCuratorExtraOps(rt));
      await ops.get('curator_record_snapshot')!.handler({ entryId: 'e1' });
      expect(rt.curator.recordSnapshot).toHaveBeenCalledWith('e1', undefined, undefined);
    });
  });

  describe('curator_queue_stats', () => {
    it('delegates to curator.getQueueStats', async () => {
      const rt = mockRuntime();
      const ops = captureOps(createCuratorExtraOps(rt));
      const result = await ops.get('curator_queue_stats')!.handler({});
      expect(result).toEqual({ totalEntries: 5, groomedEntries: 3 });
    });
  });

  describe('curator_enrich', () => {
    it('passes entryId to curator.enrichMetadata', async () => {
      const rt = mockRuntime();
      const ops = captureOps(createCuratorExtraOps(rt));
      await ops.get('curator_enrich')!.handler({ entryId: 'e1' });
      expect(rt.curator.enrichMetadata).toHaveBeenCalledWith('e1');
    });
  });

  describe('curator_hybrid_contradictions', () => {
    it('passes optional threshold', async () => {
      const rt = mockRuntime();
      const ops = captureOps(createCuratorExtraOps(rt));
      await ops.get('curator_hybrid_contradictions')!.handler({ threshold: 0.6 });
      expect(rt.curator.detectContradictionsHybrid).toHaveBeenCalledWith(0.6);
    });

    it('passes undefined when no threshold', async () => {
      const rt = mockRuntime();
      const ops = captureOps(createCuratorExtraOps(rt));
      await ops.get('curator_hybrid_contradictions')!.handler({});
      expect(rt.curator.detectContradictionsHybrid).toHaveBeenCalledWith(undefined);
    });
  });

  describe('curator_pipeline_status', () => {
    it('combines jobQueue and pipelineRunner status', async () => {
      const rt = mockRuntime();
      const ops = captureOps(createCuratorExtraOps(rt));
      const result = (await ops.get('curator_pipeline_status')!.handler({})) as {
        queue: unknown;
        runner: unknown;
      };
      expect(result.queue).toEqual({ pending: 0, running: 0 });
      expect(result.runner).toEqual({ running: false, tickCount: 0 });
    });
  });

  describe('curator_enqueue_pipeline', () => {
    it('enqueues 3 jobs in DAG order', async () => {
      const rt = mockRuntime();
      const ops = captureOps(createCuratorExtraOps(rt));
      const result = (await ops.get('curator_enqueue_pipeline')!.handler({ entryId: 'e1' })) as {
        pipelineId: string;
        jobs: string[];
      };
      expect(result.pipelineId).toMatch(/^pipe-/);
      expect(result.jobs).toHaveLength(3);
      expect(result.jobs).toEqual(['job-tag-normalize', 'job-dedup-check', 'job-auto-link']);
      // Verify dependency chain
      const calls = (rt.jobQueue.enqueue as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0][0]).toBe('tag-normalize');
      expect(calls[1][1].dependsOn).toEqual(['job-tag-normalize']);
      expect(calls[2][1].dependsOn).toEqual(['job-dedup-check']);
    });
  });

  describe('curator_schedule_start', () => {
    it('starts pipeline runner and sets interval', async () => {
      const rt = mockRuntime();
      (rt.pipelineRunner.getStatus as ReturnType<typeof vi.fn>).mockReturnValue({ running: true });
      const ops = captureOps(createCuratorExtraOps(rt));
      const result = (await ops.get('curator_schedule_start')!.handler({
        intervalMinutes: 30,
      })) as { started: boolean; consolidationIntervalMs: number };

      expect(result.started).toBe(true);
      expect(result.consolidationIntervalMs).toBe(30 * 60 * 1000);
      expect(rt.pipelineRunner.start).toHaveBeenCalledOnce();

      // Stop to clean up the interval
      await ops.get('curator_schedule_stop')!.handler({});
    });
  });

  describe('curator_schedule_stop', () => {
    it('stops pipeline runner', async () => {
      const rt = mockRuntime();
      const ops = captureOps(createCuratorExtraOps(rt));
      const result = (await ops.get('curator_schedule_stop')!.handler({})) as { stopped: boolean };
      expect(result.stopped).toBe(true);
      expect(rt.pipelineRunner.stop).toHaveBeenCalledOnce();
    });
  });

  describe('auth levels', () => {
    it('read ops have read auth', () => {
      const ops = captureOps(createCuratorExtraOps(mockRuntime()));
      expect(ops.get('curator_entry_history')!.auth).toBe('read');
      expect(ops.get('curator_queue_stats')!.auth).toBe('read');
      expect(ops.get('curator_hybrid_contradictions')!.auth).toBe('read');
      expect(ops.get('curator_pipeline_status')!.auth).toBe('read');
    });

    it('write ops have write auth', () => {
      const ops = captureOps(createCuratorExtraOps(mockRuntime()));
      expect(ops.get('curator_record_snapshot')!.auth).toBe('write');
      expect(ops.get('curator_enrich')!.auth).toBe('write');
      expect(ops.get('curator_enqueue_pipeline')!.auth).toBe('write');
      expect(ops.get('curator_schedule_start')!.auth).toBe('write');
      expect(ops.get('curator_schedule_stop')!.auth).toBe('write');
    });
  });
});
