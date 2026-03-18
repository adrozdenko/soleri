/**
 * Abstract persistence layer.
 *
 * Decouples Vault (and future modules) from any specific database engine.
 * The default implementation is SQLitePersistenceProvider (better-sqlite3).
 */

export type PersistenceParams = unknown[] | Record<string, unknown>;

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

/**
 * Minimal database provider interface.
 *
 * Supports both positional (`?`) and named (`@param`) parameter styles.
 * Implementations must handle both array and object params.
 */
export interface PersistenceProvider {
  /** Run raw SQL (DDL, multi-statement). No return value. */
  execSql(sql: string): void;

  /** Run a parameterized statement (INSERT, UPDATE, DELETE). */
  run(sql: string, params?: PersistenceParams): RunResult;

  /** Get a single row. Returns undefined if no match. */
  get<T = Record<string, unknown>>(sql: string, params?: PersistenceParams): T | undefined;

  /** Get all matching rows. */
  all<T = Record<string, unknown>>(sql: string, params?: PersistenceParams): T[];

  /** Run a function inside a transaction. Commits on success, rolls back on error. */
  transaction<T>(fn: () => T): T;

  /** Identifies the backend engine. */
  readonly backend: 'sqlite';

  /** Full-text search abstraction. */
  ftsSearch<T = Record<string, unknown>>(
    table: string,
    query: string,
    options?: FtsSearchOptions,
  ): T[];

  /** Rebuild FTS index for a table. */
  ftsRebuild(table: string): void;

  /** Close the connection. */
  close(): void;
}

export interface PersistenceConfig {
  type: 'sqlite';
  path: string;
}

export interface FtsSearchOptions {
  /** Columns to search (default: all FTS columns). */
  columns?: string[];
  /** Max results. */
  limit?: number;
  /** Skip N results. */
  offset?: number;
  /** Additional WHERE conditions on the base table. */
  filters?: Record<string, unknown>;
  /** Order by FTS relevance rank (default: true). */
  orderByRank?: boolean;
}
