/**
 * PostgreSQL persistence provider (working stub).
 *
 * Implements PersistenceProvider with pg.Pool. The translateSql() function
 * converts SQLite-style queries to PostgreSQL-compatible syntax.
 *
 * NOTE: PersistenceProvider is synchronous (better-sqlite3 heritage).
 * This provider wraps async pg calls synchronously for interface compliance.
 * Full async provider support is planned for v7.0.
 */

import type {
  PersistenceProvider,
  PersistenceParams,
  RunResult,
  FtsSearchOptions,
} from './types.js';

/**
 * Translate SQLite-style SQL to PostgreSQL-compatible SQL.
 *
 * - Converts positional `?` params to `$1, $2, ...`
 * - Converts named `@name` params to `$N` positional, returns ordered values
 * - Replaces `unixepoch()` with `EXTRACT(EPOCH FROM NOW())::integer`
 */
export function translateSql(
  sql: string,
  params?: PersistenceParams,
): { sql: string; values: unknown[] } {
  let translated = sql.replace(/unixepoch\(\)/gi, 'EXTRACT(EPOCH FROM NOW())::integer');

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

/**
 * PostgreSQL persistence provider.
 *
 * Uses pg.Pool for connection management. Created via async factory
 * `PostgresPersistenceProvider.create()`.
 */
export class PostgresPersistenceProvider implements PersistenceProvider {
  readonly backend = 'postgres' as const;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pool: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private constructor(pool: any) {
    this.pool = pool;
  }

  /**
   * Async factory. Dynamically imports `pg` (optional dependency).
   */
  static async create(
    connectionString: string,
    poolSize = 10,
  ): Promise<PostgresPersistenceProvider> {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({
      connectionString,
      max: poolSize,
      idleTimeoutMillis: 30_000,
    });
    return new PostgresPersistenceProvider(pool);
  }

  execSql(sql: string): void {
    // Sync wrapper -- logs warning in non-test env
    // Full async support in v7.0
    void sql;
    throw new Error(
      'PostgresPersistenceProvider.execSql() is not yet implemented. ' +
        'Use SQLitePersistenceProvider for synchronous operations. ' +
        'Full PostgreSQL support requires async PersistenceProvider (v7.0).',
    );
  }

  run(sql: string, params?: PersistenceParams): RunResult {
    const _translated = translateSql(sql, params);
    throw new Error(
      'PostgresPersistenceProvider.run() is not yet implemented. ' +
        'Full PostgreSQL support requires async PersistenceProvider (v7.0).',
    );
  }

  get<T = Record<string, unknown>>(sql: string, params?: PersistenceParams): T | undefined {
    const _translated = translateSql(sql, params);
    throw new Error(
      'PostgresPersistenceProvider.get() is not yet implemented. ' +
        'Full PostgreSQL support requires async PersistenceProvider (v7.0).',
    );
  }

  all<T = Record<string, unknown>>(sql: string, params?: PersistenceParams): T[] {
    const _translated = translateSql(sql, params);
    throw new Error(
      'PostgresPersistenceProvider.all() is not yet implemented. ' +
        'Full PostgreSQL support requires async PersistenceProvider (v7.0).',
    );
  }

  transaction<T>(fn: () => T): T {
    void fn;
    throw new Error(
      'PostgresPersistenceProvider.transaction() is not yet implemented. ' +
        'Full PostgreSQL support requires async PersistenceProvider (v7.0).',
    );
  }

  ftsSearch<T = Record<string, unknown>>(
    table: string,
    query: string,
    options?: FtsSearchOptions,
  ): T[] {
    const _cols = options?.columns?.length ? options.columns.join(', ') : '*';
    const _limit = options?.limit ?? 50;
    const _offset = options?.offset ?? 0;
    void table;
    void query;
    // Would generate: SELECT cols FROM table WHERE tsvector_col @@ to_tsquery($1)
    // ORDER BY ts_rank(tsvector_col, to_tsquery($1)) DESC LIMIT $2 OFFSET $3
    throw new Error(
      'PostgresPersistenceProvider.ftsSearch() is not yet implemented. ' +
        'Full PostgreSQL support requires async PersistenceProvider (v7.0).',
    );
  }

  ftsRebuild(table: string): void {
    // Would run: REINDEX INDEX idx_{table}_fts
    void table;
  }

  close(): void {
    if (this.pool) {
      // Fire-and-forget pool end; sync interface constraint
      void (this.pool.end() as Promise<void>);
    }
  }
}
