// ─── Intake Pipeline ──────────────────────────────────────────────
//
// 6-stage pipeline for ingesting PDF books into the vault:
//   1. Parse PDF + compute hash + create chunks → job record
//   2. Extract page text for each chunk
//   3. Classify chunk text via LLM
//   4. Dedup classified items against vault
//   5. Store unique items in vault
//   6. Finalize job with aggregate stats
//
// SQLite-backed job tracking for resumable processing.

import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import type { PersistenceProvider } from '../persistence/types.js';
import type { Vault } from '../vault/vault.js';
import type { LLMClient } from '../llm/llm-client.js';
import type { IntelligenceEntry } from '../intelligence/types.js';
import type {
  IntakeConfig,
  IntakeChunk,
  IntakeJobRecord,
  IntakePreviewResult,
  ClassifiedItem,
  KnowledgeType,
} from './types.js';
import { classifyChunk } from './content-classifier.js';
import { dedupItems } from './dedup-gate.js';
import { enrichExistingEntries } from './enrichment-engine.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_CHUNK_SIZE = 10;

/**
 * Map KnowledgeType → IntelligenceEntry.type.
 * Only 'pattern' and 'anti-pattern' map directly; everything else becomes 'rule'.
 */
function mapKnowledgeType(kt: KnowledgeType): IntelligenceEntry['type'] {
  if (kt === 'pattern') return 'pattern';
  if (kt === 'anti-pattern') return 'anti-pattern';
  return 'rule';
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Split concatenated PDF text into per-page segments.
 *
 * Strategy: split on form-feed characters first (common in pdf-parse output).
 * If that yields fewer segments than expected, fall back to equal-length splits.
 */
function splitIntoPages(text: string, numPages: number): string[] {
  if (numPages <= 0) return [text];

  // Try form-feed split first
  const ffPages = text.split('\f');
  if (ffPages.length >= numPages) {
    return ffPages.slice(0, numPages);
  }

  // Fallback: equal-length chunks
  const chunkSize = Math.ceil(text.length / numPages);
  const pages: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    pages.push(text.slice(i, i + chunkSize));
  }
  // Pad with empty strings if we somehow got fewer
  while (pages.length < numPages) {
    pages.push('');
  }
  return pages;
}

// =============================================================================
// PIPELINE
// =============================================================================

export class IntakePipeline {
  private provider: PersistenceProvider;
  private vault: Vault;
  private llm: LLMClient;

  constructor(provider: PersistenceProvider, vault: Vault, llm: LLMClient) {
    this.provider = provider;
    this.vault = vault;
    this.llm = llm;
    this.initSchema();
  }

  // ─── Schema ──────────────────────────────────────────────────────

  private initSchema(): void {
    this.provider.execSql(`
      CREATE TABLE IF NOT EXISTS intake_jobs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        config TEXT NOT NULL,
        pdf_meta TEXT,
        toc TEXT,
        stats TEXT,
        created_at INTEGER,
        updated_at INTEGER,
        completed_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS intake_chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL REFERENCES intake_jobs(id),
        chunk_index INTEGER,
        title TEXT,
        page_start INTEGER,
        page_end INTEGER,
        status TEXT DEFAULT 'pending',
        items_extracted INTEGER DEFAULT 0,
        items_stored INTEGER DEFAULT 0,
        items_deduped INTEGER DEFAULT 0,
        error TEXT,
        processed_at INTEGER
      );
    `);
  }

  // ─── Stage 1: Ingest Book ────────────────────────────────────────

  /**
   * Parse a PDF, compute its file hash, create fixed-size page chunks,
   * and persist the job + chunk records to the database.
   */
  async ingestBook(config: IntakeConfig): Promise<IntakeJobRecord> {
    const jobId = randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const chunkPageSize = config.chunkPageSize ?? DEFAULT_CHUNK_SIZE;

    // Read file
    const fileBuffer = readFileSync(config.pdfPath);
    const fileSize = statSync(config.pdfPath).size;
    const fileHash = createHash('sha256').update(fileBuffer).digest('hex');

    // Dynamic import of pdf-parse
    const pdfParse = (await import('pdf-parse')).default;
    const pdfData = await pdfParse(fileBuffer);
    const totalPages = pdfData.numpages;

    const pdfMeta = { totalPages, fileHash, fileSize };

    // Create chunk definitions (fixed N-page windows)
    const numChunks = Math.ceil(totalPages / chunkPageSize);

    this.provider.transaction(() => {
      // Insert job
      this.provider.run(
        `INSERT INTO intake_jobs (id, status, config, pdf_meta, toc, stats, created_at, updated_at, completed_at)
         VALUES (@id, @status, @config, @pdfMeta, @toc, @stats, @createdAt, @updatedAt, @completedAt)`,
        {
          id: jobId,
          status: 'initialized',
          config: JSON.stringify(config),
          pdfMeta: JSON.stringify(pdfMeta),
          toc: null,
          stats: null,
          createdAt: now,
          updatedAt: now,
          completedAt: null,
        },
      );

      // Insert chunk records
      for (let i = 0; i < numChunks; i++) {
        const pageStart = i * chunkPageSize + 1;
        const pageEnd = Math.min((i + 1) * chunkPageSize, totalPages);
        const chunkTitle = `${config.title} — pages ${pageStart}-${pageEnd}`;

        this.provider.run(
          `INSERT INTO intake_chunks (job_id, chunk_index, title, page_start, page_end, status)
           VALUES (@jobId, @chunkIndex, @title, @pageStart, @pageEnd, @status)`,
          {
            jobId,
            chunkIndex: i,
            title: chunkTitle,
            pageStart,
            pageEnd,
            status: 'pending',
          },
        );
      }
    });

    return this.getJob(jobId)!;
  }

  // ─── Stages 2-5: Process Chunks ──────────────────────────────────

  /**
   * Process up to `count` pending chunks for a job.
   *
   * For each chunk:
   *   2. Extract page text from PDF
   *   3. Classify via LLM
   *   4. Dedup against vault
   *   5. Store unique items
   *
   * When all chunks are done, finalizes the job (stage 6).
   */
  async processChunks(
    jobId: string,
    count: number = 5,
  ): Promise<{
    processed: number;
    itemsStored: number;
    itemsDeduped: number;
    remaining: number;
  }> {
    // Get pending chunks
    const pendingChunks = this.provider.all<Record<string, unknown>>(
      `SELECT * FROM intake_chunks WHERE job_id = @jobId AND status = 'pending' ORDER BY chunk_index ASC LIMIT @limit`,
      { jobId, limit: count },
    );

    if (pendingChunks.length === 0) {
      const remaining = this.countPendingChunks(jobId);
      return { processed: 0, itemsStored: 0, itemsDeduped: 0, remaining };
    }

    // Mark job as processing
    this.provider.run(
      `UPDATE intake_jobs SET status = 'processing', updated_at = @now WHERE id = @id`,
      { id: jobId, now: Math.floor(Date.now() / 1000) },
    );

    // Re-read config and parse PDF
    const job = this.getJob(jobId);
    if (!job) {
      return { processed: 0, itemsStored: 0, itemsDeduped: 0, remaining: 0 };
    }

    const fileBuffer = readFileSync(job.config.pdfPath);
    const pdfParse = (await import('pdf-parse')).default;
    const pdfData = await pdfParse(fileBuffer);
    const totalPages = job.pdfMeta?.totalPages ?? pdfData.numpages;
    const pages = splitIntoPages(pdfData.text, totalPages);

    let totalStored = 0;
    let totalDeduped = 0;
    let processed = 0;

    for (const chunkRow of pendingChunks) {
      const chunkId = chunkRow.id as number;
      const chunkIndex = chunkRow.chunk_index as number;
      const pageStart = chunkRow.page_start as number;
      const pageEnd = chunkRow.page_end as number;

      try {
        // Mark chunk processing
        this.provider.run(`UPDATE intake_chunks SET status = 'processing' WHERE id = @id`, {
          id: chunkId,
        });

        // Stage 2: Extract page text (1-indexed → 0-indexed)
        const chunkText = pages.slice(pageStart - 1, pageEnd).join('\n\n');
        const citation = `${job.config.title}, pages ${pageStart}-${pageEnd}`;

        // Stage 3: Classify
        // oxlint-disable-next-line eslint(no-await-in-loop)
        const classifiedItems = await classifyChunk(this.llm, chunkText, citation);

        // Stage 4: Dedup
        const dedupResults = dedupItems(classifiedItems, this.vault);
        const uniqueItems = dedupResults.filter((r) => !r.isDuplicate);
        const dupCount = dedupResults.filter((r) => r.isDuplicate).length;

        // Stage 4b: Enrich existing entries with new information
        enrichExistingEntries(dedupResults, this.vault);

        // Stage 5: Store unique items in vault
        let storedCount = 0;
        for (let itemIdx = 0; itemIdx < uniqueItems.length; itemIdx++) {
          const result = uniqueItems[itemIdx];
          const entry = classifiedItemToEntry(
            result.item,
            job.config.domain,
            jobId,
            chunkIndex,
            itemIdx,
            job.config.tags,
          );
          this.vault.add(entry);
          storedCount++;
        }

        // Update chunk record
        const now = Math.floor(Date.now() / 1000);
        this.provider.run(
          `UPDATE intake_chunks
           SET status = 'completed', items_extracted = @extracted, items_stored = @stored, items_deduped = @deduped, processed_at = @now
           WHERE id = @id`,
          {
            id: chunkId,
            extracted: classifiedItems.length,
            stored: storedCount,
            deduped: dupCount,
            now,
          },
        );

        totalStored += storedCount;
        totalDeduped += dupCount;
        processed++;
      } catch (err) {
        // Graceful degradation: mark chunk as failed, continue with others
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.provider.run(
          `UPDATE intake_chunks SET status = 'failed', error = @error, processed_at = @now WHERE id = @id`,
          { id: chunkId, error: errorMsg, now: Math.floor(Date.now() / 1000) },
        );
        processed++;
      }
    }

    // Update job timestamp
    this.provider.run(`UPDATE intake_jobs SET updated_at = @now WHERE id = @id`, {
      id: jobId,
      now: Math.floor(Date.now() / 1000),
    });

    // Check remaining
    const remaining = this.countPendingChunks(jobId);
    if (remaining === 0) {
      this.finalizeJob(jobId);
    }

    return { processed, itemsStored: totalStored, itemsDeduped: totalDeduped, remaining };
  }

  // ─── Preview ─────────────────────────────────────────────────────

  /**
   * Parse a page range from a PDF and classify it without storing.
   * Useful for previewing what the pipeline would extract.
   */
  async preview(
    config: IntakeConfig,
    pageStart: number,
    pageEnd: number,
  ): Promise<IntakePreviewResult> {
    const fileBuffer = readFileSync(config.pdfPath);
    const pdfParse = (await import('pdf-parse')).default;
    const pdfData = await pdfParse(fileBuffer);
    const totalPages = pdfData.numpages;

    const pages = splitIntoPages(pdfData.text, totalPages);
    const chunkText = pages.slice(pageStart - 1, pageEnd).join('\n\n');
    const citation = `${config.title}, pages ${pageStart}-${pageEnd}`;

    const items = await classifyChunk(this.llm, chunkText, citation);

    return {
      items,
      chunkText,
      pageRange: { start: pageStart, end: pageEnd },
    };
  }

  // ─── Queries ─────────────────────────────────────────────────────

  /**
   * Get a job record by ID.
   */
  getJob(jobId: string): IntakeJobRecord | null {
    const row = this.provider.get<Record<string, unknown>>(
      'SELECT * FROM intake_jobs WHERE id = @id',
      { id: jobId },
    );
    return row ? rowToJobRecord(row) : null;
  }

  /**
   * List all intake jobs.
   */
  listJobs(): IntakeJobRecord[] {
    const rows = this.provider.all<Record<string, unknown>>(
      'SELECT * FROM intake_jobs ORDER BY created_at DESC',
    );
    return rows.map(rowToJobRecord);
  }

  /**
   * Get all chunks for a job.
   */
  getChunks(jobId: string): IntakeChunk[] {
    const rows = this.provider.all<Record<string, unknown>>(
      'SELECT * FROM intake_chunks WHERE job_id = @jobId ORDER BY chunk_index ASC',
      { jobId },
    );
    return rows.map(rowToChunk);
  }

  // ─── Stage 6: Finalize ──────────────────────────────────────────

  /**
   * Sum stats from all chunks and mark the job as completed.
   */
  private finalizeJob(jobId: string): void {
    const chunks = this.provider.all<Record<string, unknown>>(
      'SELECT * FROM intake_chunks WHERE job_id = @jobId',
      { jobId },
    );

    let itemsExtracted = 0;
    let itemsStored = 0;
    let itemsDeduped = 0;
    let itemsFailed = 0;

    for (const chunk of chunks) {
      const status = chunk.status as string;
      if (status === 'completed') {
        itemsExtracted += (chunk.items_extracted as number) ?? 0;
        itemsStored += (chunk.items_stored as number) ?? 0;
        itemsDeduped += (chunk.items_deduped as number) ?? 0;
      } else if (status === 'failed') {
        itemsFailed++;
      }
    }

    const stats = { itemsExtracted, itemsStored, itemsDeduped, itemsFailed };
    const now = Math.floor(Date.now() / 1000);

    this.provider.run(
      `UPDATE intake_jobs SET status = 'completed', stats = @stats, updated_at = @now, completed_at = @now WHERE id = @id`,
      { id: jobId, stats: JSON.stringify(stats), now },
    );
  }

  // ─── Private helpers ─────────────────────────────────────────────

  private countPendingChunks(jobId: string): number {
    const result = this.provider.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM intake_chunks WHERE job_id = @jobId AND status = 'pending'`,
      { jobId },
    );
    return result?.count ?? 0;
  }
}

// =============================================================================
// ROW MAPPERS
// =============================================================================

function rowToJobRecord(row: Record<string, unknown>): IntakeJobRecord {
  return {
    id: row.id as string,
    status: row.status as IntakeJobRecord['status'],
    config: JSON.parse(row.config as string) as IntakeConfig,
    pdfMeta: row.pdf_meta ? JSON.parse(row.pdf_meta as string) : null,
    toc: row.toc ? JSON.parse(row.toc as string) : null,
    stats: row.stats ? JSON.parse(row.stats as string) : null,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
    completedAt: (row.completed_at as number) ?? null,
  };
}

function rowToChunk(row: Record<string, unknown>): IntakeChunk {
  return {
    id: row.id as number,
    jobId: row.job_id as string,
    chunkIndex: row.chunk_index as number,
    title: (row.title as string) ?? null,
    pageStart: row.page_start as number,
    pageEnd: row.page_end as number,
    status: row.status as IntakeChunk['status'],
    itemsExtracted: (row.items_extracted as number) ?? 0,
    itemsStored: (row.items_stored as number) ?? 0,
    itemsDeduped: (row.items_deduped as number) ?? 0,
    error: (row.error as string) ?? null,
    processedAt: (row.processed_at as number) ?? null,
  };
}

/**
 * Convert a ClassifiedItem to an IntelligenceEntry for vault storage.
 */
function classifiedItemToEntry(
  item: ClassifiedItem,
  domain: string,
  jobId: string,
  chunkIndex: number,
  itemIndex: number,
  extraTags?: string[],
): IntelligenceEntry {
  const entryType = mapKnowledgeType(item.type);
  const tags = [...item.tags, ...(extraTags ?? [])];

  return {
    id: `intake-${jobId}-${chunkIndex}-${itemIndex}`,
    type: entryType,
    domain,
    title: item.title,
    severity: item.severity,
    description: item.description,
    context: item.citation,
    tags,
  };
}
