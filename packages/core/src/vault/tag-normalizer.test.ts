import { describe, it, expect } from 'vitest';
import {
  computeEditDistance,
  normalizeTag,
  normalizeTags,
  isMetadataTag,
} from './tag-normalizer.js';

// ─── computeEditDistance ────────────────────────────────────────────────────

describe('computeEditDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(computeEditDistance('workflow', 'workflow')).toBe(0);
  });

  it('returns length of b for empty a', () => {
    expect(computeEditDistance('', 'abc')).toBe(3);
  });

  it('returns length of a for empty b', () => {
    expect(computeEditDistance('abc', '')).toBe(3);
  });

  it('single insertion: workflow → workflows', () => {
    expect(computeEditDistance('workflow', 'workflows')).toBe(1);
  });

  it('single deletion: testing → testin', () => {
    expect(computeEditDistance('testing', 'testin')).toBe(1);
  });

  it('single substitution: arch → arcs', () => {
    expect(computeEditDistance('arch', 'arcs')).toBe(1);
  });

  it('distance 1: architcture → architecture (single transposition)', () => {
    expect(computeEditDistance('architcture', 'architecture')).toBe(1);
  });

  it('distance 2: archtecrure → architecture (two edits)', () => {
    expect(computeEditDistance('archtecrure', 'architecture')).toBe(2);
  });

  it('large distance: typescript → javascript', () => {
    expect(computeEditDistance('typescript', 'javascript')).toBeGreaterThan(3);
  });

  it('is symmetric', () => {
    expect(computeEditDistance('foo', 'bar')).toBe(computeEditDistance('bar', 'foo'));
  });
});

// ─── isMetadataTag ──────────────────────────────────────────────────────────

describe('isMetadataTag', () => {
  it('returns true when tag matches a prefix', () => {
    expect(isMetadataTag('source:article', ['source:'])).toBe(true);
  });

  it('returns true for exact prefix match', () => {
    expect(isMetadataTag('source:ingested', ['source:'])).toBe(true);
  });

  it('returns false when no prefix matches', () => {
    expect(isMetadataTag('typescript', ['source:'])).toBe(false);
  });

  it('returns false with empty prefix list', () => {
    expect(isMetadataTag('source:article', [])).toBe(false);
  });

  it('supports multiple prefixes', () => {
    expect(isMetadataTag('meta:foo', ['source:', 'meta:'])).toBe(true);
  });
});

// ─── normalizeTag ───────────────────────────────────────────────────────────

const CANONICAL = ['architecture', 'typescript', 'workflow', 'testing', 'performance'];

describe('normalizeTag — mode: off', () => {
  it('returns tag as-is regardless of canonical list', () => {
    expect(normalizeTag('workflows', CANONICAL, 'off')).toBe('workflows');
  });

  it('passes through noise words in off mode', () => {
    expect(normalizeTag('new', CANONICAL, 'off')).toBe('new');
  });
});

describe('normalizeTag — noise stripping', () => {
  it('drops version strings (v1.2)', () => {
    expect(normalizeTag('v1.2', CANONICAL, 'suggest')).toBeNull();
  });

  it('drops version strings (v10)', () => {
    expect(normalizeTag('v10', CANONICAL, 'suggest')).toBeNull();
  });

  it('drops generic noise word: new', () => {
    expect(normalizeTag('new', CANONICAL, 'suggest')).toBeNull();
  });

  it('drops generic noise word: via', () => {
    expect(normalizeTag('via', CANONICAL, 'suggest')).toBeNull();
  });

  it('drops generic noise word: raw', () => {
    expect(normalizeTag('raw', CANONICAL, 'enforce')).toBeNull();
  });
});

describe('normalizeTag — mode: suggest', () => {
  it('returns canonical for exact match', () => {
    expect(normalizeTag('typescript', CANONICAL, 'suggest')).toBe('typescript');
  });

  it('maps within edit-distance 2 to canonical', () => {
    // 'workflows' is distance 1 from 'workflow'
    expect(normalizeTag('workflows', CANONICAL, 'suggest')).toBe('workflow');
  });

  it('lowercases tag before matching', () => {
    expect(normalizeTag('TypeScript', CANONICAL, 'suggest')).toBe('typescript');
  });

  it('passes through unknown tag with no close canonical (suggest passthrough)', () => {
    const result = normalizeTag('gamification', CANONICAL, 'suggest');
    // No match within distance 2 — passthrough
    expect(result).toBe('gamification');
  });

  it('returns null for noise even in suggest mode', () => {
    expect(normalizeTag('one', CANONICAL, 'suggest')).toBeNull();
  });
});

describe('normalizeTag — mode: enforce', () => {
  it('returns canonical for exact match', () => {
    expect(normalizeTag('testing', CANONICAL, 'enforce')).toBe('testing');
  });

  it('maps within edit-distance 3 to canonical', () => {
    // 'archtecrure' is 2 away from 'architecture'
    expect(normalizeTag('archtecrure', CANONICAL, 'enforce')).toBe('architecture');
  });

  it('returns null for tag with no match within distance 3', () => {
    // 'gamification' is far from all CANONICAL entries
    expect(normalizeTag('gamification', CANONICAL, 'enforce')).toBeNull();
  });

  it('returns null for noise words', () => {
    expect(normalizeTag('full', CANONICAL, 'enforce')).toBeNull();
  });
});

describe('normalizeTag — empty canonical list', () => {
  it('suggest mode: passes through non-noise tags', () => {
    expect(normalizeTag('react', [], 'suggest')).toBe('react');
  });

  it('enforce mode: drops all tags (no canonical to match)', () => {
    expect(normalizeTag('react', [], 'enforce')).toBeNull();
  });
});

// ─── normalizeTags ──────────────────────────────────────────────────────────

describe('normalizeTags', () => {
  it('deduplicates tags that map to the same canonical', () => {
    // Both 'workflows' and 'workflow' normalize to 'workflow'
    const result = normalizeTags(['workflows', 'workflow'], CANONICAL, 'suggest');
    expect(result).toEqual(['workflow']);
  });

  it('preserves metadata tags unchanged', () => {
    const result = normalizeTags(['source:article', 'typescript'], CANONICAL, 'enforce', [
      'source:',
    ]);
    expect(result).toContain('source:article');
    expect(result).toContain('typescript');
  });

  it('metadata tags bypass canonical normalization in enforce mode', () => {
    // 'source:mytype' does not match any canonical — but it should be kept
    const result = normalizeTags(['source:mytype'], CANONICAL, 'enforce', ['source:']);
    expect(result).toEqual(['source:mytype']);
  });

  it('returns empty array when all tags are noise', () => {
    const result = normalizeTags(['new', 'via', 'raw', 'v1.2'], CANONICAL, 'suggest');
    expect(result).toEqual([]);
  });

  it('in off mode, returns tags unchanged', () => {
    const input = ['new', 'workflows', 'v1.2'];
    const result = normalizeTags(input, CANONICAL, 'off');
    expect(result).toEqual(input);
  });

  it('batch normalizes a mixed tag list', () => {
    const result = normalizeTags(
      ['TypeScript', 'workflows', 'new', 'source:article'],
      CANONICAL,
      'suggest',
      ['source:'],
    );
    expect(result).toContain('typescript');
    expect(result).toContain('workflow');
    expect(result).toContain('source:article');
    expect(result).not.toContain('new');
  });
});
