import type { PersistenceProvider } from '../persistence/types.js';
import { SQLitePersistenceProvider } from '../persistence/sqlite-provider.js';
import type { IntelligenceEntry } from '../intelligence/types.js';
import type { LinkManager } from './linking.js';
import { initializeSchema, checkFormatVersion, VAULT_FORMAT_VERSION } from './vault-schema.js';
import * as entries from './vault-entries.js';
import type { AutoLinkConfig } from './vault-entries.js';

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
  /** What the user was trying to accomplish. */
  intent: string | null;
  /** Key decisions made and their rationale. */
  decisions: string[];
  /** Where things stand at capture time. */
  currentState: string | null;
  /** What should happen next session. */
  nextSteps: string[];
  /** Vault entries that informed this session. */
  vaultEntriesReferenced: string[];
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
  private linkManager: LinkManager | null = null;
  private autoLinkEnabled = true;
  /** Minimum number of FTS5 suggestions to auto-link. Top N are linked. */
  private autoLinkMaxLinks = 3;

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
      this.provider.run('PRAGMA synchronous = NORMAL');
    } else {
      this.provider = providerOrPath;
      this.sqliteProvider =
        providerOrPath instanceof SQLitePersistenceProvider ? providerOrPath : null;
    }
    initializeSchema(this.provider);
    checkFormatVersion(this.provider);
  }

  /** Vault format version — delegates to vault-schema.ts constant. */
  static readonly FORMAT_VERSION = VAULT_FORMAT_VERSION;

  private getAutoLinkConfig(): AutoLinkConfig {
    return {
      linkManager: this.linkManager,
      enabled: this.autoLinkEnabled,
      maxLinks: this.autoLinkMaxLinks,
    };
  }

  setLinkManager(mgr: LinkManager, opts?: { enabled?: boolean; maxLinks?: number }): void {
    this.linkManager = mgr;
    if (opts?.enabled !== undefined) this.autoLinkEnabled = opts.enabled;
    if (opts?.maxLinks !== undefined) this.autoLinkMaxLinks = opts.maxLinks;
  }

  /** Whether auto-linking is enabled (used by capture-ops to respect the setting). */
  isAutoLinkEnabled(): boolean {
    return this.autoLinkEnabled && this.linkManager !== null;
  }

  /** Backward-compatible factory. */
  static createWithSQLite(dbPath: string = ':memory:'): Vault {
    return new Vault(dbPath);
  }

  seed(entries_list: IntelligenceEntry[]): number {
    return entries.seed(this.provider, entries_list, this.getAutoLinkConfig());
  }

  /**
   * Install a knowledge pack — seeds entries with origin:'pack' and content-hash dedup.
   */
  installPack(entries_list: IntelligenceEntry[]): { installed: number; skipped: number } {
    return entries.installPack(this.provider, entries_list, this.getAutoLinkConfig());
  }

  /**
   * Seed entries with content-hash dedup. Returns per-entry results.
   */
  seedDedup(
    entries_list: IntelligenceEntry[],
  ): Array<{ id: string; action: 'inserted' | 'duplicate'; existingId?: string }> {
    return entries.seedDedup(this.provider, entries_list, this.getAutoLinkConfig());
  }

  search(
    query: string,
    options?: {
      domain?: string;
      type?: string;
      severity?: string;
      origin?: 'agent' | 'pack' | 'user';
      limit?: number;
      includeExpired?: boolean;
    },
  ): SearchResult[] {
    return entries.search(this.provider, query, options);
  }

  get(id: string): IntelligenceEntry | null {
    return entries.get(this.provider, id);
  }

  list(options?: {
    domain?: string;
    type?: string;
    severity?: string;
    origin?: 'agent' | 'pack' | 'user';
    tags?: string[];
    limit?: number;
    offset?: number;
    includeExpired?: boolean;
  }): IntelligenceEntry[] {
    return entries.list(this.provider, options);
  }

  stats(): VaultStats {
    return entries.stats(this.provider);
  }

  add(entry: IntelligenceEntry): void {
    entries.add(this.provider, entry, this.getAutoLinkConfig());
  }

  remove(id: string): boolean {
    return entries.remove(this.provider, id);
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
    return entries.update(this.provider, id, fields, this.getAutoLinkConfig());
  }

  setTemporal(id: string, validFrom?: number, validUntil?: number): boolean {
    return entries.setTemporal(this.provider, id, validFrom, validUntil);
  }

  findExpiring(withinDays: number): IntelligenceEntry[] {
    return entries.findExpiring(this.provider, withinDays);
  }

  findExpired(limit: number = 50): IntelligenceEntry[] {
    return entries.findExpired(this.provider, limit);
  }

  bulkRemove(ids: string[]): number {
    return entries.bulkRemove(this.provider, ids);
  }

  getTags(): Array<{ tag: string; count: number }> {
    return entries.getTags(this.provider);
  }

  getDomains(): Array<{ domain: string; count: number }> {
    return entries.getDomains(this.provider);
  }

  getRecent(limit: number = 20): IntelligenceEntry[] {
    return entries.getRecent(this.provider, limit);
  }

  exportAll(): { entries: IntelligenceEntry[]; exportedAt: number; count: number } {
    return entries.exportAll(this.provider);
  }

  getAgeReport(): {
    total: number;
    buckets: Array<{ label: string; count: number; minDays: number; maxDays: number }>;
    oldestTimestamp: number | null;
    newestTimestamp: number | null;
  } {
    return entries.getAgeReport(this.provider);
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
      `INSERT INTO memories (id, project_path, type, context, summary, topics, files_modified, tools_used, intent, decisions, current_state, next_steps, vault_entries_referenced)
       VALUES (@id, @projectPath, @type, @context, @summary, @topics, @filesModified, @toolsUsed, @intent, @decisions, @currentState, @nextSteps, @vaultEntriesReferenced)`,
      {
        id,
        projectPath: memory.projectPath,
        type: memory.type,
        context: memory.context,
        summary: memory.summary,
        topics: JSON.stringify(memory.topics),
        filesModified: JSON.stringify(memory.filesModified),
        toolsUsed: JSON.stringify(memory.toolsUsed),
        intent: memory.intent ?? null,
        decisions: JSON.stringify(memory.decisions ?? []),
        currentState: memory.currentState ?? null,
        nextSteps: JSON.stringify(memory.nextSteps ?? []),
        vaultEntriesReferenced: JSON.stringify(memory.vaultEntriesReferenced ?? []),
      },
    );
    return this.getMemory(id)!;
  }

  searchMemories(
    query: string,
    options?: { type?: string; projectPath?: string; intent?: string; limit?: number },
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
    if (options?.intent) {
      filters.push('m.intent = @intent');
      fp.intent = options.intent;
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
   */
  rebuildFtsIndex(): void {
    try {
      this.provider.run("INSERT INTO entries_fts(entries_fts) VALUES('rebuild')");
    } catch {
      // Graceful degradation — FTS rebuild failed
    }
  }

  /**
   * Archive entries older than N days. Moves them to entries_archive.
   */
  archive(options: { olderThanDays: number; reason?: string }): { archived: number } {
    return entries.archive(this.provider, options);
  }

  /**
   * Restore an archived entry back to the active table.
   */
  restore(id: string): boolean {
    return entries.restore(this.provider, id);
  }

  /**
   * Optimize the database: VACUUM (SQLite only), ANALYZE, and FTS rebuild.
   */
  optimize(): { vacuumed: boolean; analyzed: boolean; ftsRebuilt: boolean } {
    let vacuumed = false;
    let analyzed = false;
    let ftsRebuilt = false;

    if (this.provider.backend === 'sqlite') {
      try {
        this.provider.execSql('VACUUM');
        vacuumed = true;
      } catch {
        // VACUUM may fail inside a transaction
      }
    }

    try {
      this.provider.execSql('ANALYZE');
      analyzed = true;
    } catch {
      // Non-critical
    }

    try {
      this.provider.ftsRebuild('entries');
      this.provider.ftsRebuild('memories');
      ftsRebuilt = true;
    } catch {
      // Non-critical
    }

    return { vacuumed, analyzed, ftsRebuilt };
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
    if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
      console.warn('Vault.getDb() is deprecated. Use vault.getProvider() instead.');
    }
    if (this.sqliteProvider) {
      return this.sqliteProvider.getDatabase();
    }
    throw new Error('getDb() is only available with SQLite provider');
  }

  /** Check if an entry with this content hash already exists. Returns the existing ID or null. */
  findByContentHash(hash: string): string | null {
    return entries.findByContentHash(this.provider, hash);
  }

  /** Get content hash stats for dedup reporting. */
  contentHashStats(): { total: number; hashed: number; uniqueHashes: number } {
    return entries.contentHashStats(this.provider);
  }

  close(): void {
    this.provider.close();
  }
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
    intent: (row.intent as string) ?? null,
    decisions: JSON.parse((row.decisions as string) || '[]'),
    currentState: (row.current_state as string) ?? null,
    nextSteps: JSON.parse((row.next_steps as string) || '[]'),
    vaultEntriesReferenced: JSON.parse((row.vault_entries_referenced as string) || '[]'),
    createdAt: row.created_at as number,
    archivedAt: (row.archived_at as number) ?? null,
  };
}
