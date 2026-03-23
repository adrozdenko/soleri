/**
 * Migration Runner — Edge Case Tests
 *
 * Rollback failure scenarios, semver edge cases, and concurrent migration
 * attempts. Separated from core tests to keep files under 400 LOC.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { MigrationRunner } from './migration-runner.js';
import { createMigration } from './migration-runner.test-helpers.js';

describe('MigrationRunner — edge cases', () => {
  let db: Database.Database;
  let runner: MigrationRunner;

  beforeEach(() => {
    db = new Database(':memory:');
    runner = new MigrationRunner(db);
  });

  afterEach(() => {
    db.close();
  });

  // ── Rollback Failure Scenarios ───────────────────────────────────

  describe('rollback failure scenarios', () => {
    test('swallows rollback error when down() throws after up() error', () => {
      // Arrange
      const migration = createMigration({
        version: '1.0.0',
        up: () => {
          throw new Error('up-failed');
        },
        down: () => {
          throw new Error('down-also-failed');
        },
      });

      // Act
      const results = runner.run([migration]);

      // Assert — original error preserved, rollback failure swallowed
      expect(results[0].status).toBe('failed');
      expect(results[0].error).toBe('up-failed');
    });

    test('rollback after verify failure does not record migration', () => {
      // Arrange
      const migration = createMigration({
        version: '1.0.0',
        verify: () => false,
        down: () => {},
      });

      // Act
      runner.run([migration]);

      // Assert
      const applied = runner.listApplied();
      expect(applied).toHaveLength(0);
    });

    test('continues to next migration after rolled-back verification failure', () => {
      // Arrange
      const migrations = [
        createMigration({
          version: '1.0.0',
          verify: () => false,
          down: () => {},
        }),
        createMigration({ version: '1.1.0', description: 'Should run' }),
      ];

      // Act
      const results = runner.run(migrations);

      // Assert
      expect(results).toHaveLength(2);
      expect(results[0].status).toBe('rolled-back');
      expect(results[1].status).toBe('applied');
    });

    test('continues after verify failure with no rollback (status: failed)', () => {
      // Arrange
      const migrations = [
        createMigration({
          version: '1.0.0',
          verify: () => false,
        }),
        createMigration({ version: '1.1.0' }),
      ];

      // Act
      const results = runner.run(migrations);

      // Assert
      expect(results).toHaveLength(2);
      expect(results[0].status).toBe('failed');
      expect(results[1].status).toBe('applied');
    });

    test('failed migration with swallowed rollback still stops execution', () => {
      // Arrange
      const secondUp = vi.fn();
      const migrations = [
        createMigration({
          version: '1.0.0',
          up: () => {
            throw new Error('crash');
          },
          down: () => {
            throw new Error('rollback-crash');
          },
        }),
        createMigration({ version: '1.1.0', up: secondUp }),
      ];

      // Act
      const results = runner.run(migrations);

      // Assert
      expect(results).toHaveLength(1);
      expect(secondUp).not.toHaveBeenCalled();
    });
  });

  // ── Semver Edge Cases ────────────────────────────────────────────

  describe('semver edge cases', () => {
    test('sorts major.minor.patch correctly across all segments', () => {
      // Arrange
      const migrations = [
        createMigration({ version: '1.10.0', description: 'ten' }),
        createMigration({ version: '1.2.0', description: 'two' }),
        createMigration({ version: '1.9.0', description: 'nine' }),
      ];

      // Act
      const results = runner.run(migrations);

      // Assert
      expect(results.map((r) => r.version)).toEqual(['1.2.0', '1.9.0', '1.10.0']);
    });

    test('handles single-segment versions by treating missing segments as zero', () => {
      // Arrange
      const migrations = [
        createMigration({ version: '2', description: 'major only' }),
        createMigration({ version: '1', description: 'lower major' }),
      ];

      // Act
      const results = runner.run(migrations);

      // Assert
      expect(results[0].version).toBe('1');
      expect(results[1].version).toBe('2');
    });

    test('handles two-segment versions (major.minor)', () => {
      // Arrange
      const migrations = [
        createMigration({ version: '1.1', description: 'minor' }),
        createMigration({ version: '1.0', description: 'base' }),
      ];

      // Act
      const results = runner.run(migrations);

      // Assert
      expect(results[0].version).toBe('1.0');
      expect(results[1].version).toBe('1.1');
    });

    test('treats pre-release suffix as NaN — falls back to zero for sorting', () => {
      // Arrange — compareVersions does Number() on segments;
      // "0-alpha" becomes NaN, which || 0 turns to 0
      const migrations = [
        createMigration({ version: '1.0.0-alpha', description: 'pre-release' }),
        createMigration({ version: '1.0.0', description: 'release' }),
      ];

      // Act
      const results = runner.run(migrations);

      // Assert — both treated as 1.0.0, input order preserved (stable)
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.status === 'applied')).toBe(true);
    });

    test('treats build metadata suffix as NaN — falls back to zero for sorting', () => {
      // Arrange
      const migrations = [
        createMigration({ version: '1.0.0+build.123', description: 'with metadata' }),
        createMigration({ version: '1.0.0', description: 'plain' }),
      ];

      // Act
      const results = runner.run(migrations);

      // Assert
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.status === 'applied')).toBe(true);
    });

    test('sorts 0.x versions before 1.x versions', () => {
      // Arrange
      const migrations = [
        createMigration({ version: '1.0.0' }),
        createMigration({ version: '0.9.0' }),
        createMigration({ version: '0.1.0' }),
      ];

      // Act
      const results = runner.run(migrations);

      // Assert
      expect(results.map((r) => r.version)).toEqual(['0.1.0', '0.9.0', '1.0.0']);
    });

    test('patch version differences sort correctly', () => {
      // Arrange
      const migrations = [
        createMigration({ version: '1.0.3' }),
        createMigration({ version: '1.0.1' }),
        createMigration({ version: '1.0.2' }),
      ];

      // Act
      const results = runner.run(migrations);

      // Assert
      expect(results.map((r) => r.version)).toEqual(['1.0.1', '1.0.2', '1.0.3']);
    });

    test('handles large version numbers correctly', () => {
      // Arrange
      const migrations = [
        createMigration({ version: '100.200.300' }),
        createMigration({ version: '1.2.3' }),
      ];

      // Act
      const results = runner.run(migrations);

      // Assert
      expect(results.map((r) => r.version)).toEqual(['1.2.3', '100.200.300']);
    });
  });

  // ── Concurrent Migration Attempts ────────────────────────────────

  describe('concurrent migration attempts', () => {
    test('second runner skips migrations already applied by first runner', () => {
      // Arrange
      const migration = createMigration({ version: '1.0.0' });
      const runner2 = new MigrationRunner(db);
      runner.run([migration]);

      // Act
      const results = runner2.run([migration]);

      // Assert
      expect(results[0].status).toBe('skipped');
    });

    test('two runners on same db see each others applied state', () => {
      // Arrange
      const runner2 = new MigrationRunner(db);
      runner.run([createMigration({ version: '1.0.0' })]);

      // Act
      const applied = runner2.listApplied();

      // Assert
      expect(applied).toHaveLength(1);
      expect(applied[0].version).toBe('1.0.0');
    });

    test('duplicate version in same batch — second fails with PRIMARY KEY conflict', () => {
      // Arrange — getApplied() is called once before the loop,
      // so the second identical version attempts INSERT and hits a constraint error
      const migrations = [
        createMigration({ version: '1.0.0', description: 'first' }),
        createMigration({ version: '1.0.0', description: 'duplicate' }),
      ];

      // Act
      const results = runner.run(migrations);

      // Assert — first applies, second fails due to UNIQUE constraint, stops
      expect(results).toHaveLength(2);
      expect(results[0].status).toBe('applied');
      expect(results[1].status).toBe('failed');
      expect(results[1].error).toMatch(/UNIQUE constraint/);
    });

    test('getPending consistent across runners sharing same db', () => {
      // Arrange
      const runner2 = new MigrationRunner(db);
      const all = [createMigration({ version: '1.0.0' }), createMigration({ version: '2.0.0' })];
      runner.run([all[0]]);

      // Act
      const pending = runner2.getPending(all);

      // Assert
      expect(pending).toHaveLength(1);
      expect(pending[0].version).toBe('2.0.0');
    });
  });
});
