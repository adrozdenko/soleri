/**
 * One-time data migration: resolve relative project_path values in
 * vault_policies and vault_policy_changes to absolute paths.
 *
 * Why this exists
 * ---------------
 * GovernancePolicies now normalizes projectPath via node:path.resolve at
 * every public entry point. But rows were written under non-canonical paths
 * before that invariant existed (e.g. "." or ""). Without this cleanup,
 * existing rows become unreachable via the normalized API and old callers
 * that happened to match the non-absolute key keep seeing stale data.
 *
 * Strategy
 * --------
 * 1. Ensure an idempotency marker table exists (soleri_data_migrations).
 *    Skip if this migration already ran.
 * 2. For each non-absolute project_path in vault_policies:
 *    - Compute the absolute equivalent.
 *    - Per policy_type: if an absolute row already exists, DELETE the
 *      relative row and log an audit entry to vault_policy_changes
 *      ('superseded-by-normalization'). Otherwise UPDATE the project_path
 *      to the absolute form.
 * 3. For vault_policy_changes: bulk UPDATE remaining relative rows to the
 *    absolute path (no uniqueness constraint — pure rename).
 * 4. Record the marker so subsequent runs no-op.
 *
 * Rollback
 * --------
 * Everything runs inside PersistenceProvider.transaction() — any throw rolls
 * back the whole thing. vault_policy_changes preserves the original config
 * JSON for every dropped row, so a manual revert is always possible.
 */

import { isAbsolute, resolve as resolvePath } from 'node:path';
import type { PersistenceProvider } from '../../persistence/types.js';

export const MIGRATION_NAME = 'normalize-project-paths';

export interface NormalizeMigrationResult {
  skipped: boolean;
  /** Rows whose project_path was rewritten to the absolute form. */
  renamed: number;
  /** Relative rows dropped because an absolute equivalent already existed. */
  dropped: number;
  /** Audit rows inserted to record the drops. */
  auditLogged: number;
}

export function runNormalizeProjectPathsMigration(
  provider: PersistenceProvider,
): NormalizeMigrationResult {
  ensureMarkerTable(provider);

  if (hasRun(provider)) {
    return { skipped: true, renamed: 0, dropped: 0, auditLogged: 0 };
  }

  let renamed = 0;
  let dropped = 0;
  let auditLogged = 0;

  provider.transaction(() => {
    const policyPaths = provider.all<{ project_path: string }>(
      'SELECT DISTINCT project_path FROM vault_policies',
    );

    for (const row of policyPaths) {
      const original = row.project_path;
      if (isAbsolute(original)) continue;

      const absolute = resolvePath(original);
      if (absolute === original) continue;

      const policyTypes = provider.all<{ policy_type: string; config: string }>(
        'SELECT policy_type, config FROM vault_policies WHERE project_path = ?',
        [original],
      );

      for (const { policy_type, config } of policyTypes) {
        const collision = provider.get<{ id: number }>(
          'SELECT id FROM vault_policies WHERE project_path = ? AND policy_type = ?',
          [absolute, policy_type],
        );

        if (collision) {
          // Absolute row wins. Drop the relative row and audit the drop so
          // the original config JSON survives in vault_policy_changes.
          provider.run('DELETE FROM vault_policies WHERE project_path = ? AND policy_type = ?', [
            original,
            policy_type,
          ]);
          provider.run(
            `INSERT INTO vault_policy_changes
             (project_path, policy_type, old_config, new_config, changed_by)
             VALUES (?, ?, ?, ?, ?)`,
            [absolute, policy_type, config, config, 'migration:normalize-project-paths'],
          );
          dropped += 1;
          auditLogged += 1;
        } else {
          provider.run(
            'UPDATE vault_policies SET project_path = ? WHERE project_path = ? AND policy_type = ?',
            [absolute, original, policy_type],
          );
          renamed += 1;
        }
      }
    }

    // vault_policy_changes has no uniqueness constraint — simple rename.
    const changeRows = provider.all<{ project_path: string }>(
      'SELECT DISTINCT project_path FROM vault_policy_changes',
    );
    for (const { project_path } of changeRows) {
      if (isAbsolute(project_path)) continue;
      const absolute = resolvePath(project_path);
      if (absolute === project_path) continue;
      const res = provider.run(
        'UPDATE vault_policy_changes SET project_path = ? WHERE project_path = ?',
        [absolute, project_path],
      );
      renamed += res.changes;
    }

    provider.run('INSERT INTO soleri_data_migrations (name, run_at) VALUES (?, unixepoch())', [
      MIGRATION_NAME,
    ]);
  });

  return { skipped: false, renamed, dropped, auditLogged };
}

function ensureMarkerTable(provider: PersistenceProvider): void {
  provider.execSql(`
    CREATE TABLE IF NOT EXISTS soleri_data_migrations (
      name TEXT PRIMARY KEY,
      run_at INTEGER NOT NULL
    );
  `);
}

function hasRun(provider: PersistenceProvider): boolean {
  const row = provider.get<{ name: string }>(
    'SELECT name FROM soleri_data_migrations WHERE name = ?',
    [MIGRATION_NAME],
  );
  return row !== undefined;
}
