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

export class LinkManager {
  private initialized = false;

  constructor(private provider: PersistenceProvider) {
    this.ensureTable();
  }

  // ===========================================================================
  // SCHEMA
  // ===========================================================================

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

  // ===========================================================================
  // CRUD
  // ===========================================================================

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

  // ===========================================================================
  // GRAPH TRAVERSAL
  // ===========================================================================

  /**
   * Walk the link graph from a starting entry up to `depth` hops.
   * Returns all connected entries with link metadata.
   * BFS — walks both outgoing and incoming links (undirected).
   */
  traverse(entryId: string, depth: number = 2): LinkedEntry[] {
    const visited = new Set<string>([entryId]);
    const result: LinkedEntry[] = [];
    let frontier = [entryId];

    for (let d = 0; d < depth && frontier.length > 0; d++) {
      const nextFrontier: string[] = [];

      for (const currentId of frontier) {
        // Outgoing
        for (const link of this.getLinks(currentId)) {
          if (!visited.has(link.targetId)) {
            visited.add(link.targetId);
            nextFrontier.push(link.targetId);
            const entry = this.getEntryMeta(link.targetId);
            if (entry) {
              result.push({
                ...entry,
                linkType: link.linkType,
                linkDirection: 'outgoing',
                linkNote: link.note,
              });
            }
          }
        }
        // Incoming
        for (const link of this.getBacklinks(currentId)) {
          if (!visited.has(link.sourceId)) {
            visited.add(link.sourceId);
            nextFrontier.push(link.sourceId);
            const entry = this.getEntryMeta(link.sourceId);
            if (entry) {
              result.push({
                ...entry,
                linkType: link.linkType,
                linkDirection: 'incoming',
                linkNote: link.note,
              });
            }
          }
        }
      }

      frontier = nextFrontier;
    }

    return result;
  }

  // ===========================================================================
  // ORPHAN DETECTION
  // ===========================================================================

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

  // ===========================================================================
  // LINK SUGGESTIONS (FTS5-powered — improvement over Salvador's TF-IDF)
  // ===========================================================================

  /** Find semantically similar entries as link candidates using FTS5. */
  suggestLinks(entryId: string, limit: number = 5): LinkSuggestion[] {
    try {
      // Get the entry to build a search query
      const entry = this.provider.get<{
        title: string;
        description: string;
        type: string;
        tags: string;
      }>('SELECT title, description, type, tags FROM entries WHERE id = ?', [entryId]);
      if (!entry) return [];

      // Build FTS query from entry content — extract significant keywords only.
      // FTS5 MATCH chokes on long raw text; use top keywords joined with OR.
      const rawWords = `${entry.title} ${entry.description}`
        .replace(/[^\w\s]/g, ' ')
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2);
      // Deduplicate and take top 10 most significant words (skip common stop words)
      const stopWords = new Set([
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
      const unique = [...new Set(rawWords)].filter((w) => !stopWords.has(w));
      const keywords = unique.slice(0, 10);
      if (keywords.length === 0) return [];
      const queryTerms = keywords.join(' OR ');

      // FTS5 match with BM25 ranking
      const matches = this.provider.all<{
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

      // Filter out self and already-linked entries
      const existingLinks = new Set([
        ...this.getLinks(entryId).map((l) => l.targetId),
        ...this.getBacklinks(entryId).map((l) => l.sourceId),
      ]);

      return matches
        .filter((m) => m.id !== entryId && !existingLinks.has(m.id))
        .slice(0, limit)
        .map((m) => {
          const suggestedType = inferLinkType(entry.type, m.type);
          return {
            entryId: m.id,
            title: m.title,
            type: m.type,
            score: Math.abs(m.rank), // FTS5 rank is negative (lower = better)
            suggestedType,
            reason: `${m.type} in ${m.domain}`,
          };
        });
    } catch {
      return [];
    }
  }

  // ===========================================================================
  // PRIVATE
  // ===========================================================================

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

// =============================================================================
// HELPERS
// =============================================================================

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
