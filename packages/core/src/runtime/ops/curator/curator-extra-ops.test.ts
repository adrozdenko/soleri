/**
 * Colocated unit tests for curator-extra-ops.ts — mock-based, no real DB.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createCuratorExtraOps } from './curator-extra-ops.js';
import type { AgentRuntime } from '../../types.js';
import { captureOps } from '../../../engine/test-helpers.js';

function mockRuntime() {
  return {
    // agentDir '' → loadAgentConfig returns {} → editSourceLoop resolves false.
    config: { agentDir: '' },
    curator: {
      getVersionHistory: vi.fn().mockReturnValue([]),
      recordSnapshot: vi.fn().mockReturnValue({ recorded: true, historyId: 42 }),
      getQueueStats: vi.fn().mockReturnValue({ totalEntries: 5, groomedEntries: 3 }),
      enrichMetadata: vi.fn().mockReturnValue({ enriched: false, changes: [] }),
      detectContradictionsHybrid: vi
        .fn()
        .mockResolvedValue({ contradictions: [], method: 'tfidf-only' }),
      consolidate: vi.fn(),
      recordEditDiff: vi.fn().mockReturnValue({ recorded: true, id: 1, diffKind: 'length_trim' }),
      runEditSourceLoop: vi.fn().mockReturnValue({ enabled: false, ingested: 0, proposals: [] }),
      getEditSourceProposals: vi.fn().mockReturnValue([]),
      approveEditSourceProposal: vi.fn().mockReturnValue({ updated: true, status: 'approved' }),
      rejectEditSourceProposal: vi.fn().mockReturnValue({ updated: true, status: 'rejected' }),
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
    shutdownRegistry: {
      register: vi.fn(),
      closeAll: vi.fn(),
      closeAllSync: vi.fn(),
      size: 0,
      isClosed: false,
    },
  } as unknown as AgentRuntime;
}

describe('createCuratorExtraOps', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 14 ops with correct names', () => {
    const ops = createCuratorExtraOps(mockRuntime());
    expect(ops).toHaveLength(14);
    expect(ops.map((o) => o.name)).toEqual([
      'curator_entry_history',
      'curator_record_snapshot',
      'curator_record_edit_diff',
      'curator_edit_source_scan',
      'curator_edit_source_proposals',
      'curator_approve_edit_source',
      'curator_reject_edit_source',
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

  describe('edit-source loop ops', () => {
    it('curator_record_edit_diff is gated off when the flag is disabled', async () => {
      const rt = mockRuntime();
      const ops = captureOps(createCuratorExtraOps(rt));
      const result = (await ops.get('curator_record_edit_diff')!.handler({
        outputId: 'e1',
        sourceRef: 'vault:capture-contract/pattern',
        runId: 'run-1',
        beforeText: 'long original',
        afterText: 'short',
      })) as { recorded: boolean };
      expect(result.recorded).toBe(false);
      expect(rt.curator.recordEditDiff).not.toHaveBeenCalled();
    });

    it('curator_edit_source_scan passes the resolved flag (disabled) to the loop', async () => {
      const rt = mockRuntime();
      const ops = captureOps(createCuratorExtraOps(rt));
      await ops.get('curator_edit_source_scan')!.handler({});
      expect(rt.curator.runEditSourceLoop).toHaveBeenCalledWith({
        enabled: false,
        entryId: undefined,
      });
    });

    it('curator_edit_source_proposals lists proposals with a count', async () => {
      const rt = mockRuntime();
      (rt.curator.getEditSourceProposals as ReturnType<typeof vi.fn>).mockReturnValue([
        { id: 'esp-1' },
        { id: 'esp-2' },
      ]);
      const ops = captureOps(createCuratorExtraOps(rt));
      const result = (await ops.get('curator_edit_source_proposals')!.handler({
        status: 'pending',
      })) as { proposals: unknown[]; count: number };
      expect(result.count).toBe(2);
      expect(rt.curator.getEditSourceProposals).toHaveBeenCalledWith({ status: 'pending' });
    });

    it('curator_approve_edit_source delegates to the human approve gate', async () => {
      const rt = mockRuntime();
      const ops = captureOps(createCuratorExtraOps(rt));
      const result = (await ops.get('curator_approve_edit_source')!.handler({
        id: 'esp-1',
        reason: 'real defect',
      })) as { status: string };
      expect(result.status).toBe('approved');
      expect(rt.curator.approveEditSourceProposal).toHaveBeenCalledWith('esp-1', 'real defect');
    });

    it('curator_reject_edit_source delegates to the human reject gate', async () => {
      const rt = mockRuntime();
      const ops = captureOps(createCuratorExtraOps(rt));
      await ops.get('curator_reject_edit_source')!.handler({ id: 'esp-1' });
      expect(rt.curator.rejectEditSourceProposal).toHaveBeenCalledWith('esp-1', undefined);
    });
  });

  describe('auth levels', () => {
    it('read ops have read auth', () => {
      const ops = captureOps(createCuratorExtraOps(mockRuntime()));
      expect(ops.get('curator_entry_history')!.auth).toBe('read');
      expect(ops.get('curator_queue_stats')!.auth).toBe('read');
      expect(ops.get('curator_hybrid_contradictions')!.auth).toBe('read');
      expect(ops.get('curator_pipeline_status')!.auth).toBe('read');
      expect(ops.get('curator_edit_source_proposals')!.auth).toBe('read');
    });

    it('write ops have write auth', () => {
      const ops = captureOps(createCuratorExtraOps(mockRuntime()));
      expect(ops.get('curator_record_snapshot')!.auth).toBe('write');
      expect(ops.get('curator_enrich')!.auth).toBe('write');
      expect(ops.get('curator_enqueue_pipeline')!.auth).toBe('write');
      expect(ops.get('curator_schedule_start')!.auth).toBe('write');
      expect(ops.get('curator_schedule_stop')!.auth).toBe('write');
      expect(ops.get('curator_record_edit_diff')!.auth).toBe('write');
      expect(ops.get('curator_edit_source_scan')!.auth).toBe('write');
      expect(ops.get('curator_approve_edit_source')!.auth).toBe('write');
      expect(ops.get('curator_reject_edit_source')!.auth).toBe('write');
    });
  });
});
