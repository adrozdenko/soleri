import { describe, it, expect } from 'vitest';
import { toObsidianMarkdown, titleToSlug, type ResolvedLinks } from '../obsidian-sync.js';
import type { IntelligenceEntry } from '../../intelligence/types.js';
import type { VaultLink } from '../vault-types.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<IntelligenceEntry> = {}): IntelligenceEntry {
  return {
    id: 'test-1',
    type: 'pattern',
    domain: 'testing',
    title: 'Test Entry',
    severity: 'suggestion',
    description: 'A test entry.',
    tags: ['test'],
    ...overrides,
  };
}

function makeLink(overrides: Partial<VaultLink> = {}): VaultLink {
  return {
    sourceId: 'src-1',
    targetId: 'tgt-1',
    linkType: 'supports',
    createdAt: Date.now(),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('obsidian-sync wikilinks', () => {
  describe('toObsidianMarkdown without links', () => {
    it('produces no ## Related section', () => {
      const entry = makeEntry();
      const md = toObsidianMarkdown(entry);

      expect(md).toContain('# Test Entry');
      expect(md).toContain('A test entry.');
      expect(md).not.toContain('## Related');
    });
  });

  describe('toObsidianMarkdown with resolvedLinks', () => {
    it('produces a ## Related section', () => {
      const entry = makeEntry();
      const titleMap = new Map<string, string>();
      titleMap.set('tgt-1', 'Linked Pattern');

      const resolvedLinks: ResolvedLinks = {
        outgoing: [makeLink({ sourceId: 'test-1', targetId: 'tgt-1', linkType: 'supports' })],
        incoming: [],
        titleMap,
      };

      const md = toObsidianMarkdown(entry, resolvedLinks);

      expect(md).toContain('## Related');
      expect(md).toContain('[[linked-pattern]]');
    });
  });

  describe('buildRelatedSection (tested via toObsidianMarkdown)', () => {
    it('groups links by type', () => {
      const entry = makeEntry();
      const titleMap = new Map<string, string>();
      titleMap.set('tgt-1', 'Alpha Pattern');
      titleMap.set('tgt-2', 'Beta Pattern');
      titleMap.set('tgt-3', 'Gamma Rule');

      const resolvedLinks: ResolvedLinks = {
        outgoing: [
          makeLink({ sourceId: 'test-1', targetId: 'tgt-1', linkType: 'supports' }),
          makeLink({ sourceId: 'test-1', targetId: 'tgt-2', linkType: 'supports' }),
          makeLink({ sourceId: 'test-1', targetId: 'tgt-3', linkType: 'contradicts' }),
        ],
        incoming: [],
        titleMap,
      };

      const md = toObsidianMarkdown(entry, resolvedLinks);

      // Supports group should have both alpha and beta
      expect(md).toContain('**Supports:** [[alpha-pattern]], [[beta-pattern]]');
      // Contradicts group should have gamma
      expect(md).toContain('**Contradicts:** [[gamma-rule]]');
    });

    it('returns null (no section) for empty links', () => {
      const entry = makeEntry();
      const resolvedLinks: ResolvedLinks = {
        outgoing: [],
        incoming: [],
        titleMap: new Map(),
      };

      const md = toObsidianMarkdown(entry, resolvedLinks);

      expect(md).not.toContain('## Related');
    });
  });

  describe('wikilink slug format', () => {
    it('uses titleToSlug format: [[kebab-case-title]]', () => {
      expect(titleToSlug('My Cool Pattern')).toBe('my-cool-pattern');
      expect(titleToSlug('Error Handling Best Practice')).toBe('error-handling-best-practice');
    });

    it('renders wikilinks with slugified titles', () => {
      const entry = makeEntry();
      const titleMap = new Map<string, string>();
      titleMap.set('tgt-1', 'Error Handling Best Practice');

      const resolvedLinks: ResolvedLinks = {
        outgoing: [makeLink({ sourceId: 'test-1', targetId: 'tgt-1', linkType: 'extends' })],
        incoming: [],
        titleMap,
      };

      const md = toObsidianMarkdown(entry, resolvedLinks);

      expect(md).toContain('[[error-handling-best-practice]]');
    });
  });

  describe('both outgoing and incoming links', () => {
    it('includes links from both directions', () => {
      const entry = makeEntry({ id: 'center' });
      const titleMap = new Map<string, string>();
      titleMap.set('tgt-out', 'Outgoing Target');
      titleMap.set('src-in', 'Incoming Source');

      const resolvedLinks: ResolvedLinks = {
        outgoing: [makeLink({ sourceId: 'center', targetId: 'tgt-out', linkType: 'supports' })],
        incoming: [makeLink({ sourceId: 'src-in', targetId: 'center', linkType: 'supports' })],
        titleMap,
      };

      const md = toObsidianMarkdown(entry, resolvedLinks);

      expect(md).toContain('[[outgoing-target]]');
      expect(md).toContain('[[incoming-source]]');
    });
  });

  describe('link type capitalization in section headers', () => {
    it('capitalizes Supports, Contradicts, Extends', () => {
      const entry = makeEntry();
      const titleMap = new Map<string, string>();
      titleMap.set('t1', 'Alpha');
      titleMap.set('t2', 'Beta');
      titleMap.set('t3', 'Gamma');

      const resolvedLinks: ResolvedLinks = {
        outgoing: [
          makeLink({ sourceId: 'test-1', targetId: 't1', linkType: 'supports' }),
          makeLink({ sourceId: 'test-1', targetId: 't2', linkType: 'contradicts' }),
          makeLink({ sourceId: 'test-1', targetId: 't3', linkType: 'extends' }),
        ],
        incoming: [],
        titleMap,
      };

      const md = toObsidianMarkdown(entry, resolvedLinks);

      expect(md).toContain('**Supports:**');
      expect(md).toContain('**Contradicts:**');
      expect(md).toContain('**Extends:**');
      // Should NOT contain lowercase versions as labels
      expect(md).not.toMatch(/\*\*supports:\*\*/);
      expect(md).not.toMatch(/\*\*contradicts:\*\*/);
      expect(md).not.toMatch(/\*\*extends:\*\*/);
    });
  });
});
