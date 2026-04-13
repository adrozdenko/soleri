import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { runNormalizeProjectPathsMigration, MIGRATION_NAME } from './normalize-project-paths.js';
import type { PersistenceProvider, PersistenceParams, RunResult } from '../../persistence/types.js';

// Minimal PersistenceProvider adapter over better-sqlite3 for isolated
// migration unit tests. The full SQLitePersistenceProvider pulls in extra
// runtime wiring (FTS, etc.) that isn't relevant here.
function makeProvider(db: Database.Database): PersistenceProvider {
  return {
    backend: 'sqlite',
    execSql: (sql) => {
      db.exec(sql);
    },
    run: (sql, params?: PersistenceParams): RunResult => {
      const stmt = db.prepare(sql);
      const res = params === undefined ? stmt.run() : stmt.run(params as unknown[]);
      return { changes: res.changes, lastInsertRowid: res.lastInsertRowid };
    },
    get: <T>(sql: string, params?: PersistenceParams): T | undefined => {
      const stmt = db.prepare(sql);
      const row = params === undefined ? stmt.get() : stmt.get(params as unknown[]);
      return row as T | undefined;
    },
    all: <T>(sql: string, params?: PersistenceParams): T[] => {
      const stmt = db.prepare(sql);
      const rows = params === undefined ? stmt.all() : stmt.all(params as unknown[]);
      return rows as T[];
    },
    transaction: <T>(fn: () => T): T => {
      return db.transaction(fn)();
    },
    ftsSearch: () => [],
    ftsRebuild: () => {
      /* noop */
    },
    close: () => {
      db.close();
    },
  };
}

function seedSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE vault_policies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_path TEXT NOT NULL,
      policy_type TEXT NOT NULL CHECK(policy_type IN ('quota', 'retention', 'auto-capture')),
      config TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(project_path, policy_type)
    );
    CREATE TABLE vault_policy_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_path TEXT NOT NULL,
      policy_type TEXT NOT NULL,
      old_config TEXT,
      new_config TEXT NOT NULL,
      changed_by TEXT,
      changed_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
}

describe('runNormalizeProjectPathsMigration', () => {
  let db: Database.Database;
  let provider: PersistenceProvider;
  let originalCwd: string;
  let workDir: string;

  beforeEach(() => {
    db = new Database(':memory:');
    seedSchema(db);
    provider = makeProvider(db);
    originalCwd = process.cwd();
    // Use a stable cwd so resolve('.') is deterministic within the test.
    workDir = resolve(process.cwd());
  });

  afterEach(() => {
    process.chdir(originalCwd);
    db.close();
  });

  it('no-collision: renames a "." row to the absolute cwd', () => {
    db.prepare(
      'INSERT INTO vault_policies (project_path, policy_type, config) VALUES (?, ?, ?)',
    ).run('.', 'quota', JSON.stringify({ maxEntriesTotal: 1234 }));

    const result = runNormalizeProjectPathsMigration(provider);

    expect(result.skipped).toBe(false);
    expect(result.renamed).toBeGreaterThanOrEqual(1);
    expect(result.dropped).toBe(0);

    const rows = db.prepare('SELECT project_path FROM vault_policies').all() as Array<{
      project_path: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].project_path).toBe(workDir);
  });

  it('collision: absolute wins, relative row is dropped, audit row inserted', () => {
    const relCfg = JSON.stringify({ maxEntriesTotal: 111 });
    const absCfg = JSON.stringify({ maxEntriesTotal: 999 });

    db.prepare(
      'INSERT INTO vault_policies (project_path, policy_type, config) VALUES (?, ?, ?)',
    ).run('.', 'quota', relCfg);
    db.prepare(
      'INSERT INTO vault_policies (project_path, policy_type, config) VALUES (?, ?, ?)',
    ).run(workDir, 'quota', absCfg);

    const result = runNormalizeProjectPathsMigration(provider);

    expect(result.skipped).toBe(false);
    expect(result.dropped).toBe(1);
    expect(result.auditLogged).toBe(1);

    const rows = db.prepare('SELECT project_path, config FROM vault_policies').all() as Array<{
      project_path: string;
      config: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].project_path).toBe(workDir);
    expect(rows[0].config).toBe(absCfg); // absolute config survives

    const audit = db
      .prepare(
        "SELECT project_path, old_config, changed_by FROM vault_policy_changes WHERE changed_by = 'migration:normalize-project-paths'",
      )
      .all() as Array<{ project_path: string; old_config: string; changed_by: string }>;
    expect(audit).toHaveLength(1);
    expect(audit[0].project_path).toBe(workDir);
    expect(audit[0].old_config).toBe(relCfg); // original relative config preserved
  });

  it('idempotency: a second run is a no-op', () => {
    db.prepare(
      'INSERT INTO vault_policies (project_path, policy_type, config) VALUES (?, ?, ?)',
    ).run('.', 'quota', JSON.stringify({ maxEntriesTotal: 42 }));

    const first = runNormalizeProjectPathsMigration(provider);
    expect(first.skipped).toBe(false);

    const second = runNormalizeProjectPathsMigration(provider);
    expect(second.skipped).toBe(true);
    expect(second.renamed).toBe(0);
    expect(second.dropped).toBe(0);

    // Marker row exists exactly once.
    const markers = db
      .prepare('SELECT name FROM soleri_data_migrations WHERE name = ?')
      .all(MIGRATION_NAME);
    expect(markers).toHaveLength(1);
  });

  it('skips already-absolute rows without touching them', () => {
    db.prepare(
      'INSERT INTO vault_policies (project_path, policy_type, config) VALUES (?, ?, ?)',
    ).run('/already/absolute', 'quota', JSON.stringify({ maxEntriesTotal: 55 }));

    const result = runNormalizeProjectPathsMigration(provider);

    expect(result.renamed).toBe(0);
    expect(result.dropped).toBe(0);

    const rows = db.prepare('SELECT project_path FROM vault_policies').all() as Array<{
      project_path: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].project_path).toBe('/already/absolute');
  });

  it('renames relative rows in vault_policy_changes too', () => {
    db.prepare(
      'INSERT INTO vault_policy_changes (project_path, policy_type, new_config) VALUES (?, ?, ?)',
    ).run('.', 'quota', JSON.stringify({ maxEntriesTotal: 88 }));

    const result = runNormalizeProjectPathsMigration(provider);

    expect(result.skipped).toBe(false);
    expect(result.renamed).toBeGreaterThanOrEqual(1);

    const rows = db.prepare('SELECT project_path FROM vault_policy_changes').all() as Array<{
      project_path: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].project_path).toBe(workDir);
  });
});
