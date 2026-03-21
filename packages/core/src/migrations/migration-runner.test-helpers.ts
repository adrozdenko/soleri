/**
 * Migration Runner — Test Factories & Helpers
 *
 * Shared test utilities for migration-runner test files.
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from './migration-runner.js';

// ─── Test Factories ──────────────────────────────────────────────────

export function createMigration(overrides: Partial<Migration> = {}): Migration {
  return {
    version: '1.0.0',
    description: 'Test migration',
    up: () => {},
    ...overrides,
  };
}

export function createTableMigration(
  version: string,
  tableName: string,
  overrides: Partial<Migration> = {},
): Migration {
  return createMigration({
    version,
    description: `Create ${tableName}`,
    up: (d) => d.exec(`CREATE TABLE ${tableName} (id INTEGER)`),
    down: (d) => d.exec(`DROP TABLE IF EXISTS ${tableName}`),
    ...overrides,
  });
}

export function createFailingMigration(
  version: string,
  errorMessage: string,
  overrides: Partial<Migration> = {},
): Migration {
  return createMigration({
    version,
    description: `Failing at ${version}`,
    up: () => {
      throw new Error(errorMessage);
    },
    ...overrides,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────

export function tableExists(db: Database, name: string): boolean {
  const row = db
    .prepare("SELECT count(*) as cnt FROM sqlite_master WHERE type='table' AND name=?")
    .get(name) as { cnt: number };
  return row.cnt === 1;
}

export function getAppliedVersions(db: Database): string[] {
  const rows = db
    .prepare('SELECT version FROM _soleri_migrations ORDER BY version')
    .all() as Array<{ version: string }>;
  return rows.map((r) => r.version);
}
