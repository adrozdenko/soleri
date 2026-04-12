// ─── Source Registry ──────────────────────────────────────────────
// Tracks provenance: which source spawned which vault entries.
// Immutable source layer inspired by Karpathy's raw/ directory concept,
// but backed by SQLite for queryability.

import type { PersistenceProvider } from '../persistence/types.js';

export interface IntakeSource {
  id: string;
  title: string;
  url: string | null;
  sourceType: string;
  author: string | null;
  domain: string;
  ingestedAt: number;
  entryCount: number;
  contentHash: string | null;
}

export class SourceRegistry {
  constructor(private provider: PersistenceProvider) {
    this.ensureTable();
  }

  private ensureTable(): void {
    this.provider.execSql(`
      CREATE TABLE IF NOT EXISTS intake_sources (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        url TEXT,
        source_type TEXT NOT NULL,
        author TEXT,
        domain TEXT NOT NULL DEFAULT 'general',
        ingested_at INTEGER NOT NULL DEFAULT (unixepoch()),
        entry_count INTEGER NOT NULL DEFAULT 0,
        content_hash TEXT
      );

      CREATE TABLE IF NOT EXISTS intake_source_entries (
        source_id TEXT NOT NULL REFERENCES intake_sources(id) ON DELETE CASCADE,
        entry_id TEXT NOT NULL,
        PRIMARY KEY (source_id, entry_id)
      );

      CREATE INDEX IF NOT EXISTS idx_source_entries_entry
        ON intake_source_entries(entry_id);
    `);
  }

  createSource(opts: {
    title: string;
    url?: string;
    sourceType: string;
    author?: string;
    domain?: string;
    contentHash?: string;
  }): string {
    const id = `src-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.provider.run(
      `INSERT INTO intake_sources (id, title, url, source_type, author, domain, content_hash)
       VALUES (@id, @title, @url, @sourceType, @author, @domain, @contentHash)`,
      {
        id,
        title: opts.title,
        url: opts.url ?? null,
        sourceType: opts.sourceType,
        author: opts.author ?? null,
        domain: opts.domain ?? 'general',
        contentHash: opts.contentHash ?? null,
      },
    );
    return id;
  }

  linkEntry(sourceId: string, entryId: string): void {
    this.provider.run(
      `INSERT OR IGNORE INTO intake_source_entries (source_id, entry_id) VALUES (@sourceId, @entryId)`,
      { sourceId, entryId },
    );
    this.provider.run(
      `UPDATE intake_sources SET entry_count = (
        SELECT COUNT(*) FROM intake_source_entries WHERE source_id = @sourceId
      ) WHERE id = @sourceId`,
      { sourceId },
    );
  }

  linkEntries(sourceId: string, entryIds: string[]): void {
    this.provider.transaction(() => {
      for (const entryId of entryIds) {
        this.provider.run(
          `INSERT OR IGNORE INTO intake_source_entries (source_id, entry_id) VALUES (@sourceId, @entryId)`,
          { sourceId, entryId },
        );
      }
      this.provider.run(
        `UPDATE intake_sources SET entry_count = (
          SELECT COUNT(*) FROM intake_source_entries WHERE source_id = @sourceId
        ) WHERE id = @sourceId`,
        { sourceId },
      );
    });
  }

  getSource(sourceId: string): IntakeSource | null {
    const row = this.provider.get<Record<string, unknown>>(
      'SELECT * FROM intake_sources WHERE id = @id',
      { id: sourceId },
    );
    return row ? this.rowToSource(row) : null;
  }

  listSources(opts?: { domain?: string; limit?: number }): IntakeSource[] {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (opts?.domain) {
      conditions.push('domain = @domain');
      params.domain = opts.domain;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = opts?.limit ?? 50;

    const rows = this.provider.all<Record<string, unknown>>(
      `SELECT * FROM intake_sources ${where} ORDER BY ingested_at DESC LIMIT @limit`,
      { ...params, limit },
    );
    return rows.map((r) => this.rowToSource(r));
  }

  getSourceEntries(sourceId: string): string[] {
    const rows = this.provider.all<{ entry_id: string }>(
      'SELECT entry_id FROM intake_source_entries WHERE source_id = @sourceId',
      { sourceId },
    );
    return rows.map((r) => r.entry_id);
  }

  findByUrl(url: string): IntakeSource | null {
    const row = this.provider.get<Record<string, unknown>>(
      'SELECT * FROM intake_sources WHERE url = @url ORDER BY ingested_at DESC LIMIT 1',
      { url },
    );
    return row ? this.rowToSource(row) : null;
  }

  private rowToSource(row: Record<string, unknown>): IntakeSource {
    return {
      id: row.id as string,
      title: row.title as string,
      url: (row.url as string) ?? null,
      sourceType: row.source_type as string,
      author: (row.author as string) ?? null,
      domain: row.domain as string,
      ingestedAt: row.ingested_at as number,
      entryCount: row.entry_count as number,
      contentHash: (row.content_hash as string) ?? null,
    };
  }
}
