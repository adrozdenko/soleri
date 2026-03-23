import type { Vault } from '../vault/vault.js';
import type { IntelligenceEntry } from '../intelligence/types.js';
import type { PersistenceProvider } from '../persistence/types.js';
import type {
  CuratorStatus,
  TagNormalizationResult,
  CanonicalTag,
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
  detectDuplicates as detectDuplicatesPure,
  DEFAULT_DUPLICATE_THRESHOLD,
} from './duplicate-detector.js';
import {
  findContradictions,
  DEFAULT_CONTRADICTION_THRESHOLD,
  type ContradictionCandidate,
} from './contradiction-detector.js';
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
    return detectDuplicatesPure(this.vault.list({ limit: 100000 }), entryId, threshold);
  }

  // ─── Contradictions (delegates to contradiction-detector) ─────

  detectContradictions(threshold?: number): Contradiction[] {
    const searchFn = (title: string) =>
      this.vault.search(title, { type: 'pattern', limit: 20 }).map((r) => r.entry);
    return this.persistContradictions(
      findContradictions(this.vault.list({ limit: 100000 }), threshold, searchFn),
    );
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
    return {
      contradictions: this.persistContradictions(
        findContradictions(this.vault.list({ limit: 100000 }), threshold, searchFn),
      ),
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
    const entries = this.vault.list({ limit: 100000 });
    let tagsNormalized = 0,
      staleCount = 0;
    for (const entry of entries) {
      const result = this.groomEntry(entry.id);
      if (result) {
        tagsNormalized += result.tagsNormalized.filter((t) => t.wasAliased).length;
        if (result.stale) staleCount++;
      }
    }
    return {
      totalEntries: entries.length,
      groomedCount: entries.length,
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
    const entries = this.vault.list({ limit: 100000 });
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
