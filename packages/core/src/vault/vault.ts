import type { PersistenceProvider } from '../persistence/types.js';
import { SQLitePersistenceProvider } from '../persistence/sqlite-provider.js';
import type { IntelligenceEntry } from '../intelligence/types.js';
import type { StoredVector } from '../embeddings/types.js';
import type { LinkManager } from './linking.js';
import {
  initializeSchema,
  checkFormatVersion,
  VAULT_FORMAT_VERSION,
  getSourceOfTruth,
  setSourceOfTruth,
  type VaultSourceOfTruth,
} from './vault-schema.js';
import {
  writeEntryFileSync,
  removeEntryFileSync,
  archiveEntryFileSync,
  restoreEntryFileSync,
} from './vault-markdown-sync.js';
import * as entries from './vault-entries.js';
import * as memories from './vault-memories.js';
import * as maintenance from './vault-maintenance.js';
import { DomainSummaryManager } from './domain-summaries.js';
import type { AutoLinkConfig, AutoEmbedConfig, EntryUpdateFields } from './vault-entries.js';
import type { EmbeddingPipeline } from '../embeddings/pipeline.js';
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
  private embeddingPipeline: EmbeddingPipeline | null = null;
  private autoEmbedEnabled = true;
  private _domainSummaries: DomainSummaryManager | null = null;
  /** When set, mutating ops write the canonical `.md` file first (files-first write-through). */
  private fileStore: string | null = null;

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

  private getAutoEmbedConfig(): AutoEmbedConfig {
    return {
      pipeline: this.embeddingPipeline,
      enabled: this.autoEmbedEnabled,
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

  setEmbeddingPipeline(pipeline: EmbeddingPipeline, opts?: { enabled?: boolean }): void {
    this.embeddingPipeline = pipeline;
    if (opts?.enabled !== undefined) this.autoEmbedEnabled = opts.enabled;
  }

  isAutoEmbedEnabled(): boolean {
    return this.autoEmbedEnabled && this.embeddingPipeline !== null;
  }

  get domainSummaries(): DomainSummaryManager {
    if (!this._domainSummaries) {
      this._domainSummaries = new DomainSummaryManager(this.provider);
    }
    return this._domainSummaries;
  }

  static createWithSQLite(dbPath: string = ':memory:'): Vault {
    return new Vault(dbPath);
  }

  // ── Files-first write-through (WS4) ───────────────────────────────────

  /**
   * Bind a knowledge directory so mutating ops write the canonical `.md` file
   * FIRST, then upsert the derived index row (files-first write-through). Pass
   * null to unbind. The file store is the source of truth; the DB is the index.
   */
  bindFileStore(knowledgeDir: string | null): void {
    this.fileStore = knowledgeDir;
  }

  /** The bound knowledge directory, or null when write-through is disabled. */
  getFileStore(): string | null {
    return this.fileStore;
  }

  /** Read the persisted authoritative-store flag ('index' until migrated to 'files'). */
  getSourceOfTruth(): VaultSourceOfTruth {
    return getSourceOfTruth(this.provider);
  }

  /** Persist the authoritative-store flag. */
  setSourceOfTruth(value: VaultSourceOfTruth): void {
    setSourceOfTruth(this.provider, value);
  }

  /**
   * Guard every mutating op: in files-first mode a DB-only write would be
   * silently reverted by the next reindex (or pruned by a full reindex),
   * destroying data. If canonicality is `files` but no file store is bound,
   * FAIL LOUDLY rather than write the index alone.
   */
  private assertFilesModeBound(): void {
    if (this.fileStore) return;
    if (getSourceOfTruth(this.provider) === 'files') {
      throw new Error(
        'Vault is files-first (source_of_truth=files) but no file store is bound. ' +
          'Refusing a DB-only write that would be reverted by reindex. ' +
          'Call vault.bindFileStore(knowledgeDir) first.',
      );
    }
  }

  /** Write each entry's canonical file first (only when a file store is bound). */
  private writeThroughFiles(entryList: IntelligenceEntry[], force = false): void {
    if (!this.fileStore) return;
    for (const entry of entryList) {
      writeEntryFileSync(entry, this.fileStore, { force });
    }
  }

  /** Delete an entry's canonical file (only when a file store is bound). */
  private removeThroughFiles(entry: IntelligenceEntry): void {
    if (!this.fileStore) return;
    removeEntryFileSync(entry, this.fileStore);
  }

  /**
   * Write files for the given ids by re-reading their DB rows (post-dedup /
   * post-mutation write-through). Force-writes so a change to a non-hashed field
   * (tier/origin/temporal) still refreshes the file.
   */
  private writeThroughPresent(ids: string[]): void {
    if (!this.fileStore) return;
    for (const id of ids) {
      const row = entries.get(this.provider, id);
      if (row) writeEntryFileSync(row, this.fileStore, { force: true });
    }
  }

  // ── Entry operations (vault-entries.ts) ───────────────────────────────

  seed(entryList: IntelligenceEntry[]): number {
    this.assertFilesModeBound();
    this.writeThroughFiles(entryList); // file-first: write .md before the index row
    const result = entries.seed(
      this.provider,
      entryList,
      this.getAutoLinkConfig(),
      this.getAutoEmbedConfig(),
    );
    this.invalidateDomains(entryList);
    return result;
  }
  installPack(entryList: IntelligenceEntry[]): { installed: number; skipped: number } {
    this.assertFilesModeBound();
    const result = entries.installPack(
      this.provider,
      entryList,
      this.getAutoLinkConfig(),
      this.getAutoEmbedConfig(),
    );
    // Dedup needs the DB to decide inserts; write files for the rows that landed.
    this.writeThroughPresent(entryList.map((e) => e.id));
    this.invalidateDomains(entryList);
    return result;
  }
  seedDedup(
    entryList: IntelligenceEntry[],
  ): Array<{ id: string; action: 'inserted' | 'duplicate'; existingId?: string }> {
    this.assertFilesModeBound();
    const result = entries.seedDedup(
      this.provider,
      entryList,
      this.getAutoLinkConfig(),
      this.getAutoEmbedConfig(),
    );
    // Write files only for entries that were actually inserted (not deduped).
    this.writeThroughPresent(result.filter((r) => r.action === 'inserted').map((r) => r.id));
    this.invalidateDomains(entryList);
    return result;
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
    this.assertFilesModeBound();
    this.writeThroughFiles([entry]); // file-first: write .md before the index row
    entries.add(this.provider, entry, this.getAutoLinkConfig(), this.getAutoEmbedConfig());
    this.domainSummaries.markStale(entry.domain);
  }
  remove(id: string): boolean {
    this.assertFilesModeBound();
    // Look up domain before removing so we can invalidate the right summary
    const existing = entries.get(this.provider, id);
    if (existing) this.removeThroughFiles(existing); // file-first: delete .md before the index row
    const result = entries.remove(this.provider, id);
    if (result && existing) {
      this.domainSummaries.markStale(existing.domain);
    }
    return result;
  }
  update(id: string, fields: EntryUpdateFields): IntelligenceEntry | null {
    this.assertFilesModeBound();
    // Invalidate both old and new domain if domain is changing
    const existing = entries.get(this.provider, id);
    const result = entries.update(
      this.provider,
      id,
      fields,
      this.getAutoLinkConfig(),
      this.getAutoEmbedConfig(),
    );
    if (result) {
      // File-first: rewrite the .md (rename when title/domain changed) before
      // returning. Force so a non-hashed-field change (tier/origin) still rewrites.
      if (this.fileStore) {
        if (existing) this.removeThroughFiles(existing);
        this.writeThroughFiles([result], true);
      }
      this.domainSummaries.markStale(result.domain);
      if (existing && existing.domain !== result.domain) {
        this.domainSummaries.markStale(existing.domain);
      }
    }
    return result;
  }
  setTemporal(id: string, validFrom?: number, validUntil?: number): boolean {
    this.assertFilesModeBound();
    const ok = entries.setTemporal(this.provider, id, validFrom, validUntil);
    // Temporal fields participate in the content hash; refresh the .md so the file
    // (frontmatter valid_from/until + content_hash) stays canonical in files mode.
    if (ok && this.fileStore) this.writeThroughPresent([id]);
    return ok;
  }
  findExpiring(withinDays: number): IntelligenceEntry[] {
    return entries.findExpiring(this.provider, withinDays);
  }
  findExpired(limit: number = 50): IntelligenceEntry[] {
    return entries.findExpired(this.provider, limit);
  }
  bulkRemove(ids: string[]): number {
    this.assertFilesModeBound();
    // Look up domains before removing
    const existing = ids.length > 0 ? entries.getByIds(this.provider, ids) : [];
    // File-first: delete the .md files before the index rows.
    for (const entry of existing) this.removeThroughFiles(entry);
    const result = entries.bulkRemove(this.provider, ids);
    if (result > 0) {
      this.invalidateDomains(existing);
    }
    return result;
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
    this.assertFilesModeBound();
    // File-first: move the .md of every entry about to be archived into
    // vault/_archive/<domain>/ (outside the scanned tree) BEFORE the DB rows move,
    // so a later reindex cannot resurrect them.
    if (this.fileStore) {
      const cutoff = Math.floor(Date.now() / 1000) - options.olderThanDays * 86400;
      const rows = this.provider.all<Record<string, unknown>>(
        'SELECT * FROM entries WHERE updated_at < ?',
        [cutoff],
      );
      for (const row of rows) archiveEntryFileSync(entries.rowToEntry(row), this.fileStore);
    }
    return maintenance.archive(this.provider, options);
  }
  restore(id: string): boolean {
    this.assertFilesModeBound();
    const result = maintenance.restore(this.provider, id);
    // File-first: move the archived .md back into its live domain folder (or write
    // a fresh one if the archived file is missing, e.g. archived pre-files-first).
    if (result && this.fileStore) {
      const restored = entries.get(this.provider, id);
      if (restored) {
        const moved = restoreEntryFileSync(restored, this.fileStore);
        if (!moved) writeEntryFileSync(restored, this.fileStore, { force: true });
      }
    }
    return result;
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

  // ── Private helpers ──────────────────────────────────────────────────

  /** Mark domain summaries as stale for all unique domains in the given entries. */
  private invalidateDomains(entryList: IntelligenceEntry[]): void {
    const domains = new Set(entryList.map((e) => e.domain));
    for (const domain of domains) {
      this.domainSummaries.markStale(domain);
    }
  }
}
