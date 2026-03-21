import type { PersistenceProvider } from '../persistence/types.js';
import { SQLitePersistenceProvider } from '../persistence/sqlite-provider.js';
import type { IntelligenceEntry } from '../intelligence/types.js';
import type { LinkManager } from './linking.js';
import { initializeSchema, checkFormatVersion, VAULT_FORMAT_VERSION } from './vault-schema.js';
import * as entries from './vault-entries.js';
import * as memories from './vault-memories.js';
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

  // ── Entry operations (delegated to vault-entries.ts) ──────────────────

  seed(entryList: IntelligenceEntry[]): number {
    return entries.seed(this.provider, entryList, this.getAutoLinkConfig());
  }

  installPack(entryList: IntelligenceEntry[]): { installed: number; skipped: number } {
    return entries.installPack(this.provider, entryList, this.getAutoLinkConfig());
  }

  seedDedup(
    entryList: IntelligenceEntry[],
  ): Array<{ id: string; action: 'inserted' | 'duplicate'; existingId?: string }> {
    return entries.seedDedup(this.provider, entryList, this.getAutoLinkConfig());
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

  findByContentHash(hash: string): string | null {
    return entries.findByContentHash(this.provider, hash);
  }

  contentHashStats(): { total: number; hashed: number; uniqueHashes: number } {
    return entries.contentHashStats(this.provider);
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

  archive(options: { olderThanDays: number; reason?: string }): { archived: number } {
    return entries.archive(this.provider, options);
  }

  restore(id: string): boolean {
    return entries.restore(this.provider, id);
  }

  // ── Project operations ────────────────────────────────────────────────

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

  // ── Memory operations (delegated to vault-memories.ts) ────────────────

  captureMemory(memory: Omit<Memory, 'id' | 'createdAt' | 'archivedAt'>): Memory {
    return memories.captureMemory(this.provider, memory);
  }

  getMemory(id: string): Memory | null {
    return memories.getMemory(this.provider, id);
  }

  deleteMemory(id: string): boolean {
    return memories.deleteMemory(this.provider, id);
  }

  searchMemories(
    query: string,
    options?: { type?: string; projectPath?: string; intent?: string; limit?: number },
  ): Memory[] {
    return memories.searchMemories(this.provider, query, options);
  }

  listMemories(options?: {
    type?: string;
    projectPath?: string;
    limit?: number;
    offset?: number;
  }): Memory[] {
    return memories.listMemories(this.provider, options);
  }

  memoryStats(): MemoryStats {
    return memories.memoryStats(this.provider);
  }

  memoryStatsDetailed(options?: {
    projectPath?: string;
    fromDate?: number;
    toDate?: number;
  }): MemoryStats & { oldest: number | null; newest: number | null; archivedCount: number } {
    return memories.memoryStatsDetailed(this.provider, options);
  }

  exportMemories(options?: {
    projectPath?: string;
    type?: string;
    includeArchived?: boolean;
  }): Memory[] {
    return memories.exportMemories(this.provider, options);
  }

  importMemories(memoryList: Memory[]): { imported: number; skipped: number } {
    return memories.importMemories(this.provider, memoryList);
  }

  pruneMemories(olderThanDays: number): { pruned: number } {
    return memories.pruneMemories(this.provider, olderThanDays);
  }

  deduplicateMemories(): { removed: number; groups: Array<{ kept: string; removed: string[] }> } {
    return memories.deduplicateMemories(this.provider);
  }

  memoryTopics(): Array<{ topic: string; count: number }> {
    return memories.memoryTopics(this.provider);
  }

  memoriesByProject(): Array<{ project: string; count: number; memories: Memory[] }> {
    return memories.memoriesByProject(this.provider);
  }

  // ── Maintenance operations ────────────────────────────────────────────

  rebuildFtsIndex(): void {
    try {
      this.provider.run("INSERT INTO entries_fts(entries_fts) VALUES('rebuild')");
    } catch {
      // Graceful degradation — FTS rebuild failed
    }
  }

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

  // ── Provider access ───────────────────────────────────────────────────

  getProvider(): PersistenceProvider {
    return this.provider;
  }

  getDb(): import('better-sqlite3').Database {
    if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
      console.warn('Vault.getDb() is deprecated. Use vault.getProvider() instead.');
    }
    if (this.sqliteProvider) {
      return this.sqliteProvider.getDatabase();
    }
    throw new Error('getDb() is only available with SQLite provider');
  }

  close(): void {
    this.provider.close();
  }
}
