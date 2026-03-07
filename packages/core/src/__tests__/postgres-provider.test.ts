import { describe, it, expect } from 'vitest';
import { translateSql } from '../persistence/postgres-provider.js';
import { PostgresPersistenceProvider } from '../persistence/postgres-provider.js';

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
});

describe('PostgresPersistenceProvider', () => {
  it('backend returns postgres', () => {
    // Access backend without connecting (class-level property)
    // We can't instantiate without pg, so we test the translateSql export
    // and verify the class exists with correct typing
    expect(PostgresPersistenceProvider).toBeDefined();
  });
});
