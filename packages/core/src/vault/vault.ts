import type { PersistenceProvider } from '../persistence/types.js';
import { SQLitePersistenceProvider } from '../persistence/sqlite-provider.js';
import type { IntelligenceEntry } from '../intelligence/types.js';
import type { StoredVector } from '../embeddings/types.js';
import type { LinkManager } from './linking.js';
import { initializeSchema, checkFormatVersion, VAULT_FORMAT_VERSION } from './vault-schema.js';
import * as entries from './vault-entries.js';
import * as memories from './vault-memories.js';
import * as maintenance from './vault-maintenance.js';
import type { AutoLinkConfig, EntryUpdateFields } from './vault-entries.js';
import type { SearchResult, VaultStats, ProjectInfo, Memory, MemoryStats } from './vault-types.js';

export type { SearchResult, VaultStats, ProjectInfo, Memory, MemoryStats } from './vault-types.js';

/** Apply critical PRAGMAs that every vault database must have. */
function applyVaultPragmas(provider: PersistenceProvider): void {
  provider.run('PRAGMA busy_timeout = 5000');
  provider.run('PRAGMA journal_mode = WAL');
  provider.run('PRAGMA foreign_keys = ON');
  provider.run('PRAGMA synchronous = NORMAL');
}

export class Vault {
  private provider: PersistenceProvider;
  private sqliteProvider: SQLitePersistenceProvider | null;
  private linkManager: LinkManager | null = null;
  private autoLinkEnabled = true;
  private autoLinkMaxLinks = 3;

  constructor(providerOrPath: PersistenceProvider | string = ':memory:') {
    if (typeof providerOrPath === 'string') {
      const sqlite = new SQLitePersistenceProvider(providerOrPath);
      this.provider = sqlite;
      this.sqliteProvider = sqlite;
    } else {
      this.provider = providerOrPath;
      this.sqliteProvider =
        providerOrPath instanceof SQLitePersistenceProvider ? providerOrPath : null;
    }
    applyVaultPragmas(this.provider);
    initializeSchema(this.provider);
    checkFormatVersion(this.provider);
  }

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

  isAutoLinkEnabled(): boolean {
    return this.autoLinkEnabled && this.linkManager !== null;
  }

  static createWithSQLite(dbPath: string = ':memory:'): Vault {
    return new Vault(dbPath);
  }

  // ── Entry operations (vault-entries.ts) ───────────────────────────────

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
  loadEntries(ids: string[]): IntelligenceEntry[] {
    return entries.getByIds(this.provider, ids);
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
  update(id: string, fields: EntryUpdateFields): IntelligenceEntry | null {
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
  getVector(entryId: string): StoredVector | null {
    return entries.getVector(this.provider, entryId);
  }
  cosineSearch(
    queryVector: number[],
    topK: number,
  ): Array<{ entryId: string; similarity: number }> {
    return entries.cosineSearch(this.provider, queryVector, topK);
  }

  // ── Maintenance operations (vault-maintenance.ts) ─────────────────────

  exportAll(): { entries: IntelligenceEntry[]; exportedAt: number; count: number } {
    return maintenance.exportAll(this.provider);
  }
  getAgeReport(): {
    total: number;
    buckets: Array<{ label: string; count: number; minDays: number; maxDays: number }>;
    oldestTimestamp: number | null;
    newestTimestamp: number | null;
  } {
    return maintenance.getAgeReport(this.provider);
  }
  archive(options: { olderThanDays: number; reason?: string }): { archived: number } {
    return maintenance.archive(this.provider, options);
  }
  restore(id: string): boolean {
    return maintenance.restore(this.provider, id);
  }
  rebuildFtsIndex(): void {
    maintenance.rebuildFtsIndex(this.provider);
  }
  optimize(): { vacuumed: boolean; analyzed: boolean; ftsRebuilt: boolean } {
    return maintenance.optimize(this.provider);
  }

  // ── Project operations (vault-maintenance.ts) ─────────────────────────

  registerProject(path: string, name?: string): ProjectInfo {
    return maintenance.registerProject(this.provider, path, name);
  }
  getProject(path: string): ProjectInfo | null {
    return maintenance.getProject(this.provider, path);
  }
  listProjects(): ProjectInfo[] {
    return maintenance.listProjects(this.provider);
  }

  // ── Memory operations (vault-memories.ts) ─────────────────────────────

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

  // ── Provider access ───────────────────────────────────────────────────

  getProvider(): PersistenceProvider {
    return this.provider;
  }
  getDb(): import('better-sqlite3').Database {
    if (process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true') {
      console.warn('Vault.getDb() is deprecated. Use vault.getProvider() instead.');
    }
    if (this.sqliteProvider) return this.sqliteProvider.getDatabase();
    throw new Error('getDb() is only available with SQLite provider');
  }
  close(): void {
    this.provider.close();
  }
}
