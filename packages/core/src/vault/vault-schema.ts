/**
 * Vault schema management — table creation, migrations, format versioning.
 * Extracted from vault.ts as part of Wave 0C decomposition.
 */
import type { PersistenceProvider } from '../persistence/types.js';
import { computeContentHash } from './content-hash.js';

export const VAULT_FORMAT_VERSION = 1;

export function checkFormatVersion(provider: PersistenceProvider): void {
  const row = provider.get<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current === 0) {
    provider.run(`PRAGMA user_version = ${VAULT_FORMAT_VERSION}`);
  } else if (current > VAULT_FORMAT_VERSION) {
    throw new Error(
      `Vault format version ${current} is newer than engine supports (${VAULT_FORMAT_VERSION}). ` +
        `Upgrade @soleri/core to a compatible version.`,
    );
  }
}

export function initializeSchema(provider: PersistenceProvider): void {
  createCoreTables(provider);
  migrateBrainSchema(provider);
  migrateTemporalSchema(provider);
  migrateOriginColumn(provider);
  migrateContentHash(provider);
  migrateTierColumn(provider);
  migratePerformanceIndexes(provider);
  migrateVectorStorage(provider);
}

function createCoreTables(provider: PersistenceProvider): void {
  provider.execSql(`
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('pattern', 'anti-pattern', 'rule', 'playbook')),
      domain TEXT NOT NULL,
      title TEXT NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('critical', 'warning', 'suggestion')),
      description TEXT NOT NULL,
      context TEXT, example TEXT, counter_example TEXT, why TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      applies_to TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
      id, title, description, context, tags,
      content='entries', content_rowid='rowid', tokenize='porter unicode61'
    );
    CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
      INSERT INTO entries_fts(rowid,id,title,description,context,tags) VALUES(new.rowid,new.id,new.title,new.description,new.context,new.tags);
    END;
    CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
      INSERT INTO entries_fts(entries_fts,rowid,id,title,description,context,tags) VALUES('delete',old.rowid,old.id,old.title,old.description,old.context,old.tags);
    END;
    CREATE TRIGGER IF NOT EXISTS entries_au AFTER UPDATE ON entries BEGIN
      INSERT INTO entries_fts(entries_fts,rowid,id,title,description,context,tags) VALUES('delete',old.rowid,old.id,old.title,old.description,old.context,old.tags);
      INSERT INTO entries_fts(rowid,id,title,description,context,tags) VALUES(new.rowid,new.id,new.title,new.description,new.context,new.tags);
    END;
    CREATE TABLE IF NOT EXISTS entries_archive (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL, domain TEXT NOT NULL, title TEXT NOT NULL, severity TEXT NOT NULL,
      description TEXT NOT NULL, context TEXT, example TEXT, counter_example TEXT, why TEXT,
      tags TEXT NOT NULL DEFAULT '[]', applies_to TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      valid_from INTEGER, valid_until INTEGER,
      archived_at INTEGER NOT NULL DEFAULT (unixepoch()), archive_reason TEXT
    );
    CREATE TABLE IF NOT EXISTS projects (
      path TEXT PRIMARY KEY, name TEXT NOT NULL,
      registered_at INTEGER NOT NULL DEFAULT (unixepoch()),
      last_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
      session_count INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY, project_path TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('session', 'lesson', 'preference')),
      context TEXT NOT NULL, summary TEXT NOT NULL,
      topics TEXT NOT NULL DEFAULT '[]', files_modified TEXT NOT NULL DEFAULT '[]',
      tools_used TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()), archived_at INTEGER
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      id, context, summary, topics,
      content='memories', content_rowid='rowid', tokenize='porter unicode61'
    );`);

  // Add memory columns if missing
  const memCols = provider
    .all<{ name: string }>('PRAGMA table_info(memories)')
    .map((r: { name: string }) => r.name);
  if (!memCols.includes('intent')) {
    provider.execSql(`
      ALTER TABLE memories ADD COLUMN intent TEXT;
      ALTER TABLE memories ADD COLUMN decisions TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE memories ADD COLUMN current_state TEXT;
      ALTER TABLE memories ADD COLUMN next_steps TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE memories ADD COLUMN vault_entries_referenced TEXT NOT NULL DEFAULT '[]';
    `);
  }

  provider.execSql(`
    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid,id,context,summary,topics) VALUES(new.rowid,new.id,new.context,new.summary,new.topics);
    END;
    CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts,rowid,id,context,summary,topics) VALUES('delete',old.rowid,old.id,old.context,old.summary,old.topics);
    END;
    CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts,rowid,id,context,summary,topics) VALUES('delete',old.rowid,old.id,old.context,old.summary,old.topics);
      INSERT INTO memories_fts(rowid,id,context,summary,topics) VALUES(new.rowid,new.id,new.context,new.summary,new.topics);
    END;
    CREATE TABLE IF NOT EXISTS brain_vocabulary (
      term TEXT PRIMARY KEY, idf REAL NOT NULL, doc_count INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS brain_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT, query TEXT NOT NULL, entry_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('accepted', 'dismissed', 'modified', 'failed')),
      source TEXT NOT NULL DEFAULT 'search', confidence REAL NOT NULL DEFAULT 0.6,
      duration INTEGER, context TEXT NOT NULL DEFAULT '{}', reason TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_brain_feedback_query ON brain_feedback(query);
    CREATE INDEX IF NOT EXISTS idx_entries_domain ON entries(domain);
    CREATE INDEX IF NOT EXISTS idx_entries_type ON entries(type);
    CREATE INDEX IF NOT EXISTS idx_entries_severity ON entries(severity);
    CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_path);
    CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
  `);
}

function migrateBrainSchema(provider: PersistenceProvider): void {
  const columns = provider.all<{ name: string }>('PRAGMA table_info(brain_feedback)');
  const hasSource = columns.some((c: { name: string }) => c.name === 'source');
  if (!hasSource && columns.length > 0) {
    provider.transaction(() => {
      provider.run(
        `CREATE TABLE brain_feedback_new (id INTEGER PRIMARY KEY AUTOINCREMENT, query TEXT NOT NULL, entry_id TEXT NOT NULL, action TEXT NOT NULL CHECK(action IN ('accepted', 'dismissed', 'modified', 'failed')), source TEXT NOT NULL DEFAULT 'search', confidence REAL NOT NULL DEFAULT 0.6, duration INTEGER, context TEXT NOT NULL DEFAULT '{}', reason TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()))`,
      );
      provider.run(
        `INSERT INTO brain_feedback_new (id, query, entry_id, action, created_at) SELECT id, query, entry_id, action, created_at FROM brain_feedback`,
      );
      provider.run('DROP TABLE brain_feedback');
      provider.run('ALTER TABLE brain_feedback_new RENAME TO brain_feedback');
      provider.run('CREATE INDEX IF NOT EXISTS idx_brain_feedback_query ON brain_feedback(query)');
    });
  }
  try {
    const sessionCols = provider.all<{ name: string }>('PRAGMA table_info(brain_sessions)');
    if (
      sessionCols.length > 0 &&
      !sessionCols.some((c: { name: string }) => c.name === 'extracted_at')
    ) {
      provider.run('ALTER TABLE brain_sessions ADD COLUMN extracted_at TEXT');
    }
  } catch {
    /* brain_sessions doesn't exist yet */
  }
}

function migrateTemporalSchema(provider: PersistenceProvider): void {
  try {
    provider.run('ALTER TABLE entries ADD COLUMN valid_from INTEGER');
  } catch {
    /* exists */
  }
  try {
    provider.run('ALTER TABLE entries ADD COLUMN valid_until INTEGER');
  } catch {
    /* exists */
  }
}

function migrateOriginColumn(provider: PersistenceProvider): void {
  try {
    provider.run(
      "ALTER TABLE entries ADD COLUMN origin TEXT NOT NULL DEFAULT 'user' CHECK(origin IN ('agent', 'pack', 'user'))",
    );
  } catch {
    /* exists */
  }
  provider.execSql('CREATE INDEX IF NOT EXISTS idx_entries_origin ON entries(origin)');
}

function migrateContentHash(provider: PersistenceProvider): void {
  try {
    provider.run('ALTER TABLE entries ADD COLUMN content_hash TEXT');
  } catch {
    /* exists */
  }
  provider.execSql(
    'CREATE INDEX IF NOT EXISTS idx_entries_content_hash ON entries(content_hash) WHERE content_hash IS NOT NULL',
  );
  const unhashed = provider.all<{
    id: string;
    type: string;
    domain: string;
    title: string;
    description: string;
    tags: string;
    example: string | null;
    counter_example: string | null;
  }>(
    'SELECT id, type, domain, title, description, tags, example, counter_example FROM entries WHERE content_hash IS NULL',
  );
  if (unhashed.length > 0) {
    provider.transaction(() => {
      for (const row of unhashed) {
        const hash = computeContentHash({
          type: row.type,
          domain: row.domain,
          title: row.title,
          description: row.description,
          tags: JSON.parse(row.tags),
          example: row.example ?? undefined,
          counterExample: row.counter_example ?? undefined,
        });
        provider.run('UPDATE entries SET content_hash = @hash WHERE id = @id', {
          hash,
          id: row.id,
        });
      }
    });
  }
}

function migrateTierColumn(provider: PersistenceProvider): void {
  try {
    provider.run("ALTER TABLE entries ADD COLUMN tier TEXT DEFAULT 'agent'");
  } catch {
    /* exists */
  }
  provider.execSql(
    'CREATE INDEX IF NOT EXISTS idx_entries_tier ON entries(tier) WHERE tier IS NOT NULL',
  );
}

export function migratePerformanceIndexes(provider: PersistenceProvider): void {
  provider.execSql(`
    CREATE INDEX IF NOT EXISTS idx_memories_archived_at ON memories(archived_at);
    CREATE INDEX IF NOT EXISTS idx_entries_updated_at ON entries(updated_at);
    CREATE INDEX IF NOT EXISTS idx_brain_feedback_entry_id ON brain_feedback(entry_id);
    CREATE INDEX IF NOT EXISTS idx_entries_valid_until ON entries(valid_until) WHERE valid_until IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_entries_valid_from ON entries(valid_from) WHERE valid_from IS NOT NULL;
  `);

  // brain_sessions may not exist yet if intelligence module hasn't initialized
  try {
    provider.execSql(`
      CREATE INDEX IF NOT EXISTS idx_brain_sessions_plan_id ON brain_sessions(plan_id) WHERE plan_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_brain_sessions_started_at ON brain_sessions(started_at);
    `);
  } catch {
    /* brain_sessions table doesn't exist yet — indexes will be created on next init */
  }
}

function migrateVectorStorage(provider: PersistenceProvider): void {
  provider.execSql(`
    CREATE TABLE IF NOT EXISTS entry_vectors (
      entry_id TEXT PRIMARY KEY,
      vector BLOB NOT NULL,
      model TEXT NOT NULL,
      dimensions INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
    );
  `);
  provider.execSql('CREATE INDEX IF NOT EXISTS idx_entry_vectors_model ON entry_vectors(model)');
}
