/**
 * Colocated contract tests for intake-facade.ts.
 * Verifies that createIntakeFacadeOps correctly delegates to createIntakeOps
 * via the AgentRuntime. Detailed handler tests live in intake-ops.test.ts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createIntakeFacadeOps } from './intake-facade.js';
import { captureOps, executeOp } from '../../engine/test-helpers.js';
import type { CapturedOp } from '../../engine/test-helpers.js';
import type { AgentRuntime } from '../types.js';

// ─── Mock factories ──────────────────────────────────────────────────

function makeMockIntakePipeline() {
  return {
    ingestBook: vi.fn().mockResolvedValue({ jobId: 'j1', chunks: 5 }),
    processChunks: vi.fn().mockResolvedValue({ processed: 3, stored: 2 }),
    getJob: vi.fn().mockReturnValue({ id: 'j1', status: 'active' }),
    getChunks: vi.fn().mockReturnValue([{ id: 'c1' }, { id: 'c2' }]),
    listJobs: vi.fn().mockReturnValue([{ id: 'j1' }, { id: 'j2' }]),
    preview: vi.fn().mockResolvedValue({ items: [{ text: 'sample' }] }),
  };
}

function makeMockTextIngester() {
  return {
    ingestUrl: vi.fn().mockResolvedValue({ ingested: 3, duplicates: 1 }),
    ingestText: vi.fn().mockResolvedValue({ ingested: 2, duplicates: 0 }),
    ingestBatch: vi.fn().mockResolvedValue({ total: 4, ingested: 3, duplicates: 1 }),
  };
}

function makeRuntime(overrides: Partial<Record<string, unknown>> = {}): AgentRuntime {
  return {
    intakePipeline: makeMockIntakePipeline(),
    textIngester: makeMockTextIngester(),
    ...overrides,
  } as unknown as AgentRuntime;
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('intake-facade', () => {
  let runtime: AgentRuntime;
  let ops: Map<string, CapturedOp>;

  beforeEach(() => {
    runtime = makeRuntime();
    ops = captureOps(createIntakeFacadeOps(runtime));
  });

  // ─── Registration ─────────────────────────────────────────────────

  it('returns exactly 7 ops', () => {
    expect(ops.size).toBe(7);
  });

  it('includes all expected op names', () => {
    const expected = [
      'intake_ingest_book',
      'intake_process',
      'intake_status',
      'intake_preview',
      'ingest_url',
      'ingest_text',
      'ingest_batch',
    ];
    for (const name of expected) {
      expect(ops.has(name), `missing op: ${name}`).toBe(true);
    }
  });

  // ─── Auth levels ─────────────────────────────────────────────────

  it('has correct auth levels', () => {
    expect(ops.get('intake_ingest_book')!.auth).toBe('write');
    expect(ops.get('intake_process')!.auth).toBe('write');
    expect(ops.get('intake_status')!.auth).toBe('read');
    expect(ops.get('intake_preview')!.auth).toBe('read');
    expect(ops.get('ingest_url')!.auth).toBe('write');
    expect(ops.get('ingest_text')!.auth).toBe('write');
    expect(ops.get('ingest_batch')!.auth).toBe('write');
  });

  // ─── Delegation ─────────────────────────────────────────────────

  describe('intake_ingest_book', () => {
    it('delegates to pipeline.ingestBook', async () => {
      const result = await executeOp(ops, 'intake_ingest_book', {
        pdfPath: '/book.pdf', title: 'My Book', domain: 'design',
      });
      expect(result.success).toBe(true);
      const pipeline = runtime.intakePipeline as ReturnType<typeof makeMockIntakePipeline>;
      expect(pipeline.ingestBook).toHaveBeenCalled();
    });
  });

  describe('intake_process', () => {
    it('delegates to pipeline.processChunks', async () => {
      const result = await executeOp(ops, 'intake_process', { jobId: 'j1' });
      expect(result.success).toBe(true);
      const pipeline = runtime.intakePipeline as ReturnType<typeof makeMockIntakePipeline>;
      expect(pipeline.processChunks).toHaveBeenCalledWith('j1', undefined);
    });
  });

  describe('intake_status', () => {
    it('returns job and chunks when jobId provided', async () => {
      const result = await executeOp(ops, 'intake_status', { jobId: 'j1' });
      expect(result.success).toBe(true);
      const data = result.data as { job: { id: string }; chunks: unknown[] };
      expect(data.job.id).toBe('j1');
      expect(data.chunks).toHaveLength(2);
    });

    it('lists all jobs when no jobId', async () => {
      const result = await executeOp(ops, 'intake_status', {});
      expect(result.success).toBe(true);
      const data = result.data as { jobs: unknown[] };
      expect(data.jobs).toHaveLength(2);
    });
  });

  describe('intake_preview', () => {
    it('delegates to pipeline.preview', async () => {
      const result = await executeOp(ops, 'intake_preview', {
        pdfPath: '/x.pdf', title: 'T', domain: 'd', pageStart: 1, pageEnd: 10,
      });
      expect(result.success).toBe(true);
      const pipeline = runtime.intakePipeline as ReturnType<typeof makeMockIntakePipeline>;
      expect(pipeline.preview).toHaveBeenCalledWith(
        { pdfPath: '/x.pdf', title: 'T', domain: 'd' }, 1, 10,
      );
    });
  });

  describe('ingest_url', () => {
    it('delegates to textIngester.ingestUrl', async () => {
      const result = await executeOp(ops, 'ingest_url', {
        url: 'https://example.com', domain: 'test', tags: ['t1'],
      });
      expect(result.success).toBe(true);
      const ingester = runtime.textIngester as ReturnType<typeof makeMockTextIngester>;
      expect(ingester.ingestUrl).toHaveBeenCalledWith('https://example.com', {
        domain: 'test', tags: ['t1'],
      });
    });
  });

  describe('ingest_text', () => {
    it('delegates to textIngester.ingestText', async () => {
      const result = await executeOp(ops, 'ingest_text', {
        text: 'content', title: 'My Notes', sourceType: 'transcript',
      });
      expect(result.success).toBe(true);
      const ingester = runtime.textIngester as ReturnType<typeof makeMockTextIngester>;
      expect(ingester.ingestText).toHaveBeenCalled();
    });
  });

  describe('ingest_batch', () => {
    it('delegates to textIngester.ingestBatch', async () => {
      const result = await executeOp(ops, 'ingest_batch', {
        items: [{ text: 'a', title: 'A' }],
      });
      expect(result.success).toBe(true);
      const ingester = runtime.textIngester as ReturnType<typeof makeMockTextIngester>;
      expect(ingester.ingestBatch).toHaveBeenCalled();
    });
  });

  // ─── Graceful degradation ──────────────────────────────────────────

  describe('when pipeline is null', () => {
    it('intake ops return error', async () => {
      const rt = makeRuntime({ intakePipeline: null });
      const nullOps = captureOps(createIntakeFacadeOps(rt));
      const result = await executeOp(nullOps, 'intake_ingest_book', {
        pdfPath: '/x.pdf', title: 'T', domain: 'd',
      });
      expect(result.success).toBe(true);
      const data = result.data as { error: string };
      expect(data.error).toBe('Intake pipeline not configured');
    });
  });

  describe('when textIngester is null', () => {
    it('ingest ops return error', async () => {
      const rt = makeRuntime({ textIngester: null });
      const nullOps = captureOps(createIntakeFacadeOps(rt));
      const result = await executeOp(nullOps, 'ingest_url', {
        url: 'https://example.com',
      });
      expect(result.success).toBe(true);
      const data = result.data as { error: string };
      expect(data.error).toContain('Text ingester not configured');
    });
  });
});
