/**
 * Dedicated tests for vault-entries.ts — the core data layer with 28 exports.
 * Uses in-memory SQLite via Vault for schema setup, then calls vault-entries
 * functions directly against the PersistenceProvider.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Vault } from '../vault.js';
import type { PersistenceProvider } from '../../persistence/types.js';
import type { IntelligenceEntry } from '../../intelligence/types.js';
import type { AutoLinkConfig } from '../vault-entries.js';
import * as ve from '../vault-entries.js';
import { computeContentHash } from '../content-hash.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<IntelligenceEntry> = {}): IntelligenceEntry {
  return {
    id: overrides.id ?? `entry-${Math.random().toString(36).slice(2, 8)}`,
    type: overrides.type ?? 'pattern',
    domain: overrides.domain ?? 'testing',
    title: overrides.title ?? 'Test Pattern',
    severity: overrides.severity ?? 'warning',
    description: overrides.description ?? 'A test pattern for unit tests.',
    context: overrides.context ?? 'Use in test suites.',
    example: overrides.example ?? 'expect(result).toBe(true);',
    counterExample: overrides.counterExample ?? 'assert(result);',
    why: overrides.why ?? 'Tests should be explicit.',
    tags: overrides.tags ?? ['testing'],
    appliesTo: overrides.appliesTo ?? ['*.test.ts'],
    ...(overrides.tier !== undefined ? { tier: overrides.tier } : {}),
    ...(overrides.origin !== undefined ? { origin: overrides.origin } : {}),
    ...(overrides.validFrom !== undefined ? { validFrom: overrides.validFrom } : {}),
    ...(overrides.validUntil !== undefined ? { validUntil: overrides.validUntil } : {}),
  };
}

const NO_AUTOLINK: AutoLinkConfig = {
  linkManager: null,
  enabled: false,
  maxLinks: 0,
};

// ── Suite ────────────────────────────────────────────────────────────────

describe('vault-entries', () => {
  let vault: Vault;
  let provider: PersistenceProvider;

  beforeEach(() => {
    vault = new Vault(':memory:');
    provider = vault.getProvider();
  });

  afterEach(() => {
    vault.close();
  });

  // ── add / seed ──────────────────────────────────────────────────────

  describe('add (seed single entry)', () => {
    it('inserts a new entry', () => {
      const entry = makeEntry({ id: 'add-1' });
      ve.add(provider, entry, NO_AUTOLINK);
      const stored = ve.get(provider, 'add-1');
      expect(stored).not.toBeNull();
      expect(stored!.title).toBe('Test Pattern');
    });

    it('upserts on duplicate id', () => {
      ve.add(provider, makeEntry({ id: 'dup-1', title: 'Original' }), NO_AUTOLINK);
      ve.add(provider, makeEntry({ id: 'dup-1', title: 'Updated' }), NO_AUTOLINK);
      const stored = ve.get(provider, 'dup-1');
      expect(stored!.title).toBe('Updated');
    });
  });

  describe('seed', () => {
    it('inserts multiple entries in a transaction', () => {
      const entries = [makeEntry({ id: 's1' }), makeEntry({ id: 's2' }), makeEntry({ id: 's3' })];
      const count = ve.seed(provider, entries, NO_AUTOLINK);
      expect(count).toBe(3);
    });

    it('returns 0 for empty array', () => {
      expect(ve.seed(provider, [], NO_AUTOLINK)).toBe(0);
    });
  });

  // ── get ─────────────────────────────────────────────────────────────

  describe('get', () => {
    it('returns entry when found', () => {
      ve.add(provider, makeEntry({ id: 'g1', title: 'Found Me' }), NO_AUTOLINK);
      const result = ve.get(provider, 'g1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('g1');
      expect(result!.title).toBe('Found Me');
    });

    it('returns null when not found', () => {
      expect(ve.get(provider, 'nonexistent')).toBeNull();
    });
  });

  // ── update ──────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates fields on existing entry', () => {
      ve.add(provider, makeEntry({ id: 'u1', title: 'Before' }), NO_AUTOLINK);
      const updated = ve.update(provider, 'u1', { title: 'After' }, NO_AUTOLINK);
      expect(updated).not.toBeNull();
      expect(updated!.title).toBe('After');
    });

    it('returns null for missing entry', () => {
      const result = ve.update(provider, 'missing', { title: 'Nope' }, NO_AUTOLINK);
      expect(result).toBeNull();
    });

    it('preserves unchanged fields', () => {
      ve.add(
        provider,
        makeEntry({ id: 'u2', title: 'Keep', description: 'Original desc' }),
        NO_AUTOLINK,
      );
      ve.update(provider, 'u2', { title: 'Changed' }, NO_AUTOLINK);
      const result = ve.get(provider, 'u2');
      expect(result!.description).toBe('Original desc');
    });
  });

  // ── remove / delete ────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes existing entry and returns true', () => {
      ve.add(provider, makeEntry({ id: 'r1' }), NO_AUTOLINK);
      expect(ve.remove(provider, 'r1')).toBe(true);
      expect(ve.get(provider, 'r1')).toBeNull();
    });

    it('returns false for nonexistent entry', () => {
      expect(ve.remove(provider, 'ghost')).toBe(false);
    });
  });

  describe('bulkRemove', () => {
    it('deletes multiple entries and returns count', () => {
      ve.seed(
        provider,
        [makeEntry({ id: 'br1' }), makeEntry({ id: 'br2' }), makeEntry({ id: 'br3' })],
        NO_AUTOLINK,
      );
      const removed = ve.bulkRemove(provider, ['br1', 'br3']);
      expect(removed).toBe(2);
      expect(ve.get(provider, 'br2')).not.toBeNull();
    });
  });

  // ── search (FTS) ───────────────────────────────────────────────────

  describe('search', () => {
    beforeEach(() => {
      ve.seed(
        provider,
        [
          makeEntry({
            id: 'fts-1',
            title: 'Input validation pattern',
            description: 'Always validate user input at boundaries.',
            domain: 'security',
          }),
          makeEntry({
            id: 'fts-2',
            title: 'Error handling best practice',
            description: 'Catch errors at service boundaries.',
            domain: 'resilience',
          }),
        ],
        NO_AUTOLINK,
      );
    });

    it('returns matching results', () => {
      const results = ve.search(provider, 'validation');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entry.id).toBe('fts-1');
      expect(results[0].score).toBeDefined();
    });

    it('returns empty array for unmatched query', () => {
      const results = ve.search(provider, 'zzzznonexistent');
      expect(results).toEqual([]);
    });

    it('respects domain filter', () => {
      const results = ve.search(provider, 'boundaries', { domain: 'security' });
      expect(results.every((r) => r.entry.domain === 'security')).toBe(true);
    });

    it('respects limit option', () => {
      const results = ve.search(provider, 'pattern', { limit: 1 });
      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  // ── list ───────────────────────────────────────────────────────────

  describe('list', () => {
    beforeEach(() => {
      ve.seed(
        provider,
        [
          makeEntry({ id: 'l1', domain: 'ui', type: 'rule', severity: 'critical' }),
          makeEntry({ id: 'l2', domain: 'api', type: 'pattern', severity: 'warning' }),
          makeEntry({ id: 'l3', domain: 'ui', type: 'pattern', severity: 'suggestion' }),
        ],
        NO_AUTOLINK,
      );
    });

    it('lists all entries', () => {
      const all = ve.list(provider);
      expect(all.length).toBe(3);
    });

    it('filters by domain', () => {
      const ui = ve.list(provider, { domain: 'ui' });
      expect(ui.length).toBe(2);
      expect(ui.every((e) => e.domain === 'ui')).toBe(true);
    });

    it('filters by type', () => {
      const patterns = ve.list(provider, { type: 'pattern' });
      expect(patterns.length).toBe(2);
    });

    it('filters by tags', () => {
      ve.add(provider, makeEntry({ id: 'lt', tags: ['accessibility', 'a11y'] }), NO_AUTOLINK);
      const tagged = ve.list(provider, { tags: ['accessibility'] });
      expect(tagged.some((e) => e.id === 'lt')).toBe(true);
    });

    it('respects limit and offset', () => {
      const page = ve.list(provider, { limit: 2, offset: 1 });
      expect(page.length).toBe(2);
    });
  });

  // ── stats ──────────────────────────────────────────────────────────

  describe('stats', () => {
    it('returns correct counts', () => {
      ve.seed(
        provider,
        [
          makeEntry({ id: 'st1', domain: 'ui', type: 'pattern', severity: 'warning' }),
          makeEntry({ id: 'st2', domain: 'api', type: 'rule', severity: 'critical' }),
        ],
        NO_AUTOLINK,
      );
      const s = ve.stats(provider);
      expect(s.totalEntries).toBe(2);
      expect(s.byDomain.ui).toBe(1);
      expect(s.byDomain.api).toBe(1);
      expect(s.byType.pattern).toBe(1);
      expect(s.byType.rule).toBe(1);
      expect(s.bySeverity.warning).toBe(1);
      expect(s.bySeverity.critical).toBe(1);
    });

    it('returns zeros when vault is empty', () => {
      const s = ve.stats(provider);
      expect(s.totalEntries).toBe(0);
    });
  });

  // ── rowToEntry ─────────────────────────────────────────────────────

  describe('rowToEntry', () => {
    it('maps DB row shape to IntelligenceEntry', () => {
      const row = {
        id: 'r1',
        type: 'pattern',
        domain: 'testing',
        title: 'Test',
        severity: 'warning',
        description: 'Desc',
        context: 'Ctx',
        example: 'Ex',
        counter_example: 'CEx',
        why: 'Because',
        tags: '["a","b"]',
        applies_to: '["*.ts"]',
        tier: 'agent',
        origin: 'user',
        valid_from: null,
        valid_until: null,
      };
      const entry = ve.rowToEntry(row);
      expect(entry.id).toBe('r1');
      expect(entry.counterExample).toBe('CEx');
      expect(entry.tags).toEqual(['a', 'b']);
      expect(entry.appliesTo).toEqual(['*.ts']);
      expect(entry.tier).toBe('agent');
      expect(entry.origin).toBe('user');
    });

    it('handles null optional fields gracefully', () => {
      const row = {
        id: 'r2',
        type: 'rule',
        domain: 'd',
        title: 'T',
        severity: 'suggestion',
        description: 'D',
        context: null,
        example: null,
        counter_example: null,
        why: null,
        tags: '[]',
        applies_to: '[]',
        tier: null,
        origin: null,
        valid_from: null,
        valid_until: null,
      };
      const entry = ve.rowToEntry(row);
      expect(entry.context).toBeUndefined();
      expect(entry.example).toBeUndefined();
      expect(entry.tags).toEqual([]);
    });
  });

  // ── buildFtsQuery ──────────────────────────────────────────────────

  describe('buildFtsQuery', () => {
    it('returns single term as-is', () => {
      expect(ve.buildFtsQuery('validation')).toBe('validation');
    });

    it('joins multiple terms with OR', () => {
      expect(ve.buildFtsQuery('input validation')).toBe('input OR validation');
    });

    it('splits on hyphens and underscores', () => {
      expect(ve.buildFtsQuery('smoke-test-entry')).toBe('smoke OR test OR entry');
    });

    it('filters short tokens (< 2 chars)', () => {
      expect(ve.buildFtsQuery('a big test')).toBe('big OR test');
    });

    it('returns original query when all terms are too short', () => {
      expect(ve.buildFtsQuery('a b')).toBe('a b');
    });

    it('strips non-alphanumeric characters', () => {
      expect(ve.buildFtsQuery("it's good!")).toBe('its OR good');
    });
  });

  // ── rowToSearchResult ──────────────────────────────────────────────

  describe('rowToSearchResult', () => {
    it('converts negative BM25 score to positive', () => {
      const row = {
        id: 'sr1',
        type: 'pattern',
        domain: 'd',
        title: 'T',
        severity: 'warning',
        description: 'D',
        context: null,
        example: null,
        counter_example: null,
        why: null,
        tags: '[]',
        applies_to: '[]',
        tier: null,
        origin: null,
        valid_from: null,
        valid_until: null,
        score: -5.2,
      };
      const result = ve.rowToSearchResult(row);
      expect(result.score).toBe(5.2);
      expect(result.entry.id).toBe('sr1');
    });

    it('keeps positive score unchanged', () => {
      const row = {
        id: 'sr2',
        type: 'rule',
        domain: 'd',
        title: 'T',
        severity: 'suggestion',
        description: 'D',
        context: null,
        example: null,
        counter_example: null,
        why: null,
        tags: '[]',
        applies_to: '[]',
        tier: null,
        origin: null,
        valid_from: null,
        valid_until: null,
        score: 3.7,
      };
      expect(ve.rowToSearchResult(row).score).toBe(3.7);
    });
  });

  // ── autoLink ───────────────────────────────────────────────────────

  describe('autoLink', () => {
    it('does nothing when linkManager is null', () => {
      ve.autoLink('any-id', NO_AUTOLINK);
    });

    it('does nothing when disabled', () => {
      const mockManager = {
        suggestLinks: () => [],
        addLink: () => {},
      };
      ve.autoLink('any-id', {
        linkManager: mockManager as unknown as AutoLinkConfig['linkManager'],
        enabled: false,
        maxLinks: 3,
      });
    });

    it('calls suggestLinks and addLink when enabled', () => {
      const addedLinks: Array<{ from: string; to: string }> = [];
      const mockManager = {
        suggestLinks: (_id: string, _max: number) => [
          { entryId: 'target-1', suggestedType: 'supports', reason: 'similar' },
        ],
        addLink: (from: string, to: string) => {
          addedLinks.push({ from, to });
        },
      };
      ve.autoLink('source-1', {
        linkManager: mockManager as unknown as AutoLinkConfig['linkManager'],
        enabled: true,
        maxLinks: 3,
      });
      expect(addedLinks.length).toBe(1);
      expect(addedLinks[0].from).toBe('source-1');
      expect(addedLinks[0].to).toBe('target-1');
    });

    it('swallows errors from linkManager', () => {
      const mockManager = {
        suggestLinks: () => {
          throw new Error('boom');
        },
        addLink: () => {},
      };
      ve.autoLink('source-1', {
        linkManager: mockManager as unknown as AutoLinkConfig['linkManager'],
        enabled: true,
        maxLinks: 3,
      });
    });
  });

  // ── seedDedup ──────────────────────────────────────────────────────

  describe('seedDedup', () => {
    it('inserts fresh entries with distinct content', () => {
      const results = ve.seedDedup(
        provider,
        [
          makeEntry({ id: 'sd1', title: 'First Pattern', description: 'Unique body one' }),
          makeEntry({ id: 'sd2', title: 'Second Pattern', description: 'Unique body two' }),
        ],
        NO_AUTOLINK,
      );
      expect(results.length).toBe(2);
      expect(results.every((r) => r.action === 'inserted')).toBe(true);
    });

    it('detects duplicates by content hash', () => {
      const entry = makeEntry({
        id: 'orig',
        title: 'Same Content',
        description: 'Identical body',
      });
      ve.add(provider, entry, NO_AUTOLINK);

      const duplicate = { ...entry, id: 'dupe-id' };
      const results = ve.seedDedup(provider, [duplicate], NO_AUTOLINK);
      expect(results[0].action).toBe('duplicate');
      expect(results[0].existingId).toBe('orig');
    });
  });

  // ── installPack ────────────────────────────────────────────────────

  describe('installPack', () => {
    it('installs entries with origin=pack', () => {
      const result = ve.installPack(
        provider,
        [
          makeEntry({ id: 'pk1', title: 'Pack One', description: 'Unique pack body one' }),
          makeEntry({ id: 'pk2', title: 'Pack Two', description: 'Unique pack body two' }),
        ],
        NO_AUTOLINK,
      );
      expect(result.installed).toBe(2);
      expect(result.skipped).toBe(0);
      const stored = ve.get(provider, 'pk1');
      expect(stored!.origin).toBe('pack');
    });

    it('skips content-duplicate entries', () => {
      const entry = makeEntry({ id: 'pk-orig', title: 'Pack Pattern', description: 'Body' });
      ve.add(provider, entry, NO_AUTOLINK);

      const dupe = { ...entry, id: 'pk-dupe' };
      const result = ve.installPack(provider, [dupe], NO_AUTOLINK);
      expect(result.skipped).toBe(1);
      expect(result.installed).toBe(0);
    });
  });

  // ── temporal: setTemporal / findExpiring / findExpired ──────────────

  describe('setTemporal', () => {
    it('sets validFrom and validUntil', () => {
      ve.add(provider, makeEntry({ id: 'tmp1' }), NO_AUTOLINK);
      const now = Math.floor(Date.now() / 1000);
      const result = ve.setTemporal(provider, 'tmp1', now, now + 86400);
      expect(result).toBe(true);
    });

    it('returns false for nonexistent entry', () => {
      expect(ve.setTemporal(provider, 'ghost', 100, 200)).toBe(false);
    });

    it('returns false when no fields are provided', () => {
      ve.add(provider, makeEntry({ id: 'tmp2' }), NO_AUTOLINK);
      expect(ve.setTemporal(provider, 'tmp2')).toBe(false);
    });
  });

  describe('findExpiring', () => {
    it('finds entries expiring within N days', () => {
      const now = Math.floor(Date.now() / 1000);
      ve.add(provider, makeEntry({ id: 'exp1' }), NO_AUTOLINK);
      ve.setTemporal(provider, 'exp1', undefined, now + 3600); // expires in 1 hour
      ve.add(provider, makeEntry({ id: 'exp2' }), NO_AUTOLINK);
      ve.setTemporal(provider, 'exp2', undefined, now + 86400 * 30); // expires in 30 days

      const expiring = ve.findExpiring(provider, 1);
      expect(expiring.some((e) => e.id === 'exp1')).toBe(true);
      expect(expiring.some((e) => e.id === 'exp2')).toBe(false);
    });
  });

  describe('findExpired', () => {
    it('finds already-expired entries', () => {
      const past = Math.floor(Date.now() / 1000) - 86400;
      ve.add(provider, makeEntry({ id: 'dead1' }), NO_AUTOLINK);
      ve.setTemporal(provider, 'dead1', undefined, past);

      const expired = ve.findExpired(provider);
      expect(expired.some((e) => e.id === 'dead1')).toBe(true);
    });
  });

  // ── getTags / getDomains / getRecent ───────────────────────────────

  describe('getTags', () => {
    it('aggregates tag counts', () => {
      ve.seed(
        provider,
        [makeEntry({ id: 'tg1', tags: ['a', 'b'] }), makeEntry({ id: 'tg2', tags: ['a', 'c'] })],
        NO_AUTOLINK,
      );
      const tags = ve.getTags(provider);
      const aTag = tags.find((t) => t.tag === 'a');
      expect(aTag!.count).toBe(2);
    });
  });

  describe('getDomains', () => {
    it('returns domain counts', () => {
      ve.seed(
        provider,
        [
          makeEntry({ id: 'dm1', domain: 'ui' }),
          makeEntry({ id: 'dm2', domain: 'ui' }),
          makeEntry({ id: 'dm3', domain: 'api' }),
        ],
        NO_AUTOLINK,
      );
      const domains = ve.getDomains(provider);
      expect(domains.find((d) => d.domain === 'ui')!.count).toBe(2);
      expect(domains.find((d) => d.domain === 'api')!.count).toBe(1);
    });
  });

  describe('getRecent', () => {
    it('returns entries ordered by updated_at desc', () => {
      ve.seed(
        provider,
        [makeEntry({ id: 'rec1' }), makeEntry({ id: 'rec2' }), makeEntry({ id: 'rec3' })],
        NO_AUTOLINK,
      );
      const recent = ve.getRecent(provider, 2);
      expect(recent.length).toBe(2);
    });
  });

  // ── findByContentHash / contentHashStats ───────────────────────────

  describe('findByContentHash', () => {
    it('finds entry by its content hash', () => {
      const entry = makeEntry({ id: 'ch1', title: 'Hash Test' });
      ve.add(provider, entry, NO_AUTOLINK);

      const hash = computeContentHash(entry);
      expect(ve.findByContentHash(provider, hash)).toBe('ch1');
    });

    it('returns null for unknown hash', () => {
      expect(ve.findByContentHash(provider, 'deadbeef')).toBeNull();
    });
  });

  describe('contentHashStats', () => {
    it('returns correct hash statistics', () => {
      ve.seed(
        provider,
        [
          makeEntry({ id: 'hs1', title: 'Hash A', description: 'Unique A' }),
          makeEntry({ id: 'hs2', title: 'Hash B', description: 'Unique B' }),
        ],
        NO_AUTOLINK,
      );
      const s = ve.contentHashStats(provider);
      expect(s.total).toBe(2);
      expect(s.hashed).toBe(2);
      expect(s.uniqueHashes).toBe(2);
    });
  });

  // ── Vector operations ──────────────────────────────────────────────

  describe('storeVector / getVector / deleteVector', () => {
    it('stores and retrieves a vector', () => {
      ve.add(provider, makeEntry({ id: 'v1' }), NO_AUTOLINK);
      const vec = [0.1, 0.2, 0.3, 0.4];
      ve.storeVector(provider, 'v1', vec, 'test-model', 4);

      const stored = ve.getVector(provider, 'v1');
      expect(stored).not.toBeNull();
      expect(stored!.entryId).toBe('v1');
      expect(stored!.model).toBe('test-model');
      expect(stored!.dimensions).toBe(4);
      for (let i = 0; i < vec.length; i++) {
        expect(stored!.vector[i]).toBeCloseTo(vec[i], 5);
      }
    });

    it('returns null for entry without vector', () => {
      expect(ve.getVector(provider, 'no-vec')).toBeNull();
    });

    it('upserts on conflict', () => {
      ve.add(provider, makeEntry({ id: 'v2' }), NO_AUTOLINK);
      ve.storeVector(provider, 'v2', [1, 2], 'model-a', 2);
      ve.storeVector(provider, 'v2', [3, 4], 'model-b', 2);

      const stored = ve.getVector(provider, 'v2');
      expect(stored!.model).toBe('model-b');
      expect(stored!.vector[0]).toBeCloseTo(3, 5);
    });

    it('deletes a vector', () => {
      ve.add(provider, makeEntry({ id: 'v3' }), NO_AUTOLINK);
      ve.storeVector(provider, 'v3', [1, 2], 'model', 2);
      ve.deleteVector(provider, 'v3');
      expect(ve.getVector(provider, 'v3')).toBeNull();
    });
  });

  describe('getEntriesWithoutVectors', () => {
    it('returns IDs of entries missing vectors for the given model', () => {
      ve.seed(
        provider,
        [makeEntry({ id: 'wv1' }), makeEntry({ id: 'wv2' }), makeEntry({ id: 'wv3' })],
        NO_AUTOLINK,
      );
      ve.storeVector(provider, 'wv1', [1, 2], 'my-model', 2);

      const missing = ve.getEntriesWithoutVectors(provider, 'my-model');
      expect(missing).toContain('wv2');
      expect(missing).toContain('wv3');
      expect(missing).not.toContain('wv1');
    });
  });

  describe('cosineSearch', () => {
    it('returns entries sorted by similarity', () => {
      ve.seed(provider, [makeEntry({ id: 'cs1' }), makeEntry({ id: 'cs2' })], NO_AUTOLINK);
      ve.storeVector(provider, 'cs1', [1, 0, 0], 'model', 3);
      ve.storeVector(provider, 'cs2', [0, 1, 0], 'model', 3);

      const results = ve.cosineSearch(provider, [1, 0, 0], 2);
      expect(results.length).toBe(2);
      expect(results[0].entryId).toBe('cs1');
      expect(results[0].similarity).toBeCloseTo(1.0, 5);
      expect(results[1].entryId).toBe('cs2');
      expect(results[1].similarity).toBeCloseTo(0.0, 5);
    });

    it('returns empty for zero query vector', () => {
      ve.add(provider, makeEntry({ id: 'cs3' }), NO_AUTOLINK);
      ve.storeVector(provider, 'cs3', [1, 2], 'model', 2);
      expect(ve.cosineSearch(provider, [0, 0], 5)).toEqual([]);
    });

    it('respects topK limit', () => {
      ve.seed(
        provider,
        [makeEntry({ id: 'tk1' }), makeEntry({ id: 'tk2' }), makeEntry({ id: 'tk3' })],
        NO_AUTOLINK,
      );
      ve.storeVector(provider, 'tk1', [1, 0], 'model', 2);
      ve.storeVector(provider, 'tk2', [0.9, 0.1], 'model', 2);
      ve.storeVector(provider, 'tk3', [0, 1], 'model', 2);

      const results = ve.cosineSearch(provider, [1, 0], 1);
      expect(results.length).toBe(1);
    });
  });
});
