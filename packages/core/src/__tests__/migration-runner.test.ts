/**
 * Migration Runner Tests.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { MigrationRunner } from '../migrations/migration-runner.js';
import type { Migration } from '../migrations/migration-runner.js';

describe('MigrationRunner', () => {
  let db: Database.Database;
  let runner: MigrationRunner;

  beforeEach(() => {
    db = new Database(':memory:');
    runner = new MigrationRunner(db);
  });

  afterEach(() => {
    db.close();
  });

  test('creates migration tracking table', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='_soleri_migrations'")
      .all();
    expect(tables).toHaveLength(1);
  });

  test('runs migrations in version order', () => {
    const migrations: Migration[] = [
      {
        version: '2.1.0',
        description: 'Add column B',
        up: (d) => d.exec('CREATE TABLE test_b (id INTEGER)'),
      },
      {
        version: '2.0.0',
        description: 'Add column A',
        up: (d) => d.exec('CREATE TABLE test_a (id INTEGER)'),
      },
    ];

    const results = runner.run(migrations);
    expect(results).toHaveLength(2);
    expect(results[0].version).toBe('2.0.0');
    expect(results[1].version).toBe('2.1.0');
    expect(results.every((r) => r.status === 'applied')).toBe(true);
  });

  test('skips already-applied migrations', () => {
    const migration: Migration = {
      version: '1.0.0',
      description: 'Initial',
      up: (d) => d.exec('CREATE TABLE test (id INTEGER)'),
    };

    runner.run([migration]);
    const results = runner.run([migration]);
    expect(results[0].status).toBe('skipped');
  });

  test('records applied migrations', () => {
    runner.run([
      { version: '1.0.0', description: 'First', up: () => {} },
      { version: '1.1.0', description: 'Second', up: () => {} },
    ]);

    const applied = runner.listApplied();
    expect(applied).toHaveLength(2);
    expect(applied[0].version).toBe('1.0.0');
    expect(applied[1].version).toBe('1.1.0');
  });

  test('runs verify after up', () => {
    const results = runner.run([
      {
        version: '1.0.0',
        description: 'Verified',
        up: (d) => d.exec('CREATE TABLE verified (id INTEGER)'),
        verify: (d) => {
          const tables = d
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='verified'")
            .all();
          return tables.length > 0;
        },
      },
    ]);

    expect(results[0].status).toBe('applied');
  });

  test('rolls back when verify fails', () => {
    let upRan = false;
    let downRan = false;

    const results = runner.run([
      {
        version: '1.0.0',
        description: 'Bad migration',
        up: () => {
          upRan = true;
        },
        verify: () => false,
        down: () => {
          downRan = true;
        },
      },
    ]);

    expect(upRan).toBe(true);
    expect(downRan).toBe(true);
    expect(results[0].status).toBe('rolled-back');
  });

  test('fails when verify fails with no rollback', () => {
    const results = runner.run([
      {
        version: '1.0.0',
        description: 'Bad no rollback',
        up: () => {},
        verify: () => false,
      },
    ]);

    expect(results[0].status).toBe('failed');
    expect(results[0].error).toContain('Verification failed');
  });

  test('stops on error', () => {
    const results = runner.run([
      {
        version: '1.0.0',
        description: 'Will fail',
        up: () => {
          throw new Error('boom');
        },
      },
      {
        version: '1.1.0',
        description: 'Never runs',
        up: () => {},
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('failed');
    expect(results[0].error).toBe('boom');
  });

  test('getPending returns unapplied migrations', () => {
    const all: Migration[] = [
      { version: '1.0.0', description: 'Done', up: () => {} },
      { version: '1.1.0', description: 'Pending', up: () => {} },
      { version: '1.2.0', description: 'Also pending', up: () => {} },
    ];

    runner.run([all[0]]);
    const pending = runner.getPending(all);
    expect(pending).toHaveLength(2);
    expect(pending[0].version).toBe('1.1.0');
    expect(pending[1].version).toBe('1.2.0');
  });

  test('tracks duration', () => {
    const results = runner.run([{ version: '1.0.0', description: 'Quick', up: () => {} }]);

    expect(results[0].durationMs).toBeGreaterThanOrEqual(0);
  });
});
