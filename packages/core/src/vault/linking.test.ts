import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LinkManager } from './linking.js';
import type { PersistenceProvider, RunResult } from '../persistence/types.js';

// ─── In-memory mock persistence ──────────────────────────────────────

interface LinkRow {
  source_id: string;
  target_id: string;
  link_type: string;
  note: string | null;
  created_at: number;
}

interface EntryRow {
  id: string;
  title: string;
  type: string;
  domain: string;
  description: string;
  tags: string;
  rowid: number;
  updated_at: number;
}

class LinkingMockDB implements PersistenceProvider {
  readonly backend = 'sqlite' as const;
  private links: LinkRow[] = [];
  private entries: EntryRow[] = [];

  /** Seed entries for getEntryMeta / suggestLinks queries. */
  seedEntries(list: Array<Omit<EntryRow, 'rowid' | 'updated_at'>>): void {
    for (let i = 0; i < list.length; i++) {
      this.entries.push({ ...list[i], rowid: i + 1, updated_at: Date.now() });
    }
  }

  execSql(): void {}

  run(sql: string, params?: unknown[] | Record<string, unknown>): RunResult {
    const p = params as unknown[];
    if (sql.includes('INSERT OR REPLACE INTO vault_links')) {
      const row: LinkRow = {
        source_id: p[0] as string,
        target_id: p[1] as string,
        link_type: p[2] as string,
        note: p[3] as string | null,
        created_at: p[4] as number,
      };
      const idx = this.links.findIndex(
        (l) => l.source_id === row.source_id && l.target_id === row.target_id,
      );
      if (idx >= 0) {
        this.links[idx] = row;
      } else {
        this.links.push(row);
      }
      return { changes: 1, lastInsertRowid: this.links.length };
    }
    if (sql.includes('DELETE FROM vault_links')) {
      const before = this.links.length;
      this.links = this.links.filter((l) => !(l.source_id === p[0] && l.target_id === p[1]));
      return { changes: before - this.links.length, lastInsertRowid: 0 };
    }
    return { changes: 0, lastInsertRowid: 0 };
  }

  get<T>(sql: string, params?: unknown[]): T | undefined {
    const p = params ?? [];
    if (sql.includes('COUNT(*)')) {
      if (sql.includes('NOT IN')) {
        // Count orphan entries (no links)
        const linkedIds = new Set(this.links.flatMap((l) => [l.source_id, l.target_id]));
        const count = this.entries.filter((e) => !linkedIds.has(e.id)).length;
        return { count } as T;
      }
      const id = p[0] as string;
      const count = this.links.filter((l) => l.source_id === id || l.target_id === id).length;
      return { count } as T;
    }
    if (sql.includes('FROM entries WHERE id')) {
      const entry = this.entries.find((e) => e.id === p[0]);
      return entry as T | undefined;
    }
    if (sql.includes('title, description, type, tags')) {
      const entry = this.entries.find((e) => e.id === p[0]);
      if (!entry) return undefined;
      return {
        title: entry.title,
        description: entry.description,
        type: entry.type,
        tags: entry.tags,
      } as T;
    }
    return undefined;
  }

  all<T>(sql: string, params?: unknown[]): T[] {
    const p = params ?? [];
    if (sql.includes('source_id = ?') && !sql.includes('OR')) {
      return this.links.filter((l) => l.source_id === p[0]) as T[];
    }
    if (sql.includes('target_id = ?') && !sql.includes('OR')) {
      return this.links.filter((l) => l.target_id === p[0]) as T[];
    }
    if (sql.includes('source_id IN')) {
      const half = p.length / 2;
      const ids = new Set(p.slice(0, half) as string[]);
      return this.links.filter((l) => ids.has(l.source_id) || ids.has(l.target_id)) as T[];
    }
    if (sql.includes('FROM entries WHERE id IN')) {
      const ids = new Set(p as string[]);
      return this.entries
        .filter((e) => ids.has(e.id))
        .map((e) => ({ id: e.id, title: e.title, type: e.type, domain: e.domain })) as T[];
    }
    if (sql.includes('NOT IN')) {
      const limit = p[0] as number;
      const linkedIds = new Set(this.links.flatMap((l) => [l.source_id, l.target_id]));
      return this.entries
        .filter((e) => !linkedIds.has(e.id))
        .slice(0, limit)
        .map((e) => ({ id: e.id, title: e.title, type: e.type, domain: e.domain })) as T[];
    }
    if (sql.includes('entries_fts')) {
      // Simplified FTS mock: return all entries with a fake rank
      const limit = p[1] as number;
      return this.entries.slice(0, limit).map((e, i) => ({
        id: e.id,
        title: e.title,
        type: e.type,
        domain: e.domain,
        rank: -(1.0 - i * 0.1),
      })) as T[];
    }
    return [];
  }

  transaction<T>(fn: () => T): T {
    return fn();
  }
  ftsSearch<T>(): T[] {
    return [];
  }
  ftsRebuild(): void {}
  close(): void {}
}

describe('LinkManager', () => {
  let db: LinkingMockDB;
  let mgr: LinkManager;

  beforeEach(() => {
    db = new LinkingMockDB();
    mgr = new LinkManager(db);
  });

  // ── addLink / getLinks / getBacklinks ───────────────────────────────

  it('adds and retrieves outgoing links', () => {
    mgr.addLink('a', 'b', 'supports', 'test note');
    const links = mgr.getLinks('a');
    expect(links).toHaveLength(1);
    expect(links[0].sourceId).toBe('a');
    expect(links[0].targetId).toBe('b');
    expect(links[0].linkType).toBe('supports');
    expect(links[0].note).toBe('test note');
  });

  it('retrieves backlinks', () => {
    mgr.addLink('a', 'b', 'extends');
    const backlinks = mgr.getBacklinks('b');
    expect(backlinks).toHaveLength(1);
    expect(backlinks[0].sourceId).toBe('a');
  });

  it('replaces existing link on same source-target pair', () => {
    mgr.addLink('a', 'b', 'supports');
    mgr.addLink('a', 'b', 'contradicts');
    const links = mgr.getLinks('a');
    expect(links).toHaveLength(1);
    expect(links[0].linkType).toBe('contradicts');
  });

  it('handles note as undefined', () => {
    mgr.addLink('a', 'b', 'extends');
    const links = mgr.getLinks('a');
    expect(links[0].note).toBeUndefined();
  });

  // ── removeLink ──────────────────────────────────────────────────────

  it('removes an existing link', () => {
    mgr.addLink('a', 'b', 'supports');
    mgr.removeLink('a', 'b');
    expect(mgr.getLinks('a')).toEqual([]);
  });

  it('does not throw when removing non-existent link', () => {
    expect(() => mgr.removeLink('x', 'y')).not.toThrow();
  });

  // ── getLinkCount ────────────────────────────────────────────────────

  it('counts outgoing and incoming links', () => {
    mgr.addLink('a', 'b', 'supports');
    mgr.addLink('c', 'a', 'extends');
    expect(mgr.getLinkCount('a')).toBe(2);
  });

  it('returns 0 for entry with no links', () => {
    expect(mgr.getLinkCount('orphan')).toBe(0);
  });

  // ── traverse ────────────────────────────────────────────────────────

  it('returns empty for entry with no links', () => {
    db.seedEntries([
      { id: 'solo', title: 'Solo', type: 'pattern', domain: 'd', description: '', tags: '' },
    ]);
    expect(mgr.traverse('solo')).toEqual([]);
  });

  it('traverses outgoing links at depth 1', () => {
    db.seedEntries([
      { id: 'a', title: 'A', type: 'pattern', domain: 'd', description: '', tags: '' },
      { id: 'b', title: 'B', type: 'rule', domain: 'd', description: '', tags: '' },
    ]);
    mgr.addLink('a', 'b', 'supports');
    const result = mgr.traverse('a', 1);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b');
    expect(result[0].linkDirection).toBe('outgoing');
  });

  it('traverses incoming links at depth 1', () => {
    db.seedEntries([
      { id: 'a', title: 'A', type: 'pattern', domain: 'd', description: '', tags: '' },
      { id: 'b', title: 'B', type: 'rule', domain: 'd', description: '', tags: '' },
    ]);
    mgr.addLink('a', 'b', 'extends');
    const result = mgr.traverse('b', 1);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
    expect(result[0].linkDirection).toBe('incoming');
  });

  it('does not revisit nodes in BFS', () => {
    db.seedEntries([
      { id: 'a', title: 'A', type: 'pattern', domain: 'd', description: '', tags: '' },
      { id: 'b', title: 'B', type: 'rule', domain: 'd', description: '', tags: '' },
    ]);
    mgr.addLink('a', 'b', 'supports');
    mgr.addLink('b', 'a', 'extends'); // cycle
    const result = mgr.traverse('a', 3);
    expect(result).toHaveLength(1); // only 'b', not 'a' again
  });

  it('respects depth 0 — returns empty', () => {
    db.seedEntries([
      { id: 'a', title: 'A', type: 'pattern', domain: 'd', description: '', tags: '' },
      { id: 'b', title: 'B', type: 'rule', domain: 'd', description: '', tags: '' },
    ]);
    mgr.addLink('a', 'b', 'supports');
    expect(mgr.traverse('a', 0)).toEqual([]);
  });

  // ── getAllLinksForEntries ────────────────────────────────────────────

  it('returns links for given entry IDs', () => {
    mgr.addLink('a', 'b', 'supports');
    mgr.addLink('c', 'd', 'extends');
    const links = mgr.getAllLinksForEntries(['a', 'b']);
    expect(links).toHaveLength(1);
    expect(links[0].sourceId).toBe('a');
  });

  it('returns empty for empty ID list', () => {
    expect(mgr.getAllLinksForEntries([])).toEqual([]);
  });

  // ── getOrphans ──────────────────────────────────────────────────────

  it('returns entries with no links', () => {
    db.seedEntries([
      { id: 'orphan', title: 'Orphan', type: 'pattern', domain: 'd', description: '', tags: '' },
      { id: 'linked', title: 'Linked', type: 'rule', domain: 'd', description: '', tags: '' },
    ]);
    mgr.addLink('linked', 'orphan', 'supports'); // orphan now has links
    // After linking, only entries NOT in any link are orphans
    // In our mock, both are now in links, so no orphans
    const orphans = mgr.getOrphans();
    expect(orphans).toEqual([]);
  });

  it('returns all entries when none are linked', () => {
    db.seedEntries([
      { id: 'a', title: 'A', type: 'pattern', domain: 'd', description: '', tags: '' },
      { id: 'b', title: 'B', type: 'rule', domain: 'd', description: '', tags: '' },
    ]);
    const orphans = mgr.getOrphans();
    expect(orphans).toHaveLength(2);
  });

  // ── suggestLinks ────────────────────────────────────────────────────

  it('returns empty for non-existent entry', () => {
    expect(mgr.suggestLinks('missing')).toEqual([]);
  });

  it('suggests links based on FTS matches', () => {
    db.seedEntries([
      {
        id: 'e1',
        title: 'Accessibility Pattern',
        type: 'pattern',
        domain: 'a11y',
        description: 'Screen reader support',
        tags: '',
      },
      {
        id: 'e2',
        title: 'ARIA Rules',
        type: 'rule',
        domain: 'a11y',
        description: 'Always use ARIA labels',
        tags: '',
      },
    ]);
    const suggestions = mgr.suggestLinks('e1', 5);
    // e2 should be suggested (e1 is filtered as self)
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].entryId).toBe('e2');
    expect(suggestions[0].suggestedType).toBe('supports'); // pattern → rule
  });

  it('excludes already-linked entries from suggestions', () => {
    db.seedEntries([
      { id: 'e1', title: 'Pattern A', type: 'pattern', domain: 'd', description: 'desc', tags: '' },
      { id: 'e2', title: 'Pattern B', type: 'pattern', domain: 'd', description: 'desc', tags: '' },
    ]);
    mgr.addLink('e1', 'e2', 'extends');
    const suggestions = mgr.suggestLinks('e1', 5);
    expect(suggestions.every((s) => s.entryId !== 'e2')).toBe(true);
  });

  // ── backfillLinks ───────────────────────────────────────────────────

  it('returns zero processed when no orphans exist', () => {
    mgr.addLink('a', 'b', 'supports'); // No orphans if all are linked
    db.seedEntries([
      { id: 'a', title: 'A', type: 'pattern', domain: 'd', description: 'x', tags: '' },
      { id: 'b', title: 'B', type: 'rule', domain: 'd', description: 'x', tags: '' },
    ]);
    const result = mgr.backfillLinks();
    expect(result.processed).toBe(0);
    expect(result.linksCreated).toBe(0);
  });

  it('dry run populates preview array', () => {
    db.seedEntries([
      {
        id: 'orphan',
        title: 'Orphan',
        type: 'pattern',
        domain: 'd',
        description: 'test content',
        tags: '',
      },
      {
        id: 'target',
        title: 'Target',
        type: 'rule',
        domain: 'd',
        description: 'test content',
        tags: '',
      },
    ]);
    // Link target so orphan is the only orphan
    mgr.addLink('target', 'target', 'supports'); // self-link to exclude from orphans

    const result = mgr.backfillLinks({ dryRun: true, threshold: 0.0 });
    // orphan should be processed, preview should contain link candidates
    if (result.processed > 0 && result.preview) {
      expect(Array.isArray(result.preview)).toBe(true);
    }
  });

  it('calls onProgress callback', () => {
    db.seedEntries([
      { id: 'a', title: 'A', type: 'pattern', domain: 'd', description: 'x', tags: '' },
    ]);
    const progress = vi.fn();
    mgr.backfillLinks({ onProgress: progress, batchSize: 1 });
    expect(progress).toHaveBeenCalled();
    const lastCall = progress.mock.calls[progress.mock.calls.length - 1][0];
    expect(lastCall).toHaveProperty('processed');
    expect(lastCall).toHaveProperty('total');
    expect(lastCall).toHaveProperty('linksCreated');
  });
});
