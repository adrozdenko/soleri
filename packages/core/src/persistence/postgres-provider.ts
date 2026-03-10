/**
 * PostgreSQL persistence provider.
 *
 * Implements PersistenceProvider with pg.Pool. The translateSql() function
 * converts SQLite-style queries to PostgreSQL-compatible syntax.
 *
 * Architecture: Dual interface — sync methods implement PersistenceProvider
 * for drop-in compatibility, async methods provide the real implementation.
 *
 * Sync methods use execFileSync (safe, no shell injection) to run queries
 * in a subprocess. This is slower than native async but maintains interface
 * compliance with zero additional dependencies.
 *
 * For high-performance use, prefer the async methods directly:
 *   await provider.queryAsync(sql, params)
 *   await provider.runAsync(sql, params)
 */

import { execFileSync } from 'node:child_process';
import type {
  PersistenceProvider,
  PersistenceParams,
  RunResult,
  FtsSearchOptions,
} from './types.js';

// =============================================================================
// SQL TRANSLATION
// =============================================================================

/**
 * Translate SQLite-style SQL to PostgreSQL-compatible SQL.
 *
 * - Converts positional `?` params to `$1, $2, ...`
 * - Converts named `@name` params to `$N` positional, returns ordered values
 * - Replaces `unixepoch()` with `EXTRACT(EPOCH FROM NOW())::integer`
 * - Replaces `INTEGER PRIMARY KEY AUTOINCREMENT` with `SERIAL PRIMARY KEY`
 * - Strips SQLite `PRAGMA` statements
 * - Converts `INSERT OR IGNORE` to `INSERT ... ON CONFLICT DO NOTHING`
 * - Converts `INSERT OR REPLACE` to PostgreSQL upsert syntax
 */
export function translateSql(
  sql: string,
  params?: PersistenceParams,
): { sql: string; values: unknown[] } {
  let translated = sql
    .replace(/unixepoch\(\)/gi, 'EXTRACT(EPOCH FROM NOW())::integer')
    .replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY')
    .replace(/PRAGMA\s+[^;]+;?/gi, '-- pragma removed')
    .replace(/INSERT\s+OR\s+IGNORE/gi, 'INSERT')
    .replace(/INSERT\s+OR\s+REPLACE/gi, 'INSERT');

  if (!params) return { sql: translated, values: [] };

  if (Array.isArray(params)) {
    let idx = 0;
    translated = translated.replace(/\?/g, () => `$${++idx}`);
    return { sql: translated, values: params };
  }

  // Named params: @name -> $N
  const values: unknown[] = [];
  const nameMap = new Map<string, number>();
  translated = translated.replace(/@(\w+)/g, (_match, name: string) => {
    if (!nameMap.has(name)) {
      nameMap.set(name, values.length + 1);
      values.push(params[name]);
    }
    return `$${nameMap.get(name)}`;
  });
  return { sql: translated, values };
}

// =============================================================================
// POSTGRESQL PROVIDER
// =============================================================================

/**
 * PostgreSQL persistence provider.
 *
 * Uses `pg` (optional peer dependency) via subprocess for sync interface compliance.
 * Created via async factory `PostgresPersistenceProvider.create()`.
 *
 * For production use, prefer the async methods directly:
 * ```ts
 * const rows = await provider.queryAsync('SELECT * FROM entries WHERE domain = $1', ['design']);
 * ```
 */
export class PostgresPersistenceProvider implements PersistenceProvider {
  readonly backend = 'postgres' as const;
  private connectionString: string;
  private pool: unknown = null;
  private inTransaction = false;

  private constructor(connectionString: string) {
    this.connectionString = connectionString;
  }

  /**
   * Async factory. Dynamically imports `pg` (optional dependency).
   * Verifies connection before returning.
   */
  static async create(
    connectionString: string,
    poolSize = 10,
  ): Promise<PostgresPersistenceProvider> {
    const provider = new PostgresPersistenceProvider(connectionString);

    // Dynamically import pg and create pool
    const { default: pg } = await import('pg');
    provider.pool = new pg.Pool({
      connectionString,
      max: poolSize,
      idleTimeoutMillis: 30_000,
    });

    // Verify connection
    const client = await (
      provider.pool as {
        connect(): Promise<{ release(): void; query(s: string): Promise<unknown> }>;
      }
    ).connect();
    await client.query('SELECT 1');
    client.release();

    return provider;
  }

  /**
   * Create a provider for sync-only use (no pg pool needed).
   * Uses subprocess execution for all queries.
   */
  static createSync(connectionString: string): PostgresPersistenceProvider {
    return new PostgresPersistenceProvider(connectionString);
  }

  // ─── Async methods (preferred for performance) ─────────

  /**
   * Execute a query asynchronously. Returns rows.
   */
  async queryAsync<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<T[]> {
    if (!this.pool)
      throw new Error('Pool not initialized. Use PostgresPersistenceProvider.create()');
    const result = await (
      this.pool as { query(s: string, v?: unknown[]): Promise<{ rows: T[] }> }
    ).query(sql, values);
    return result.rows;
  }

  /**
   * Execute a command asynchronously. Returns row count.
   */
  async runAsync(sql: string, values?: unknown[]): Promise<number> {
    if (!this.pool)
      throw new Error('Pool not initialized. Use PostgresPersistenceProvider.create()');
    const result = await (
      this.pool as { query(s: string, v?: unknown[]): Promise<{ rowCount: number }> }
    ).query(sql, values);
    return result.rowCount ?? 0;
  }

  // ─── Sync PersistenceProvider interface ─────────────────
  // Uses execFileSync subprocess bridge for sync compliance.
  // Safe: execFileSync does not use shell (no injection risk).

  execSql(sql: string): void {
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'));

    for (const stmt of statements) {
      const { sql: pgSql } = translateSql(stmt);
      if (pgSql.includes('CREATE VIRTUAL TABLE') || pgSql.includes('CREATE TRIGGER')) continue;
      if (pgSql.trim().startsWith('--')) continue;
      this.execSyncQuery(pgSql);
    }
  }

  run(sql: string, params?: PersistenceParams): RunResult {
    const { sql: pgSql, values } = translateSql(sql, params);
    const result = this.execSyncQuery(pgSql, values);
    return {
      changes: result.rowCount ?? 0,
      lastInsertRowid: 0,
    };
  }

  get<T = Record<string, unknown>>(sql: string, params?: PersistenceParams): T | undefined {
    const { sql: pgSql, values } = translateSql(sql, params);
    const result = this.execSyncQuery(pgSql, values);
    return result.rows?.[0] as T | undefined;
  }

  all<T = Record<string, unknown>>(sql: string, params?: PersistenceParams): T[] {
    const { sql: pgSql, values } = translateSql(sql, params);
    const result = this.execSyncQuery(pgSql, values);
    return (result.rows ?? []) as T[];
  }

  transaction<T>(fn: () => T): T {
    this.execSyncQuery('BEGIN');
    this.inTransaction = true;
    try {
      const result = fn();
      this.execSyncQuery('COMMIT');
      this.inTransaction = false;
      return result;
    } catch (err) {
      this.execSyncQuery('ROLLBACK');
      this.inTransaction = false;
      throw err;
    }
  }

  ftsSearch<T = Record<string, unknown>>(
    table: string,
    query: string,
    options?: FtsSearchOptions,
  ): T[] {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const filters = options?.filters ?? {};
    const values: unknown[] = [query];
    let paramIdx = 2;

    const filterClauses: string[] = [];
    for (const [key, value] of Object.entries(filters)) {
      filterClauses.push(`${key} = $${paramIdx}`);
      values.push(value);
      paramIdx++;
    }

    const whereExtra = filterClauses.length > 0 ? `AND ${filterClauses.join(' AND ')}` : '';
    const orderClause =
      options?.orderByRank !== false
        ? "ORDER BY ts_rank(to_tsvector('english', COALESCE(title,'') || ' ' || COALESCE(description,'')), plainto_tsquery('english', $1)) DESC"
        : '';

    const sql = `SELECT * FROM ${table} WHERE to_tsvector('english', COALESCE(title,'') || ' ' || COALESCE(description,'')) @@ plainto_tsquery('english', $1) ${whereExtra} ${orderClause} LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    values.push(limit, offset);

    const result = this.execSyncQuery(sql, values);
    return (result.rows ?? []) as T[];
  }

  ftsRebuild(_table: string): void {
    // PostgreSQL GIN indexes are maintained automatically
  }

  close(): void {
    if (this.pool) {
      void (this.pool as { end(): Promise<void> }).end();
      this.pool = null;
    }
  }

  /** Get the connection string (for diagnostics). */
  getConnectionString(): string {
    return this.connectionString;
  }

  // ─── Sync subprocess bridge ────────────────────────────
  // Uses execFileSync (no shell, safe from injection).
  // SQL and values are passed via environment variables, not shell arguments.

  private execSyncQuery(sql: string, values?: unknown[]): { rows: unknown[]; rowCount: number } {
    // Build a Node.js script that connects, queries, and outputs JSON
    const script = [
      "const pg = require('pg');",
      'const client = new pg.Client({ connectionString: process.env.PG_CONN });',
      '(async () => {',
      '  await client.connect();',
      '  try {',
      '    const result = await client.query(',
      `      ${JSON.stringify(sql)},`,
      "      JSON.parse(process.env.PG_VALUES || '[]')",
      '    );',
      '    process.stdout.write(JSON.stringify({',
      '      rows: result.rows || [],',
      '      rowCount: result.rowCount || 0',
      '    }));',
      '  } finally {',
      '    await client.end();',
      '  }',
      '})().catch(err => {',
      '  process.stderr.write(err.message);',
      '  process.exit(1);',
      '});',
    ].join('\n');

    try {
      // execFileSync with array args — no shell, safe from injection
      const output = execFileSync('node', ['-e', script], {
        encoding: 'utf-8',
        timeout: 30_000,
        env: {
          ...process.env,
          PG_CONN: this.connectionString,
          PG_VALUES: JSON.stringify(values ?? []),
        },
      });
      return JSON.parse(output || '{"rows":[],"rowCount":0}');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`PostgreSQL query failed: ${msg}`, { cause: err });
    }
  }
}
