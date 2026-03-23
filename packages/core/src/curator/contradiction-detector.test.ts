import { describe, it, expect, vi } from 'vitest';
import type { IntelligenceEntry } from '../intelligence/types.js';
import { findContradictions, DEFAULT_CONTRADICTION_THRESHOLD } from './contradiction-detector.js';

function makeEntry(overrides: Partial<IntelligenceEntry> = {}): IntelligenceEntry {
  return {
    id: overrides.id ?? 'test-1',
    type: overrides.type ?? 'pattern',
    domain: overrides.domain ?? 'testing',
    title: overrides.title ?? 'Test Pattern',
    severity: overrides.severity ?? 'warning',
    description: overrides.description ?? 'A test pattern for testing.',
    tags: overrides.tags ?? ['testing'],
  };
}

describe('contradiction-detector', () => {
  describe('constants', () => {
    it('exports DEFAULT_CONTRADICTION_THRESHOLD', () => {
      expect(DEFAULT_CONTRADICTION_THRESHOLD).toBe(0.4);
    });
  });

  describe('findContradictions', () => {
    it('returns empty array when no entries', () => {
      expect(findContradictions([])).toEqual([]);
    });

    it('returns empty array when no anti-patterns', () => {
      const entries = [
        makeEntry({ id: 'p1', type: 'pattern' }),
        makeEntry({ id: 'p2', type: 'pattern' }),
      ];
      expect(findContradictions(entries)).toEqual([]);
    });

    it('returns empty array when no patterns', () => {
      const entries = [
        makeEntry({ id: 'ap1', type: 'anti-pattern' }),
        makeEntry({ id: 'ap2', type: 'anti-pattern' }),
      ];
      expect(findContradictions(entries)).toEqual([]);
    });

    it('detects contradictions between similar pattern and anti-pattern', () => {
      const entries = [
        makeEntry({
          id: 'p-inline',
          type: 'pattern',
          title: 'Use inline styles for dynamic values',
          description: 'Apply inline styles when values are computed at runtime.',
          tags: ['styling'],
        }),
        makeEntry({
          id: 'ap-inline',
          type: 'anti-pattern',
          title: 'Avoid inline styles for styling',
          description: 'Never use inline styles — prefer CSS classes.',
          tags: ['styling'],
        }),
      ];
      const results = findContradictions(entries, 0.2);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].patternId).toBe('p-inline');
      expect(results[0].antipatternId).toBe('ap-inline');
      expect(results[0].similarity).toBeGreaterThanOrEqual(0.2);
    });

    it('skips unrelated pattern/anti-pattern pairs', () => {
      const entries = [
        makeEntry({
          id: 'p-auth',
          type: 'pattern',
          title: 'Use JWT for authentication',
          description: 'JSON Web Tokens for stateless auth.',
          tags: ['auth'],
        }),
        makeEntry({
          id: 'ap-css',
          type: 'anti-pattern',
          title: 'Avoid CSS important',
          description: 'Never use important in CSS declarations.',
          tags: ['styling'],
        }),
      ];
      const results = findContradictions(entries, 0.8);
      expect(results.length).toBe(0);
    });

    it('uses searchFn when provided', () => {
      const pattern = makeEntry({
        id: 'p1',
        type: 'pattern',
        title: 'Use inline styles',
        description: 'Apply inline styles.',
      });
      const antipattern = makeEntry({
        id: 'ap1',
        type: 'anti-pattern',
        title: 'Avoid inline styles',
        description: 'Do not use inline styles.',
      });
      const entries = [pattern, antipattern];

      const searchFn = vi.fn().mockReturnValue([pattern]);
      const results = findContradictions(entries, 0.2, searchFn);

      expect(searchFn).toHaveBeenCalledWith('Avoid inline styles');
      expect(results.length).toBeGreaterThan(0);
    });

    it('falls back to all patterns when searchFn returns empty', () => {
      const entries = [
        makeEntry({ id: 'p1', type: 'pattern', title: 'Use inline styles', description: 'Inline.' }),
        makeEntry({ id: 'ap1', type: 'anti-pattern', title: 'Avoid inline styles', description: 'No inline.' }),
      ];

      const searchFn = vi.fn().mockReturnValue([]);
      const results = findContradictions(entries, 0.2, searchFn);

      expect(searchFn).toHaveBeenCalled();
      // Should still detect — falls back to full scan
      expect(results.length).toBeGreaterThan(0);
    });

    it('falls back to all patterns when searchFn throws', () => {
      const entries = [
        makeEntry({ id: 'p1', type: 'pattern', title: 'Use inline styles', description: 'Inline.' }),
        makeEntry({ id: 'ap1', type: 'anti-pattern', title: 'Avoid inline styles', description: 'No inline.' }),
      ];

      const searchFn = vi.fn().mockImplementation(() => {
        throw new Error('FTS5 unavailable');
      });
      const results = findContradictions(entries, 0.2, searchFn);

      expect(results.length).toBeGreaterThan(0);
    });

    it('respects threshold — high threshold reduces detections', () => {
      const entries = [
        makeEntry({
          id: 'p1',
          type: 'pattern',
          title: 'Prefer inline styles for dynamic',
          description: 'Use inline for dynamic values.',
        }),
        makeEntry({
          id: 'ap1',
          type: 'anti-pattern',
          title: 'Avoid inline styles completely',
          description: 'Never use inline styles at all.',
        }),
      ];
      const lowThreshold = findContradictions(entries, 0.1);
      const highThreshold = findContradictions(entries, 0.99);
      expect(highThreshold.length).toBeLessThanOrEqual(lowThreshold.length);
    });

    it('uses default threshold when none provided', () => {
      const entries = [
        makeEntry({ id: 'p1', type: 'pattern', title: 'A', description: 'B' }),
        makeEntry({ id: 'ap1', type: 'anti-pattern', title: 'C', description: 'D' }),
      ];
      // Should not throw
      const results = findContradictions(entries);
      expect(Array.isArray(results)).toBe(true);
    });

    it('ignores entries that are neither pattern nor anti-pattern', () => {
      const entries = [
        makeEntry({ id: 'r1', type: 'rule', title: 'Use inline styles', description: 'Inline.' }),
        makeEntry({ id: 'ap1', type: 'anti-pattern', title: 'Avoid inline styles', description: 'No inline.' }),
      ];
      // Rules should not be compared against anti-patterns
      const results = findContradictions(entries, 0.1);
      expect(results.length).toBe(0);
    });
  });
});
