import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SQLitePersistenceProvider, applyPerformancePragmas } from './sqlite-provider.js';
import Database from 'better-sqlite3';

// ─── Test Factories ──────────────────────────────────────────────────

function createProvider(path = ':memory:'): SQLitePersistenceProvider {
  return new SQLitePersistenceProvider(path);
}

function createProviderWithTable(
  tableDdl = 'CREATE TABLE t (id TEXT PRIMARY KEY, val TEXT)',
): SQLitePersistenceProvider {
  const p = createProvider();
  p.execSql(tableDdl);
  return p;
}

function createFtsProvider(): SQLitePersistenceProvider {
  const p = createProvider();
  p.execSql(`
    CREATE TABLE docs (rowid INTEGER PRIMARY KEY, title TEXT, body TEXT);
    CREATE VIRTUAL TABLE docs_fts USING fts5(title, body, content=docs, content_rowid=rowid);
  `);
  return p;
}

function seedFtsRows(
  p: SQLitePersistenceProvider,
  rows: Array<{ rowid: number; title: string; body: string }>,
): void {
  for (const row of rows) {
    p.run('INSERT INTO docs (rowid, title, body) VALUES (?, ?, ?)', [
      row.rowid,
      row.title,
      row.body,
    ]);
    p.run('INSERT INTO docs_fts (rowid, title, body) VALUES (?, ?, ?)', [
      row.rowid,
      row.title,
      row.body,
    ]);
  }
}

// ─── applyPerformancePragmas() ───────────────────────────────────────

describe('applyPerformancePragmas', () => {
  it('sets cache_size to 64MB', () => {
    // Arrange
    const db = new Database(':memory:');

    // Act
    applyPerformancePragmas(db);

    // Assert
    const cacheSize = db.pragma('cache_size', { simple: true });
    expect(cacheSize).toBe(-64000);
    db.close();
  });

  it('sets temp_store to MEMORY', () => {
    // Arrange
    const db = new Database(':memory:');

    // Act
    applyPerformancePragmas(db);

    // Assert — temp_store: 0=DEFAULT, 1=FILE, 2=MEMORY
    const tempStore = db.pragma('temp_store', { simple: true });
    expect(tempStore).toBe(2);
    db.close();
  });

  it('sets mmap_size to 256MB on file-backed databases', () => {
    // Arrange — mmap_size only takes effect on file-backed DBs
    const tmpPath = join(tmpdir(), `soleri-mmap-test-${Date.now()}.db`);
    const db = new Database(tmpPath);

    // Act
    applyPerformancePragmas(db);

    // Assert
    const mmapSize = db.pragma('mmap_size', { simple: true });
    expect(mmapSize).toBe(268435456);
    db.close();
    rmSync(tmpPath, { force: true });
  });
});

// ─── SQLitePersistenceProvider ────────────────────────────────────────

describe('SQLitePersistenceProvider', () => {
  describe('execSql', () => {
    it('creates tables from DDL', () => {
      // Arrange
      const p = createProvider();

      // Act
      p.execSql('CREATE TABLE test (id TEXT PRIMARY KEY, val TEXT)');
      p.run('INSERT INTO test (id, val) VALUES (?, ?)', ['a', 'hello']);
      const row = p.get<{ id: string; val: string }>('SELECT * FROM test WHERE id = ?', ['a']);

      // Assert
      expect(row).toEqual({ id: 'a', val: 'hello' });
      p.close();
    });
  });

  describe('run', () => {
    it('inserts with named params and returns changes count', () => {
      // Arrange
      const p = createProviderWithTable('CREATE TABLE t (id TEXT PRIMARY KEY, name TEXT)');

      // Act
      const result = p.run('INSERT INTO t (id, name) VALUES (@id, @name)', {
        id: '1',
        name: 'test',
      });

      // Assert
      expect(result.changes).toBe(1);
      p.close();
    });

    it('inserts with positional params and returns changes count', () => {
      // Arrange
      const p = createProviderWithTable('CREATE TABLE t (id TEXT PRIMARY KEY)');

      // Act
      const result = p.run('INSERT INTO t (id) VALUES (?)', ['x']);

      // Assert
      expect(result.changes).toBe(1);
      p.close();
    });

    it('inserts with no params and returns lastInsertRowid', () => {
      // Arrange
      const p = createProviderWithTable('CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT)');

      // Act
      const result = p.run('INSERT INTO t DEFAULT VALUES');

      // Assert
      expect(result.changes).toBe(1);
      expect(result.lastInsertRowid).toBe(1);
      p.close();
    });
  });

  describe('get', () => {
    it('returns undefined when no row matches', () => {
      // Arrange
      const p = createProviderWithTable();

      // Act
      const row = p.get('SELECT * FROM t WHERE id = ?', ['nonexistent']);

      // Assert
      expect(row).toBeUndefined();
      p.close();
    });

    it('returns the matching row with correct types', () => {
      // Arrange
      const p = createProviderWithTable('CREATE TABLE t (id TEXT PRIMARY KEY, num INTEGER)');
      p.run('INSERT INTO t VALUES (?, ?)', ['x', 42]);

      // Act
      const row = p.get<{ id: string; num: number }>('SELECT * FROM t WHERE id = ?', ['x']);

      // Assert
      expect(row).toEqual({ id: 'x', num: 42 });
      p.close();
    });
  });

  describe('all', () => {
    it('returns empty array when no rows match', () => {
      // Arrange
      const p = createProviderWithTable();

      // Act
      const rows = p.all('SELECT * FROM t');

      // Assert
      expect(rows).toEqual([]);
      p.close();
    });

    it('returns all rows in order', () => {
      // Arrange
      const p = createProviderWithTable('CREATE TABLE t (id TEXT PRIMARY KEY, val INTEGER)');
      p.run('INSERT INTO t VALUES (?, ?)', ['a', 1]);
      p.run('INSERT INTO t VALUES (?, ?)', ['b', 2]);
      p.run('INSERT INTO t VALUES (?, ?)', ['c', 3]);

      // Act
      const rows = p.all<{ id: string; val: number }>('SELECT * FROM t ORDER BY id');

      // Assert
      expect(rows).toHaveLength(3);
      expect(rows[0]).toEqual({ id: 'a', val: 1 });
      expect(rows[2]).toEqual({ id: 'c', val: 3 });
      p.close();
    });
  });

  describe('transaction', () => {
    it('commits all operations on success', () => {
      // Arrange
      const p = createProviderWithTable();

      // Act
      p.transaction(() => {
        p.run("INSERT INTO t VALUES ('a', 'x')");
        p.run("INSERT INTO t VALUES ('b', 'y')");
      });

      // Assert
      const rows = p.all('SELECT * FROM t');
      expect(rows).toHaveLength(2);
      p.close();
    });

    it('rolls back all operations on error', () => {
      // Arrange
      const p = createProviderWithTable();

      // Act & Assert
      expect(() =>
        p.transaction(() => {
          p.run("INSERT INTO t VALUES ('a', 'x')");
          throw new Error('rollback');
        }),
      ).toThrow('rollback');
      const rows = p.all('SELECT * FROM t');
      expect(rows).toHaveLength(0);
      p.close();
    });

    it('returns the value from the transaction function', () => {
      // Arrange
      const p = createProviderWithTable();

      // Act
      const result = p.transaction(() => {
        p.run("INSERT INTO t VALUES ('a', 'x')");
        return 42;
      });

      // Assert
      expect(result).toBe(42);
      p.close();
    });
  });

  describe('getDatabase', () => {
    it('returns a better-sqlite3 Database instance with prepare method', () => {
      // Arrange
      const p = createProvider();

      // Act
      const db = p.getDatabase();

      // Assert
      expect(db).toBeInstanceOf(Database);
      expect(typeof db.prepare).toBe('function');
      p.close();
    });
  });

  describe('backend', () => {
    it('returns "sqlite"', () => {
      // Arrange & Act
      const p = createProvider();

      // Assert
      expect(p.backend).toBe('sqlite');
      p.close();
    });
  });

  describe('close', () => {
    it('prevents further operations after close', () => {
      // Arrange
      const p = createProvider();

      // Act
      p.close();

      // Assert
      expect(() => p.run('SELECT 1')).toThrow();
    });
  });

  describe('ftsSearch', () => {
    it('returns matching rows by FTS query', () => {
      // Arrange
      const p = createFtsProvider();
      seedFtsRows(p, [
        { rowid: 1, title: 'Hello World', body: 'This is a test document' },
        { rowid: 2, title: 'Goodbye', body: 'Another test here' },
      ]);

      // Act
      const results = p.ftsSearch<{ title: string; body: string }>('docs', 'hello');

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Hello World');
      p.close();
    });

    it('respects limit option', () => {
      // Arrange
      const p = createFtsProvider();
      seedFtsRows(p, [
        { rowid: 1, title: 'test alpha', body: 'a' },
        { rowid: 2, title: 'test beta', body: 'b' },
        { rowid: 3, title: 'test gamma', body: 'c' },
      ]);

      // Act
      const results = p.ftsSearch<{ title: string }>('docs', 'test', { limit: 2 });

      // Assert
      expect(results).toHaveLength(2);
      p.close();
    });

    it('respects offset option', () => {
      // Arrange
      const p = createFtsProvider();
      seedFtsRows(p, [
        { rowid: 1, title: 'test alpha', body: 'a' },
        { rowid: 2, title: 'test beta', body: 'b' },
        { rowid: 3, title: 'test gamma', body: 'c' },
      ]);

      // Act
      const results = p.ftsSearch<{ title: string }>('docs', 'test', { limit: 1, offset: 2 });

      // Assert
      expect(results).toHaveLength(1);
      p.close();
    });

    it('applies column filters on the base table', () => {
      // Arrange
      const p = createProvider();
      p.execSql(`
        CREATE TABLE notes (rowid INTEGER PRIMARY KEY, title TEXT, category TEXT);
        CREATE VIRTUAL TABLE notes_fts USING fts5(title, content=notes, content_rowid=rowid);
        INSERT INTO notes (rowid, title, category) VALUES (1, 'design pattern', 'arch');
        INSERT INTO notes (rowid, title, category) VALUES (2, 'design review', 'process');
        INSERT INTO notes_fts (rowid, title) VALUES (1, 'design pattern');
        INSERT INTO notes_fts (rowid, title) VALUES (2, 'design review');
      `);

      // Act
      const filtered = p.ftsSearch<{ title: string; category: string }>('notes', 'design', {
        filters: { category: 'arch' },
      });

      // Assert
      expect(filtered).toHaveLength(1);
      expect(filtered[0].category).toBe('arch');
      p.close();
    });

    it('returns empty array when no FTS matches', () => {
      // Arrange
      const p = createFtsProvider();
      seedFtsRows(p, [{ rowid: 1, title: 'Hello', body: 'world' }]);

      // Act
      const results = p.ftsSearch('docs', 'nonexistent');

      // Assert
      expect(results).toEqual([]);
      p.close();
    });
  });

  describe('ftsRebuild', () => {
    it('does not throw when FTS table does not exist', () => {
      // Arrange
      const p = createProvider();

      // Act & Assert
      expect(() => p.ftsRebuild('nonexistent')).not.toThrow();
      p.close();
    });

    it('rebuilds an existing FTS index without error', () => {
      // Arrange
      const p = createFtsProvider();
      seedFtsRows(p, [{ rowid: 1, title: 'test', body: 'content' }]);

      // Act & Assert
      expect(() => p.ftsRebuild('docs')).not.toThrow();
      p.close();
    });
  });

  // ─── Edge Cases ──────────────────────────────────────────────────────

  describe('edge cases', () => {
    const tmpBase = join(tmpdir(), 'soleri-persistence-test');

    afterEach(() => {
      try {
        rmSync(tmpBase, { recursive: true, force: true });
      } catch {
        // cleanup best-effort
      }
    });

    it('creates parent directories for file-backed databases', () => {
      // Arrange
      const nested = join(tmpBase, 'deep', 'nested', 'test.db');

      // Act
      const p = new SQLitePersistenceProvider(nested);

      // Assert
      expect(existsSync(nested)).toBe(true);
      p.close();
    });

    it('applies performance pragmas for file-backed databases', () => {
      // Arrange
      mkdirSync(tmpBase, { recursive: true });
      const dbPath = join(tmpBase, 'pragmas.db');

      // Act
      const p = new SQLitePersistenceProvider(dbPath);
      const db = p.getDatabase();

      // Assert
      const cacheSize = db.pragma('cache_size', { simple: true });
      expect(cacheSize).toBe(-64000);
      p.close();
    });

    it('does NOT apply performance pragmas for in-memory databases', () => {
      // Arrange & Act
      const p = createProvider();
      const db = p.getDatabase();

      // Assert — in-memory default cache_size is NOT -64000
      const cacheSize = db.pragma('cache_size', { simple: true });
      expect(cacheSize).not.toBe(-64000);
      p.close();
    });

    it('recovers from corrupt database by throwing on open', () => {
      // Arrange — write garbage bytes to a file
      mkdirSync(tmpBase, { recursive: true });
      const dbPath = join(tmpBase, 'corrupt.db');
      writeFileSync(dbPath, 'this is not a valid sqlite database');

      // Act & Assert — better-sqlite3 throws on open for corrupt files
      expect(() => new SQLitePersistenceProvider(dbPath)).toThrow();
    });

    it('WAL mode can be enabled on file-backed databases', () => {
      // Arrange
      mkdirSync(tmpBase, { recursive: true });
      const dbPath = join(tmpBase, 'wal-test.db');
      const p = new SQLitePersistenceProvider(dbPath);

      // Act
      p.run('PRAGMA journal_mode = WAL');

      // Assert
      const db = p.getDatabase();
      const mode = db.pragma('journal_mode', { simple: true });
      expect(mode).toBe('wal');
      p.close();
    });

    it('handles concurrent read-after-write within same provider', () => {
      // Arrange
      const p = createProviderWithTable('CREATE TABLE t (id TEXT PRIMARY KEY, val INTEGER)');

      // Act — write then immediately read
      p.run('INSERT INTO t VALUES (?, ?)', ['k1', 100]);
      const row = p.get<{ id: string; val: number }>('SELECT * FROM t WHERE id = ?', ['k1']);

      // Assert
      expect(row).toEqual({ id: 'k1', val: 100 });
      p.close();
    });

    it('handles multiple sequential transactions', () => {
      // Arrange
      const p = createProviderWithTable('CREATE TABLE t (id TEXT PRIMARY KEY, val INTEGER)');

      // Act
      p.transaction(() => p.run('INSERT INTO t VALUES (?, ?)', ['a', 1]));
      p.transaction(() => p.run('INSERT INTO t VALUES (?, ?)', ['b', 2]));
      p.transaction(() => {
        p.run('UPDATE t SET val = ? WHERE id = ?', [10, 'a']);
      });

      // Assert
      const rows = p.all<{ id: string; val: number }>('SELECT * FROM t ORDER BY id');
      expect(rows).toEqual([
        { id: 'a', val: 10 },
        { id: 'b', val: 2 },
      ]);
      p.close();
    });

    it('two providers can read/write same file-backed database sequentially', () => {
      // Arrange
      mkdirSync(tmpBase, { recursive: true });
      const dbPath = join(tmpBase, 'concurrent.db');
      const p1 = new SQLitePersistenceProvider(dbPath);
      p1.run('PRAGMA journal_mode = WAL');
      p1.execSql('CREATE TABLE t (id TEXT PRIMARY KEY)');
      p1.run('INSERT INTO t VALUES (?)', ['from-p1']);
      p1.close();

      // Act — second provider opens the same file
      const p2 = new SQLitePersistenceProvider(dbPath);
      const rows = p2.all<{ id: string }>('SELECT * FROM t');

      // Assert
      expect(rows).toEqual([{ id: 'from-p1' }]);
      p2.close();
    });
  });
});
