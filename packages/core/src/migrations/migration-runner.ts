/**
 * Schema Migration Runner — versioned migration scripts for engine upgrades.
 *
 * Migrations run in version order, track state in `_soleri_migrations` table,
 * and support verify + rollback.
 */

import type { Database } from 'better-sqlite3';

// ─── Types ────────────────────────────────────────────────────────────

export interface Migration {
  /** Semver version this migration applies to */
  version: string;
  /** Human-readable description */
  description: string;
  /** Apply the migration */
  up: (db: Database) => void;
  /** Verify the migration was applied correctly */
  verify?: (db: Database) => boolean;
  /** Rollback (optional) */
  down?: (db: Database) => void;
}

export interface MigrationResult {
  version: string;
  description: string;
  status: 'applied' | 'skipped' | 'failed' | 'rolled-back';
  error?: string;
  durationMs: number;
}

export interface MigrationState {
  version: string;
  appliedAt: string;
  description: string;
}

// ─── Runner ───────────────────────────────────────────────────────────

export class MigrationRunner {
  constructor(private db: Database) {
    this.ensureTable();
  }

  /**
   * Run all pending migrations in version order.
   */
  run(migrations: Migration[]): MigrationResult[] {
    const applied = this.getApplied();
    const sorted = [...migrations].sort((a, b) => compareVersions(a.version, b.version));
    const results: MigrationResult[] = [];

    for (const migration of sorted) {
      if (applied.has(migration.version)) {
        results.push({
          version: migration.version,
          description: migration.description,
          status: 'skipped',
          durationMs: 0,
        });
        continue;
      }

      const start = Date.now();
      try {
        migration.up(this.db);

        // Verify if verifier provided
        if (migration.verify && !migration.verify(this.db)) {
          // Rollback if possible
          if (migration.down) {
            migration.down(this.db);
            results.push({
              version: migration.version,
              description: migration.description,
              status: 'rolled-back',
              error: 'Verification failed after apply',
              durationMs: Date.now() - start,
            });
          } else {
            results.push({
              version: migration.version,
              description: migration.description,
              status: 'failed',
              error: 'Verification failed, no rollback available',
              durationMs: Date.now() - start,
            });
          }
          continue;
        }

        // Record as applied
        this.recordApplied(migration);
        results.push({
          version: migration.version,
          description: migration.description,
          status: 'applied',
          durationMs: Date.now() - start,
        });
      } catch (err) {
        // Attempt rollback
        if (migration.down) {
          try {
            migration.down(this.db);
          } catch {
            // Rollback failed — nothing we can do
          }
        }

        results.push({
          version: migration.version,
          description: migration.description,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - start,
        });
        // Stop on failure — don't run subsequent migrations
        break;
      }
    }

    return results;
  }

  /**
   * Get list of applied migrations.
   */
  listApplied(): MigrationState[] {
    const stmt = this.db.prepare(
      'SELECT version, applied_at, description FROM _soleri_migrations ORDER BY version',
    );
    const rows = stmt.all() as Array<{ version: string; applied_at: string; description: string }>;
    return rows.map((row) => ({
      version: row.version,
      appliedAt: row.applied_at,
      description: row.description,
    }));
  }

  /**
   * Get pending migrations (not yet applied).
   */
  getPending(migrations: Migration[]): Migration[] {
    const applied = this.getApplied();
    return migrations
      .filter((m) => !applied.has(m.version))
      .sort((a, b) => compareVersions(a.version, b.version));
  }

  private getApplied(): Set<string> {
    const stmt = this.db.prepare('SELECT version FROM _soleri_migrations');
    const rows = stmt.all() as Array<{ version: string }>;
    return new Set(rows.map((r) => r.version));
  }

  private recordApplied(migration: Migration): void {
    const stmt = this.db.prepare(
      'INSERT INTO _soleri_migrations (version, applied_at, description) VALUES (?, ?, ?)',
    );
    stmt.run(migration.version, new Date().toISOString(), migration.description);
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _soleri_migrations (
        version TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL,
        description TEXT NOT NULL
      )
    `);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
