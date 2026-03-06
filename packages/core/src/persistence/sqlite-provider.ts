/**
 * SQLite persistence provider backed by better-sqlite3.
 *
 * Supports both positional (array) and named (object) parameters.
 * Exposes getDatabase() for backward-compat consumers that need the raw db.
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PersistenceProvider, PersistenceParams, RunResult } from './types.js';

export class SQLitePersistenceProvider implements PersistenceProvider {
  private db: Database.Database;

  constructor(path: string = ':memory:') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
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

  close(): void {
    this.db.close();
  }

  /**
   * Escape hatch: get the raw better-sqlite3 Database.
   * Used by modules that need direct db access (ProjectRegistry, BrainIntelligence, etc.).
   * Will be deprecated once those modules migrate to PersistenceProvider.
   */
  getDatabase(): Database.Database {
    return this.db;
  }
}
