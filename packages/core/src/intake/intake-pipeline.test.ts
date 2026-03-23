import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntakePipeline } from './intake-pipeline.js';
import type { PersistenceProvider } from '../persistence/types.js';
import type { Vault } from '../vault/vault.js';
import type { LLMClient } from '../llm/llm-client.js';

// ─── Mock downstream modules ────────────────────────────────────────

vi.mock('./content-classifier.js', () => ({
  classifyChunk: vi.fn().mockResolvedValue([
    {
      type: 'pattern',
      title: 'Test Pattern',
      description: 'A test pattern',
      tags: ['test'],
      severity: 'suggestion',
      citation: 'test, pages 1-10',
    },
  ]),
}));

vi.mock('./dedup-gate.js', () => ({
  dedupItems: vi.fn().mockImplementation((items: unknown[]) =>
    items.map((item) => ({ item, isDuplicate: false, similarity: 0 })),
  ),
}));

vi.mock('node:fs', () => ({
  readFileSync: vi.fn().mockReturnValue(Buffer.from('fake-pdf-data')),
  statSync: vi.fn().mockReturnValue({ size: 1024 }),
}));

vi.mock('node:crypto', async () => {
  const actual = await vi.importActual<typeof import('node:crypto')>('node:crypto');
  return {
    ...actual,
    randomUUID: vi.fn().mockReturnValue('test-job-id-1234'),
    createHash: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnThis(),
      digest: vi.fn().mockReturnValue('abc123hash'),
    }),
  };
});

vi.mock('pdf-parse', () => ({
  default: vi.fn().mockResolvedValue({
    numpages: 20,
    text: 'Page one\fPage two\fPage three\fPage four\fPage five\fPage six\fPage seven\fPage eight\fPage nine\fPage ten\fPage eleven\fPage twelve\fPage thirteen\fPage fourteen\fPage fifteen\fPage sixteen\fPage seventeen\fPage eighteen\fPage nineteen\fPage twenty',
  }),
}));

// ─── Test Factories ─────────────────────────────────────────────────

function createMockProvider(): PersistenceProvider {
  const _store = new Map<string, unknown[]>();
  return {
    execSql: vi.fn(),
    run: vi.fn(),
    get: vi.fn().mockReturnValue(null),
    all: vi.fn().mockReturnValue([]),
    transaction: vi.fn().mockImplementation((fn: () => void) => fn()),
    close: vi.fn(),
  } as unknown as PersistenceProvider;
}

function createMockVault(): Vault {
  return {
    add: vi.fn(),
    exportAll: vi.fn().mockReturnValue({ entries: [] }),
  } as unknown as Vault;
}

function createMockLlm(): LLMClient {
  return {
    complete: vi.fn().mockResolvedValue({ text: '[]' }),
  } as unknown as LLMClient;
}

function createConfig(overrides = {}) {
  return {
    pdfPath: '/tmp/test.pdf',
    title: 'Test Book',
    domain: 'testing',
    ...overrides,
  };
}

// ─── IntakePipeline ─────────────────────────────────────────────────

describe('IntakePipeline', () => {
  let provider: PersistenceProvider;
  let vault: Vault;
  let llm: LLMClient;
  let pipeline: IntakePipeline;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = createMockProvider();
    vault = createMockVault();
    llm = createMockLlm();
    pipeline = new IntakePipeline(provider, vault, llm);
  });

  describe('constructor', () => {
    it('should initialize the database schema', () => {
      expect(provider.execSql).toHaveBeenCalledTimes(1);
      const sql = (provider.execSql as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS intake_jobs');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS intake_chunks');
    });
  });

  describe('ingestBook', () => {
    it('should create a job record via transaction', async () => {
      await pipeline.ingestBook(createConfig());

      expect(provider.transaction).toHaveBeenCalledTimes(1);
    });

    it('should insert job and chunk records', async () => {
      await pipeline.ingestBook(createConfig());

      const runCalls = (provider.run as ReturnType<typeof vi.fn>).mock.calls;
      const insertJobCall = runCalls.find((c: unknown[]) =>
        (c[0] as string).includes('INSERT INTO intake_jobs'),
      );
      expect(insertJobCall).toBeDefined();
      expect(insertJobCall![1]).toMatchObject({
        id: 'test-job-id-1234',
        status: 'initialized',
      });
    });

    it('should create chunks based on page count and chunk size', async () => {
      await pipeline.ingestBook(createConfig({ chunkPageSize: 5 }));

      const runCalls = (provider.run as ReturnType<typeof vi.fn>).mock.calls;
      const chunkInserts = runCalls.filter((c: unknown[]) =>
        (c[0] as string).includes('INSERT INTO intake_chunks'),
      );
      // 20 pages / 5 per chunk = 4 chunks
      expect(chunkInserts).toHaveLength(4);
    });

    it('should use default chunk size of 10 when not specified', async () => {
      await pipeline.ingestBook(createConfig());

      const runCalls = (provider.run as ReturnType<typeof vi.fn>).mock.calls;
      const chunkInserts = runCalls.filter((c: unknown[]) =>
        (c[0] as string).includes('INSERT INTO intake_chunks'),
      );
      // 20 pages / 10 per chunk = 2 chunks
      expect(chunkInserts).toHaveLength(2);
    });

    it('should call getJob to return the created record', async () => {
      vi.mocked(provider.get).mockReturnValue({
        id: 'test-job-id-1234',
        status: 'initialized',
        config: JSON.stringify(createConfig()),
        pdf_meta: JSON.stringify({ totalPages: 20, fileHash: 'abc123hash', fileSize: 1024 }),
        toc: null,
        stats: null,
        created_at: 100,
        updated_at: 100,
        completed_at: null,
      });

      const result = await pipeline.ingestBook(createConfig());
      expect(result.id).toBe('test-job-id-1234');
      expect(result.status).toBe('initialized');
    });
  });

  describe('processChunks', () => {
    it('should return zeros when no pending chunks exist', async () => {
      vi.mocked(provider.all).mockReturnValue([]);
      vi.mocked(provider.get).mockReturnValue({ count: 0 });

      const result = await pipeline.processChunks('job-1', 5);
      expect(result).toEqual({ processed: 0, itemsStored: 0, itemsDeduped: 0, remaining: 0 });
    });

    it('should return early when job not found after marking processing', async () => {
      vi.mocked(provider.all).mockReturnValueOnce([
        { id: 1, chunk_index: 0, page_start: 1, page_end: 10, status: 'pending' },
      ]);
      // getJob returns null
      vi.mocked(provider.get).mockReturnValue(null);

      const result = await pipeline.processChunks('nonexistent', 5);
      expect(result).toEqual({ processed: 0, itemsStored: 0, itemsDeduped: 0, remaining: 0 });
    });

    it('should process chunks and store items in vault', async () => {
      // pending chunks query
      vi.mocked(provider.all).mockReturnValueOnce([
        { id: 1, chunk_index: 0, page_start: 1, page_end: 10, status: 'pending' },
      ]);
      // getJob
      vi.mocked(provider.get).mockReturnValueOnce({
        id: 'job-1',
        status: 'processing',
        config: JSON.stringify(createConfig()),
        pdf_meta: JSON.stringify({ totalPages: 20, fileHash: 'abc', fileSize: 1024 }),
        toc: null,
        stats: null,
        created_at: 100,
        updated_at: 100,
        completed_at: null,
      });
      // countPendingChunks -> 0 remaining
      vi.mocked(provider.get).mockReturnValueOnce({ count: 0 });
      // finalizeJob chunks query
      vi.mocked(provider.all).mockReturnValueOnce([
        { status: 'completed', items_extracted: 1, items_stored: 1, items_deduped: 0 },
      ]);

      const result = await pipeline.processChunks('job-1', 5);
      expect(result.processed).toBe(1);
      expect(result.itemsStored).toBe(1);
      expect(result.remaining).toBe(0);
      expect(vault.add).toHaveBeenCalledTimes(1);
    });

    it('should handle chunk processing errors gracefully', async () => {
      const { classifyChunk } = await import('./content-classifier.js');
      vi.mocked(classifyChunk).mockRejectedValueOnce(new Error('LLM timeout'));

      vi.mocked(provider.all).mockReturnValueOnce([
        { id: 1, chunk_index: 0, page_start: 1, page_end: 10, status: 'pending' },
      ]);
      vi.mocked(provider.get).mockReturnValueOnce({
        id: 'job-1',
        status: 'processing',
        config: JSON.stringify(createConfig()),
        pdf_meta: JSON.stringify({ totalPages: 20, fileHash: 'abc', fileSize: 1024 }),
        toc: null,
        stats: null,
        created_at: 100,
        updated_at: 100,
        completed_at: null,
      });
      vi.mocked(provider.get).mockReturnValueOnce({ count: 0 });
      vi.mocked(provider.all).mockReturnValueOnce([
        { status: 'failed', items_extracted: 0, items_stored: 0, items_deduped: 0 },
      ]);

      const result = await pipeline.processChunks('job-1', 5);
      expect(result.processed).toBe(1);
      expect(result.itemsStored).toBe(0);

      // Should have marked chunk as failed
      const runCalls = (provider.run as ReturnType<typeof vi.fn>).mock.calls;
      const failUpdate = runCalls.find(
        (c: unknown[]) =>
          (c[0] as string).includes('UPDATE intake_chunks') &&
          (c[0] as string).includes("status = 'failed'"),
      );
      expect(failUpdate).toBeDefined();
    });

    it('should finalize job when no chunks remain', async () => {
      vi.mocked(provider.all).mockReturnValueOnce([
        { id: 1, chunk_index: 0, page_start: 1, page_end: 5, status: 'pending' },
      ]);
      vi.mocked(provider.get).mockReturnValueOnce({
        id: 'job-1',
        status: 'processing',
        config: JSON.stringify(createConfig()),
        pdf_meta: JSON.stringify({ totalPages: 20, fileHash: 'abc', fileSize: 1024 }),
        toc: null,
        stats: null,
        created_at: 100,
        updated_at: 100,
        completed_at: null,
      });
      vi.mocked(provider.get).mockReturnValueOnce({ count: 0 });
      vi.mocked(provider.all).mockReturnValueOnce([
        { status: 'completed', items_extracted: 1, items_stored: 1, items_deduped: 0 },
      ]);

      await pipeline.processChunks('job-1', 5);

      const runCalls = (provider.run as ReturnType<typeof vi.fn>).mock.calls;
      const finalizeCall = runCalls.find(
        (c: unknown[]) =>
          (c[0] as string).includes('UPDATE intake_jobs') &&
          (c[0] as string).includes("status = 'completed'"),
      );
      expect(finalizeCall).toBeDefined();
    });

    it('should track deduped items from dedup gate', async () => {
      const { dedupItems } = await import('./dedup-gate.js');
      vi.mocked(dedupItems).mockReturnValueOnce([
        {
          item: {
            type: 'pattern',
            title: 'Dup',
            description: 'dup',
            tags: [],
            severity: 'suggestion',
            citation: 'test',
          },
          isDuplicate: true,
          similarity: 0.9,
          bestMatchId: 'existing-1',
        },
        {
          item: {
            type: 'pattern',
            title: 'New',
            description: 'new',
            tags: [],
            severity: 'suggestion',
            citation: 'test',
          },
          isDuplicate: false,
          similarity: 0.1,
        },
      ]);

      const { classifyChunk } = await import('./content-classifier.js');
      vi.mocked(classifyChunk).mockResolvedValueOnce([
        {
          type: 'pattern',
          title: 'Dup',
          description: 'dup',
          tags: [],
          severity: 'suggestion',
          citation: 'test',
        },
        {
          type: 'pattern',
          title: 'New',
          description: 'new',
          tags: [],
          severity: 'suggestion',
          citation: 'test',
        },
      ]);

      vi.mocked(provider.all).mockReturnValueOnce([
        { id: 1, chunk_index: 0, page_start: 1, page_end: 10, status: 'pending' },
      ]);
      vi.mocked(provider.get).mockReturnValueOnce({
        id: 'job-1',
        status: 'processing',
        config: JSON.stringify(createConfig()),
        pdf_meta: JSON.stringify({ totalPages: 20, fileHash: 'abc', fileSize: 1024 }),
        toc: null,
        stats: null,
        created_at: 100,
        updated_at: 100,
        completed_at: null,
      });
      vi.mocked(provider.get).mockReturnValueOnce({ count: 0 });
      vi.mocked(provider.all).mockReturnValueOnce([
        { status: 'completed', items_extracted: 2, items_stored: 1, items_deduped: 1 },
      ]);

      const result = await pipeline.processChunks('job-1', 5);
      expect(result.itemsStored).toBe(1);
      expect(result.itemsDeduped).toBe(1);
    });
  });

  describe('getJob', () => {
    it('should return null when job does not exist', () => {
      vi.mocked(provider.get).mockReturnValue(null);
      expect(pipeline.getJob('nonexistent')).toBeNull();
    });

    it('should parse JSON fields in job row', () => {
      const config = createConfig();
      vi.mocked(provider.get).mockReturnValue({
        id: 'job-1',
        status: 'initialized',
        config: JSON.stringify(config),
        pdf_meta: JSON.stringify({ totalPages: 10, fileHash: 'abc', fileSize: 512 }),
        toc: null,
        stats: null,
        created_at: 100,
        updated_at: 200,
        completed_at: null,
      });

      const job = pipeline.getJob('job-1');
      expect(job).not.toBeNull();
      expect(job!.config).toEqual(config);
      expect(job!.pdfMeta).toEqual({ totalPages: 10, fileHash: 'abc', fileSize: 512 });
      expect(job!.toc).toBeNull();
      expect(job!.stats).toBeNull();
    });

    it('should parse stats when present', () => {
      const stats = { itemsExtracted: 10, itemsStored: 8, itemsDeduped: 2, itemsFailed: 0 };
      vi.mocked(provider.get).mockReturnValue({
        id: 'job-1',
        status: 'completed',
        config: JSON.stringify(createConfig()),
        pdf_meta: null,
        toc: null,
        stats: JSON.stringify(stats),
        created_at: 100,
        updated_at: 200,
        completed_at: 300,
      });

      const job = pipeline.getJob('job-1');
      expect(job!.stats).toEqual(stats);
      expect(job!.completedAt).toBe(300);
    });
  });

  describe('listJobs', () => {
    it('should return empty array when no jobs exist', () => {
      vi.mocked(provider.all).mockReturnValue([]);
      expect(pipeline.listJobs()).toEqual([]);
    });

    it('should map rows to job records', () => {
      vi.mocked(provider.all).mockReturnValue([
        {
          id: 'j1',
          status: 'completed',
          config: JSON.stringify(createConfig()),
          pdf_meta: null,
          toc: null,
          stats: null,
          created_at: 100,
          updated_at: 200,
          completed_at: 200,
        },
      ]);

      const jobs = pipeline.listJobs();
      expect(jobs).toHaveLength(1);
      expect(jobs[0].id).toBe('j1');
    });
  });

  describe('getChunks', () => {
    it('should return empty array when no chunks exist', () => {
      vi.mocked(provider.all).mockReturnValue([]);
      expect(pipeline.getChunks('job-1')).toEqual([]);
    });

    it('should map rows to chunk objects', () => {
      vi.mocked(provider.all).mockReturnValue([
        {
          id: 1,
          job_id: 'job-1',
          chunk_index: 0,
          title: 'Test chunk',
          page_start: 1,
          page_end: 10,
          status: 'completed',
          items_extracted: 5,
          items_stored: 3,
          items_deduped: 2,
          error: null,
          processed_at: 100,
        },
      ]);

      const chunks = pipeline.getChunks('job-1');
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toMatchObject({
        id: 1,
        jobId: 'job-1',
        chunkIndex: 0,
        pageStart: 1,
        pageEnd: 10,
        status: 'completed',
        itemsExtracted: 5,
        itemsStored: 3,
        itemsDeduped: 2,
      });
    });
  });

  describe('preview', () => {
    it('should classify text without storing in vault', async () => {
      const items = [
        {
          type: 'pattern' as const,
          title: 'Preview Item',
          description: 'preview desc',
          tags: ['test'],
          severity: 'suggestion' as const,
          citation: 'Test Book, pages 1-5',
        },
      ];

      const { classifyChunk } = await import('./content-classifier.js');
      vi.mocked(classifyChunk).mockResolvedValueOnce(items);

      const result = await pipeline.preview(createConfig(), 1, 5);
      expect(result.items).toEqual(items);
      expect(result.pageRange).toEqual({ start: 1, end: 5 });
      expect(vault.add).not.toHaveBeenCalled();
    });
  });
});
