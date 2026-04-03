import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SOLERI_HOME } from '@soleri/core';

/**
 * Resolve the vault DB path for a given agent.
 * Checks the current path first, then falls back to the legacy dot-prefixed path.
 */
export function resolveVaultDbPath(agentId: string): string | null {
  const newDbPath = join(SOLERI_HOME, agentId, 'vault.db');
  const legacyDbPath = join(SOLERI_HOME, '..', `.${agentId}`, 'vault.db');
  if (existsSync(newDbPath)) return newDbPath;
  if (existsSync(legacyDbPath)) return legacyDbPath;
  return null;
}
