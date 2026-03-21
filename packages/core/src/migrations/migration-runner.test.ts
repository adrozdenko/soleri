/**
 * Migration Runner — Core Unit Tests
 *
 * Colocated tests for constructor, run(), verification, error handling,
 * listApplied(), getPending(), and full migration path coverage.
 *
 * Edge cases (rollback failures, semver, concurrency) live in
 * migration-runner.edge-cases.test.ts.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { MigrationRunner } from './migration-runner.js';
import {
  createMigration,
  createTableMigration,
  createFailingMigration,
  tableExists,
  getAppliedVersions,
} from './migration-runner.test-helpers.js';

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

  // ── Constructor ──────────────────────────────────────────────────

  describe('constructor', () => {
    test('creates _soleri_migrations tracking table on instantiation', () => {
      // Arrange — runner already created in beforeEach

      // Act
      const exists = tableExists(db, '_soleri_migrations');

      // Assert
      expect(exists).toBe(true);
    });

    test('is idempotent — second instantiation does not throw', () => {
      // Arrange — runner already created

      // Act & Assert
      expect(() => new MigrationRunner(db)).not.toThrow();
    });
  });

  // ── run() ────────────────────────────────────────────────────────

  describe('run', () => {
    test('applies migrations in ascending version order regardless of input order', () => {
      // Arrange
      const migrations = [
        createTableMigration('2.1.0', 'test_b'),
        createTableMigration('2.0.0', 'test_a'),
      ];

      // Act
      const results = runner.run(migrations);

      // Assert
      expect(results).toHaveLength(2);
      expect(results[0].version).toBe('2.0.0');
      expect(results[1].version).toBe('2.1.0');
      expect(results[0].status).toBe('applied');
      expect(results[1].status).toBe('applied');
    });

    test('skips already-applied migrations with status "skipped"', () => {
      // Arrange
      const migration = createTableMigration('1.0.0', 'test_skip');
      runner.run([migration]);

      // Act
      const results = runner.run([migration]);

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('skipped');
      expect(results[0].durationMs).toBe(0);
    });

    test('records applied migrations in tracking table', () => {
      // Arrange
      const migrations = [
        createMigration({ version: '1.0.0', description: 'First' }),
        createMigration({ version: '1.1.0', description: 'Second' }),
      ];

      // Act
      runner.run(migrations);

      // Assert
      const versions = getAppliedVersions(db);
      expect(versions).toEqual(['1.0.0', '1.1.0']);
    });

    test('does not record migration when verification fails', () => {
      // Arrange
      const migration = createMigration({
        version: '1.0.0',
        verify: () => false,
      });

      // Act
      runner.run([migration]);

      // Assert
      const versions = getAppliedVersions(db);
      expect(versions).toEqual([]);
    });

    test('returns empty array when given no migrations', () => {
      // Arrange — no migrations

      // Act
      const results = runner.run([]);

      // Assert
      expect(results).toEqual([]);
    });

    test('measures duration as non-negative number', () => {
      // Arrange
      const migration = createMigration({ version: '1.0.0' });

      // Act
      const results = runner.run([migration]);

      // Assert
      expect(typeof results[0].durationMs).toBe('number');
      expect(results[0].durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ── Verification ─────────────────────────────────────────────────

  describe('verification', () => {
    test('marks migration as applied when verify returns true', () => {
      // Arrange
      const migration = createTableMigration('1.0.0', 'verified', {
        verify: (d) => tableExists(d, 'verified'),
      });

      // Act
      const results = runner.run([migration]);

      // Assert
      expect(results[0].status).toBe('applied');
      expect(getAppliedVersions(db)).toEqual(['1.0.0']);
    });

    test('rolls back and reports "rolled-back" when verify fails and down exists', () => {
      // Arrange
      const upSpy = vi.fn();
      const downSpy = vi.fn();
      const migration = createMigration({
        version: '1.0.0',
        description: 'Bad migration',
        up: upSpy,
        verify: () => false,
        down: downSpy,
      });

      // Act
      const results = runner.run([migration]);

      // Assert
      expect(upSpy).toHaveBeenCalledOnce();
      expect(downSpy).toHaveBeenCalledOnce();
      expect(results[0].status).toBe('rolled-back');
      expect(results[0].error).toBe('Verification failed after apply');
    });

    test('reports "failed" when verify fails and no down handler exists', () => {
      // Arrange
      const migration = createMigration({
        version: '1.0.0',
        description: 'No rollback',
        verify: () => false,
      });

      // Act
      const results = runner.run([migration]);

      // Assert
      expect(results[0].status).toBe('failed');
      expect(results[0].error).toBe('Verification failed, no rollback available');
    });

    test('skips verification when no verify function provided', () => {
      // Arrange
      const migration = createMigration({ version: '1.0.0' });

      // Act
      const results = runner.run([migration]);

      // Assert
      expect(results[0].status).toBe('applied');
    });
  });

  // ── Error Handling ───────────────────────────────────────────────

  describe('error handling', () => {
    test('stops execution on first failure — subsequent migrations do not run', () => {
      // Arrange
      const secondUp = vi.fn();
      const migrations = [
        createFailingMigration('1.0.0', 'boom'),
        createMigration({ version: '1.1.0', up: secondUp }),
      ];

      // Act
      const results = runner.run(migrations);

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('failed');
      expect(results[0].error).toBe('boom');
      expect(secondUp).not.toHaveBeenCalled();
    });

    test('attempts rollback on up() error when down handler exists', () => {
      // Arrange
      const downSpy = vi.fn();
      const migration = createFailingMigration('1.0.0', 'crash', {
        down: downSpy,
      });

      // Act
      runner.run([migration]);

      // Assert
      expect(downSpy).toHaveBeenCalledOnce();
    });

    test('does not throw when up() fails and no down handler exists', () => {
      // Arrange
      const migration = createFailingMigration('1.0.0', 'crash');

      // Act
      const results = runner.run([migration]);

      // Assert
      expect(results[0].status).toBe('failed');
      expect(results[0].error).toBe('crash');
    });

    test('converts non-Error throws to string in error field', () => {
      // Arrange
      const migration = createMigration({
        version: '1.0.0',
        up: () => {
          throw 'string-error'; // eslint-disable-line no-throw-literal
        },
      });

      // Act
      const results = runner.run([migration]);

      // Assert
      expect(results[0].error).toBe('string-error');
    });
  });

  // ── listApplied() ────────────────────────────────────────────────

  describe('listApplied', () => {
    test('returns empty array when no migrations have been applied', () => {
      // Arrange — no migrations run

      // Act
      const applied = runner.listApplied();

      // Assert
      expect(applied).toEqual([]);
    });

    test('returns applied migrations with version, appliedAt, and description', () => {
      // Arrange
      runner.run([createMigration({ version: '1.0.0', description: 'First' })]);

      // Act
      const applied = runner.listApplied();

      // Assert
      expect(applied).toHaveLength(1);
      expect(applied[0].version).toBe('1.0.0');
      expect(applied[0].description).toBe('First');
      expect(typeof applied[0].appliedAt).toBe('string');
      expect(applied[0].appliedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test('returns migrations sorted by version', () => {
      // Arrange
      runner.run([
        createMigration({ version: '1.1.0', description: 'Second' }),
        createMigration({ version: '1.0.0', description: 'First' }),
      ]);

      // Act
      const applied = runner.listApplied();

      // Assert
      expect(applied.map((a) => a.version)).toEqual(['1.0.0', '1.1.0']);
    });
  });

  // ── getPending() ─────────────────────────────────────────────────

  describe('getPending', () => {
    test('returns all migrations when none are applied', () => {
      // Arrange
      const migrations = [
        createMigration({ version: '1.0.0' }),
        createMigration({ version: '1.1.0' }),
      ];

      // Act
      const pending = runner.getPending(migrations);

      // Assert
      expect(pending).toHaveLength(2);
      expect(pending.map((p) => p.version)).toEqual(['1.0.0', '1.1.0']);
    });

    test('excludes already-applied migrations', () => {
      // Arrange
      const all = [
        createMigration({ version: '1.0.0', description: 'Done' }),
        createMigration({ version: '1.1.0', description: 'Pending' }),
        createMigration({ version: '1.2.0', description: 'Also pending' }),
      ];
      runner.run([all[0]]);

      // Act
      const pending = runner.getPending(all);

      // Assert
      expect(pending).toHaveLength(2);
      expect(pending[0].version).toBe('1.1.0');
      expect(pending[1].version).toBe('1.2.0');
    });

    test('returns pending in version order', () => {
      // Arrange
      const all = [
        createMigration({ version: '2.0.0' }),
        createMigration({ version: '1.0.0' }),
        createMigration({ version: '1.5.0' }),
      ];

      // Act
      const pending = runner.getPending(all);

      // Assert
      expect(pending.map((p) => p.version)).toEqual(['1.0.0', '1.5.0', '2.0.0']);
    });

    test('returns empty array when all are applied', () => {
      // Arrange
      const migrations = [createMigration({ version: '1.0.0' })];
      runner.run(migrations);

      // Act
      const pending = runner.getPending(migrations);

      // Assert
      expect(pending).toEqual([]);
    });
  });

  // Full migration path coverage is exercised across the describe
  // blocks above: constructor, run, verification, error handling,
  // listApplied, and getPending. Edge cases in migration-runner.edge-cases.test.ts.
});
