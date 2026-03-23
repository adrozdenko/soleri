/**
 * LinkManager — Zettelkasten bidirectional linking for vault entries.
 *
 * Provides typed links between entries (supports, contradicts, extends, sequences),
 * backlink traversal, graph walking, orphan detection, and link suggestions via FTS5.
 *
 * Ported from Salvador MCP with improvements:
 * - Uses PersistenceProvider (not raw SQLite) for backend abstraction
 * - Uses FTS5 for suggest_links (Salvador used TF-IDF cosine similarity)
 * - Graceful degradation — all methods return empty on table-not-found
 */

import type { PersistenceProvider } from '../persistence/types.js';
import type {
  VaultLink,
  VaultLinkRow,
  LinkType,
  LinkedEntry,
  LinkSuggestion,
} from './vault-types.js';

// ── Stop words for keyword extraction ─────────────────────────────────
const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'this',
  'that',
  'are',
  'was',
  'not',
  'but',
  'have',
  'has',
  'use',
  'can',
  'will',
  'all',
  'each',
  'than',
  'its',
  'more',
  'when',
  'into',
  'also',
  'any',
  'may',
  'only',
  'should',
  'which',
]);

export class LinkManager {
  private initialized = false;

  constructor(private provider: PersistenceProvider) {
    this.ensureTable();
  }

  // ── Schema ──────────────────────────────────────────────────────────

  private ensureTable(): void {
    if (this.initialized) return;
    try {
      this.provider.execSql(`
        CREATE TABLE IF NOT EXISTS vault_links (
          source_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
          target_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
          link_type TEXT NOT NULL CHECK(link_type IN ('supports', 'contradicts', 'extends', 'sequences')),
          note TEXT,
          created_at INTEGER NOT NULL,
          PRIMARY KEY (source_id, target_id)
        );
        CREATE INDEX IF NOT EXISTS idx_links_target ON vault_links(target_id);
        CREATE INDEX IF NOT EXISTS idx_links_type ON vault_links(link_type);
      `);
      this.initialized = true;
    } catch {
      // Table may already exist or DB may be read-only — degrade gracefully
    }
  }

  // ── CRUD ────────────────────────────────────────────────────────────

  /** Create a typed link between two entries. */
  addLink(sourceId: string, targetId: string, linkType: LinkType, note?: string): void {
    this.provider.run(
      `INSERT OR REPLACE INTO vault_links (source_id, target_id, link_type, note, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [sourceId, targetId, linkType, note ?? null, Date.now()],
    );
  }

  /** Remove a link between two entries. */
  removeLink(sourceId: string, targetId: string): void {
    this.provider.run('DELETE FROM vault_links WHERE source_id = ? AND target_id = ?', [
      sourceId,
      targetId,
    ]);
  }

  /** Get all outgoing links FROM an entry. */
  getLinks(entryId: string): VaultLink[] {
    try {
      const rows = this.provider.all<VaultLinkRow>(
        'SELECT * FROM vault_links WHERE source_id = ?',
        [entryId],
      );
      return rows.map(rowToVaultLink);
    } catch {
      return [];
    }
  }

  /** Get all incoming links TO an entry (backlinks). */
  getBacklinks(entryId: string): VaultLink[] {
    try {
      const rows = this.provider.all<VaultLinkRow>(
        'SELECT * FROM vault_links WHERE target_id = ?',
        [entryId],
      );
      return rows.map(rowToVaultLink);
    } catch {
      return [];
    }
  }

  /** Get total link count (outgoing + incoming). */
  getLinkCount(entryId: string): number {
    try {
      const row = this.provider.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM vault_links WHERE source_id = ? OR target_id = ?',
        [entryId, entryId],
      );
      return row?.count ?? 0;
    } catch {
      return 0;
    }
  }

  // ── Graph Traversal ─────────────────────────────────────────────────

  /**
   * Walk the link graph from a starting entry up to `depth` hops.
   * BFS — walks both outgoing and incoming links (undirected).
   */
  traverse(entryId: string, depth: number = 2): LinkedEntry[] {
    const visited = new Set<string>([entryId]);
    const result: LinkedEntry[] = [];
    let frontier = [entryId];

    for (let d = 0; d < depth && frontier.length > 0; d++) {
      const nextFrontier: string[] = [];
      for (const currentId of frontier) {
        this.collectNeighbors(currentId, visited, nextFrontier, result);
      }
      frontier = nextFrontier;
    }

    return result;
  }

  /** Collect unvisited outgoing and incoming neighbors for BFS. */
  private collectNeighbors(
    currentId: string,
    visited: Set<string>,
    nextFrontier: string[],
    result: LinkedEntry[],
  ): void {
    for (const link of this.getLinks(currentId)) {
      this.visitNeighbor(link.targetId, link, 'outgoing', visited, nextFrontier, result);
    }
    for (const link of this.getBacklinks(currentId)) {
      this.visitNeighbor(link.sourceId, link, 'incoming', visited, nextFrontier, result);
    }
  }

  /** Visit a single neighbor node if not already visited. */
  private visitNeighbor(
    neighborId: string,
    link: VaultLink,
    direction: 'outgoing' | 'incoming',
    visited: Set<string>,
    nextFrontier: string[],
    result: LinkedEntry[],
  ): void {
    if (visited.has(neighborId)) return;
    visited.add(neighborId);
    nextFrontier.push(neighborId);
    const entry = this.getEntryMeta(neighborId);
    if (!entry) return;
    result.push({
      ...entry,
      linkType: link.linkType,
      linkDirection: direction,
      linkNote: link.note,
    });
  }

  // ── Bulk Queries ────────────────────────────────────────────────────

  /** Get all links where either source or target is in the given ID set. */
  getAllLinksForEntries(entryIds: string[]): VaultLink[] {
    if (entryIds.length === 0) return [];
    try {
      const placeholders = entryIds.map(() => '?').join(',');
      const rows = this.provider.all<VaultLinkRow>(
        `SELECT * FROM vault_links WHERE source_id IN (${placeholders}) OR target_id IN (${placeholders})`,
        [...entryIds, ...entryIds],
      );
      return rows.map(rowToVaultLink);
    } catch {
      return [];
    }
  }

  // ── Orphan Detection ────────────────────────────────────────────────

  /** Find entries with zero links. */
  getOrphans(
    limit: number = 50,
  ): Array<{ id: string; title: string; type: string; domain: string }> {
    try {
      return this.provider.all<{ id: string; title: string; type: string; domain: string }>(
        `SELECT id, title, type, domain FROM entries
         WHERE id NOT IN (SELECT source_id FROM vault_links)
           AND id NOT IN (SELECT target_id FROM vault_links)
         ORDER BY updated_at DESC LIMIT ?`,
        [limit],
      );
    } catch {
      return [];
    }
  }

  // ── Link Suggestions (FTS5) ─────────────────────────────────────────

  /** Find semantically similar entries as link candidates using FTS5. */
  suggestLinks(entryId: string, limit: number = 5): LinkSuggestion[] {
    try {
      return this.suggestLinksUnsafe(entryId, limit);
    } catch {
      return [];
    }
  }

  private suggestLinksUnsafe(entryId: string, limit: number): LinkSuggestion[] {
    const entry = this.provider.get<{
      title: string;
      description: string;
      type: string;
      tags: string;
    }>('SELECT title, description, type, tags FROM entries WHERE id = ?', [entryId]);
    if (!entry) return [];

    const keywords = extractKeywords(`${entry.title} ${entry.description}`);
    if (keywords.length === 0) return [];

    const matches = this.queryFtsCandidates(keywords, limit);
    const existingLinks = this.getExistingLinkIds(entryId);

    return buildSuggestions(matches, entryId, existingLinks, entry.type, limit);
  }

  private queryFtsCandidates(
    keywords: string[],
    limit: number,
  ): Array<{ id: string; title: string; type: string; domain: string; rank: number }> {
    const queryTerms = keywords.join(' OR ');
    return this.provider.all<{
      id: string;
      title: string;
      type: string;
      domain: string;
      rank: number;
    }>(
      `SELECT e.id, e.title, e.type, e.domain, rank
       FROM entries_fts fts
       JOIN entries e ON e.rowid = fts.rowid
       WHERE entries_fts MATCH ?
       ORDER BY rank
       LIMIT ?`,
      [queryTerms, limit + 5],
    );
  }

  private getExistingLinkIds(entryId: string): Set<string> {
    return new Set([
      ...this.getLinks(entryId).map((l) => l.targetId),
      ...this.getBacklinks(entryId).map((l) => l.sourceId),
    ]);
  }

  // ── Backfill ────────────────────────────────────────────────────────

  /**
   * Generate links for orphan entries using FTS5 suggestions.
   * Processes orphans in batches and creates links above the threshold.
   */
  backfillLinks(opts?: {
    threshold?: number;
    maxLinks?: number;
    dryRun?: boolean;
    batchSize?: number;
    onProgress?: (stats: { processed: number; total: number; linksCreated: number }) => void;
  }): {
    processed: number;
    linksCreated: number;
    durationMs: number;
    preview?: Array<{ sourceId: string; targetId: string; linkType: string; score: number }>;
  } {
    const threshold = opts?.threshold ?? 0.7;
    const maxLinks = opts?.maxLinks ?? 3;
    const dryRun = opts?.dryRun ?? false;
    const batchSize = opts?.batchSize ?? 50;
    const start = Date.now();

    const orphans = this.getOrphans(10000);
    let processed = 0;
    let linksCreated = 0;
    const preview: Array<{ sourceId: string; targetId: string; linkType: string; score: number }> =
      [];

    for (let i = 0; i < orphans.length; i += batchSize) {
      const batch = orphans.slice(i, i + batchSize);
      for (const entry of batch) {
        const created = this.processOrphan(entry.id, threshold, maxLinks, dryRun, preview);
        linksCreated += created;
        processed++;
      }
      opts?.onProgress?.({ processed, total: orphans.length, linksCreated });
    }

    return {
      processed,
      linksCreated,
      durationMs: Date.now() - start,
      ...(dryRun ? { preview } : {}),
    };
  }

  /** Process a single orphan: suggest links, create or preview qualifying ones. */
  private processOrphan(
    entryId: string,
    threshold: number,
    maxLinks: number,
    dryRun: boolean,
    preview: Array<{ sourceId: string; targetId: string; linkType: string; score: number }>,
  ): number {
    const suggestions = this.suggestLinks(entryId, maxLinks + 2);
    const qualifying = suggestions.filter((s) => s.score >= threshold).slice(0, maxLinks);
    for (const s of qualifying) {
      if (dryRun) {
        preview.push({
          sourceId: entryId,
          targetId: s.entryId,
          linkType: s.suggestedType,
          score: s.score,
        });
      } else {
        this.addLink(entryId, s.entryId, s.suggestedType);
      }
    }
    return qualifying.length;
  }

  // ── Private Helpers ─────────────────────────────────────────────────

  private getEntryMeta(
    entryId: string,
  ): Omit<LinkedEntry, 'linkType' | 'linkDirection' | 'linkNote'> | null {
    try {
      const row = this.provider.get<{ id: string; title: string; type: string; domain: string }>(
        'SELECT id, title, type, domain FROM entries WHERE id = ?',
        [entryId],
      );
      return row ?? null;
    } catch {
      return null;
    }
  }
}

// ── Free-standing helpers ─────────────────────────────────────────────
function rowToVaultLink(row: VaultLinkRow): VaultLink {
  return {
    sourceId: row.source_id,
    targetId: row.target_id,
    linkType: row.link_type as LinkType,
    note: row.note ?? undefined,
    createdAt: row.created_at,
  };
}

function inferLinkType(sourceType: string, targetType: string): LinkType {
  if (sourceType === 'pattern' && targetType === 'anti-pattern') return 'contradicts';
  if (sourceType === 'anti-pattern' && targetType === 'pattern') return 'contradicts';
  if (targetType === 'rule') return 'supports';
  return 'extends';
}

/** Extract significant keywords from text for FTS5 queries. */
function extractKeywords(text: string): string[] {
  const rawWords = text
    .replace(/[^\w\s]/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const unique = [...new Set(rawWords)].filter((w) => !STOP_WORDS.has(w));
  return unique.slice(0, 10);
}

/** Convert FTS matches into LinkSuggestions, filtering self and existing links. */
function buildSuggestions(
  matches: Array<{ id: string; title: string; type: string; domain: string; rank: number }>,
  entryId: string,
  existingLinks: Set<string>,
  sourceType: string,
  limit: number,
): LinkSuggestion[] {
  return matches
    .filter((m) => m.id !== entryId && !existingLinks.has(m.id))
    .slice(0, limit)
    .map((m) => ({
      entryId: m.id,
      title: m.title,
      type: m.type,
      score: Math.abs(m.rank),
      suggestedType: inferLinkType(sourceType, m.type),
      reason: `${m.type} in ${m.domain}`,
    }));
}
