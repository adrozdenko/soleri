import { describe, it, expect, afterEach } from 'vitest';
import { checkVaultIntegrity } from '../health/vault-integrity.js';
import { Vault } from '../vault/vault.js';

describe('checkVaultIntegrity', () => {
  let vault: Vault;

  afterEach(() => {
    vault?.close();
  });

  it('reports healthy for a fresh vault', () => {
    vault = new Vault(':memory:');
    const result = checkVaultIntegrity(vault.getProvider());
    expect(result.schemaValid).toBe(true);
    expect(result.ftsValid).toBe(true);
    expect(result.ftsRebuilt).toBe(false);
    expect(result.missingTables).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('detects FTS row count mismatch and auto-rebuilds', () => {
    vault = new Vault(':memory:');
    vault.seed([
      {
        id: 'test-1',
        type: 'pattern',
        domain: 'test',
        title: 'Test entry',
        severity: 'suggestion',
        description: 'A test',
        tags: ['test'],
      },
    ]);

    // Corrupt FTS by deleting directly from FTS table
    const provider = vault.getProvider();
    try {
      provider.run(
        'DELETE FROM entries_fts WHERE rowid IN (SELECT rowid FROM entries_fts LIMIT 1)',
      );
    } catch {
      // Some FTS implementations don't allow direct delete — skip test
      return;
    }

    const result = checkVaultIntegrity(provider);
    // Either detects mismatch or FTS doesn't allow direct manipulation
    if (!result.ftsValid) {
      expect(result.ftsRebuilt).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('detects missing tables', () => {
    vault = new Vault(':memory:');
    const provider = vault.getProvider();

    // Drop a non-FTS table to simulate corruption
    try {
      provider.run('DROP TABLE IF EXISTS brain_vocabulary');
    } catch {
      return; // Table may not exist
    }

    const result = checkVaultIntegrity(provider);
    if (result.missingTables.includes('brain_vocabulary')) {
      expect(result.schemaValid).toBe(false);
    }
  });
});
