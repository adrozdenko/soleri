/**
 * ISP interfaces for Vault decomposition.
 */
import type { IntelligenceEntry } from '../intelligence/types.js';
import type { SearchResult, VaultStats, Memory, MemoryStats, ProjectInfo } from './vault.js';

export interface VaultReader {
  get(id: string): IntelligenceEntry | null;
  search(query: string, options?: { domain?: string; type?: string; severity?: string; origin?: 'agent' | 'pack' | 'user'; limit?: number; includeExpired?: boolean }): SearchResult[];
  list(options?: { domain?: string; type?: string; severity?: string; origin?: 'agent' | 'pack' | 'user'; tags?: string[]; limit?: number; offset?: number; includeExpired?: boolean }): IntelligenceEntry[];
  stats(): VaultStats;
  getTags(): Array<{ tag: string; count: number }>;
  getDomains(): Array<{ domain: string; count: number }>;
  getRecent(limit?: number): IntelligenceEntry[];
  findExpiring(withinDays: number): IntelligenceEntry[];
  findExpired(limit?: number): IntelligenceEntry[];
  findByContentHash(hash: string): string | null;
  contentHashStats(): { total: number; hashed: number; uniqueHashes: number };
}

export interface VaultWriter {
  seed(entries: IntelligenceEntry[]): number;
  seedDedup(entries: IntelligenceEntry[]): Array<{ id: string; action: 'inserted' | 'duplicate'; existingId?: string }>;
  installPack(entries: IntelligenceEntry[]): { installed: number; skipped: number };
  add(entry: IntelligenceEntry): void;
  remove(id: string): boolean;
  bulkRemove(ids: string[]): number;
  update(id: string, fields: Partial<Pick<IntelligenceEntry, 'title' | 'description' | 'context' | 'example' | 'counterExample' | 'why' | 'tags' | 'appliesTo' | 'severity' | 'type' | 'domain' | 'validFrom' | 'validUntil'>>): IntelligenceEntry | null;
  setTemporal(id: string, validFrom?: number, validUntil?: number): boolean;
  archive(options: { olderThanDays: number; reason?: string }): { archived: number };
  restore(id: string): boolean;
}

export interface VaultMemory {
  captureMemory(memory: Omit<Memory, 'id' | 'createdAt' | 'archivedAt'>): Memory;
  getMemory(id: string): Memory | null;
  deleteMemory(id: string): boolean;
  searchMemories(query: string, options?: { type?: string; projectPath?: string; intent?: string; limit?: number }): Memory[];
  listMemories(options?: { type?: string; projectPath?: string; limit?: number; offset?: number }): Memory[];
  memoryStats(): MemoryStats;
  memoryStatsDetailed(options?: { projectPath?: string; fromDate?: number; toDate?: number }): MemoryStats & { oldest: number | null; newest: number | null; archivedCount: number };
  exportMemories(options?: { projectPath?: string; type?: string; includeArchived?: boolean }): Memory[];
  importMemories(memories: Memory[]): { imported: number; skipped: number };
  pruneMemories(olderThanDays: number): { pruned: number };
  deduplicateMemories(): { removed: number; groups: Array<{ kept: string; removed: string[] }> };
  memoryTopics(): Array<{ topic: string; count: number }>;
  memoriesByProject(): Array<{ project: string; count: number; memories: Memory[] }>;
}

export interface VaultMaintenance {
  optimize(): { vacuumed: boolean; analyzed: boolean; ftsRebuilt: boolean };
  rebuildFtsIndex(): void;
  exportAll(): { entries: IntelligenceEntry[]; exportedAt: number; count: number };
  getAgeReport(): { total: number; buckets: Array<{ label: string; count: number; minDays: number; maxDays: number }>; oldestTimestamp: number | null; newestTimestamp: number | null };
  contentHashStats(): { total: number; hashed: number; uniqueHashes: number };
}
