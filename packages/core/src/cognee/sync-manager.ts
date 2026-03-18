/**
 * CogneeSyncManager — queued, resilient sync between the Vault SQLite DB and Cognee.
 *
 * ## Architecture
 *
 * Two independent mechanisms:
 *
 * 1. **Drain** — pushes vault entries to Cognee via `addEntries()` API.
 *    Batch size: configurable (default 50). Retries: configurable (default 3) per item.
 *    Returns a `DrainResult` with `processed` count and `reason` when 0.
 *
 * 2. **Cognify** — triggers Cognee's graph building after data ingestion.
 *    Debounced: 30s sliding window (configurable). Multiple `addEntries()` calls
 *    coalesce into one `cognify()` call. This is intentional — cognify is expensive.
 *
 * These are INDEPENDENT. Drain can succeed while cognify is still debounced.
 * A drain returning `{ processed: 0 }` always includes a `reason` field explaining why.
 * It does NOT mean cognify was skipped or debounced.
 *
 * For bulk operations, use `drainAll({ forceCognify: true })` to trigger cognify
 * after each batch instead of relying on the debounce timer.
 *
 * ## Queue State Machine
 *
 * `pending` → `processing` → `completed` (success)
 * `pending` → `processing` → `pending`   (retry on error, attempts < maxRetries)
 * `pending` → `processing` → `failed`    (max retries exceeded)
 *
 * Ported from Salvador MCP's battle-tested cognee-sync module.
 */

import { createHash } from 'node:crypto';
import type { PersistenceProvider } from '../persistence/types.js';
import type { CogneeClient } from './client.js';
import type { IntelligenceEntry } from '../intelligence/types.js';
import type { DrainResult, DrainAllResult, DrainStopReason } from './types.js';

// ─── Types ──────────────────────────────────────────────────────────

export type SyncOp = 'ingest' | 'update' | 'delete';
export type SyncStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface SyncQueueItem {
  id: number;
  op: SyncOp;
  entryId: string;
  dataset: string;
  contentHash: string | null;
  status: SyncStatus;
  attempts: number;
  error: string | null;
  createdAt: number;
  processedAt: number | null;
}

export interface SyncManagerStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  queueSize: number;
  lastDrainAt: number | null;
}

export interface SyncManagerConfig {
  /** Max items per drain batch (default: 50) */
  batchSize?: number;
  /** Max retry attempts per item before marking failed (default: 3) */
  maxRetries?: number;
}

// ─── Defaults ────────────────────────────────────────────────────────

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_MAX_RETRIES = 3;

// ─── CogneeSyncManager ─────────────────────────────────────────────

export class CogneeSyncManager {
  private db: PersistenceProvider;
  private cognee: CogneeClient;
  private dataset: string;
  private batchSize: number;
  private maxRetries: number;
  private lastDrainAt: number | null = null;
  private drainTimer: ReturnType<typeof setInterval> | null = null;
  private wasAvailable: boolean = false;

  constructor(
    db: PersistenceProvider,
    cognee: CogneeClient,
    dataset: string,
    config?: SyncManagerConfig,
  ) {
    this.db = db;
    this.cognee = cognee;
    this.dataset = dataset;
    this.batchSize = config?.batchSize ?? DEFAULT_BATCH_SIZE;
    this.maxRetries = config?.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.initSchema();
    this.wasAvailable = cognee.isAvailable;
  }

  // ─── Schema ────────────────────────────────────────────────────

  private initSchema(): void {
    this.db.execSql(`
      CREATE TABLE IF NOT EXISTS cognee_sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        op TEXT NOT NULL,
        entry_id TEXT NOT NULL,
        dataset TEXT NOT NULL,
        content_hash TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        processed_at INTEGER
      )
    `);

    // Add cognee_ingested_hash column to entries table for reconciliation.
    // ALTER TABLE ... ADD COLUMN is a no-op error when the column already exists.
    try {
      this.db.run('ALTER TABLE entries ADD COLUMN cognee_ingested_hash TEXT');
    } catch {
      // Column already exists — expected on subsequent runs.
    }
  }

  // ─── Content hashing ──────────────────────────────────────────

  /**
   * SHA-256 of the serialized entry fields, truncated to 16 hex characters.
   * Deterministic for identical content — used to detect drift.
   */
  static contentHash(entry: IntelligenceEntry): string {
    const payload = JSON.stringify({
      id: entry.id,
      type: entry.type,
      domain: entry.domain,
      title: entry.title,
      severity: entry.severity,
      description: entry.description,
      context: entry.context ?? null,
      example: entry.example ?? null,
      counterExample: entry.counterExample ?? null,
      why: entry.why ?? null,
      tags: entry.tags,
      appliesTo: entry.appliesTo ?? [],
    });
    return createHash('sha256').update(payload).digest('hex').slice(0, 16);
  }

  // ─── Enqueue ──────────────────────────────────────────────────

  /**
   * Add an operation to the sync queue.
   *
   * @param op       The operation type (ingest | update | delete).
   * @param entryId  The vault entry ID.
   * @param entry    Optional entry for hash computation. If omitted, hash is null.
   */
  enqueue(op: SyncOp, entryId: string, entry?: IntelligenceEntry): void {
    const contentHash = entry ? CogneeSyncManager.contentHash(entry) : null;
    this.db.run(
      `INSERT INTO cognee_sync_queue (op, entry_id, dataset, content_hash)
       VALUES (@op, @entryId, @dataset, @contentHash)`,
      {
        op,
        entryId,
        dataset: this.dataset,
        contentHash,
      },
    );
  }

  // ─── Drain ────────────────────────────────────────────────────

  /**
   * Process up to `batchSize` pending items from the queue.
   *
   * Always returns a `DrainResult` with a `reason` when processed=0:
   * - `cognee_unavailable`: health check failed
   * - `auth_failed`: Cognee authentication failed (breaks batch early)
   * - `queue_empty`: no pending items
   * - `partial_failure`: some items failed within the batch
   *
   * @param opts.forceCognify  If true, trigger cognify synchronously after the batch
   *                           instead of relying on the debounce timer. Useful for bulk ops.
   */
  async drain(opts?: { forceCognify?: boolean }): Promise<DrainResult> {
    // Refresh health cache if stale, then check availability
    const health = await this.cognee.ensureHealthy();
    if (!health.available) {
      return {
        processed: 0,
        reason: 'cognee_unavailable',
        errors: [health.error ?? 'Health check failed'],
      };
    }

    // Claim a batch: select pending items
    const items = this.db.all<Record<string, unknown>>(
      `SELECT * FROM cognee_sync_queue
       WHERE status = 'pending' AND dataset = @dataset
       ORDER BY created_at ASC
       LIMIT @limit`,
      { dataset: this.dataset, limit: this.batchSize },
    );

    if (items.length === 0) {
      return { processed: 0, reason: 'queue_empty' };
    }

    let processed = 0;
    const errors: string[] = [];

    for (const raw of items) {
      const item = rowToQueueItem(raw);

      // Mark as processing
      this.db.run(
        `UPDATE cognee_sync_queue SET status = 'processing', attempts = attempts + 1 WHERE id = @id`,
        { id: item.id },
      );

      try {
        if (item.op === 'ingest' || item.op === 'update') {
          const entry = this.readEntry(item.entryId);
          if (!entry) {
            // Entry was deleted from vault before we could sync — mark completed
            this.markCompleted(item.id);
            processed++;
            continue;
          }

          const result = await this.cognee.addEntries([entry]);

          // Break early on auth failure — don't waste retries on all remaining items
          if (result.code === 'AUTH_FAILED') {
            this.revertToRetryOrFail(item, result.error ?? 'Auth failed');
            errors.push(`Auth failed for ${item.entryId}: ${result.error}`);
            return { processed, reason: 'auth_failed', errors };
          }

          if (result.added === 0) {
            throw new Error(
              `Cognee addEntries returned 0: ${result.error ?? 'unknown'} (code: ${result.code ?? 'none'})`,
            );
          }

          // Update the ingested hash on the entries table
          const hash = CogneeSyncManager.contentHash(entry);
          this.db.run(`UPDATE entries SET cognee_ingested_hash = @hash WHERE id = @id`, {
            hash,
            id: item.entryId,
          });

          this.markCompleted(item.id);
          processed++;
        } else if (item.op === 'delete') {
          await this.cognee.deleteEntries([item.entryId]);
          // Clear the ingested hash (entry may already be gone from entries table)
          this.db.run(`UPDATE entries SET cognee_ingested_hash = NULL WHERE id = @id`, {
            id: item.entryId,
          });
          this.markCompleted(item.id);
          processed++;
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        errors.push(`${item.entryId}: ${errorMsg}`);
        this.revertToRetryOrFail(item, errorMsg);
      }
    }

    this.lastDrainAt = Math.floor(Date.now() / 1000);

    // Force cognify if requested (bypasses debounce timer)
    if (opts?.forceCognify && processed > 0) {
      await this.cognee.cognify(this.dataset);
    }

    const reason: DrainStopReason | undefined = errors.length > 0 ? 'partial_failure' : undefined;
    return { processed, reason, errors: errors.length > 0 ? errors : undefined };
  }

  // ─── Drain All ──────────────────────────────────────────────────

  /**
   * Drain the entire queue in a loop until empty or unrecoverable error.
   *
   * @param opts.forceCognify   Trigger cognify after each batch (default: false)
   * @param opts.abortSignal    Cancel the drain loop externally
   * @param opts.onProgress     Called after each batch with current stats
   */
  async drainAll(opts?: {
    forceCognify?: boolean;
    abortSignal?: AbortSignal;
    onProgress?: (stats: {
      processed: number;
      remaining: number;
      failed: number;
      batch: number;
    }) => void;
  }): Promise<DrainAllResult> {
    const start = Date.now();
    let totalProcessed = 0;
    let totalFailed = 0;
    let batches = 0;
    let lastReason: DrainStopReason | undefined;

    while (true) {
      if (opts?.abortSignal?.aborted) break;

      const result = await this.drain({ forceCognify: opts?.forceCognify });

      if (result.processed === 0) {
        lastReason = result.reason;
        // queue_empty is the normal exit; other reasons are errors
        break;
      }

      totalProcessed += result.processed;
      batches++;

      if (result.errors) {
        totalFailed += result.errors.length;
      }

      const stats = this.getStats();
      opts?.onProgress?.({
        processed: totalProcessed,
        remaining: stats.pending,
        failed: totalFailed,
        batch: batches,
      });
    }

    return {
      totalProcessed,
      totalFailed,
      batches,
      durationMs: Date.now() - start,
      reason: lastReason,
    };
  }

  // ─── Reconciliation ───────────────────────────────────────────

  /**
   * Find entries whose cognee_ingested_hash is NULL or doesn't match the
   * current content hash. Enqueue dirty entries for re-ingestion.
   *
   * Returns the number of entries enqueued.
   */
  reconcile(): number {
    // Get all entries that either have never been ingested or whose content changed
    const rows = this.db.all<Record<string, unknown>>(
      `SELECT * FROM entries WHERE cognee_ingested_hash IS NULL
       UNION ALL
       SELECT * FROM entries WHERE cognee_ingested_hash IS NOT NULL`,
    );

    let enqueued = 0;

    for (const raw of rows) {
      const entry = this.rowToEntry(raw);
      const currentHash = CogneeSyncManager.contentHash(entry);
      const ingestedHash = raw.cognee_ingested_hash as string | null;

      if (ingestedHash === currentHash) continue;

      // Determine op: null hash means never ingested, mismatched means update
      const op: SyncOp = ingestedHash === null ? 'ingest' : 'update';

      // Avoid duplicate pending items for the same entry
      const existing = this.db.get<{ id: number }>(
        `SELECT id FROM cognee_sync_queue
         WHERE entry_id = @entryId AND dataset = @dataset AND status = 'pending'`,
        { entryId: entry.id, dataset: this.dataset },
      );

      if (!existing) {
        this.enqueue(op, entry.id, entry);
        enqueued++;
      }
    }

    return enqueued;
  }

  // ─── Stats ────────────────────────────────────────────────────

  getStats(): SyncManagerStats {
    const countByStatus = (status: SyncStatus): number => {
      const row = this.db.get<{ count: number }>(
        `SELECT COUNT(*) as count FROM cognee_sync_queue WHERE status = @status AND dataset = @dataset`,
        { status, dataset: this.dataset },
      );
      return row?.count ?? 0;
    };

    const pending = countByStatus('pending');
    const processing = countByStatus('processing');
    const completed = countByStatus('completed');
    const failed = countByStatus('failed');

    return {
      pending,
      processing,
      completed,
      failed,
      queueSize: pending + processing,
      lastDrainAt: this.lastDrainAt,
    };
  }

  // ─── Health-flip detection ────────────────────────────────────

  /**
   * Detects an unavailable-to-available transition on the Cognee client.
   * When Cognee comes back online, automatically triggers a drain.
   *
   * Call this periodically (e.g. after each health check).
   */
  async checkHealthFlip(): Promise<void> {
    const nowAvailable = this.cognee.isAvailable;
    if (nowAvailable && !this.wasAvailable) {
      // Cognee just came back online — drain the queue
      await this.drain();
    }
    this.wasAvailable = nowAvailable;
  }

  // ─── Cleanup ──────────────────────────────────────────────────

  /**
   * Clear any periodic drain timer.
   */
  close(): void {
    if (this.drainTimer) {
      clearInterval(this.drainTimer);
      this.drainTimer = null;
    }
  }

  // ─── Private helpers ──────────────────────────────────────────

  private markCompleted(id: number): void {
    this.db.run(
      `UPDATE cognee_sync_queue SET status = 'completed', processed_at = unixepoch() WHERE id = @id`,
      { id },
    );
  }

  /**
   * Revert a queue item to pending (for retry) or mark as failed (max retries exceeded).
   */
  private revertToRetryOrFail(item: SyncQueueItem, errorMsg: string): void {
    const attempts = item.attempts + 1; // Already incremented in the processing step
    if (attempts >= this.maxRetries) {
      this.db.run(
        `UPDATE cognee_sync_queue SET status = 'failed', error = @error, processed_at = unixepoch() WHERE id = @id`,
        { id: item.id, error: errorMsg },
      );
    } else {
      this.db.run(
        `UPDATE cognee_sync_queue SET status = 'pending', error = @error WHERE id = @id`,
        { id: item.id, error: errorMsg },
      );
    }
  }

  /**
   * Read an entry from the entries table by ID.
   * Returns null if the entry doesn't exist.
   */
  private readEntry(id: string): IntelligenceEntry | null {
    const row = this.db.get<Record<string, unknown>>('SELECT * FROM entries WHERE id = @id', {
      id,
    });
    return row ? this.rowToEntry(row) : null;
  }

  /**
   * Convert a raw DB row into an IntelligenceEntry.
   */
  private rowToEntry(row: Record<string, unknown>): IntelligenceEntry {
    return {
      id: row.id as string,
      type: row.type as IntelligenceEntry['type'],
      domain: row.domain as string,
      title: row.title as string,
      severity: row.severity as IntelligenceEntry['severity'],
      description: row.description as string,
      context: (row.context as string) ?? undefined,
      example: (row.example as string) ?? undefined,
      counterExample: (row.counter_example as string) ?? undefined,
      why: (row.why as string) ?? undefined,
      tags: JSON.parse((row.tags as string) || '[]'),
      appliesTo: JSON.parse((row.applies_to as string) || '[]'),
      validFrom: (row.valid_from as number) ?? undefined,
      validUntil: (row.valid_until as number) ?? undefined,
    };
  }
}

// ─── Module-level helpers ─────────────────────────────────────────

function rowToQueueItem(row: Record<string, unknown>): SyncQueueItem {
  return {
    id: row.id as number,
    op: row.op as SyncOp,
    entryId: row.entry_id as string,
    dataset: row.dataset as string,
    contentHash: (row.content_hash as string) ?? null,
    status: row.status as SyncStatus,
    attempts: row.attempts as number,
    error: (row.error as string) ?? null,
    createdAt: row.created_at as number,
    processedAt: (row.processed_at as number) ?? null,
  };
}
