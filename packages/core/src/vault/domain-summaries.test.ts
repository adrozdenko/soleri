/**
 * Unit tests for DomainSummaryManager — pre-computed domain compression layer.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Vault } from './vault.js';
import type { IntelligenceEntry } from '../intelligence/types.js';

function makeEntry(
  overrides: Partial<IntelligenceEntry> & { id: string; domain: string },
): IntelligenceEntry {
  return {
    type: 'pattern',
    title: `Test pattern ${overrides.id}`,
    severity: 'suggestion',
    description: `Description for ${overrides.id}`,
    tags: ['test'],
    ...overrides,
  } as IntelligenceEntry;
}

describe('DomainSummaryManager', () => {
  let vault: Vault;

  beforeEach(() => {
    vault = Vault.createWithSQLite(':memory:');
  });

  describe('get()', () => {
    it('returns null for a domain with no entries', () => {
      const result = vault.domainSummaries.get('nonexistent');
      expect(result).toBeNull();
    });

    it('builds summary on first access for a domain with entries', () => {
      vault.seed([
        makeEntry({ id: 'p1', domain: 'testing', title: 'Always use arrange-act-assert' }),
        makeEntry({
          id: 'p2',
          domain: 'testing',
          title: 'Mock-free integration tests',
          type: 'anti-pattern',
        }),
      ]);

      const summary = vault.domainSummaries.get('testing');
      expect(summary).not.toBeNull();
      expect(summary!.domain).toBe('testing');
      expect(summary!.entryCount).toBe(2);
      expect(summary!.stale).toBe(false);
      expect(summary!.summary).toContain('testing');
      expect(summary!.topPatterns).toContain('Always use arrange-act-assert');
      expect(summary!.topAntipatterns).toContain('Mock-free integration tests');
    });

    it('returns cached summary on second access', () => {
      vault.seed([makeEntry({ id: 'p1', domain: 'architecture' })]);

      const first = vault.domainSummaries.get('architecture');
      const second = vault.domainSummaries.get('architecture');
      expect(first!.lastRebuilt).toBe(second!.lastRebuilt);
    });
  });

  describe('markStale() and lazy rebuild', () => {
    it('marks a domain as stale', () => {
      vault.seed([makeEntry({ id: 'p1', domain: 'testing' })]);
      // Force initial build
      vault.domainSummaries.get('testing');

      vault.domainSummaries.markStale('testing');
      const stats = vault.domainSummaries.stats();
      expect(stats.staleDomains).toBeGreaterThanOrEqual(1);
    });

    it('rebuilds stale summary on next get()', () => {
      vault.seed([makeEntry({ id: 'p1', domain: 'testing', title: 'Original pattern' })]);
      const first = vault.domainSummaries.get('testing');
      expect(first!.summary).toContain('Original pattern');

      // Add a new entry and mark stale
      vault.add(makeEntry({ id: 'p2', domain: 'testing', title: 'New pattern added' }));
      // add() should have marked it stale automatically

      const second = vault.domainSummaries.get('testing');
      expect(second!.entryCount).toBe(2);
      expect(second!.stale).toBe(false);
    });
  });

  describe('automatic invalidation via Vault write paths', () => {
    it('seed() marks affected domains stale', () => {
      vault.seed([makeEntry({ id: 'p1', domain: 'testing' })]);
      vault.domainSummaries.get('testing'); // build fresh

      vault.seed([makeEntry({ id: 'p2', domain: 'testing', title: 'Another pattern' })]);

      // Internally stale, but get() will rebuild
      const stats = vault.domainSummaries.stats();
      expect(stats.staleDomains).toBeGreaterThanOrEqual(1);
    });

    it('add() marks domain stale', () => {
      vault.seed([makeEntry({ id: 'p1', domain: 'react' })]);
      vault.domainSummaries.get('react'); // build

      vault.add(makeEntry({ id: 'p2', domain: 'react' }));
      const summary = vault.domainSummaries.get('react');
      expect(summary!.entryCount).toBe(2);
    });

    it('update() marks both old and new domain stale on domain change', () => {
      vault.seed([makeEntry({ id: 'p1', domain: 'react' })]);
      vault.domainSummaries.get('react');

      vault.update('p1', { domain: 'typescript' });

      const reactSummary = vault.domainSummaries.get('react');
      expect(reactSummary).toBeNull(); // No entries left in react

      const tsSummary = vault.domainSummaries.get('typescript');
      expect(tsSummary).not.toBeNull();
      expect(tsSummary!.entryCount).toBe(1);
    });

    it('remove() marks domain stale', () => {
      vault.seed([
        makeEntry({ id: 'p1', domain: 'testing' }),
        makeEntry({ id: 'p2', domain: 'testing' }),
      ]);
      vault.domainSummaries.get('testing');

      vault.remove('p1');
      const summary = vault.domainSummaries.get('testing');
      expect(summary!.entryCount).toBe(1);
    });

    it('bulkRemove() marks affected domains stale', () => {
      vault.seed([
        makeEntry({ id: 'p1', domain: 'testing' }),
        makeEntry({ id: 'p2', domain: 'architecture' }),
      ]);
      vault.domainSummaries.get('testing');
      vault.domainSummaries.get('architecture');

      vault.bulkRemove(['p1', 'p2']);
      // Both domains should have been invalidated
      const testSummary = vault.domainSummaries.get('testing');
      expect(testSummary).toBeNull();
    });
  });

  describe('rebuild()', () => {
    it('prioritizes critical entries in summary', () => {
      vault.seed([
        makeEntry({
          id: 'c1',
          domain: 'security',
          severity: 'critical',
          title: 'Never store plaintext passwords',
        }),
        makeEntry({
          id: 's1',
          domain: 'security',
          severity: 'suggestion',
          title: 'Consider rate limiting',
        }),
      ]);

      const summary = vault.domainSummaries.rebuild('security');
      expect(summary).not.toBeNull();
      expect(summary!.summary).toContain('Critical');
      expect(summary!.summary).toContain('Never store plaintext passwords');
    });

    it('includes tag frequency in summary', () => {
      vault.seed([
        makeEntry({ id: 'p1', domain: 'testing', tags: ['vitest', 'tdd'] }),
        makeEntry({ id: 'p2', domain: 'testing', tags: ['vitest', 'mocking'] }),
        makeEntry({ id: 'p3', domain: 'testing', tags: ['vitest', 'tdd', 'integration'] }),
      ]);

      const summary = vault.domainSummaries.rebuild('testing');
      expect(summary!.summary).toContain('vitest'); // most frequent tag
    });

    it('returns null for empty domain', () => {
      const summary = vault.domainSummaries.rebuild('nonexistent');
      expect(summary).toBeNull();
    });
  });

  describe('rebuildAll()', () => {
    it('rebuilds all stale summaries', () => {
      vault.seed([
        makeEntry({ id: 'p1', domain: 'testing' }),
        makeEntry({ id: 'p2', domain: 'architecture' }),
        makeEntry({ id: 'p3', domain: 'react' }),
      ]);

      const rebuilt = vault.domainSummaries.rebuildAll();
      expect(rebuilt).toBe(3);

      const stats = vault.domainSummaries.stats();
      expect(stats.freshDomains).toBe(3);
      expect(stats.staleDomains).toBe(0);
    });

    it('skips already-fresh domains', () => {
      vault.seed([
        makeEntry({ id: 'p1', domain: 'testing' }),
        makeEntry({ id: 'p2', domain: 'architecture' }),
      ]);

      vault.domainSummaries.rebuildAll();
      const rebuilt2 = vault.domainSummaries.rebuildAll();
      expect(rebuilt2).toBe(0);
    });
  });

  describe('stats()', () => {
    it('returns correct counts', () => {
      vault.seed([
        makeEntry({ id: 'p1', domain: 'testing' }),
        makeEntry({ id: 'p2', domain: 'architecture' }),
      ]);
      vault.domainSummaries.get('testing'); // fresh
      vault.domainSummaries.markStale('architecture'); // stale placeholder

      const stats = vault.domainSummaries.stats();
      expect(stats.totalDomains).toBe(2);
      expect(stats.freshDomains).toBe(1);
      expect(stats.staleDomains).toBe(1);
      expect(stats.totalEntries).toBe(2);
    });
  });

  describe('getMultiple()', () => {
    it('returns summaries for multiple domains', () => {
      vault.seed([
        makeEntry({ id: 'p1', domain: 'testing' }),
        makeEntry({ id: 'p2', domain: 'architecture' }),
        makeEntry({ id: 'p3', domain: 'react' }),
      ]);

      const summaries = vault.domainSummaries.getMultiple([
        'testing',
        'architecture',
        'nonexistent',
      ]);
      expect(summaries).toHaveLength(2);
      expect(summaries.map((s) => s.domain).sort()).toEqual(['architecture', 'testing']);
    });

    it('returns empty array for empty input', () => {
      expect(vault.domainSummaries.getMultiple([])).toEqual([]);
    });
  });

  describe('list()', () => {
    it('lists all domain summaries sorted by entry count', () => {
      vault.seed([
        makeEntry({ id: 'p1', domain: 'testing' }),
        makeEntry({ id: 'p2', domain: 'testing' }),
        makeEntry({ id: 'p3', domain: 'architecture' }),
      ]);
      vault.domainSummaries.rebuildAll();

      const list = vault.domainSummaries.list();
      expect(list).toHaveLength(2);
      expect(list[0].domain).toBe('testing'); // more entries
      expect(list[0].entryCount).toBe(2);
    });
  });

  describe('summary quality', () => {
    it('keeps summary under 1200 chars', () => {
      // Create many entries with long descriptions
      const longEntries = Array.from({ length: 15 }, (_, i) =>
        makeEntry({
          id: `long-${i}`,
          domain: 'verbose',
          title: `Pattern number ${i} with a reasonably long title that takes up space`,
          description: 'A'.repeat(500),
          tags: ['tag-a', 'tag-b', 'tag-c', `tag-${i}`],
        }),
      );
      vault.seed(longEntries);

      const summary = vault.domainSummaries.get('verbose');
      expect(summary!.summary.length).toBeLessThanOrEqual(1200);
    });

    it('separates patterns from anti-patterns', () => {
      vault.seed([
        makeEntry({ id: 'p1', domain: 'testing', type: 'pattern', title: 'Use TDD' }),
        makeEntry({
          id: 'a1',
          domain: 'testing',
          type: 'anti-pattern',
          title: 'Mocking everything',
        }),
      ]);

      const summary = vault.domainSummaries.get('testing');
      expect(summary!.topPatterns).toContain('Use TDD');
      expect(summary!.topAntipatterns).toContain('Mocking everything');
      expect(summary!.summary).toContain('Patterns');
      expect(summary!.summary).toContain('Avoid');
    });
  });
});
