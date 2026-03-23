import { describe, it, expect, vi } from 'vitest';
import { checkVaultIntegrity } from './vault-integrity.js';
import type { PersistenceProvider } from '../persistence/types.js';

function createMockProvider(overrides: Partial<PersistenceProvider> = {}): PersistenceProvider {
  return {
    backend: 'sqlite' as const,
    execSql: vi.fn(),
    run: vi.fn().mockReturnValue({ changes: 0, lastInsertRowid: 0 }),
    get: vi.fn().mockReturnValue({ count: 0 }),
    all: vi.fn().mockReturnValue([]),
    transaction: vi.fn((fn) => fn()),
    ftsSearch: vi.fn().mockReturnValue([]),
    ...overrides,
  } as unknown as PersistenceProvider;
}

describe('checkVaultIntegrity', () => {
  it('reports healthy when all tables exist and FTS is in sync', () => {
    const provider = createMockProvider({
      get: vi.fn().mockReturnValue({ count: 5 }),
    });

    const result = checkVaultIntegrity(provider);
    expect(result.schemaValid).toBe(true);
    expect(result.ftsValid).toBe(true);
    expect(result.ftsRebuilt).toBe(false);
    expect(result.missingTables).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('detects missing tables', () => {
    const getMock = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('brain_vocabulary')) throw new Error('no such table');
      if (sql.includes('entries_fts')) throw new Error('no such table');
      return { count: 0 };
    });

    const provider = createMockProvider({ get: getMock });
    const result = checkVaultIntegrity(provider);

    expect(result.schemaValid).toBe(false);
    expect(result.missingTables).toContain('brain_vocabulary');
    expect(result.missingTables).toContain('entries_fts');
  });

  it('detects FTS row count mismatch and attempts rebuild', () => {
    const getMock = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT 1 FROM')) return { exists: 1 };
      if (sql.includes('COUNT(*)') && sql.includes('entries_fts')) return { count: 3 };
      if (sql.includes('COUNT(*)') && sql.includes('entries')) return { count: 5 };
      return { count: 0 };
    });
    const runMock = vi.fn().mockReturnValue({ changes: 0, lastInsertRowid: 0 });

    const provider = createMockProvider({ get: getMock, run: runMock });
    const result = checkVaultIntegrity(provider);

    expect(result.ftsValid).toBe(false);
    expect(result.errors.some((e) => e.includes('FTS index out of sync'))).toBe(true);
    expect(result.ftsRebuilt).toBe(true);
    expect(runMock).toHaveBeenCalledWith("INSERT INTO entries_fts(entries_fts) VALUES('rebuild')");
  });

  it('reports FTS rebuild failure', () => {
    const getMock = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT 1 FROM')) return { exists: 1 };
      if (sql.includes('COUNT(*)') && sql.includes('entries_fts')) return { count: 1 };
      if (sql.includes('COUNT(*)') && sql.includes('entries')) return { count: 5 };
      return { count: 0 };
    });
    const runMock = vi.fn().mockImplementation(() => {
      throw new Error('rebuild failed');
    });

    const provider = createMockProvider({ get: getMock, run: runMock });
    const result = checkVaultIntegrity(provider);

    expect(result.ftsRebuilt).toBe(false);
    expect(result.errors.some((e) => e.includes('rebuild failed'))).toBe(true);
  });

  it('skips FTS check when entries_fts table is missing', () => {
    const getMock = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('entries_fts')) throw new Error('no such table');
      return { count: 0 };
    });

    const provider = createMockProvider({ get: getMock });
    const result = checkVaultIntegrity(provider);

    expect(result.missingTables).toContain('entries_fts');
    // FTS validity should remain default true since check was skipped
    expect(result.ftsValid).toBe(true);
  });

  it('handles FTS count query failure gracefully', () => {
    const getMock = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT 1 FROM')) return { exists: 1 };
      if (sql.includes('COUNT(*)')) throw new Error('query failed');
      return { count: 0 };
    });

    const provider = createMockProvider({ get: getMock });
    const result = checkVaultIntegrity(provider);

    expect(result.ftsValid).toBe(false);
    expect(result.errors.some((e) => e.includes('FTS check failed'))).toBe(true);
  });
});
