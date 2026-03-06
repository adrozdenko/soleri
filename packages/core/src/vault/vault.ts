import type { PersistenceProvider } from '../persistence/types.js';
import { SQLitePersistenceProvider } from '../persistence/sqlite-provider.js';
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
  private provider: PersistenceProvider;
  private sqliteProvider: SQLitePersistenceProvider | null;

  /**
   * Create a Vault with a PersistenceProvider or a SQLite path (backward compat).
   */
  constructor(providerOrPath: PersistenceProvider | string = ':memory:') {
    if (typeof providerOrPath === 'string') {
      const sqlite = new SQLitePersistenceProvider(providerOrPath);
      this.provider = sqlite;
      this.sqliteProvider = sqlite;
      // SQLite-specific pragmas
      this.provider.run('PRAGMA journal_mode = WAL');
      this.provider.run('PRAGMA foreign_keys = ON');
    } else {
      this.provider = providerOrPath;
      this.sqliteProvider =
        providerOrPath instanceof SQLitePersistenceProvider ? providerOrPath : null;
    }
    this.initialize();
  }

  /** Backward-compatible factory. */
  static createWithSQLite(dbPath: string = ':memory:'): Vault {
    return new Vault(dbPath);
  }

  private initialize(): void {
    this.provider.execSql(`
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
    this.migrateTemporalSchema();
  }

  private migrateTemporalSchema(): void {
    try {
      this.provider.run('ALTER TABLE entries ADD COLUMN valid_from INTEGER');
    } catch {
      // Column already exists
    }
    try {
      this.provider.run('ALTER TABLE entries ADD COLUMN valid_until INTEGER');
    } catch {
      // Column already exists
    }
  }

  private migrateBrainSchema(): void {
    const columns = this.provider.all<{ name: string }>('PRAGMA table_info(brain_feedback)');
    const hasSource = columns.some((c) => c.name === 'source');

    if (!hasSource && columns.length > 0) {
      this.provider.transaction(() => {
        this.provider.run(`
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
        `);
        this.provider.run(`
          INSERT INTO brain_feedback_new (id, query, entry_id, action, created_at)
            SELECT id, query, entry_id, action, created_at FROM brain_feedback
        `);
        this.provider.run('DROP TABLE brain_feedback');
        this.provider.run('ALTER TABLE brain_feedback_new RENAME TO brain_feedback');
        this.provider.run(
          'CREATE INDEX IF NOT EXISTS idx_brain_feedback_query ON brain_feedback(query)',
        );
      });
    }

    try {
      const sessionCols = this.provider.all<{ name: string }>('PRAGMA table_info(brain_sessions)');
      if (sessionCols.length > 0 && !sessionCols.some((c) => c.name === 'extracted_at')) {
        this.provider.run('ALTER TABLE brain_sessions ADD COLUMN extracted_at TEXT');
      }
    } catch {
      // brain_sessions table doesn't exist yet — BrainIntelligence will create it
    }
  }

  seed(entries: IntelligenceEntry[]): number {
    const sql = `
      INSERT INTO entries (id,type,domain,title,severity,description,context,example,counter_example,why,tags,applies_to,valid_from,valid_until)
      VALUES (@id,@type,@domain,@title,@severity,@description,@context,@example,@counterExample,@why,@tags,@appliesTo,@validFrom,@validUntil)
      ON CONFLICT(id) DO UPDATE SET type=excluded.type,domain=excluded.domain,title=excluded.title,severity=excluded.severity,
        description=excluded.description,context=excluded.context,example=excluded.example,counter_example=excluded.counter_example,
        why=excluded.why,tags=excluded.tags,applies_to=excluded.applies_to,valid_from=excluded.valid_from,valid_until=excluded.valid_until,updated_at=unixepoch()
    `;
    return this.provider.transaction(() => {
      let count = 0;
      for (const entry of entries) {
        this.provider.run(sql, {
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
          validFrom: entry.validFrom ?? null,
          validUntil: entry.validUntil ?? null,
        });
        count++;
      }
      return count;
    });
  }

  search(
    query: string,
    options?: {
      domain?: string;
      type?: string;
      severity?: string;
      limit?: number;
      includeExpired?: boolean;
    },
  ): SearchResult[] {
    const limit = options?.limit ?? 10;
    const filters: string[] = [];
    const fp: Record<string, unknown> = {};
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
    if (!options?.includeExpired) {
      const now = Math.floor(Date.now() / 1000);
      filters.push('(e.valid_until IS NULL OR e.valid_until > @now)');
      filters.push('(e.valid_from IS NULL OR e.valid_from <= @now)');
      fp.now = now;
    }
    const wc = filters.length > 0 ? `AND ${filters.join(' AND ')}` : '';
    try {
      const rows = this.provider.all<Record<string, unknown>>(
        `SELECT e.*, -rank as score FROM entries_fts fts JOIN entries e ON e.rowid = fts.rowid WHERE entries_fts MATCH @query ${wc} ORDER BY score DESC LIMIT @limit`,
        { query, limit, ...fp },
      );
      return rows.map(rowToSearchResult);
    } catch {
      return [];
    }
  }

  get(id: string): IntelligenceEntry | null {
    const row = this.provider.get<Record<string, unknown>>('SELECT * FROM entries WHERE id = ?', [
      id,
    ]);
    return row ? rowToEntry(row) : null;
  }

  list(options?: {
    domain?: string;
    type?: string;
    severity?: string;
    tags?: string[];
    limit?: number;
    offset?: number;
    includeExpired?: boolean;
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
    if (!options?.includeExpired) {
      const now = Math.floor(Date.now() / 1000);
      filters.push('(valid_until IS NULL OR valid_until > @now)');
      filters.push('(valid_from IS NULL OR valid_from <= @now)');
      params.now = now;
    }
    const wc = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
    const rows = this.provider.all<Record<string, unknown>>(
      `SELECT * FROM entries ${wc} ORDER BY severity, domain, title LIMIT @limit OFFSET @offset`,
      { ...params, limit: options?.limit ?? 50, offset: options?.offset ?? 0 },
    );
    return rows.map(rowToEntry);
  }

  stats(): VaultStats {
    const total = this.provider.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM entries',
    )!.count;
    return {
      totalEntries: total,
      byType: gc(this.provider, 'type'),
      byDomain: gc(this.provider, 'domain'),
      bySeverity: gc(this.provider, 'severity'),
    };
  }

  add(entry: IntelligenceEntry): void {
    this.seed([entry]);
  }
  remove(id: string): boolean {
    return this.provider.run('DELETE FROM entries WHERE id = ?', [id]).changes > 0;
  }

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
        | 'validFrom'
        | 'validUntil'
      >
    >,
  ): IntelligenceEntry | null {
    const existing = this.get(id);
    if (!existing) return null;
    const merged: IntelligenceEntry = { ...existing, ...fields };
    this.seed([merged]);
    return this.get(id);
  }

  setTemporal(id: string, validFrom?: number, validUntil?: number): boolean {
    const sets: string[] = [];
    const params: Record<string, unknown> = { id };
    if (validFrom !== undefined) {
      sets.push('valid_from = @validFrom');
      params.validFrom = validFrom;
    }
    if (validUntil !== undefined) {
      sets.push('valid_until = @validUntil');
      params.validUntil = validUntil;
    }
    if (sets.length === 0) return false;
    sets.push('updated_at = unixepoch()');
    return (
      this.provider.run(`UPDATE entries SET ${sets.join(', ')} WHERE id = @id`, params).changes > 0
    );
  }

  findExpiring(withinDays: number): IntelligenceEntry[] {
    const now = Math.floor(Date.now() / 1000);
    const cutoff = now + withinDays * 86400;
    const rows = this.provider.all<Record<string, unknown>>(
      'SELECT * FROM entries WHERE valid_until IS NOT NULL AND valid_until > @now AND valid_until <= @cutoff ORDER BY valid_until ASC',
      { now, cutoff },
    );
    return rows.map(rowToEntry);
  }

  findExpired(limit: number = 50): IntelligenceEntry[] {
    const now = Math.floor(Date.now() / 1000);
    const rows = this.provider.all<Record<string, unknown>>(
      'SELECT * FROM entries WHERE valid_until IS NOT NULL AND valid_until <= @now ORDER BY valid_until DESC LIMIT @limit',
      { now, limit },
    );
    return rows.map(rowToEntry);
  }

  bulkRemove(ids: string[]): number {
    return this.provider.transaction(() => {
      let count = 0;
      for (const id of ids) {
        count += this.provider.run('DELETE FROM entries WHERE id = ?', [id]).changes;
      }
      return count;
    });
  }

  getTags(): Array<{ tag: string; count: number }> {
    const rows = this.provider.all<{ tags: string }>('SELECT tags FROM entries');
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

  getDomains(): Array<{ domain: string; count: number }> {
    return this.provider.all<{ domain: string; count: number }>(
      'SELECT domain, COUNT(*) as count FROM entries GROUP BY domain ORDER BY count DESC',
    );
  }

  getRecent(limit: number = 20): IntelligenceEntry[] {
    const rows = this.provider.all<Record<string, unknown>>(
      'SELECT * FROM entries ORDER BY updated_at DESC LIMIT ?',
      [limit],
    );
    return rows.map(rowToEntry);
  }

  exportAll(): { entries: IntelligenceEntry[]; exportedAt: number; count: number } {
    const rows = this.provider.all<Record<string, unknown>>(
      'SELECT * FROM entries ORDER BY domain, title',
    );
    const entries = rows.map(rowToEntry);
    return { entries, exportedAt: Math.floor(Date.now() / 1000), count: entries.length };
  }

  getAgeReport(): {
    total: number;
    buckets: Array<{ label: string; count: number; minDays: number; maxDays: number }>;
    oldestTimestamp: number | null;
    newestTimestamp: number | null;
  } {
    const rows = this.provider.all<{ created_at: number; updated_at: number }>(
      'SELECT created_at, updated_at FROM entries',
    );
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
      this.provider.run(
        'UPDATE projects SET last_seen_at = unixepoch(), session_count = session_count + 1 WHERE path = ?',
        [path],
      );
      return this.getProject(path)!;
    }
    this.provider.run('INSERT INTO projects (path, name) VALUES (?, ?)', [path, projectName]);
    return this.getProject(path)!;
  }

  getProject(path: string): ProjectInfo | null {
    const row = this.provider.get<Record<string, unknown>>(
      'SELECT * FROM projects WHERE path = ?',
      [path],
    );
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
    const rows = this.provider.all<Record<string, unknown>>(
      'SELECT * FROM projects ORDER BY last_seen_at DESC',
    );
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
    this.provider.run(
      `INSERT INTO memories (id, project_path, type, context, summary, topics, files_modified, tools_used) VALUES (@id, @projectPath, @type, @context, @summary, @topics, @filesModified, @toolsUsed)`,
      {
        id,
        projectPath: memory.projectPath,
        type: memory.type,
        context: memory.context,
        summary: memory.summary,
        topics: JSON.stringify(memory.topics),
        filesModified: JSON.stringify(memory.filesModified),
        toolsUsed: JSON.stringify(memory.toolsUsed),
      },
    );
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
      const rows = this.provider.all<Record<string, unknown>>(
        `SELECT m.* FROM memories_fts fts JOIN memories m ON m.rowid = fts.rowid WHERE memories_fts MATCH @query ${wc} ORDER BY rank LIMIT @limit`,
        { query, limit, ...fp },
      );
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
    const rows = this.provider.all<Record<string, unknown>>(
      `SELECT * FROM memories ${wc} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`,
      { ...params, limit: options?.limit ?? 50, offset: options?.offset ?? 0 },
    );
    return rows.map(rowToMemory);
  }

  memoryStats(): MemoryStats {
    const total = this.provider.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM memories WHERE archived_at IS NULL',
    )!.count;
    const byTypeRows = this.provider.all<{ key: string; count: number }>(
      'SELECT type as key, COUNT(*) as count FROM memories WHERE archived_at IS NULL GROUP BY type',
    );
    const byProjectRows = this.provider.all<{ key: string; count: number }>(
      'SELECT project_path as key, COUNT(*) as count FROM memories WHERE archived_at IS NULL GROUP BY project_path',
    );
    return {
      total,
      byType: Object.fromEntries(byTypeRows.map((r) => [r.key, r.count])),
      byProject: Object.fromEntries(byProjectRows.map((r) => [r.key, r.count])),
    };
  }

  getMemory(id: string): Memory | null {
    const row = this.provider.get<Record<string, unknown>>('SELECT * FROM memories WHERE id = ?', [
      id,
    ]);
    return row ? rowToMemory(row) : null;
  }

  deleteMemory(id: string): boolean {
    return this.provider.run('DELETE FROM memories WHERE id = ?', [id]).changes > 0;
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

    const total = this.provider.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM memories ${wc}${wc ? ' AND' : ' WHERE'} archived_at IS NULL`,
      params,
    )!.count;

    const archivedCount = this.provider.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM memories ${wc}${wc ? ' AND' : ' WHERE'} archived_at IS NOT NULL`,
      params,
    )!.count;

    const byTypeRows = this.provider.all<{ key: string; count: number }>(
      `SELECT type as key, COUNT(*) as count FROM memories ${wc}${wc ? ' AND' : ' WHERE'} archived_at IS NULL GROUP BY type`,
      params,
    );

    const byProjectRows = this.provider.all<{ key: string; count: number }>(
      `SELECT project_path as key, COUNT(*) as count FROM memories ${wc}${wc ? ' AND' : ' WHERE'} archived_at IS NULL GROUP BY project_path`,
      params,
    );

    const dateRange = this.provider.get<{ oldest: number | null; newest: number | null }>(
      `SELECT MIN(created_at) as oldest, MAX(created_at) as newest FROM memories ${wc}${wc ? ' AND' : ' WHERE'} archived_at IS NULL`,
      params,
    )!;

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
    const rows = this.provider.all<Record<string, unknown>>(
      `SELECT * FROM memories ${wc} ORDER BY created_at ASC`,
      Object.keys(params).length > 0 ? params : undefined,
    );
    return rows.map(rowToMemory);
  }

  importMemories(memories: Memory[]): { imported: number; skipped: number } {
    const sql = `
      INSERT OR IGNORE INTO memories (id, project_path, type, context, summary, topics, files_modified, tools_used, created_at, archived_at)
      VALUES (@id, @projectPath, @type, @context, @summary, @topics, @filesModified, @toolsUsed, @createdAt, @archivedAt)
    `;
    let imported = 0;
    let skipped = 0;
    this.provider.transaction(() => {
      for (const m of memories) {
        const result = this.provider.run(sql, {
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
    return { imported, skipped };
  }

  pruneMemories(olderThanDays: number): { pruned: number } {
    const cutoff = Math.floor(Date.now() / 1000) - olderThanDays * 86400;
    const result = this.provider.run(
      'DELETE FROM memories WHERE created_at < ? AND archived_at IS NULL',
      [cutoff],
    );
    return { pruned: result.changes };
  }

  deduplicateMemories(): { removed: number; groups: Array<{ kept: string; removed: string[] }> } {
    const dupeRows = this.provider.all<{ id1: string; id2: string }>(`
        SELECT m1.id as id1, m2.id as id2
        FROM memories m1
        JOIN memories m2 ON m1.summary = m2.summary
          AND m1.project_path = m2.project_path
          AND m1.type = m2.type
          AND m1.id < m2.id
          AND m1.archived_at IS NULL
          AND m2.archived_at IS NULL
      `);

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
      this.provider.transaction(() => {
        for (const id of toRemove) {
          this.provider.run('DELETE FROM memories WHERE id = ?', [id]);
        }
      });
    }

    return { removed: toRemove.size, groups };
  }

  memoryTopics(): Array<{ topic: string; count: number }> {
    const rows = this.provider.all<{ topics: string }>(
      'SELECT topics FROM memories WHERE archived_at IS NULL',
    );

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
    const rows = this.provider.all<{ project: string; count: number }>(
      'SELECT project_path as project, COUNT(*) as count FROM memories WHERE archived_at IS NULL GROUP BY project_path ORDER BY count DESC',
    );

    return rows.map((row) => {
      const memories = this.provider.all<Record<string, unknown>>(
        'SELECT * FROM memories WHERE project_path = ? AND archived_at IS NULL ORDER BY created_at DESC',
        [row.project],
      );
      return {
        project: row.project,
        count: row.count,
        memories: memories.map(rowToMemory),
      };
    });
  }

  /**
   * Rebuild the FTS5 index for the entries table.
   * Useful after bulk operations or if the index gets out of sync.
   */
  rebuildFtsIndex(): void {
    try {
      this.provider.run("INSERT INTO entries_fts(entries_fts) VALUES('rebuild')");
    } catch {
      // Graceful degradation — FTS rebuild failed (e.g. table doesn't exist yet)
    }
  }

  /**
   * Get the underlying persistence provider.
   */
  getProvider(): PersistenceProvider {
    return this.provider;
  }

  /**
   * Get the raw better-sqlite3 Database (backward compat).
   * Throws if the provider is not SQLite.
   */
  getDb(): import('better-sqlite3').Database {
    if (this.sqliteProvider) {
      return this.sqliteProvider.getDatabase();
    }
    throw new Error('getDb() is only available with SQLite provider');
  }

  close(): void {
    this.provider.close();
  }
}

function gc(provider: PersistenceProvider, col: string): Record<string, number> {
  const rows = provider.all<{ key: string; count: number }>(
    `SELECT ${col} as key, COUNT(*) as count FROM entries GROUP BY ${col}`,
  );
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
    validFrom: (row.valid_from as number) ?? undefined,
    validUntil: (row.valid_until as number) ?? undefined,
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
