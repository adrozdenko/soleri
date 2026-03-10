import { describe, it, expect } from 'vitest';
import { translateSql, PostgresPersistenceProvider } from '../persistence/postgres-provider.js';

describe('translateSql', () => {
  it('converts positional ? to $N', () => {
    const result = translateSql('SELECT * FROM t WHERE a = ? AND b = ?', ['x', 'y']);
    expect(result.sql).toBe('SELECT * FROM t WHERE a = $1 AND b = $2');
    expect(result.values).toEqual(['x', 'y']);
  });

  it('converts named @params to $N', () => {
    const result = translateSql('INSERT INTO t (a, b) VALUES (@name, @age)', {
      name: 'Alice',
      age: 30,
    });
    expect(result.sql).toBe('INSERT INTO t (a, b) VALUES ($1, $2)');
    expect(result.values).toEqual(['Alice', 30]);
  });

  it('deduplicates repeated named params', () => {
    const result = translateSql('SELECT * FROM t WHERE a = @x OR b = @x', { x: 42 });
    expect(result.sql).toBe('SELECT * FROM t WHERE a = $1 OR b = $1');
    expect(result.values).toEqual([42]);
  });

  it('replaces unixepoch()', () => {
    const result = translateSql('INSERT INTO t (ts) VALUES (unixepoch())');
    expect(result.sql).toBe('INSERT INTO t (ts) VALUES (EXTRACT(EPOCH FROM NOW())::integer)');
    expect(result.values).toEqual([]);
  });

  it('handles no params', () => {
    const result = translateSql('SELECT 1');
    expect(result.sql).toBe('SELECT 1');
    expect(result.values).toEqual([]);
  });

  it('handles mixed: ? params + unixepoch()', () => {
    const result = translateSql('UPDATE t SET name = ?, updated_at = unixepoch() WHERE id = ?', [
      'Bob',
      'id-1',
    ]);
    expect(result.sql).toBe(
      'UPDATE t SET name = $1, updated_at = EXTRACT(EPOCH FROM NOW())::integer WHERE id = $2',
    );
    expect(result.values).toEqual(['Bob', 'id-1']);
  });

  it('replaces INTEGER PRIMARY KEY AUTOINCREMENT with SERIAL PRIMARY KEY', () => {
    const result = translateSql('CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)');
    expect(result.sql).toBe('CREATE TABLE t (id SERIAL PRIMARY KEY, name TEXT)');
  });

  it('strips PRAGMA statements', () => {
    const result = translateSql('PRAGMA journal_mode = WAL');
    expect(result.sql).toBe('-- pragma removed');
  });

  it('replaces INSERT OR IGNORE with INSERT', () => {
    const result = translateSql('INSERT OR IGNORE INTO t (a) VALUES (?)', ['x']);
    expect(result.sql).toBe('INSERT INTO t (a) VALUES ($1)');
    expect(result.values).toEqual(['x']);
  });

  it('replaces INSERT OR REPLACE with INSERT', () => {
    const result = translateSql('INSERT OR REPLACE INTO t (a) VALUES (?)', ['x']);
    expect(result.sql).toBe('INSERT INTO t (a) VALUES ($1)');
    expect(result.values).toEqual(['x']);
  });

  it('handles complex vault-style query with multiple named params', () => {
    const result = translateSql(
      'SELECT e.* FROM entries e WHERE e.domain = @domain AND e.type = @type ORDER BY e.title LIMIT @limit OFFSET @offset',
      { domain: 'design', type: 'pattern', limit: 10, offset: 0 },
    );
    expect(result.sql).toBe(
      'SELECT e.* FROM entries e WHERE e.domain = $1 AND e.type = $2 ORDER BY e.title LIMIT $3 OFFSET $4',
    );
    expect(result.values).toEqual(['design', 'pattern', 10, 0]);
  });

  it('handles vault seed query with many named params', () => {
    const result = translateSql(
      'INSERT INTO entries (id, type, domain) VALUES (@id, @type, @domain) ON CONFLICT(id) DO UPDATE SET type=excluded.type',
      { id: 'e1', type: 'pattern', domain: 'general' },
    );
    expect(result.sql).toContain('VALUES ($1, $2, $3)');
    expect(result.values).toEqual(['e1', 'pattern', 'general']);
  });
});

describe('PostgresPersistenceProvider', () => {
  it('class exists with correct backend', () => {
    expect(PostgresPersistenceProvider).toBeDefined();
    expect(typeof PostgresPersistenceProvider.create).toBe('function');
    expect(typeof PostgresPersistenceProvider.createSync).toBe('function');
  });

  it('createSync returns a provider instance', () => {
    const provider = PostgresPersistenceProvider.createSync('postgresql://localhost/test');
    expect(provider.backend).toBe('postgres');
    expect(provider.getConnectionString()).toBe('postgresql://localhost/test');
  });

  it('ftsRebuild is a no-op (PostgreSQL GIN auto-maintains)', () => {
    const provider = PostgresPersistenceProvider.createSync('postgresql://localhost/test');
    // Should not throw
    provider.ftsRebuild('entries');
  });

  it('close is safe to call multiple times', () => {
    const provider = PostgresPersistenceProvider.createSync('postgresql://localhost/test');
    provider.close();
    provider.close(); // should not throw
  });
});
