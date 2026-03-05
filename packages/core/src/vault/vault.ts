import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { IntelligenceEntry } from '../intelligence/types.js';

export interface SearchResult {
  entry: IntelligenceEntry;
  score: number;
}
export interface VaultStats {
  totalEntries: number;
  byType: Record<string, number>;
  byDomain: Record<string, number>;
  bySeverity: Record<string, number>;
}
export interface ProjectInfo {
  path: string;
  name: string;
  registeredAt: number;
  lastSeenAt: number;
  sessionCount: number;
}
export interface Memory {
  id: string;
  projectPath: string;
  type: 'session' | 'lesson' | 'preference';
  context: string;
  summary: string;
  topics: string[];
  filesModified: string[];
  toolsUsed: string[];
  createdAt: number;
  archivedAt: number | null;
}
export interface MemoryStats {
  total: number;
  byType: Record<string, number>;
  byProject: Record<string, number>;
}

export class Vault {
  private db: Database.Database;

  constructor(dbPath: string = ':memory:') {
    if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entries (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('pattern', 'anti-pattern', 'rule')),
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
      CREATE TABLE IF NOT EXISTS projects (
        path TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        registered_at INTEGER NOT NULL DEFAULT (unixepoch()),
        last_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
        session_count INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        project_path TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('session', 'lesson', 'preference')),
        context TEXT NOT NULL,
        summary TEXT NOT NULL,
        topics TEXT NOT NULL DEFAULT '[]',
        files_modified TEXT NOT NULL DEFAULT '[]',
        tools_used TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        archived_at INTEGER
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        id, context, summary, topics,
        content='memories', content_rowid='rowid', tokenize='porter unicode61'
      );
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
        term TEXT PRIMARY KEY,
        idf REAL NOT NULL,
        doc_count INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE TABLE IF NOT EXISTS brain_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query TEXT NOT NULL,
        entry_id TEXT NOT NULL,
        action TEXT NOT NULL CHECK(action IN ('accepted', 'dismissed', 'modified', 'failed')),
        source TEXT NOT NULL DEFAULT 'search',
        confidence REAL NOT NULL DEFAULT 0.6,
        duration INTEGER,
        context TEXT NOT NULL DEFAULT '{}',
        reason TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_brain_feedback_query ON brain_feedback(query);
    `);
    this.migrateBrainSchema();
  }

  /**
   * Migrate brain_feedback table from old schema (accepted/dismissed only)
   * to new schema with source, confidence, duration, context, reason columns.
   * Also adds extracted_at to brain_sessions if it exists.
   */
  private migrateBrainSchema(): void {
    // Check if brain_feedback needs migration (old schema lacks 'source' column)
    const columns = this.db.prepare('PRAGMA table_info(brain_feedback)').all() as Array<{
      name: string;
    }>;
    const hasSource = columns.some((c) => c.name === 'source');

    if (!hasSource && columns.length > 0) {
      // Old table exists without new columns — rebuild with expanded schema
      this.db.transaction(() => {
        this.db
          .prepare(`
          CREATE TABLE brain_feedback_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            query TEXT NOT NULL,
            entry_id TEXT NOT NULL,
            action TEXT NOT NULL CHECK(action IN ('accepted', 'dismissed', 'modified', 'failed')),
            source TEXT NOT NULL DEFAULT 'search',
            confidence REAL NOT NULL DEFAULT 0.6,
            duration INTEGER,
            context TEXT NOT NULL DEFAULT '{}',
            reason TEXT,
            created_at INTEGER NOT NULL DEFAULT (unixepoch())
          )
        `)
          .run();
        this.db
          .prepare(`
          INSERT INTO brain_feedback_new (id, query, entry_id, action, created_at)
            SELECT id, query, entry_id, action, created_at FROM brain_feedback
        `)
          .run();
        this.db.prepare('DROP TABLE brain_feedback').run();
        this.db.prepare('ALTER TABLE brain_feedback_new RENAME TO brain_feedback').run();
        this.db
          .prepare('CREATE INDEX IF NOT EXISTS idx_brain_feedback_query ON brain_feedback(query)')
          .run();
      })();
    }

    // Add extracted_at to brain_sessions if it exists but lacks the column
    try {
      const sessionCols = this.db.prepare('PRAGMA table_info(brain_sessions)').all() as Array<{
        name: string;
      }>;
      if (sessionCols.length > 0 && !sessionCols.some((c) => c.name === 'extracted_at')) {
        this.db.prepare('ALTER TABLE brain_sessions ADD COLUMN extracted_at TEXT').run();
      }
    } catch {
      // brain_sessions table doesn't exist yet — BrainIntelligence will create it
    }
  }

  seed(entries: IntelligenceEntry[]): number {
    const upsert = this.db.prepare(`
      INSERT INTO entries (id,type,domain,title,severity,description,context,example,counter_example,why,tags,applies_to)
      VALUES (@id,@type,@domain,@title,@severity,@description,@context,@example,@counterExample,@why,@tags,@appliesTo)
      ON CONFLICT(id) DO UPDATE SET type=excluded.type,domain=excluded.domain,title=excluded.title,severity=excluded.severity,
        description=excluded.description,context=excluded.context,example=excluded.example,counter_example=excluded.counter_example,
        why=excluded.why,tags=excluded.tags,applies_to=excluded.applies_to,updated_at=unixepoch()
    `);
    const tx = this.db.transaction((items: IntelligenceEntry[]) => {
      let count = 0;
      for (const entry of items) {
        upsert.run({
          id: entry.id,
          type: entry.type,
          domain: entry.domain,
          title: entry.title,
          severity: entry.severity,
          description: entry.description,
          context: entry.context ?? null,
          example: entry.example ?? null,
          counterExample: entry.counterExample ?? null,
          why: entry.why ?? null,
          tags: JSON.stringify(entry.tags),
          appliesTo: JSON.stringify(entry.appliesTo ?? []),
        });
        count++;
      }
      return count;
    });
    return tx(entries);
  }

  search(
    query: string,
    options?: { domain?: string; type?: string; severity?: string; limit?: number },
  ): SearchResult[] {
    const limit = options?.limit ?? 10;
    const filters: string[] = [];
    const fp: Record<string, string> = {};
    if (options?.domain) {
      filters.push('e.domain = @domain');
      fp.domain = options.domain;
    }
    if (options?.type) {
      filters.push('e.type = @type');
      fp.type = options.type;
    }
    if (options?.severity) {
      filters.push('e.severity = @severity');
      fp.severity = options.severity;
    }
    const wc = filters.length > 0 ? `AND ${filters.join(' AND ')}` : '';
    try {
      const rows = this.db
        .prepare(
          `SELECT e.*, -rank as score FROM entries_fts fts JOIN entries e ON e.rowid = fts.rowid WHERE entries_fts MATCH @query ${wc} ORDER BY score DESC LIMIT @limit`,
        )
        .all({ query, limit, ...fp }) as Array<Record<string, unknown>>;
      return rows.map(rowToSearchResult);
    } catch {
      return [];
    }
  }

  get(id: string): IntelligenceEntry | null {
    const row = this.db.prepare('SELECT * FROM entries WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToEntry(row) : null;
  }

  list(options?: {
    domain?: string;
    type?: string;
    severity?: string;
    tags?: string[];
    limit?: number;
    offset?: number;
  }): IntelligenceEntry[] {
    const filters: string[] = [];
    const params: Record<string, unknown> = {};
    if (options?.domain) {
      filters.push('domain = @domain');
      params.domain = options.domain;
    }
    if (options?.type) {
      filters.push('type = @type');
      params.type = options.type;
    }
    if (options?.severity) {
      filters.push('severity = @severity');
      params.severity = options.severity;
    }
    if (options?.tags?.length) {
      const c = options.tags.map((t, i) => {
        params[`tag${i}`] = `%"${t}"%`;
        return `tags LIKE @tag${i}`;
      });
      filters.push(`(${c.join(' OR ')})`);
    }
    const wc = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
    const rows = this.db
      .prepare(
        `SELECT * FROM entries ${wc} ORDER BY severity, domain, title LIMIT @limit OFFSET @offset`,
      )
      .all({ ...params, limit: options?.limit ?? 50, offset: options?.offset ?? 0 }) as Array<
      Record<string, unknown>
    >;
    return rows.map(rowToEntry);
  }

  stats(): VaultStats {
    const total = (
      this.db.prepare('SELECT COUNT(*) as count FROM entries').get() as { count: number }
    ).count;
    return {
      totalEntries: total,
      byType: gc(this.db, 'type'),
      byDomain: gc(this.db, 'domain'),
      bySeverity: gc(this.db, 'severity'),
    };
  }

  add(entry: IntelligenceEntry): void {
    this.seed([entry]);
  }
  remove(id: string): boolean {
    return this.db.prepare('DELETE FROM entries WHERE id = ?').run(id).changes > 0;
  }

  /**
   * Partial update of an existing entry's mutable fields.
   * Returns the updated entry or null if not found.
   */
  update(
    id: string,
    fields: Partial<
      Pick<
        IntelligenceEntry,
        | 'title'
        | 'description'
        | 'context'
        | 'example'
        | 'counterExample'
        | 'why'
        | 'tags'
        | 'appliesTo'
        | 'severity'
        | 'type'
        | 'domain'
      >
    >,
  ): IntelligenceEntry | null {
    const existing = this.get(id);
    if (!existing) return null;
    const merged: IntelligenceEntry = { ...existing, ...fields };
    this.seed([merged]);
    return this.get(id);
  }

  /**
   * Remove multiple entries by IDs in a single transaction.
   * Returns the number of entries actually removed.
   */
  bulkRemove(ids: string[]): number {
    const stmt = this.db.prepare('DELETE FROM entries WHERE id = ?');
    const tx = this.db.transaction((idList: string[]) => {
      let count = 0;
      for (const id of idList) {
        count += stmt.run(id).changes;
      }
      return count;
    });
    return tx(ids);
  }

  /**
   * List all unique tags with their occurrence counts.
   */
  getTags(): Array<{ tag: string; count: number }> {
    const rows = this.db.prepare('SELECT tags FROM entries').all() as Array<{ tags: string }>;
    const counts = new Map<string, number>();
    for (const row of rows) {
      const tags: string[] = JSON.parse(row.tags || '[]');
      for (const tag of tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * List all domains with their entry counts.
   */
  getDomains(): Array<{ domain: string; count: number }> {
    const rows = this.db
      .prepare('SELECT domain, COUNT(*) as count FROM entries GROUP BY domain ORDER BY count DESC')
      .all() as Array<{ domain: string; count: number }>;
    return rows;
  }

  /**
   * Get recently added or updated entries, ordered by updated_at DESC.
   */
  getRecent(limit: number = 20): IntelligenceEntry[] {
    const rows = this.db
      .prepare('SELECT * FROM entries ORDER BY updated_at DESC LIMIT ?')
      .all(limit) as Array<Record<string, unknown>>;
    return rows.map(rowToEntry);
  }

  /**
   * Export the entire vault as a JSON-serializable bundle.
   */
  exportAll(): { entries: IntelligenceEntry[]; exportedAt: number; count: number } {
    const rows = this.db
      .prepare('SELECT * FROM entries ORDER BY domain, title')
      .all() as Array<Record<string, unknown>>;
    const entries = rows.map(rowToEntry);
    return { entries, exportedAt: Math.floor(Date.now() / 1000), count: entries.length };
  }

  /**
   * Get entry age distribution — how old entries are, bucketed.
   */
  getAgeReport(): {
    total: number;
    buckets: Array<{ label: string; count: number; minDays: number; maxDays: number }>;
    oldestTimestamp: number | null;
    newestTimestamp: number | null;
  } {
    const rows = this.db
      .prepare('SELECT created_at, updated_at FROM entries')
      .all() as Array<{ created_at: number; updated_at: number }>;
    const now = Math.floor(Date.now() / 1000);
    const bucketDefs = [
      { label: 'today', minDays: 0, maxDays: 1 },
      { label: 'this_week', minDays: 1, maxDays: 7 },
      { label: 'this_month', minDays: 7, maxDays: 30 },
      { label: 'this_quarter', minDays: 30, maxDays: 90 },
      { label: 'older', minDays: 90, maxDays: Infinity },
    ];
    const counts = new Array(bucketDefs.length).fill(0) as number[];
    let oldest: number | null = null;
    let newest: number | null = null;
    for (const row of rows) {
      const ts = row.created_at;
      if (oldest === null || ts < oldest) oldest = ts;
      if (newest === null || ts > newest) newest = ts;
      const ageDays = (now - ts) / 86400;
      for (let i = 0; i < bucketDefs.length; i++) {
        if (ageDays >= bucketDefs[i].minDays && ageDays < bucketDefs[i].maxDays) {
          counts[i]++;
          break;
        }
      }
    }
    return {
      total: rows.length,
      buckets: bucketDefs.map((b, i) => ({ ...b, count: counts[i] })),
      oldestTimestamp: oldest,
      newestTimestamp: newest,
    };
  }

  registerProject(path: string, name?: string): ProjectInfo {
    const projectName = name ?? path.replace(/\/$/, '').split('/').pop() ?? path;
    const existing = this.getProject(path);
    if (existing) {
      this.db
        .prepare(
          'UPDATE projects SET last_seen_at = unixepoch(), session_count = session_count + 1 WHERE path = ?',
        )
        .run(path);
      return this.getProject(path)!;
    }
    this.db.prepare('INSERT INTO projects (path, name) VALUES (?, ?)').run(path, projectName);
    return this.getProject(path)!;
  }

  getProject(path: string): ProjectInfo | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE path = ?').get(path) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    return {
      path: row.path as string,
      name: row.name as string,
      registeredAt: row.registered_at as number,
      lastSeenAt: row.last_seen_at as number,
      sessionCount: row.session_count as number,
    };
  }

  listProjects(): ProjectInfo[] {
    const rows = this.db
      .prepare('SELECT * FROM projects ORDER BY last_seen_at DESC')
      .all() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      path: row.path as string,
      name: row.name as string,
      registeredAt: row.registered_at as number,
      lastSeenAt: row.last_seen_at as number,
      sessionCount: row.session_count as number,
    }));
  }

  captureMemory(memory: Omit<Memory, 'id' | 'createdAt' | 'archivedAt'>): Memory {
    const id = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.db
      .prepare(
        `INSERT INTO memories (id, project_path, type, context, summary, topics, files_modified, tools_used) VALUES (@id, @projectPath, @type, @context, @summary, @topics, @filesModified, @toolsUsed)`,
      )
      .run({
        id,
        projectPath: memory.projectPath,
        type: memory.type,
        context: memory.context,
        summary: memory.summary,
        topics: JSON.stringify(memory.topics),
        filesModified: JSON.stringify(memory.filesModified),
        toolsUsed: JSON.stringify(memory.toolsUsed),
      });
    return this.getMemory(id)!;
  }

  searchMemories(
    query: string,
    options?: { type?: string; projectPath?: string; limit?: number },
  ): Memory[] {
    const limit = options?.limit ?? 10;
    const filters: string[] = ['m.archived_at IS NULL'];
    const fp: Record<string, unknown> = {};
    if (options?.type) {
      filters.push('m.type = @type');
      fp.type = options.type;
    }
    if (options?.projectPath) {
      filters.push('m.project_path = @projectPath');
      fp.projectPath = options.projectPath;
    }
    const wc = filters.length > 0 ? `AND ${filters.join(' AND ')}` : '';
    try {
      const rows = this.db
        .prepare(
          `SELECT m.* FROM memories_fts fts JOIN memories m ON m.rowid = fts.rowid WHERE memories_fts MATCH @query ${wc} ORDER BY rank LIMIT @limit`,
        )
        .all({ query, limit, ...fp }) as Array<Record<string, unknown>>;
      return rows.map(rowToMemory);
    } catch {
      return [];
    }
  }

  listMemories(options?: {
    type?: string;
    projectPath?: string;
    limit?: number;
    offset?: number;
  }): Memory[] {
    const filters: string[] = ['archived_at IS NULL'];
    const params: Record<string, unknown> = {};
    if (options?.type) {
      filters.push('type = @type');
      params.type = options.type;
    }
    if (options?.projectPath) {
      filters.push('project_path = @projectPath');
      params.projectPath = options.projectPath;
    }
    const wc = `WHERE ${filters.join(' AND ')}`;
    const rows = this.db
      .prepare(`SELECT * FROM memories ${wc} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`)
      .all({ ...params, limit: options?.limit ?? 50, offset: options?.offset ?? 0 }) as Array<
      Record<string, unknown>
    >;
    return rows.map(rowToMemory);
  }

  memoryStats(): MemoryStats {
    const total = (
      this.db.prepare('SELECT COUNT(*) as count FROM memories WHERE archived_at IS NULL').get() as {
        count: number;
      }
    ).count;
    const byTypeRows = this.db
      .prepare(
        'SELECT type as key, COUNT(*) as count FROM memories WHERE archived_at IS NULL GROUP BY type',
      )
      .all() as Array<{ key: string; count: number }>;
    const byProjectRows = this.db
      .prepare(
        'SELECT project_path as key, COUNT(*) as count FROM memories WHERE archived_at IS NULL GROUP BY project_path',
      )
      .all() as Array<{ key: string; count: number }>;
    return {
      total,
      byType: Object.fromEntries(byTypeRows.map((r) => [r.key, r.count])),
      byProject: Object.fromEntries(byProjectRows.map((r) => [r.key, r.count])),
    };
  }

  getMemory(id: string): Memory | null {
    const row = this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToMemory(row) : null;
  }


  deleteMemory(id: string): boolean {
    return this.db.prepare('DELETE FROM memories WHERE id = ?').run(id).changes > 0;
  }

  memoryStatsDetailed(options?: {
    projectPath?: string;
    fromDate?: number;
    toDate?: number;
  }): MemoryStats & { oldest: number | null; newest: number | null; archivedCount: number } {
    const filters: string[] = [];
    const params: Record<string, unknown> = {};
    if (options?.projectPath) {
      filters.push('project_path = @projectPath');
      params.projectPath = options.projectPath;
    }
    if (options?.fromDate) {
      filters.push('created_at >= @fromDate');
      params.fromDate = options.fromDate;
    }
    if (options?.toDate) {
      filters.push('created_at <= @toDate');
      params.toDate = options.toDate;
    }
    const wc = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

    const total = (
      this.db
        .prepare(`SELECT COUNT(*) as count FROM memories ${wc}${wc ? ' AND' : ' WHERE'} archived_at IS NULL`)
        .get(params) as { count: number }
    ).count;

    const archivedCount = (
      this.db
        .prepare(`SELECT COUNT(*) as count FROM memories ${wc}${wc ? ' AND' : ' WHERE'} archived_at IS NOT NULL`)
        .get(params) as { count: number }
    ).count;

    const byTypeRows = this.db
      .prepare(
        `SELECT type as key, COUNT(*) as count FROM memories ${wc}${wc ? ' AND' : ' WHERE'} archived_at IS NULL GROUP BY type`,
      )
      .all(params) as Array<{ key: string; count: number }>;

    const byProjectRows = this.db
      .prepare(
        `SELECT project_path as key, COUNT(*) as count FROM memories ${wc}${wc ? ' AND' : ' WHERE'} archived_at IS NULL GROUP BY project_path`,
      )
      .all(params) as Array<{ key: string; count: number }>;

    const dateRange = this.db
      .prepare(
        `SELECT MIN(created_at) as oldest, MAX(created_at) as newest FROM memories ${wc}${wc ? ' AND' : ' WHERE'} archived_at IS NULL`,
      )
      .get(params) as { oldest: number | null; newest: number | null };

    return {
      total,
      byType: Object.fromEntries(byTypeRows.map((r) => [r.key, r.count])),
      byProject: Object.fromEntries(byProjectRows.map((r) => [r.key, r.count])),
      oldest: dateRange.oldest,
      newest: dateRange.newest,
      archivedCount,
    };
  }

  exportMemories(options?: {
    projectPath?: string;
    type?: string;
    includeArchived?: boolean;
  }): Memory[] {
    const filters: string[] = [];
    const params: Record<string, unknown> = {};
    if (!options?.includeArchived) {
      filters.push('archived_at IS NULL');
    }
    if (options?.projectPath) {
      filters.push('project_path = @projectPath');
      params.projectPath = options.projectPath;
    }
    if (options?.type) {
      filters.push('type = @type');
      params.type = options.type;
    }
    const wc = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
    const rows = this.db
      .prepare(`SELECT * FROM memories ${wc} ORDER BY created_at ASC`)
      .all(params) as Array<Record<string, unknown>>;
    return rows.map(rowToMemory);
  }

  importMemories(memories: Memory[]): { imported: number; skipped: number } {
    const upsert = this.db.prepare(`
      INSERT OR IGNORE INTO memories (id, project_path, type, context, summary, topics, files_modified, tools_used, created_at, archived_at)
      VALUES (@id, @projectPath, @type, @context, @summary, @topics, @filesModified, @toolsUsed, @createdAt, @archivedAt)
    `);
    let imported = 0;
    let skipped = 0;
    const tx = this.db.transaction((items: Memory[]) => {
      for (const m of items) {
        const result = upsert.run({
          id: m.id,
          projectPath: m.projectPath,
          type: m.type,
          context: m.context,
          summary: m.summary,
          topics: JSON.stringify(m.topics),
          filesModified: JSON.stringify(m.filesModified),
          toolsUsed: JSON.stringify(m.toolsUsed),
          createdAt: m.createdAt,
          archivedAt: m.archivedAt,
        });
        if (result.changes > 0) imported++;
        else skipped++;
      }
    });
    tx(memories);
    return { imported, skipped };
  }

  pruneMemories(olderThanDays: number): { pruned: number } {
    const cutoff = Math.floor(Date.now() / 1000) - olderThanDays * 86400;
    const result = this.db
      .prepare('DELETE FROM memories WHERE created_at < ? AND archived_at IS NULL')
      .run(cutoff);
    return { pruned: result.changes };
  }

  deduplicateMemories(): { removed: number; groups: Array<{ kept: string; removed: string[] }> } {
    // Find duplicates by matching summary + project_path + type
    const dupeRows = this.db
      .prepare(`
        SELECT m1.id as id1, m2.id as id2
        FROM memories m1
        JOIN memories m2 ON m1.summary = m2.summary
          AND m1.project_path = m2.project_path
          AND m1.type = m2.type
          AND m1.id < m2.id
          AND m1.archived_at IS NULL
          AND m2.archived_at IS NULL
      `)
      .all() as Array<{ id1: string; id2: string }>;

    // Group: keep the earliest (id1), remove all later duplicates
    const groupMap = new Map<string, Set<string>>();
    for (const row of dupeRows) {
      if (!groupMap.has(row.id1)) groupMap.set(row.id1, new Set());
      groupMap.get(row.id1)!.add(row.id2);
    }

    const groups: Array<{ kept: string; removed: string[] }> = [];
    const toRemove = new Set<string>();
    for (const [kept, removedSet] of groupMap) {
      const removed = [...removedSet].filter((id) => !toRemove.has(id));
      if (removed.length > 0) {
        groups.push({ kept, removed });
        for (const id of removed) toRemove.add(id);
      }
    }

    if (toRemove.size > 0) {
      const del = this.db.prepare('DELETE FROM memories WHERE id = ?');
      const tx = this.db.transaction((ids: string[]) => {
        for (const id of ids) del.run(id);
      });
      tx([...toRemove]);
    }

    return { removed: toRemove.size, groups };
  }

  memoryTopics(): Array<{ topic: string; count: number }> {
    const rows = this.db
      .prepare('SELECT topics FROM memories WHERE archived_at IS NULL')
      .all() as Array<{ topics: string }>;

    const topicCounts = new Map<string, number>();
    for (const row of rows) {
      const topics: string[] = JSON.parse(row.topics || '[]');
      for (const topic of topics) {
        topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
      }
    }

    return [...topicCounts.entries()]
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count);
  }

  memoriesByProject(): Array<{ project: string; count: number; memories: Memory[] }> {
    const rows = this.db
      .prepare(
        'SELECT project_path as project, COUNT(*) as count FROM memories WHERE archived_at IS NULL GROUP BY project_path ORDER BY count DESC',
      )
      .all() as Array<{ project: string; count: number }>;

    return rows.map((row) => {
      const memories = this.db
        .prepare(
          'SELECT * FROM memories WHERE project_path = ? AND archived_at IS NULL ORDER BY created_at DESC',
        )
        .all(row.project) as Array<Record<string, unknown>>;
      return {
        project: row.project,
        count: row.count,
        memories: memories.map(rowToMemory),
      };
    });
  }

  getDb(): Database.Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }
}

function gc(db: Database.Database, col: string): Record<string, number> {
  const rows = db
    .prepare(`SELECT ${col} as key, COUNT(*) as count FROM entries GROUP BY ${col}`)
    .all() as Array<{ key: string; count: number }>;
  return Object.fromEntries(rows.map((r) => [r.key, r.count]));
}

function rowToEntry(row: Record<string, unknown>): IntelligenceEntry {
  return {
    id: row.id as string,
    type: row.type as IntelligenceEntry['type'],
    domain: row.domain as IntelligenceEntry['domain'],
    title: row.title as string,
    severity: row.severity as IntelligenceEntry['severity'],
    description: row.description as string,
    context: (row.context as string) ?? undefined,
    example: (row.example as string) ?? undefined,
    counterExample: (row.counter_example as string) ?? undefined,
    why: (row.why as string) ?? undefined,
    tags: JSON.parse((row.tags as string) || '[]'),
    appliesTo: JSON.parse((row.applies_to as string) || '[]'),
  };
}

function rowToSearchResult(row: Record<string, unknown>): SearchResult {
  return { entry: rowToEntry(row), score: row.score as number };
}

function rowToMemory(row: Record<string, unknown>): Memory {
  return {
    id: row.id as string,
    projectPath: row.project_path as string,
    type: row.type as Memory['type'],
    context: row.context as string,
    summary: row.summary as string,
    topics: JSON.parse((row.topics as string) || '[]'),
    filesModified: JSON.parse((row.files_modified as string) || '[]'),
    toolsUsed: JSON.parse((row.tools_used as string) || '[]'),
    createdAt: row.created_at as number,
    archivedAt: (row.archived_at as number) ?? null,
  };
}
