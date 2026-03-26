import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCuratorFacadeOps } from './curator-facade.js';
import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';

function mockRuntime(): AgentRuntime {
  return {
    curator: {
      getStatus: vi.fn().mockReturnValue({ initialized: true, entriesGroomed: 5 }),
      detectDuplicates: vi.fn().mockReturnValue([]),
      detectContradictions: vi.fn(),
      getContradictions: vi.fn().mockReturnValue([]),
      resolveContradiction: vi.fn().mockReturnValue({ resolved: true }),
      groomEntry: vi.fn().mockReturnValue({ groomed: true }),
      groomAll: vi.fn().mockReturnValue({ groomed: 10 }),
      consolidate: vi.fn().mockReturnValue({ duplicates: 0, stale: 0 }),
      healthAudit: vi.fn().mockReturnValue({ score: 85 }),
      getVersionHistory: vi.fn().mockReturnValue([]),
      recordSnapshot: vi.fn().mockReturnValue({ recorded: true }),
      getQueueStats: vi.fn().mockReturnValue({ total: 20, groomed: 15 }),
      enrichMetadata: vi.fn().mockReturnValue({ enriched: true }),
      detectContradictionsHybrid: vi.fn().mockReturnValue([]),
    },
    jobQueue: {
      enqueue: vi.fn().mockImplementation((_type, _params) => `job-${Date.now()}`),
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

function findOp(ops: OpDefinition[], name: string): OpDefinition {
  const op = ops.find((o) => o.name === name);
  if (!op) throw new Error(`Op "${name}" not found`);
  return op;
}

describe('createCuratorFacadeOps', () => {
  let runtime: ReturnType<typeof mockRuntime>;
  let ops: OpDefinition[];

  beforeEach(() => {
    runtime = mockRuntime();
    ops = createCuratorFacadeOps(runtime);
  });

  it('returns all expected ops', () => {
    const names = ops.map((o) => o.name);
    expect(names).toContain('curator_status');
    expect(names).toContain('curator_detect_duplicates');
    expect(names).toContain('curator_contradictions');
    expect(names).toContain('curator_resolve_contradiction');
    expect(names).toContain('curator_groom');
    expect(names).toContain('curator_groom_all');
    expect(names).toContain('curator_consolidate');
    expect(names).toContain('curator_health_audit');
    // Extra ops
    expect(names).toContain('curator_entry_history');
    expect(names).toContain('curator_record_snapshot');
    expect(names).toContain('curator_queue_stats');
    expect(names).toContain('curator_enrich');
    expect(names).toContain('curator_hybrid_contradictions');
    expect(names).toContain('curator_pipeline_status');
    expect(names).toContain('curator_enqueue_pipeline');
    expect(names).toContain('curator_schedule_start');
    expect(names).toContain('curator_schedule_stop');
  });

  it('assigns correct auth levels', () => {
    expect(findOp(ops, 'curator_status').auth).toBe('read');
    expect(findOp(ops, 'curator_detect_duplicates').auth).toBe('read');
    expect(findOp(ops, 'curator_contradictions').auth).toBe('read');
    expect(findOp(ops, 'curator_resolve_contradiction').auth).toBe('write');
    expect(findOp(ops, 'curator_groom').auth).toBe('write');
    expect(findOp(ops, 'curator_groom_all').auth).toBe('write');
    expect(findOp(ops, 'curator_consolidate').auth).toBe('write');
    expect(findOp(ops, 'curator_health_audit').auth).toBe('read');
  });

  describe('curator_status', () => {
    it('returns curator status', async () => {
      const result = await findOp(ops, 'curator_status').handler({});
      expect(result).toEqual({ initialized: true, entriesGroomed: 5 });
    });
  });

  describe('curator_detect_duplicates', () => {
    it('detects duplicates with defaults', async () => {
      const dupes = [{ entryA: 'a', entryB: 'b', similarity: 0.9 }];
      vi.mocked(runtime.curator.detectDuplicates).mockReturnValue(dupes as never);

      const result = await findOp(ops, 'curator_detect_duplicates').handler({});
      expect(result).toEqual(dupes);
      expect(runtime.curator.detectDuplicates).toHaveBeenCalledWith(undefined, undefined);
    });

    it('detects duplicates for specific entry', async () => {
      await findOp(ops, 'curator_detect_duplicates').handler({
        entryId: 'e1',
        threshold: 0.6,
      });
      expect(runtime.curator.detectDuplicates).toHaveBeenCalledWith('e1', 0.6);
    });
  });

  describe('curator_contradictions', () => {
    it('lists contradictions without detection', async () => {
      const contras = [{ id: 1, entryA: 'a', entryB: 'b' }];
      vi.mocked(runtime.curator.getContradictions).mockReturnValue(contras as never);

      const result = await findOp(ops, 'curator_contradictions').handler({
        status: 'open',
      });
      expect(result).toEqual(contras);
      expect(runtime.curator.detectContradictions).not.toHaveBeenCalled();
    });

    it('runs detection before listing when detect=true', async () => {
      await findOp(ops, 'curator_contradictions').handler({ detect: true });
      expect(runtime.curator.detectContradictions).toHaveBeenCalled();
      expect(runtime.curator.getContradictions).toHaveBeenCalled();
    });
  });

  describe('curator_resolve_contradiction', () => {
    it('resolves a contradiction', async () => {
      const result = await findOp(ops, 'curator_resolve_contradiction').handler({
        id: 1,
        resolution: 'resolved',
      });
      expect(result).toEqual({ resolved: true });
      expect(runtime.curator.resolveContradiction).toHaveBeenCalledWith(1, 'resolved');
    });

    it('dismisses a contradiction', async () => {
      await findOp(ops, 'curator_resolve_contradiction').handler({
        id: 2,
        resolution: 'dismissed',
      });
      expect(runtime.curator.resolveContradiction).toHaveBeenCalledWith(2, 'dismissed');
    });
  });

  describe('curator_groom', () => {
    it('grooms a single entry', async () => {
      const result = await findOp(ops, 'curator_groom').handler({ entryId: 'e1' });
      expect(result).toEqual({ groomed: true });
      expect(runtime.curator.groomEntry).toHaveBeenCalledWith('e1');
    });
  });

  describe('curator_groom_all', () => {
    it('grooms all entries', async () => {
      const result = await findOp(ops, 'curator_groom_all').handler({});
      expect(result).toEqual({ groomed: 10 });
    });
  });

  describe('curator_consolidate', () => {
    it('consolidates with default params', async () => {
      const result = await findOp(ops, 'curator_consolidate').handler({});
      expect(result).toEqual({ duplicates: 0, stale: 0 });
      expect(runtime.curator.consolidate).toHaveBeenCalledWith({
        dryRun: undefined,
        staleDaysThreshold: undefined,
        duplicateThreshold: undefined,
        contradictionThreshold: undefined,
      });
    });

    it('consolidates with custom params', async () => {
      await findOp(ops, 'curator_consolidate').handler({
        dryRun: false,
        staleDaysThreshold: 60,
        duplicateThreshold: 0.5,
        contradictionThreshold: 0.3,
      });
      expect(runtime.curator.consolidate).toHaveBeenCalledWith({
        dryRun: false,
        staleDaysThreshold: 60,
        duplicateThreshold: 0.5,
        contradictionThreshold: 0.3,
      });
    });
  });

  describe('curator_health_audit', () => {
    it('returns audit result', async () => {
      const result = await findOp(ops, 'curator_health_audit').handler({});
      expect(result).toEqual({ score: 85 });
    });
  });

  // ─── Extra ops (from curator-extra-ops) ─────────────────────────────

  describe('curator_entry_history', () => {
    it('returns version history', async () => {
      const history = [{ version: 1, changedAt: 123 }];
      vi.mocked(runtime.curator.getVersionHistory).mockReturnValue(history as never);

      const result = (await findOp(ops, 'curator_entry_history').handler({
        entryId: 'e1',
      })) as Record<string, unknown>;
      expect(result.entryId).toBe('e1');
      expect(result.history).toEqual(history);
      expect(result.count).toBe(1);
    });
  });

  describe('curator_record_snapshot', () => {
    it('records snapshot', async () => {
      const result = await findOp(ops, 'curator_record_snapshot').handler({
        entryId: 'e1',
        changedBy: 'user',
        changeReason: 'fix typo',
      });
      expect(result).toEqual({ recorded: true });
      expect(runtime.curator.recordSnapshot).toHaveBeenCalledWith('e1', 'user', 'fix typo');
    });
  });

  describe('curator_queue_stats', () => {
    it('returns queue statistics', async () => {
      const result = await findOp(ops, 'curator_queue_stats').handler({});
      expect(result).toEqual({ total: 20, groomed: 15 });
    });
  });

  describe('curator_enrich', () => {
    it('enriches entry metadata', async () => {
      const result = await findOp(ops, 'curator_enrich').handler({ entryId: 'e1' });
      expect(result).toEqual({ enriched: true });
      expect(runtime.curator.enrichMetadata).toHaveBeenCalledWith('e1');
    });
  });

  describe('curator_hybrid_contradictions', () => {
    it('detects contradictions with default threshold', async () => {
      const contras = [{ pair: ['a', 'b'], score: 0.8 }];
      vi.mocked(runtime.curator.detectContradictionsHybrid).mockReturnValue(contras as never);

      const result = await findOp(ops, 'curator_hybrid_contradictions').handler({});
      expect(result).toEqual(contras);
      expect(runtime.curator.detectContradictionsHybrid).toHaveBeenCalledWith(undefined);
    });

    it('uses custom threshold', async () => {
      await findOp(ops, 'curator_hybrid_contradictions').handler({ threshold: 0.6 });
      expect(runtime.curator.detectContradictionsHybrid).toHaveBeenCalledWith(0.6);
    });
  });

  describe('curator_pipeline_status', () => {
    it('returns queue and runner status', async () => {
      const result = (await findOp(ops, 'curator_pipeline_status').handler({})) as Record<
        string,
        unknown
      >;
      expect(result.queue).toEqual({ pending: 0, running: 0 });
      expect(result.runner).toEqual({ running: false, tickCount: 0 });
    });
  });

  describe('curator_enqueue_pipeline', () => {
    it('enqueues 3-step pipeline', async () => {
      let callCount = 0;
      vi.mocked(runtime.jobQueue.enqueue).mockImplementation(() => `job-${++callCount}`);

      const result = (await findOp(ops, 'curator_enqueue_pipeline').handler({
        entryId: 'e1',
      })) as Record<string, unknown>;
      expect(result.pipelineId).toBeDefined();
      expect(result.jobs).toHaveLength(3);
      expect(runtime.jobQueue.enqueue).toHaveBeenCalledTimes(3);
    });
  });

  describe('curator_schedule_start', () => {
    it('starts pipeline runner and scheduler', async () => {
      const result = (await findOp(ops, 'curator_schedule_start').handler({
        intervalMinutes: 30,
      })) as Record<string, unknown>;
      expect(result.started).toBe(true);
      expect(runtime.pipelineRunner.start).toHaveBeenCalled();
      expect(result.consolidationIntervalMs).toBe(30 * 60 * 1000);
    });
  });

  describe('curator_schedule_stop', () => {
    it('stops pipeline runner', async () => {
      const result = (await findOp(ops, 'curator_schedule_stop').handler({})) as Record<
        string,
        unknown
      >;
      expect(result.stopped).toBe(true);
      expect(runtime.pipelineRunner.stop).toHaveBeenCalled();
    });
  });
});
