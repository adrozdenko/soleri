/**
 * Vault startup integrity checks — schema validation and FTS recovery.
 */

import type { PersistenceProvider } from '../persistence/types.js';

export interface IntegrityResult {
  schemaValid: boolean;
  ftsValid: boolean;
  ftsRebuilt: boolean;
  missingTables: string[];
  errors: string[];
}

const REQUIRED_TABLES = ['entries', 'entries_fts', 'memories', 'projects', 'brain_vocabulary'];

export function checkVaultIntegrity(provider: PersistenceProvider): IntegrityResult {
  const result: IntegrityResult = {
    schemaValid: true,
    ftsValid: true,
    ftsRebuilt: false,
    missingTables: [],
    errors: [],
  };

  // 1. Check required tables exist
  for (const table of REQUIRED_TABLES) {
    try {
      provider.get(`SELECT 1 FROM ${table} LIMIT 1`);
    } catch {
      result.missingTables.push(table);
      result.schemaValid = false;
    }
  }

  // 2. Validate FTS index consistency
  if (!result.missingTables.includes('entries_fts')) {
    try {
      // FTS integrity check — compare row counts
      const entryCount =
        provider.get<{ count: number }>('SELECT COUNT(*) as count FROM entries')?.count ?? 0;
      const ftsCount =
        provider.get<{ count: number }>('SELECT COUNT(*) as count FROM entries_fts')?.count ?? 0;

      if (entryCount !== ftsCount) {
        result.ftsValid = false;
        result.errors.push(`FTS index out of sync: ${ftsCount} FTS rows vs ${entryCount} entries`);

        // Auto-rebuild
        try {
          provider.run("INSERT INTO entries_fts(entries_fts) VALUES('rebuild')");
          result.ftsRebuilt = true;
        } catch (rebuildErr) {
          result.errors.push(
            `FTS rebuild failed: ${rebuildErr instanceof Error ? rebuildErr.message : String(rebuildErr)}`,
          );
        }
      }
    } catch (err) {
      result.ftsValid = false;
      result.errors.push(`FTS check failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}
