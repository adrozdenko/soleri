import type { Vault } from '../vault/vault.js';
import type { IntelligenceEntry } from '../intelligence/types.js';
import type { PersistenceProvider } from '../persistence/types.js';
import type {
  CuratorStatus,
  TagNormalizationResult,
  CanonicalTag,
  DuplicateCandidate,
  DuplicateDetectionResult,
  Contradiction,
  ContradictionStatus,
  GroomResult,
  GroomAllResult,
  ConsolidationOptions,
  ConsolidationResult,
  ChangelogEntry,
  HealthAuditResult,
} from './types.js';

import {
  DEFAULT_DUPLICATE_THRESHOLD,
  MERGE_SUGGESTION_THRESHOLD,
  buildVocabulary,
  entryToText,
} from './duplicate-detector.js';
import {
  findContradictions,
  DEFAULT_CONTRADICTION_THRESHOLD,
  type ContradictionCandidate,
} from './contradiction-detector.js';
import { tokenize, calculateTfIdf, cosineSimilarity } from '../text/similarity.js';
import {
  normalizeTag as normalizeTagPure,
  normalizeAndDedup,
  addTagAlias as addTagAliasPure,
  getCanonicalTags as getCanonicalTagsPure,
  seedDefaultAliases,
  type TagStore,
} from './tag-manager.js';
import { initializeTables } from './schema.js';
import { computeHealthAudit, type HealthDataProvider } from './health-audit.js';
import { enrichEntryMetadata } from './metadata-enricher.js';

// ─── Constants ──────────────────────────────────────────────────────

const DEFAULT_STALE_DAYS = 90;
const DEFAULT_BATCH_SIZE = 100;

// ─── Curator Class ──────────────────────────────────────────────────

export class Curator {
  private vault: Vault;
  private provider: PersistenceProvider;
  private tagStore: TagStore;

  constructor(vault: Vault) {
    this.vault = vault;
    this.provider = vault.getProvider();
    this.tagStore = this.createTagStore();
    initializeTables(this.provider);
    this.provider.transaction(() => seedDefaultAliases(this.tagStore));
  }

  private createTagStore(): TagStore {
    const p = this.provider;
    return {
      getAlias(lower: string) {
        return (
          p.get<{ canonical: string }>('SELECT canonical FROM curator_tag_alias WHERE alias = ?', [
            lower,
          ])?.canonical ?? null
        );
      },
      insertCanonical(tag: string) {
        p.run('INSERT OR IGNORE INTO curator_tag_canonical (tag) VALUES (?)', [tag]);
      },
      upsertAlias(alias: string, canonical: string) {
        p.run('INSERT OR REPLACE INTO curator_tag_alias (alias, canonical) VALUES (?, ?)', [
          alias,
          canonical,
        ]);
      },
      getCanonicalRows() {
        return p.all<{ tag: string; description: string | null; alias_count: number }>(
          `SELECT c.tag, c.description, (SELECT COUNT(*) FROM curator_tag_alias a WHERE a.canonical = c.tag) as alias_count FROM curator_tag_canonical c ORDER BY c.tag`,
        );
      },
      countTagUsage(tag: string) {
        return (
          p.get<{ count: number }>('SELECT COUNT(*) as count FROM entries WHERE tags LIKE ?', [
            `%"${tag}"%`,
          ])?.count ?? 0
        );
      },
    };
  }

  // ─── Status ─────────────────────────────────────────────────────

  getStatus(): CuratorStatus {
    const tableCount = (table: string): number =>
      (
        this.provider.get<{ count: number }>(`SELECT COUNT(*) as count FROM ${table}`) ?? {
          count: 0,
        }
      ).count;
    const lastGroomed = this.provider.get<{ ts: number | null }>(
      'SELECT MAX(last_groomed_at) as ts FROM curator_entry_state WHERE last_groomed_at IS NOT NULL',
    ) ?? { ts: null };
    return {
      initialized: true,
      tables: {
        entry_state: tableCount('curator_entry_state'),
        tag_canonical: tableCount('curator_tag_canonical'),
        tag_alias: tableCount('curator_tag_alias'),
        changelog: tableCount('curator_changelog'),
        contradictions: tableCount('curator_contradictions'),
      },
      lastGroomedAt: lastGroomed.ts,
    };
  }

  // ─── Tags (delegates to tag-manager) ──────────────────────────

  normalizeTag(tag: string): TagNormalizationResult {
    return normalizeTagPure(tag, this.tagStore);
  }

  normalizeTags(entryId: string): TagNormalizationResult[] {
    const entry = this.vault.get(entryId);
    if (!entry) return [];
    const { results, dedupedTags, changed } = normalizeAndDedup(entry.tags, this.tagStore);
    if (changed) {
      this.provider.run('UPDATE entries SET tags = ?, updated_at = unixepoch() WHERE id = ?', [
        JSON.stringify(dedupedTags),
        entryId,
      ]);
      this.logChange(
        'normalize_tags',
        entryId,
        JSON.stringify(entry.tags),
        JSON.stringify(dedupedTags),
        'Tag normalization',
      );
    }
    return results;
  }

  addTagAlias(alias: string, canonical: string): void {
    addTagAliasPure(alias, canonical, this.tagStore);
  }
  getCanonicalTags(): CanonicalTag[] {
    return getCanonicalTagsPure(this.tagStore);
  }

  // ─── Duplicates (delegates to duplicate-detector) ─────────────

  detectDuplicates(entryId?: string, threshold?: number): DuplicateDetectionResult[] {
    const effectiveThreshold = threshold ?? DEFAULT_DUPLICATE_THRESHOLD;
    const dismissed = this.getDismissedPairs();

    // --- Phase 1: Content-hash exact duplicates (O(n) via GROUP BY) ---
    const exactDupes = this.provider.all<{ content_hash: string; ids: string }>(
      `SELECT content_hash, GROUP_CONCAT(id) as ids FROM entries
       WHERE content_hash IS NOT NULL
       GROUP BY content_hash HAVING COUNT(*) > 1`,
    );

    const results: DuplicateDetectionResult[] = [];
    const seenPairs = new Set<string>();

    for (const { ids } of exactDupes) {
      const idList = ids.split(',');
      if (entryId && !idList.includes(entryId)) continue;
      const targets = entryId ? [entryId] : idList;
      for (const targetId of targets) {
        const matches: DuplicateCandidate[] = [];
        for (const otherId of idList) {
          if (otherId === targetId) continue;
          const pairKey = [targetId, otherId].sort().join('::');
          if (dismissed.has(pairKey) || seenPairs.has(pairKey)) continue;
          seenPairs.add(pairKey);
          const other = this.vault.get(otherId);
          if (!other) continue;
          matches.push({
            entryId: otherId,
            title: other.title,
            similarity: 1.0,
            suggestMerge: true,
          });
        }
        if (matches.length > 0) {
          results.push({ entryId: targetId, matches, scannedCount: idList.length - 1 });
        }
      }
    }

    // --- Phase 2: FTS5 fuzzy candidate matching ---
    // For each entry, use FTS5 MATCH to find top candidates, then TF-IDF cosine similarity.
    // Complexity is O(n * k) where k = FTS5 candidate limit (10), not O(n^2).
    const exactDupeEntryIds = new Set(results.map((r) => r.entryId));
    const targetEntries = entryId
      ? ([this.vault.get(entryId)].filter(Boolean) as IntelligenceEntry[])
      : this.listBatched();

    // Build vocabulary from all entries (batched)
    const allEntries = entryId ? this.listBatched() : targetEntries;
    const vocabulary = buildVocabulary(allEntries);

    for (const entry of targetEntries) {
      // Skip entries already fully handled by exact-hash matches
      if (exactDupeEntryIds.has(entry.id)) continue;

      // FTS5 candidate retrieval: find top-10 similar entries
      let candidates: IntelligenceEntry[];
      try {
        candidates = this.vault
          .search(entry.title, { domain: entry.domain, limit: 10 })
          .map((r) => r.entry)
          .filter((c) => c.id !== entry.id);
      } catch {
        candidates = [];
      }
      if (candidates.length === 0) continue;

      const entryVec = calculateTfIdf(tokenize(entryToText(entry)), vocabulary);
      const matches: DuplicateCandidate[] = [];

      for (const candidate of candidates) {
        // Skip cross-domain pairs
        if (entry.domain !== candidate.domain) continue;
        const pairKey = [entry.id, candidate.id].sort().join('::');
        if (dismissed.has(pairKey)) continue;

        const candidateVec = calculateTfIdf(tokenize(entryToText(candidate)), vocabulary);
        const similarity = cosineSimilarity(entryVec, candidateVec);
        if (similarity >= effectiveThreshold) {
          matches.push({
            entryId: candidate.id,
            title: candidate.title,
            similarity,
            suggestMerge: similarity >= MERGE_SUGGESTION_THRESHOLD,
          });
        }
      }

      if (matches.length > 0) {
        matches.sort((a, b) => b.similarity - a.similarity);
        results.push({ entryId: entry.id, matches, scannedCount: candidates.length });
      }
    }

    return results;
  }

  dismissDuplicate(entryIdA: string, entryIdB: string, reason?: string): { dismissed: boolean } {
    const [a, b] = [entryIdA, entryIdB].sort();
    const result = this.provider.run(
      'INSERT OR IGNORE INTO curator_duplicate_dismissals (entry_id_a, entry_id_b, reason) VALUES (?, ?, ?)',
      [a, b, reason ?? 'reviewed — not duplicate'],
    );
    return { dismissed: result.changes > 0 };
  }

  private getDismissedPairs(): Set<string> {
    const rows = this.provider.all<{ entry_id_a: string; entry_id_b: string }>(
      'SELECT entry_id_a, entry_id_b FROM curator_duplicate_dismissals',
    );
    return new Set(rows.map((r) => `${r.entry_id_a}::${r.entry_id_b}`));
  }

  // ─── Contradictions (delegates to contradiction-detector) ─────

  detectContradictions(threshold?: number): Contradiction[] {
    const searchFn = (title: string) =>
      this.vault.search(title, { type: 'pattern', limit: 20 }).map((r) => r.entry);
    // Load only anti-patterns and patterns (bounded by type), not the entire vault
    const antipatterns = this.vault.list({ type: 'anti-pattern', limit: 10000 });
    const patterns = this.vault.list({ type: 'pattern', limit: 10000 });
    const entries = [...antipatterns, ...patterns];
    return this.persistContradictions(findContradictions(entries, threshold, searchFn));
  }

  getContradictions(status?: ContradictionStatus): Contradiction[] {
    const query = status
      ? 'SELECT * FROM curator_contradictions WHERE status = ? ORDER BY similarity DESC'
      : 'SELECT * FROM curator_contradictions ORDER BY similarity DESC';
    return this.provider
      .all<Record<string, unknown>>(query, status ? [status] : undefined)
      .map((r) => this.rowToContradiction(r));
  }

  resolveContradiction(id: number, resolution: 'resolved' | 'dismissed'): Contradiction | null {
    this.provider.run(
      'UPDATE curator_contradictions SET status = ?, resolved_at = unixepoch() WHERE id = ?',
      [resolution, id],
    );
    const row = this.provider.get<Record<string, unknown>>(
      'SELECT * FROM curator_contradictions WHERE id = ?',
      [id],
    );
    return row ? this.rowToContradiction(row) : null;
  }

  async detectContradictionsHybrid(
    threshold?: number,
  ): Promise<{ contradictions: Contradiction[]; method: 'tfidf-only' }> {
    const searchFn = (title: string) =>
      this.vault.search(title, { type: 'pattern', limit: 20 }).map((r) => r.entry);
    // Load only anti-patterns and patterns (bounded by type), not the entire vault
    const antipatterns = this.vault.list({ type: 'anti-pattern', limit: 10000 });
    const patterns = this.vault.list({ type: 'pattern', limit: 10000 });
    const entries = [...antipatterns, ...patterns];
    return {
      contradictions: this.persistContradictions(findContradictions(entries, threshold, searchFn)),
      method: 'tfidf-only',
    };
  }

  // ─── Grooming ─────────────────────────────────────────────────

  groomEntry(entryId: string): GroomResult | null {
    const entry = this.vault.get(entryId);
    if (!entry) return null;
    const tagsNormalized = this.normalizeTags(entryId);
    const row = this.provider.get<{ updated_at: number }>(
      'SELECT updated_at FROM entries WHERE id = ?',
      [entryId],
    );
    const now = Math.floor(Date.now() / 1000);
    const stale = row ? now - row.updated_at > DEFAULT_STALE_DAYS * 86400 : false;
    const status = stale ? 'stale' : 'active';
    this.provider.run(
      `INSERT INTO curator_entry_state (entry_id, status, last_groomed_at) VALUES (?, ?, unixepoch()) ON CONFLICT(entry_id) DO UPDATE SET status = excluded.status, last_groomed_at = unixepoch()`,
      [entryId, status],
    );
    this.logChange('groom', entryId, null, `status=${status}`, 'Routine grooming');
    return { entryId, tagsNormalized, stale, lastGroomedAt: now };
  }

  groomAll(): GroomAllResult {
    const start = Date.now();
    let tagsNormalized = 0,
      staleCount = 0,
      totalEntries = 0;
    // Batch pagination — process entries in batches instead of loading all at once
    let offset = 0;
    while (true) {
      const batch = this.vault.list({ limit: DEFAULT_BATCH_SIZE, offset });
      if (batch.length === 0) break;
      totalEntries += batch.length;
      for (const entry of batch) {
        const result = this.groomEntry(entry.id);
        if (result) {
          tagsNormalized += result.tagsNormalized.filter((t) => t.wasAliased).length;
          if (result.stale) staleCount++;
        }
      }
      if (batch.length < DEFAULT_BATCH_SIZE) break;
      offset += DEFAULT_BATCH_SIZE;
    }
    return {
      totalEntries,
      groomedCount: totalEntries,
      tagsNormalized,
      staleCount,
      durationMs: Date.now() - start,
    };
  }

  // ─── Consolidation ───────────────────────────────────────────

  consolidate(options?: ConsolidationOptions): ConsolidationResult {
    const start = Date.now();
    const dryRun = options?.dryRun ?? true;
    const staleDaysThreshold = options?.staleDaysThreshold ?? DEFAULT_STALE_DAYS;
    const duplicateThreshold = options?.duplicateThreshold ?? DEFAULT_DUPLICATE_THRESHOLD;
    const contradictionThreshold =
      options?.contradictionThreshold ?? DEFAULT_CONTRADICTION_THRESHOLD;
    const duplicates = this.detectDuplicates(undefined, duplicateThreshold);
    const now = Math.floor(Date.now() / 1000);
    const staleRows = this.provider.all<{ id: string }>(
      'SELECT id FROM entries WHERE updated_at < ?',
      [now - staleDaysThreshold * 86400],
    );
    const staleEntries = staleRows.map((r) => r.id);
    const contradictions = this.detectContradictions(contradictionThreshold);
    let mutations = 0;
    if (!dryRun) {
      for (const entryId of staleEntries) {
        this.provider.run(
          `INSERT INTO curator_entry_state (entry_id, status, last_groomed_at) VALUES (?, 'archived', unixepoch()) ON CONFLICT(entry_id) DO UPDATE SET status = 'archived', last_groomed_at = unixepoch()`,
          [entryId],
        );
        this.logChange(
          'archive',
          entryId,
          'active',
          'archived',
          'Stale entry archived during consolidation',
        );
        mutations++;
      }
      const removed = new Set<string>();
      for (const result of duplicates) {
        for (const match of result.matches) {
          if (!removed.has(match.entryId) && match.entryId !== result.entryId) {
            this.vault.remove(match.entryId);
            this.logChange(
              'remove_duplicate',
              match.entryId,
              null,
              null,
              `Duplicate of ${result.entryId} (similarity: ${match.similarity.toFixed(3)})`,
            );
            removed.add(match.entryId);
            mutations++;
          }
        }
      }
    }
    return {
      dryRun,
      duplicates,
      staleEntries,
      contradictions,
      mutations,
      durationMs: Date.now() - start,
    };
  }

  // ─── Changelog ────────────────────────────────────────────────

  getEntryHistory(entryId: string, limit?: number): ChangelogEntry[] {
    return this.provider
      .all<Record<string, unknown>>(
        'SELECT * FROM curator_changelog WHERE entry_id = ? ORDER BY created_at DESC, id DESC LIMIT ?',
        [entryId, limit ?? 50],
      )
      .map((r) => this.rowToChangelog(r));
  }

  // ─── Health Audit (delegates to health-audit) ─────────────────

  healthAudit(): HealthAuditResult {
    // Load entries in batches instead of all at once
    const entries = this.listBatched();
    const dataProvider: HealthDataProvider = {
      getStaleCount: (threshold) =>
        (
          this.provider.get<{ count: number }>(
            'SELECT COUNT(*) as count FROM entries WHERE updated_at < ?',
            [threshold],
          ) ?? { count: 0 }
        ).count,
      getGroomedCount: () =>
        (
          this.provider.get<{ count: number }>(
            'SELECT COUNT(*) as count FROM curator_entry_state WHERE last_groomed_at IS NOT NULL',
          ) ?? { count: 0 }
        ).count,
      getDuplicates: () => this.detectDuplicates(),
      getOpenContradictions: () => this.getContradictions('open'),
    };
    return computeHealthAudit(entries, dataProvider, DEFAULT_STALE_DAYS);
  }

  // ─── Entry History (Version Snapshots) ────────────────────────

  recordSnapshot(
    entryId: string,
    changedBy?: string,
    changeReason?: string,
  ): { recorded: boolean; historyId: number } {
    const entry = this.vault.get(entryId);
    if (!entry) return { recorded: false, historyId: -1 };
    const result = this.provider.run(
      'INSERT INTO curator_entry_history (entry_id, snapshot, changed_by, change_reason, created_at) VALUES (?, ?, ?, ?, unixepoch())',
      [entryId, JSON.stringify(entry), changedBy ?? 'system', changeReason ?? null],
    );
    return { recorded: true, historyId: Number(result.lastInsertRowid) };
  }

  getVersionHistory(entryId: string): Array<{
    historyId: number;
    entryId: string;
    snapshot: IntelligenceEntry;
    changedBy: string;
    changeReason: string | null;
    createdAt: number;
  }> {
    return this.provider
      .all<Record<string, unknown>>(
        'SELECT * FROM curator_entry_history WHERE entry_id = ? ORDER BY created_at ASC, id ASC',
        [entryId],
      )
      .map((row) => ({
        historyId: row.id as number,
        entryId: row.entry_id as string,
        snapshot: JSON.parse(row.snapshot as string) as IntelligenceEntry,
        changedBy: row.changed_by as string,
        changeReason: (row.change_reason as string) ?? null,
        createdAt: row.created_at as number,
      }));
  }

  // ─── Queue Stats ─────────────────────────────────────────────

  getQueueStats(): {
    totalEntries: number;
    groomedEntries: number;
    ungroomedEntries: number;
    staleEntries: number;
    freshEntries: number;
    avgDaysSinceGroom: number;
  } {
    const p = this.provider;
    const totalEntries = (
      p.get<{ count: number }>('SELECT COUNT(*) as count FROM entries') ?? { count: 0 }
    ).count;
    const groomedEntries = (
      p.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM curator_entry_state WHERE last_groomed_at IS NOT NULL',
      ) ?? { count: 0 }
    ).count;
    const now = Math.floor(Date.now() / 1000);
    const staleEntries = (
      p.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM curator_entry_state WHERE last_groomed_at IS NOT NULL AND last_groomed_at < ?',
        [now - 30 * 86400],
      ) ?? { count: 0 }
    ).count;
    const freshEntries = (
      p.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM curator_entry_state WHERE last_groomed_at IS NOT NULL AND last_groomed_at >= ?',
        [now - 7 * 86400],
      ) ?? { count: 0 }
    ).count;
    let avgDaysSinceGroom = 0;
    if (groomedEntries > 0) {
      const totalSeconds =
        (
          p.get<{ total: number | null }>(
            'SELECT SUM(? - last_groomed_at) as total FROM curator_entry_state WHERE last_groomed_at IS NOT NULL',
            [now],
          ) ?? { total: 0 }
        ).total ?? 0;
      avgDaysSinceGroom = Math.round((totalSeconds / groomedEntries / 86400) * 100) / 100;
    }
    return {
      totalEntries,
      groomedEntries,
      ungroomedEntries: totalEntries - groomedEntries,
      staleEntries,
      freshEntries,
      avgDaysSinceGroom,
    };
  }

  // ─── Metadata Enrichment (delegates to metadata-enricher) ────

  enrichMetadata(entryId: string): {
    enriched: boolean;
    changes: Array<{ field: string; before: string; after: string }>;
  } {
    const entry = this.vault.get(entryId);
    if (!entry) return { enriched: false, changes: [] };
    const { changes, updates } = enrichEntryMetadata(entry);
    if (changes.length === 0) return { enriched: false, changes: [] };
    this.vault.update(entryId, updates);
    this.recordSnapshot(entryId, 'curator', 'Metadata enrichment');
    this.logChange(
      'enrich_metadata',
      entryId,
      JSON.stringify(changes.map((c) => c.field)),
      JSON.stringify(changes.map((c) => c.after)),
      'Rule-based metadata enrichment',
    );
    return { enriched: true, changes };
  }

  // ─── Private Helpers ──────────────────────────────────────────

  /**
   * Load all vault entries using batched pagination instead of a single 100k query.
   */
  private listBatched(batchSize: number = DEFAULT_BATCH_SIZE): IntelligenceEntry[] {
    const all: IntelligenceEntry[] = [];
    let offset = 0;
    while (true) {
      const batch = this.vault.list({ limit: batchSize, offset });
      if (batch.length === 0) break;
      all.push(...batch);
      if (batch.length < batchSize) break;
      offset += batchSize;
    }
    return all;
  }

  private persistContradictions(candidates: ContradictionCandidate[]): Contradiction[] {
    const detected: Contradiction[] = [];
    for (const c of candidates) {
      const result = this.provider.run(
        'INSERT OR IGNORE INTO curator_contradictions (pattern_id, antipattern_id, similarity) VALUES (?, ?, ?)',
        [c.patternId, c.antipatternId, c.similarity],
      );
      if (result.changes > 0) {
        const row = this.provider.get<Record<string, unknown>>(
          'SELECT * FROM curator_contradictions WHERE pattern_id = ? AND antipattern_id = ?',
          [c.patternId, c.antipatternId],
        );
        if (row) detected.push(this.rowToContradiction(row));
      }
    }
    return detected;
  }

  private logChange(
    action: string,
    entryId: string,
    beforeValue: string | null,
    afterValue: string | null,
    reason: string,
  ): void {
    this.provider.run(
      'INSERT INTO curator_changelog (action, entry_id, before_value, after_value, reason) VALUES (?, ?, ?, ?, ?)',
      [action, entryId, beforeValue, afterValue, reason],
    );
  }

  private rowToContradiction(row: Record<string, unknown>): Contradiction {
    return {
      id: row.id as number,
      patternId: row.pattern_id as string,
      antipatternId: row.antipattern_id as string,
      similarity: row.similarity as number,
      status: row.status as ContradictionStatus,
      createdAt: row.created_at as number,
      resolvedAt: (row.resolved_at as number) ?? null,
    };
  }

  private rowToChangelog(row: Record<string, unknown>): ChangelogEntry {
    return {
      id: row.id as number,
      action: row.action as string,
      entryId: row.entry_id as string,
      beforeValue: (row.before_value as string) ?? null,
      afterValue: (row.after_value as string) ?? null,
      reason: row.reason as string,
      createdAt: row.created_at as number,
    };
  }
}
