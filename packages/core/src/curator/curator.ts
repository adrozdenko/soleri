import type { Vault } from '../vault/vault.js';
import type { IntelligenceEntry } from '../intelligence/types.js';
import type { PersistenceProvider } from '../persistence/types.js';
import {
  tokenize,
  calculateTfIdf,
  cosineSimilarity,
  type SparseVector,
} from '../text/similarity.js';
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

// ─── Constants ──────────────────────────────────────────────────────

const DEFAULT_DUPLICATE_THRESHOLD = 0.45;
const MERGE_SUGGESTION_THRESHOLD = 0.65;
const DEFAULT_CONTRADICTION_THRESHOLD = 0.4;
const DEFAULT_STALE_DAYS = 90;

const DEFAULT_TAG_ALIASES: Array<[string, string]> = [
  ['a11y', 'accessibility'],
  ['ts', 'typescript'],
  ['js', 'javascript'],
  ['css', 'styling'],
  ['tailwind', 'styling'],
  ['tw', 'styling'],
  ['vitest', 'testing'],
  ['jest', 'testing'],
  ['perf', 'performance'],
  ['sec', 'security'],
  ['auth', 'authentication'],
  ['i18n', 'internationalization'],
  ['l10n', 'localization'],
];

// ─── Curator Class ──────────────────────────────────────────────────

export class Curator {
  private vault: Vault;
  private provider: PersistenceProvider;

  constructor(vault: Vault) {
    this.vault = vault;
    this.provider = vault.getProvider();
    this.initializeTables();
    this.seedDefaultAliases();
  }

  // ─── Schema ─────────────────────────────────────────────────────

  private initializeTables(): void {
    this.provider.execSql(`
      CREATE TABLE IF NOT EXISTS curator_entry_state (
        entry_id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'stale', 'archived')),
        confidence REAL NOT NULL DEFAULT 1.0,
        source TEXT NOT NULL DEFAULT 'unknown' CHECK(source IN ('manual', 'capture', 'seed', 'unknown')),
        last_groomed_at INTEGER,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );

      CREATE TABLE IF NOT EXISTS curator_tag_canonical (
        tag TEXT PRIMARY KEY,
        description TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );

      CREATE TABLE IF NOT EXISTS curator_tag_alias (
        alias TEXT PRIMARY KEY,
        canonical TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY (canonical) REFERENCES curator_tag_canonical(tag)
      );

      CREATE TABLE IF NOT EXISTS curator_changelog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        entry_id TEXT NOT NULL,
        before_value TEXT,
        after_value TEXT,
        reason TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );

      CREATE TABLE IF NOT EXISTS curator_entry_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_id TEXT NOT NULL,
        snapshot TEXT NOT NULL,
        changed_by TEXT DEFAULT 'system',
        change_reason TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );

      CREATE TABLE IF NOT EXISTS curator_contradictions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern_id TEXT NOT NULL,
        antipattern_id TEXT NOT NULL,
        similarity REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'resolved', 'dismissed')),
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        resolved_at INTEGER,
        UNIQUE(pattern_id, antipattern_id)
      );
      CREATE INDEX IF NOT EXISTS idx_curator_state_status ON curator_entry_state(status);
      CREATE INDEX IF NOT EXISTS idx_curator_changelog_entry ON curator_changelog(entry_id);
    `);
  }

  private seedDefaultAliases(): void {
    this.provider.transaction(() => {
      const canonicals = new Set(DEFAULT_TAG_ALIASES.map(([, c]) => c));
      for (const tag of canonicals) {
        this.provider.run('INSERT OR IGNORE INTO curator_tag_canonical (tag) VALUES (?)', [tag]);
      }
      for (const [alias, canonical] of DEFAULT_TAG_ALIASES) {
        this.provider.run(
          'INSERT OR IGNORE INTO curator_tag_alias (alias, canonical) VALUES (?, ?)',
          [alias, canonical],
        );
      }
    });
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

  // ─── Tag Normalization ──────────────────────────────────────────

  normalizeTag(tag: string): TagNormalizationResult {
    const lower = tag.toLowerCase().trim();
    const row = this.provider.get<{ canonical: string }>(
      'SELECT canonical FROM curator_tag_alias WHERE alias = ?',
      [lower],
    );
    if (row) {
      return { original: tag, normalized: row.canonical, wasAliased: true };
    }
    return { original: tag, normalized: lower, wasAliased: false };
  }

  normalizeTags(entryId: string): TagNormalizationResult[] {
    const entry = this.vault.get(entryId);
    if (!entry) return [];

    const results: TagNormalizationResult[] = [];
    const normalizedTags: string[] = [];
    let changed = false;

    for (const tag of entry.tags) {
      const result = this.normalizeTag(tag);
      results.push(result);
      normalizedTags.push(result.normalized);
      if (result.normalized !== tag) changed = true;
    }

    if (changed) {
      const dedupedTags = [...new Set(normalizedTags)];
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
    const lower = alias.toLowerCase().trim();
    const canonicalLower = canonical.toLowerCase().trim();
    this.provider.run('INSERT OR IGNORE INTO curator_tag_canonical (tag) VALUES (?)', [
      canonicalLower,
    ]);
    this.provider.run('INSERT OR REPLACE INTO curator_tag_alias (alias, canonical) VALUES (?, ?)', [
      lower,
      canonicalLower,
    ]);
  }

  getCanonicalTags(): CanonicalTag[] {
    const rows = this.provider.all<{
      tag: string;
      description: string | null;
      alias_count: number;
    }>(
      `SELECT c.tag, c.description,
        (SELECT COUNT(*) FROM curator_tag_alias a WHERE a.canonical = c.tag) as alias_count
      FROM curator_tag_canonical c
      ORDER BY c.tag`,
    );

    return rows.map((row) => ({
      tag: row.tag,
      description: row.description,
      usageCount: this.countTagUsage(row.tag),
      aliasCount: row.alias_count,
    }));
  }

  private countTagUsage(tag: string): number {
    const row = this.provider.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM entries WHERE tags LIKE ?',
      [`%"${tag}"%`],
    );
    return row?.count ?? 0;
  }

  // ─── Duplicate Detection ────────────────────────────────────────

  detectDuplicates(entryId?: string, threshold?: number): DuplicateDetectionResult[] {
    const effectiveThreshold = threshold ?? DEFAULT_DUPLICATE_THRESHOLD;
    const entries = this.vault.list({ limit: 100000 });
    if (entries.length === 0) return [];

    // Build transient vocabulary
    const vocabulary = this.buildVocabulary(entries);

    // Build vectors for all entries
    const vectors = new Map<string, SparseVector>();
    for (const entry of entries) {
      const text = [entry.title, entry.description, entry.context ?? '', entry.tags.join(' ')].join(
        ' ',
      );
      vectors.set(entry.id, calculateTfIdf(tokenize(text), vocabulary));
    }

    const targetEntries = entryId ? entries.filter((e) => e.id === entryId) : entries;

    const results: DuplicateDetectionResult[] = [];

    for (const entry of targetEntries) {
      const entryVec = vectors.get(entry.id)!;
      const matches: DuplicateCandidate[] = [];

      for (const other of entries) {
        if (other.id === entry.id) continue;
        // Skip cross-domain pairs — shared vocabulary across domains causes false positives
        if (entry.domain !== other.domain) continue;
        const otherVec = vectors.get(other.id)!;
        const similarity = cosineSimilarity(entryVec, otherVec);
        if (similarity >= effectiveThreshold) {
          matches.push({
            entryId: other.id,
            title: other.title,
            similarity,
            suggestMerge: similarity >= MERGE_SUGGESTION_THRESHOLD,
          });
        }
      }

      if (matches.length > 0) {
        matches.sort((a, b) => b.similarity - a.similarity);
        results.push({
          entryId: entry.id,
          matches,
          scannedCount: entries.length - 1,
        });
      }
    }

    return results;
  }

  // ─── Contradictions ─────────────────────────────────────────────

  detectContradictions(threshold?: number): Contradiction[] {
    const effectiveThreshold = threshold ?? DEFAULT_CONTRADICTION_THRESHOLD;
    const entries = this.vault.list({ limit: 100000 });
    const antipatterns = entries.filter((e) => e.type === 'anti-pattern');
    const patterns = entries.filter((e) => e.type === 'pattern');

    if (antipatterns.length === 0 || patterns.length === 0) return [];

    const vocabulary = this.buildVocabulary(entries);
    const detected: Contradiction[] = [];

    for (const ap of antipatterns) {
      // Stage 1: FTS5 candidate retrieval (fall back to all patterns if FTS returns empty)
      let candidates: IntelligenceEntry[];
      try {
        const searchResults = this.vault.search(ap.title, { type: 'pattern', limit: 20 });
        candidates = searchResults.length > 0 ? searchResults.map((r) => r.entry) : patterns;
      } catch {
        candidates = patterns;
      }

      // Stage 2: TF-IDF cosine similarity
      const apText = [ap.title, ap.description, ap.context ?? ''].join(' ');
      const apVec = calculateTfIdf(tokenize(apText), vocabulary);

      for (const pattern of candidates) {
        const pText = [pattern.title, pattern.description, pattern.context ?? ''].join(' ');
        const pVec = calculateTfIdf(tokenize(pText), vocabulary);
        const similarity = cosineSimilarity(apVec, pVec);

        if (similarity >= effectiveThreshold) {
          const result = this.provider.run(
            'INSERT OR IGNORE INTO curator_contradictions (pattern_id, antipattern_id, similarity) VALUES (?, ?, ?)',
            [pattern.id, ap.id, similarity],
          );
          if (result.changes > 0) {
            const row = this.provider.get<Record<string, unknown>>(
              'SELECT * FROM curator_contradictions WHERE pattern_id = ? AND antipattern_id = ?',
              [pattern.id, ap.id],
            );
            if (row) detected.push(this.rowToContradiction(row));
          }
        }
      }
    }

    return detected;
  }

  getContradictions(status?: ContradictionStatus): Contradiction[] {
    const query = status
      ? 'SELECT * FROM curator_contradictions WHERE status = ? ORDER BY similarity DESC'
      : 'SELECT * FROM curator_contradictions ORDER BY similarity DESC';
    const rows = this.provider.all<Record<string, unknown>>(query, status ? [status] : undefined);
    return rows.map((r) => this.rowToContradiction(r));
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

  async detectContradictionsHybrid(threshold?: number): Promise<{
    contradictions: Contradiction[];
    method: 'tfidf-only';
  }> {
    const effectiveThreshold = threshold ?? DEFAULT_CONTRADICTION_THRESHOLD;
    const entries = this.vault.list({ limit: 100000 });
    const antipatterns = entries.filter((e) => e.type === 'anti-pattern');
    const patterns = entries.filter((e) => e.type === 'pattern');

    if (antipatterns.length === 0 || patterns.length === 0) {
      return { contradictions: [], method: 'tfidf-only' };
    }

    const vocabulary = this.buildVocabulary(entries);
    const detected: Contradiction[] = [];

    for (const ap of antipatterns) {
      let candidates: IntelligenceEntry[];
      try {
        const searchResults = this.vault.search(ap.title, { type: 'pattern', limit: 20 });
        candidates = searchResults.length > 0 ? searchResults.map((r) => r.entry) : patterns;
      } catch {
        candidates = patterns;
      }

      const apText = [ap.title, ap.description, ap.context ?? ''].join(' ');
      const apVec = calculateTfIdf(tokenize(apText), vocabulary);

      for (const pattern of candidates) {
        const pText = [pattern.title, pattern.description, pattern.context ?? ''].join(' ');
        const pVec = calculateTfIdf(tokenize(pText), vocabulary);
        const finalScore = cosineSimilarity(apVec, pVec);

        if (finalScore >= effectiveThreshold) {
          const result = this.provider.run(
            'INSERT OR IGNORE INTO curator_contradictions (pattern_id, antipattern_id, similarity) VALUES (?, ?, ?)',
            [pattern.id, ap.id, finalScore],
          );
          if (result.changes > 0) {
            const row = this.provider.get<Record<string, unknown>>(
              'SELECT * FROM curator_contradictions WHERE pattern_id = ? AND antipattern_id = ?',
              [pattern.id, ap.id],
            );
            if (row) detected.push(this.rowToContradiction(row));
          }
        }
      }
    }

    return {
      contradictions: detected,
      method: 'tfidf-only',
    };
  }

  // ─── Grooming ───────────────────────────────────────────────────

  groomEntry(entryId: string): GroomResult | null {
    const entry = this.vault.get(entryId);
    if (!entry) return null;

    const tagsNormalized = this.normalizeTags(entryId);

    // Check staleness based on entry's updated_at timestamp
    const row = this.provider.get<{ updated_at: number }>(
      'SELECT updated_at FROM entries WHERE id = ?',
      [entryId],
    );
    const now = Math.floor(Date.now() / 1000);
    const stale = row ? now - row.updated_at > DEFAULT_STALE_DAYS * 86400 : false;

    const status = stale ? 'stale' : 'active';

    // Upsert entry state
    this.provider.run(
      `INSERT INTO curator_entry_state (entry_id, status, last_groomed_at)
       VALUES (?, ?, unixepoch())
       ON CONFLICT(entry_id) DO UPDATE SET status = excluded.status, last_groomed_at = unixepoch()`,
      [entryId, status],
    );

    this.logChange('groom', entryId, null, `status=${status}`, 'Routine grooming');

    return {
      entryId,
      tagsNormalized,
      stale,
      lastGroomedAt: now,
    };
  }

  groomAll(): GroomAllResult {
    const start = Date.now();
    const entries = this.vault.list({ limit: 100000 });
    let tagsNormalized = 0;
    let staleCount = 0;

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

  // ─── Consolidation ─────────────────────────────────────────────

  consolidate(options?: ConsolidationOptions): ConsolidationResult {
    const start = Date.now();
    const dryRun = options?.dryRun ?? true;
    const staleDaysThreshold = options?.staleDaysThreshold ?? DEFAULT_STALE_DAYS;
    const duplicateThreshold = options?.duplicateThreshold ?? DEFAULT_DUPLICATE_THRESHOLD;
    const contradictionThreshold =
      options?.contradictionThreshold ?? DEFAULT_CONTRADICTION_THRESHOLD;

    // Detect duplicates
    const duplicates = this.detectDuplicates(undefined, duplicateThreshold);

    // Detect stale entries
    const now = Math.floor(Date.now() / 1000);
    const staleThreshold = now - staleDaysThreshold * 86400;
    const staleRows = this.provider.all<{ id: string }>(
      'SELECT id FROM entries WHERE updated_at < ?',
      [staleThreshold],
    );
    const staleEntries = staleRows.map((r) => r.id);

    // Detect contradictions
    const contradictions = this.detectContradictions(contradictionThreshold);

    let mutations = 0;

    if (!dryRun) {
      // Archive stale entries
      for (const entryId of staleEntries) {
        this.provider.run(
          `INSERT INTO curator_entry_state (entry_id, status, last_groomed_at)
           VALUES (?, 'archived', unixepoch())
           ON CONFLICT(entry_id) DO UPDATE SET status = 'archived', last_groomed_at = unixepoch()`,
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

      // Remove lower-similarity duplicates (keep the first entry, remove matches)
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

  // ─── Changelog ──────────────────────────────────────────────────

  getEntryHistory(entryId: string, limit?: number): ChangelogEntry[] {
    const rows = this.provider.all<Record<string, unknown>>(
      'SELECT * FROM curator_changelog WHERE entry_id = ? ORDER BY created_at DESC, id DESC LIMIT ?',
      [entryId, limit ?? 50],
    );
    return rows.map((r) => this.rowToChangelog(r));
  }

  // ─── Health Audit ───────────────────────────────────────────────

  healthAudit(): HealthAuditResult {
    const entries = this.vault.list({ limit: 100000 });
    const recommendations: string[] = [];

    if (entries.length === 0) {
      return {
        score: 100,
        metrics: { coverage: 1, freshness: 1, quality: 1, tagHealth: 1 },
        recommendations: ['Vault is empty — add knowledge entries to get started.'],
      };
    }

    let score = 100;

    // Coverage: penalize if no anti-patterns or no patterns
    const typeCount: Record<string, number> = { pattern: 0, 'anti-pattern': 0, rule: 0 };
    for (const e of entries) {
      typeCount[e.type] = (typeCount[e.type] ?? 0) + 1;
    }
    const hasPatterns = typeCount.pattern > 0;
    const hasAntiPatterns = typeCount['anti-pattern'] > 0;
    const hasRules = typeCount.rule > 0;
    let coverageScore = 1;
    if (!hasPatterns) {
      score -= 10;
      coverageScore -= 0.33;
      recommendations.push('No patterns found — add patterns to improve coverage.');
    }
    if (!hasAntiPatterns) {
      score -= 5;
      coverageScore -= 0.17;
      recommendations.push('No anti-patterns found — add anti-patterns to detect contradictions.');
    }
    if (!hasRules) {
      score -= 5;
      coverageScore -= 0.17;
      recommendations.push('No rules found — add rules for completeness.');
    }
    coverageScore = Math.max(0, coverageScore);

    // Freshness: penalize stale entries
    const now = Math.floor(Date.now() / 1000);
    const staleThreshold = now - DEFAULT_STALE_DAYS * 86400;
    const staleCount = (
      this.provider.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM entries WHERE updated_at < ?',
        [staleThreshold],
      ) ?? { count: 0 }
    ).count;
    const staleRatio = staleCount / entries.length;
    const freshnessScore = 1 - staleRatio;
    if (staleRatio > 0.3) {
      const penalty = Math.min(20, Math.round(staleRatio * 30));
      score -= penalty;
      recommendations.push(
        `${staleCount} stale entries (${Math.round(staleRatio * 100)}%) — run grooming to update.`,
      );
    }

    // Quality: penalize duplicates and contradictions
    const duplicates = this.detectDuplicates();
    const contradictions = this.getContradictions('open');
    let qualityScore = 1;
    if (duplicates.length > 0) {
      const penalty = Math.min(15, duplicates.length * 3);
      score -= penalty;
      qualityScore -= penalty / 30;
      recommendations.push(`${duplicates.length} entries have duplicates — run consolidation.`);
    }
    if (contradictions.length > 0) {
      const penalty = Math.min(15, contradictions.length * 5);
      score -= penalty;
      qualityScore -= penalty / 30;
      recommendations.push(`${contradictions.length} open contradictions — resolve or dismiss.`);
    }
    qualityScore = Math.max(0, qualityScore);

    // Tag health: penalize entries with few or no tags
    const lowTagEntries = entries.filter((e) => e.tags.length < 2);
    const lowTagRatio = lowTagEntries.length / entries.length;
    const tagHealthScore = 1 - lowTagRatio;
    if (lowTagRatio > 0.3) {
      const penalty = Math.min(10, Math.round(lowTagRatio * 15));
      score -= penalty;
      recommendations.push(
        `${lowTagEntries.length} entries have fewer than 2 tags — improve tagging.`,
      );
    }

    // Penalize ungroomed entries
    const groomedCount = (
      this.provider.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM curator_entry_state WHERE last_groomed_at IS NOT NULL',
      ) ?? { count: 0 }
    ).count;
    if (groomedCount < entries.length) {
      const ungroomed = entries.length - groomedCount;
      const penalty = Math.min(10, Math.round((ungroomed / entries.length) * 10));
      score -= penalty;
      recommendations.push(`${ungroomed} entries never groomed — run groomAll().`);
    }

    score = Math.max(0, score);

    if (recommendations.length === 0) {
      recommendations.push('Vault is healthy — no issues detected.');
    }

    return {
      score,
      metrics: {
        coverage: coverageScore,
        freshness: freshnessScore,
        quality: qualityScore,
        tagHealth: tagHealthScore,
      },
      recommendations,
    };
  }

  // ─── Entry History (Version Snapshots) ─────────────────────────

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
    const rows = this.provider.all<Record<string, unknown>>(
      'SELECT * FROM curator_entry_history WHERE entry_id = ? ORDER BY created_at ASC, id ASC',
      [entryId],
    );

    return rows.map((row) => ({
      historyId: row.id as number,
      entryId: row.entry_id as string,
      snapshot: JSON.parse(row.snapshot as string) as IntelligenceEntry,
      changedBy: row.changed_by as string,
      changeReason: (row.change_reason as string) ?? null,
      createdAt: row.created_at as number,
    }));
  }

  // ─── Queue Stats ──────────────────────────────────────────────

  getQueueStats(): {
    totalEntries: number;
    groomedEntries: number;
    ungroomedEntries: number;
    staleEntries: number;
    freshEntries: number;
    avgDaysSinceGroom: number;
  } {
    const totalEntries = (
      this.provider.get<{ count: number }>('SELECT COUNT(*) as count FROM entries') ?? { count: 0 }
    ).count;

    const groomedEntries = (
      this.provider.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM curator_entry_state WHERE last_groomed_at IS NOT NULL',
      ) ?? { count: 0 }
    ).count;

    const ungroomedEntries = totalEntries - groomedEntries;

    const now = Math.floor(Date.now() / 1000);
    const staleThreshold = now - 30 * 86400;
    const freshThreshold = now - 7 * 86400;

    const staleEntries = (
      this.provider.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM curator_entry_state WHERE last_groomed_at IS NOT NULL AND last_groomed_at < ?',
        [staleThreshold],
      ) ?? { count: 0 }
    ).count;

    const freshEntries = (
      this.provider.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM curator_entry_state WHERE last_groomed_at IS NOT NULL AND last_groomed_at >= ?',
        [freshThreshold],
      ) ?? { count: 0 }
    ).count;

    let avgDaysSinceGroom = 0;
    if (groomedEntries > 0) {
      const sumRow = this.provider.get<{ total: number | null }>(
        'SELECT SUM(? - last_groomed_at) as total FROM curator_entry_state WHERE last_groomed_at IS NOT NULL',
        [now],
      ) ?? { total: 0 };
      const totalSeconds = sumRow.total ?? 0;
      avgDaysSinceGroom = Math.round((totalSeconds / groomedEntries / 86400) * 100) / 100;
    }

    return {
      totalEntries,
      groomedEntries,
      ungroomedEntries,
      staleEntries,
      freshEntries,
      avgDaysSinceGroom,
    };
  }

  // ─── Metadata Enrichment ──────────────────────────────────────

  enrichMetadata(entryId: string): {
    enriched: boolean;
    changes: Array<{ field: string; before: string; after: string }>;
  } {
    const entry = this.vault.get(entryId);
    if (!entry) return { enriched: false, changes: [] };

    const changes: Array<{ field: string; before: string; after: string }> = [];
    const updates: Partial<
      Pick<IntelligenceEntry, 'title' | 'description' | 'tags' | 'severity' | 'type'>
    > = {};

    // Auto-capitalize title
    if (entry.title.length > 0 && entry.title[0] !== entry.title[0].toUpperCase()) {
      const capitalized = entry.title[0].toUpperCase() + entry.title.slice(1);
      changes.push({ field: 'title', before: entry.title, after: capitalized });
      updates.title = capitalized;
    }

    // Normalize tags: lowercase, trim, dedup
    const normalizedTags = [...new Set(entry.tags.map((t) => t.toLowerCase().trim()))];
    const tagsChanged =
      normalizedTags.length !== entry.tags.length ||
      normalizedTags.some((t, i) => t !== entry.tags[i]);
    if (tagsChanged) {
      changes.push({
        field: 'tags',
        before: JSON.stringify(entry.tags),
        after: JSON.stringify(normalizedTags),
      });
      updates.tags = normalizedTags;
    }

    // Infer severity from keywords if currently 'suggestion'
    if (entry.severity === 'suggestion') {
      const text = (entry.title + ' ' + entry.description).toLowerCase();
      const criticalKeywords = ['never', 'must not', 'critical', 'security', 'vulnerability'];
      const warningKeywords = ['avoid', 'should not', 'deprecated', 'careful', 'warning'];
      if (criticalKeywords.some((k) => text.includes(k))) {
        changes.push({ field: 'severity', before: entry.severity, after: 'critical' });
        updates.severity = 'critical';
      } else if (warningKeywords.some((k) => text.includes(k))) {
        changes.push({ field: 'severity', before: entry.severity, after: 'warning' });
        updates.severity = 'warning';
      }
    }

    // Infer type from title patterns
    if (entry.type === 'pattern') {
      const titleLower = entry.title.toLowerCase();
      if (
        titleLower.startsWith('avoid') ||
        titleLower.startsWith('never') ||
        titleLower.startsWith("don't") ||
        titleLower.startsWith('do not')
      ) {
        changes.push({ field: 'type', before: entry.type, after: 'anti-pattern' });
        updates.type = 'anti-pattern';
      }
    }

    // Trim whitespace from description
    const trimmed = entry.description.trim();
    if (trimmed !== entry.description) {
      changes.push({ field: 'description', before: entry.description, after: trimmed });
      updates.description = trimmed;
    }

    if (changes.length === 0) {
      return { enriched: false, changes: [] };
    }

    // Apply updates
    this.vault.update(entryId, updates);

    // Record snapshot
    this.recordSnapshot(entryId, 'curator', 'Metadata enrichment');

    // Log change
    this.logChange(
      'enrich_metadata',
      entryId,
      JSON.stringify(changes.map((c) => c.field)),
      JSON.stringify(changes.map((c) => c.after)),
      'Rule-based metadata enrichment',
    );

    return { enriched: true, changes };
  }

  // ─── Private Helpers ────────────────────────────────────────────

  private buildVocabulary(entries: IntelligenceEntry[]): Map<string, number> {
    const docCount = entries.length;
    const termDocFreq = new Map<string, number>();
    for (const entry of entries) {
      const text = [entry.title, entry.description, entry.context ?? '', entry.tags.join(' ')].join(
        ' ',
      );
      const tokens = new Set(tokenize(text));
      for (const token of tokens) {
        termDocFreq.set(token, (termDocFreq.get(token) ?? 0) + 1);
      }
    }
    const vocabulary = new Map<string, number>();
    for (const [term, df] of termDocFreq) {
      const idf = Math.log((docCount + 1) / (df + 1)) + 1;
      vocabulary.set(term, idf);
    }
    return vocabulary;
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
