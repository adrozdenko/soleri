import { describe, it, expect } from 'vitest';
import { SQLitePersistenceProvider } from '../persistence/sqlite-provider.js';
import { Vault } from '../vault/vault.js';

// ─── SQLitePersistenceProvider ────────────────────────────────────────

describe('SQLitePersistenceProvider', () => {
  it('execSql creates tables', () => {
    const p = new SQLitePersistenceProvider(':memory:');
    p.execSql('CREATE TABLE test (id TEXT PRIMARY KEY, val TEXT)');
    p.run('INSERT INTO test (id, val) VALUES (?, ?)', ['a', 'hello']);
    const row = p.get<{ id: string; val: string }>('SELECT * FROM test WHERE id = ?', ['a']);
    expect(row).toEqual({ id: 'a', val: 'hello' });
    p.close();
  });

  it('run with named params', () => {
    const p = new SQLitePersistenceProvider(':memory:');
    p.execSql('CREATE TABLE t (id TEXT PRIMARY KEY, name TEXT)');
    const result = p.run('INSERT INTO t (id, name) VALUES (@id, @name)', {
      id: '1',
      name: 'test',
    });
    expect(result.changes).toBe(1);
    p.close();
  });

  it('run with positional params', () => {
    const p = new SQLitePersistenceProvider(':memory:');
    p.execSql('CREATE TABLE t (id TEXT PRIMARY KEY)');
    const result = p.run('INSERT INTO t (id) VALUES (?)', ['x']);
    expect(result.changes).toBe(1);
    p.close();
  });

  it('run with no params', () => {
    const p = new SQLitePersistenceProvider(':memory:');
    p.execSql('CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT)');
    const result = p.run('INSERT INTO t DEFAULT VALUES');
    expect(result.changes).toBe(1);
    expect(result.lastInsertRowid).toBe(1);
    p.close();
  });

  it('get returns undefined for no match', () => {
    const p = new SQLitePersistenceProvider(':memory:');
    p.execSql('CREATE TABLE t (id TEXT PRIMARY KEY)');
    const row = p.get('SELECT * FROM t WHERE id = ?', ['nonexistent']);
    expect(row).toBeUndefined();
    p.close();
  });

  it('all returns empty for no matches', () => {
    const p = new SQLitePersistenceProvider(':memory:');
    p.execSql('CREATE TABLE t (id TEXT PRIMARY KEY)');
    const rows = p.all('SELECT * FROM t');
    expect(rows).toEqual([]);
    p.close();
  });

  it('all returns multiple rows', () => {
    const p = new SQLitePersistenceProvider(':memory:');
    p.execSql('CREATE TABLE t (id TEXT PRIMARY KEY, val INTEGER)');
    p.run('INSERT INTO t VALUES (?, ?)', ['a', 1]);
    p.run('INSERT INTO t VALUES (?, ?)', ['b', 2]);
    p.run('INSERT INTO t VALUES (?, ?)', ['c', 3]);
    const rows = p.all<{ id: string; val: number }>('SELECT * FROM t ORDER BY id');
    expect(rows).toHaveLength(3);
    expect(rows[0].id).toBe('a');
    expect(rows[2].val).toBe(3);
    p.close();
  });

  it('transaction commits on success', () => {
    const p = new SQLitePersistenceProvider(':memory:');
    p.execSql('CREATE TABLE t (id TEXT PRIMARY KEY)');
    p.transaction(() => {
      p.run('INSERT INTO t VALUES (?)', ['a']);
      p.run('INSERT INTO t VALUES (?)', ['b']);
    });
    const rows = p.all('SELECT * FROM t');
    expect(rows).toHaveLength(2);
    p.close();
  });

  it('transaction rolls back on error', () => {
    const p = new SQLitePersistenceProvider(':memory:');
    p.execSql('CREATE TABLE t (id TEXT PRIMARY KEY)');
    expect(() =>
      p.transaction(() => {
        p.run('INSERT INTO t VALUES (?)', ['a']);
        throw new Error('rollback');
      }),
    ).toThrow('rollback');
    const rows = p.all('SELECT * FROM t');
    expect(rows).toHaveLength(0);
    p.close();
  });

  it('transaction returns value', () => {
    const p = new SQLitePersistenceProvider(':memory:');
    p.execSql('CREATE TABLE t (id TEXT PRIMARY KEY)');
    const result = p.transaction(() => {
      p.run('INSERT INTO t VALUES (?)', ['a']);
      return 42;
    });
    expect(result).toBe(42);
    p.close();
  });

  it('getDatabase returns raw db', () => {
    const p = new SQLitePersistenceProvider(':memory:');
    const db = p.getDatabase();
    expect(db).toBeDefined();
    // Verify it's a real better-sqlite3 database
    expect(typeof db.prepare).toBe('function');
    p.close();
  });

  it('close prevents further operations', () => {
    const p = new SQLitePersistenceProvider(':memory:');
    p.close();
    expect(() => p.run('SELECT 1')).toThrow();
  });

  it('backend returns sqlite', () => {
    const p = new SQLitePersistenceProvider(':memory:');
    expect(p.backend).toBe('sqlite');
    p.close();
  });

  it('ftsSearch returns matches', () => {
    const p = new SQLitePersistenceProvider(':memory:');
    p.execSql(`
      CREATE TABLE docs (rowid INTEGER PRIMARY KEY, title TEXT, body TEXT);
      CREATE VIRTUAL TABLE docs_fts USING fts5(title, body, content=docs, content_rowid=rowid);
      INSERT INTO docs (rowid, title, body) VALUES (1, 'Hello World', 'This is a test document');
      INSERT INTO docs (rowid, title, body) VALUES (2, 'Goodbye', 'Another test here');
      INSERT INTO docs_fts (rowid, title, body) VALUES (1, 'Hello World', 'This is a test document');
      INSERT INTO docs_fts (rowid, title, body) VALUES (2, 'Goodbye', 'Another test here');
    `);
    const results = p.ftsSearch<{ title: string; body: string }>('docs', 'hello');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Hello World');
    p.close();
  });

  it('ftsSearch respects limit/offset', () => {
    const p = new SQLitePersistenceProvider(':memory:');
    p.execSql(`
      CREATE TABLE items (rowid INTEGER PRIMARY KEY, name TEXT);
      CREATE VIRTUAL TABLE items_fts USING fts5(name, content=items, content_rowid=rowid);
      INSERT INTO items (rowid, name) VALUES (1, 'test alpha');
      INSERT INTO items (rowid, name) VALUES (2, 'test beta');
      INSERT INTO items (rowid, name) VALUES (3, 'test gamma');
      INSERT INTO items_fts (rowid, name) VALUES (1, 'test alpha');
      INSERT INTO items_fts (rowid, name) VALUES (2, 'test beta');
      INSERT INTO items_fts (rowid, name) VALUES (3, 'test gamma');
    `);
    const limited = p.ftsSearch<{ name: string }>('items', 'test', { limit: 2 });
    expect(limited).toHaveLength(2);
    const offset = p.ftsSearch<{ name: string }>('items', 'test', { limit: 1, offset: 2 });
    expect(offset).toHaveLength(1);
    p.close();
  });

  it('ftsSearch applies filters', () => {
    const p = new SQLitePersistenceProvider(':memory:');
    p.execSql(`
      CREATE TABLE notes (rowid INTEGER PRIMARY KEY, title TEXT, category TEXT);
      CREATE VIRTUAL TABLE notes_fts USING fts5(title, content=notes, content_rowid=rowid);
      INSERT INTO notes (rowid, title, category) VALUES (1, 'design pattern', 'arch');
      INSERT INTO notes (rowid, title, category) VALUES (2, 'design review', 'process');
      INSERT INTO notes_fts (rowid, title) VALUES (1, 'design pattern');
      INSERT INTO notes_fts (rowid, title) VALUES (2, 'design review');
    `);
    const filtered = p.ftsSearch<{ title: string; category: string }>('notes', 'design', {
      filters: { category: 'arch' },
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].category).toBe('arch');
    p.close();
  });

  it('ftsRebuild no-ops gracefully', () => {
    const p = new SQLitePersistenceProvider(':memory:');
    // No FTS table exists — should not throw
    expect(() => p.ftsRebuild('nonexistent')).not.toThrow();
    p.close();
  });
});

// ─── Vault with PersistenceProvider ───────────────────────────────────

describe('Vault with PersistenceProvider', () => {
  it('accepts string path (backward compat)', () => {
    const vault = new Vault(':memory:');
    expect(vault.stats().totalEntries).toBe(0);
    vault.close();
  });

  it('accepts SQLitePersistenceProvider', () => {
    const provider = new SQLitePersistenceProvider(':memory:');
    provider.run('PRAGMA journal_mode = WAL');
    provider.run('PRAGMA foreign_keys = ON');
    const vault = new Vault(provider);
    expect(vault.stats().totalEntries).toBe(0);
    vault.close();
  });

  it('createWithSQLite factory works', () => {
    const vault = Vault.createWithSQLite(':memory:');
    vault.add({
      id: 'test-1',
      type: 'pattern',
      domain: 'core',
      title: 'Test Pattern',
      severity: 'suggestion',
      description: 'A test',
      tags: ['test'],
    });
    expect(vault.stats().totalEntries).toBe(1);
    vault.close();
  });

  it('getProvider returns the provider', () => {
    const provider = new SQLitePersistenceProvider(':memory:');
    provider.run('PRAGMA journal_mode = WAL');
    provider.run('PRAGMA foreign_keys = ON');
    const vault = new Vault(provider);
    expect(vault.getProvider()).toBe(provider);
    vault.close();
  });

  it('getDb works with SQLite provider', () => {
    const vault = new Vault(':memory:');
    const db = vault.getDb();
    expect(typeof db.prepare).toBe('function');
    vault.close();
  });

  it('all vault operations work through provider', () => {
    const vault = new Vault(':memory:');

    // seed + get
    vault.seed([
      {
        id: 'e1',
        type: 'pattern',
        domain: 'test',
        title: 'Pattern One',
        severity: 'suggestion',
        description: 'First pattern',
        tags: ['a', 'b'],
      },
      {
        id: 'e2',
        type: 'anti-pattern',
        domain: 'test',
        title: 'Anti Pattern',
        severity: 'warning',
        description: 'Avoid this',
        tags: ['c'],
      },
    ]);
    expect(vault.get('e1')?.title).toBe('Pattern One');
    expect(vault.stats().totalEntries).toBe(2);

    // search
    const results = vault.search('pattern');
    expect(results.length).toBeGreaterThan(0);

    // list
    const all = vault.list({ domain: 'test' });
    expect(all).toHaveLength(2);

    // update
    const updated = vault.update('e1', { title: 'Updated' });
    expect(updated?.title).toBe('Updated');

    // remove
    expect(vault.remove('e2')).toBe(true);
    expect(vault.stats().totalEntries).toBe(1);

    // bulk remove
    expect(vault.bulkRemove(['e1'])).toBe(1);
    expect(vault.stats().totalEntries).toBe(0);

    vault.close();
  });
});
