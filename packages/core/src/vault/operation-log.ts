// ─── Operation Log ─────────────────────────────────────────────────
// Chronological, append-only record of vault operations.
// Inspired by Karpathy's log.md pattern but backed by SQLite.

import type { PersistenceProvider } from '../persistence/types.js';

export type OpLogType =
  | 'ingest'
  | 'capture'
  | 'consolidate'
  | 'dream'
  | 'self_heal'
  | 'link'
  | 'sync';

export interface OpLogEntry {
  id: number;
  opType: OpLogType;
  opName: string;
  summary: string;
  entriesAffected: number;
  metadata: Record<string, unknown>;
  createdAt: number;
}

export class OperationLogger {
  constructor(private provider: PersistenceProvider) {
    this.ensureTable();
  }

  private ensureTable(): void {
    this.provider.execSql(`
      CREATE TABLE IF NOT EXISTS vault_operations_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        op_type TEXT NOT NULL,
        op_name TEXT,
        summary TEXT,
        entries_affected INTEGER DEFAULT 0,
        metadata TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);
  }

  log(
    opType: OpLogType,
    opName: string,
    summary: string,
    entriesAffected = 0,
    metadata: Record<string, unknown> = {},
  ): void {
    this.provider.run(
      `INSERT INTO vault_operations_log (op_type, op_name, summary, entries_affected, metadata)
       VALUES (@opType, @opName, @summary, @entriesAffected, @metadata)`,
      { opType, opName, summary, entriesAffected, metadata: JSON.stringify(metadata) },
    );
  }

  query(filters?: { opType?: OpLogType; limit?: number; since?: number }): OpLogEntry[] {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (filters?.opType) {
      conditions.push('op_type = @opType');
      params.opType = filters.opType;
    }
    if (filters?.since) {
      conditions.push('created_at >= @since');
      params.since = filters.since;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters?.limit ?? 50;

    const rows = this.provider.all<Record<string, unknown>>(
      `SELECT * FROM vault_operations_log ${where} ORDER BY created_at DESC LIMIT @limit`,
      { ...params, limit },
    );

    return rows.map((row) => ({
      id: row.id as number,
      opType: row.op_type as OpLogType,
      opName: (row.op_name as string) ?? '',
      summary: (row.summary as string) ?? '',
      entriesAffected: (row.entries_affected as number) ?? 0,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : {},
      createdAt: row.created_at as number,
    }));
  }

  getRecent(limit = 10): OpLogEntry[] {
    return this.query({ limit });
  }
}
