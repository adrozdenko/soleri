import { describe, it, expect, vi } from 'vitest';
import { createIntakeOps } from './intake-ops.js';
import type { OpDefinition } from '../facades/types.js';

function makeMockPipeline() {
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

describe('createIntakeOps', () => {
  function findOp(ops: OpDefinition[], name: string): OpDefinition {
    const op = ops.find((o) => o.name === name);
    if (!op) throw new Error(`Op "${name}" not found`);
    return op;
  }

  it('returns 7 ops', () => {
    const ops = createIntakeOps(makeMockPipeline() as never);
    expect(ops).toHaveLength(7);
  });

  it('has all expected op names', () => {
    const ops = createIntakeOps(makeMockPipeline() as never);
    const names = ops.map((o) => o.name);
    expect(names).toEqual([
      'intake_ingest_book',
      'intake_process',
      'intake_status',
      'intake_preview',
      'ingest_url',
      'ingest_text',
      'ingest_batch',
    ]);
  });

  describe('when pipeline is null', () => {
    it('intake_ingest_book returns error', async () => {
      const ops = createIntakeOps(null);
      const result = (await findOp(ops, 'intake_ingest_book').handler({
        pdfPath: '/test.pdf', title: 'T', domain: 'd',
      })) as Record<string, unknown>;
      expect(result.error).toBe('Intake pipeline not configured');
    });

    it('intake_process returns error', async () => {
      const ops = createIntakeOps(null);
      const result = (await findOp(ops, 'intake_process').handler({ jobId: 'j1' })) as Record<string, unknown>;
      expect(result.error).toBe('Intake pipeline not configured');
    });

    it('intake_status returns error', async () => {
      const ops = createIntakeOps(null);
      const result = (await findOp(ops, 'intake_status').handler({})) as Record<string, unknown>;
      expect(result.error).toBe('Intake pipeline not configured');
    });

    it('intake_preview returns error', async () => {
      const ops = createIntakeOps(null);
      const result = (await findOp(ops, 'intake_preview').handler({
        pdfPath: '/x.pdf', title: 'T', domain: 'd', pageStart: 1, pageEnd: 5,
      })) as Record<string, unknown>;
      expect(result.error).toBe('Intake pipeline not configured');
    });
  });

  describe('when textIngester is null', () => {
    it('ingest_url returns error', async () => {
      const ops = createIntakeOps(makeMockPipeline() as never, null);
      const result = (await findOp(ops, 'ingest_url').handler({ url: 'https://example.com' })) as Record<string, unknown>;
      expect(result.error).toContain('Text ingester not configured');
    });

    it('ingest_text returns error', async () => {
      const ops = createIntakeOps(makeMockPipeline() as never, null);
      const result = (await findOp(ops, 'ingest_text').handler({
        text: 'hello', title: 'T',
      })) as Record<string, unknown>;
      expect(result.error).toContain('Text ingester not configured');
    });

    it('ingest_batch returns error', async () => {
      const ops = createIntakeOps(makeMockPipeline() as never, null);
      const result = (await findOp(ops, 'ingest_batch').handler({
        items: [{ text: 'a', title: 'A' }],
      })) as Record<string, unknown>;
      expect(result.error).toContain('Text ingester not configured');
    });
  });

  describe('intake_ingest_book', () => {
    it('delegates to pipeline.ingestBook', async () => {
      const pipeline = makeMockPipeline();
      const ops = createIntakeOps(pipeline as never);
      const result = await findOp(ops, 'intake_ingest_book').handler({
        pdfPath: '/book.pdf', title: 'My Book', domain: 'design', author: 'Author', chunkPageSize: 15, tags: ['tag1'],
      });
      expect(pipeline.ingestBook).toHaveBeenCalledWith({
        pdfPath: '/book.pdf', title: 'My Book', domain: 'design', author: 'Author', chunkPageSize: 15, tags: ['tag1'],
      });
      expect(result).toEqual({ jobId: 'j1', chunks: 5 });
    });
  });

  describe('intake_process', () => {
    it('delegates to pipeline.processChunks', async () => {
      const pipeline = makeMockPipeline();
      const ops = createIntakeOps(pipeline as never);
      await findOp(ops, 'intake_process').handler({ jobId: 'j1', count: 3 });
      expect(pipeline.processChunks).toHaveBeenCalledWith('j1', 3);
    });
  });

  describe('intake_status', () => {
    it('returns job and chunks when jobId provided', async () => {
      const pipeline = makeMockPipeline();
      const ops = createIntakeOps(pipeline as never);
      const result = (await findOp(ops, 'intake_status').handler({ jobId: 'j1' })) as Record<string, unknown>;
      expect(result.job).toEqual({ id: 'j1', status: 'active' });
      expect(result.chunks).toHaveLength(2);
    });

    it('returns error when job not found', async () => {
      const pipeline = makeMockPipeline();
      pipeline.getJob.mockReturnValue(null);
      const ops = createIntakeOps(pipeline as never);
      const result = (await findOp(ops, 'intake_status').handler({ jobId: 'missing' })) as Record<string, unknown>;
      expect(result.error).toContain('Job not found');
    });

    it('lists all jobs when no jobId', async () => {
      const pipeline = makeMockPipeline();
      const ops = createIntakeOps(pipeline as never);
      const result = (await findOp(ops, 'intake_status').handler({})) as Record<string, unknown>;
      expect(result.jobs).toHaveLength(2);
    });
  });

  describe('intake_preview', () => {
    it('delegates to pipeline.preview', async () => {
      const pipeline = makeMockPipeline();
      const ops = createIntakeOps(pipeline as never);
      await findOp(ops, 'intake_preview').handler({
        pdfPath: '/x.pdf', title: 'T', domain: 'd', pageStart: 1, pageEnd: 10,
      });
      expect(pipeline.preview).toHaveBeenCalledWith(
        { pdfPath: '/x.pdf', title: 'T', domain: 'd' }, 1, 10,
      );
    });
  });

  describe('ingest_url', () => {
    it('delegates to textIngester.ingestUrl', async () => {
      const ingester = makeMockTextIngester();
      const ops = createIntakeOps(makeMockPipeline() as never, ingester as never);
      const result = await findOp(ops, 'ingest_url').handler({
        url: 'https://example.com', domain: 'test', tags: ['t1'],
      });
      expect(ingester.ingestUrl).toHaveBeenCalledWith('https://example.com', { domain: 'test', tags: ['t1'] });
      expect(result).toEqual({ ingested: 3, duplicates: 1 });
    });
  });

  describe('ingest_text', () => {
    it('delegates to textIngester.ingestText with source', async () => {
      const ingester = makeMockTextIngester();
      const ops = createIntakeOps(makeMockPipeline() as never, ingester as never);
      await findOp(ops, 'ingest_text').handler({
        text: 'content', title: 'My Notes', sourceType: 'transcript', url: 'https://x.com', author: 'A', domain: 'd', tags: ['t'],
      });
      expect(ingester.ingestText).toHaveBeenCalledWith(
        'content',
        { type: 'transcript', title: 'My Notes', url: 'https://x.com', author: 'A' },
        { domain: 'd', tags: ['t'] },
      );
    });
  });

  describe('ingest_batch', () => {
    it('delegates to textIngester.ingestBatch', async () => {
      const ingester = makeMockTextIngester();
      const ops = createIntakeOps(makeMockPipeline() as never, ingester as never);
      await findOp(ops, 'ingest_batch').handler({
        items: [
          { text: 'a', title: 'A', sourceType: 'article', domain: 'x' },
          { text: 'b', title: 'B' },
        ],
      });
      expect(ingester.ingestBatch).toHaveBeenCalledWith([
        { text: 'a', source: { type: 'article', title: 'A', url: undefined, author: undefined }, opts: { domain: 'x', tags: undefined } },
        { text: 'b', source: { type: 'notes', title: 'B', url: undefined, author: undefined }, opts: { domain: undefined, tags: undefined } },
      ]);
    });
  });
});
