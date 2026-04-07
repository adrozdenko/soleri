/**
 * SQLite persistence provider backed by better-sqlite3.
 *
 * Supports both positional (array) and named (object) parameters.
 * Exposes getDatabase() for backward-compat consumers that need the raw db.
 *
 * better-sqlite3 is loaded lazily at construction time (not at module import)
 * so that code paths that never instantiate a provider don't require the
 * native module to be installed.
 */

import type Database from 'better-sqlite3';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  PersistenceProvider,
  PersistenceParams,
  RunResult,
  FtsSearchOptions,
} from './types.js';

type DatabaseConstructor = typeof Database;
let _DatabaseCtor: DatabaseConstructor | undefined;

function loadDriver(): DatabaseConstructor {
  if (!_DatabaseCtor) {
    const req = createRequire(import.meta.url);
    try {
      _DatabaseCtor = req('better-sqlite3') as DatabaseConstructor;
    } catch {
      throw new Error(
        'better-sqlite3 is required for persistence but is not installed.\n' +
          'Run: npm install better-sqlite3',
      );
    }
  }
  return _DatabaseCtor;
}

/** Apply performance-tuning PRAGMAs for file-backed SQLite databases. */
export function applyPerformancePragmas(db: Database.Database): void {
  db.pragma('busy_timeout = 5000'); // 5s wait on lock for multi-process safety
  db.pragma('cache_size = -64000'); // 64MB
  db.pragma('temp_store = MEMORY');
  db.pragma('mmap_size = 268435456'); // 256MB
  db.pragma('synchronous = NORMAL');
}

export class SQLitePersistenceProvider implements PersistenceProvider {
  readonly backend = 'sqlite' as const;
  private db: Database.Database;

  constructor(path: string = ':memory:') {
    const Driver = loadDriver();
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new Driver(path);
    if (path !== ':memory:') applyPerformancePragmas(this.db);
  }

  execSql(sql: string): void {
    this.db.exec(sql);
  }

  run(sql: string, params?: PersistenceParams): RunResult {
    const stmt = this.db.prepare(sql);
    if (!params) return stmt.run();
    if (Array.isArray(params)) return stmt.run(...params);
    return stmt.run(params);
  }

  get<T = Record<string, unknown>>(sql: string, params?: PersistenceParams): T | undefined {
    const stmt = this.db.prepare(sql);
    if (!params) return stmt.get() as T | undefined;
    if (Array.isArray(params)) return stmt.get(...params) as T | undefined;
    return stmt.get(params) as T | undefined;
  }

  all<T = Record<string, unknown>>(sql: string, params?: PersistenceParams): T[] {
    const stmt = this.db.prepare(sql);
    if (!params) return stmt.all() as T[];
    if (Array.isArray(params)) return stmt.all(...params) as T[];
    return stmt.all(params) as T[];
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  ftsSearch<T = Record<string, unknown>>(
    table: string,
    query: string,
    options?: FtsSearchOptions,
  ): T[] {
    const ftsTable = `${table}_fts`;
    const cols = options?.columns?.length ? options.columns.join(', ') : `${table}.*`;
    const orderBy = options?.orderByRank !== false ? `ORDER BY rank` : '';
    const limit = options?.limit ? `LIMIT ${options.limit}` : '';
    const offset = options?.offset ? `OFFSET ${options.offset}` : '';

    const filterClauses: string[] = [];
    const filterParams: unknown[] = [query];

    if (options?.filters) {
      for (const [key, value] of Object.entries(options.filters)) {
        filterClauses.push(`${table}.${key} = ?`);
        filterParams.push(value);
      }
    }

    const filterSql = filterClauses.length ? `AND ${filterClauses.join(' AND ')}` : '';

    const sql = `SELECT ${cols} FROM ${ftsTable} JOIN ${table} ON ${table}.rowid = ${ftsTable}.rowid WHERE ${ftsTable} MATCH ? ${filterSql} ${orderBy} ${limit} ${offset}`;

    return this.all<T>(sql, filterParams);
  }

  ftsRebuild(table: string): void {
    const ftsTable = `${table}_fts`;
    try {
      this.execSql(`INSERT INTO ${ftsTable}(${ftsTable}) VALUES('rebuild')`);
    } catch {
      // Graceful degradation: FTS table may not exist
    }
  }

  close(): void {
    this.db.close();
  }

  /**
   * Escape hatch: get the raw better-sqlite3 Database.
   * Used by modules that need direct db access (ProjectRegistry, BrainIntelligence, etc.).
   * @deprecated Use provider methods instead.
   */
  getDatabase(): Database.Database {
    if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
      console.warn(
        'SQLitePersistenceProvider.getDatabase() is deprecated. Use provider methods instead.',
      );
    }
    return this.db;
  }
}
