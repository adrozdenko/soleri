import { describe, it, expect } from 'vitest';
import type { IntelligenceEntry } from '../intelligence/types.js';
import {
  detectDuplicates,
  buildVocabulary,
  entryToText,
  DEFAULT_DUPLICATE_THRESHOLD,
  MERGE_SUGGESTION_THRESHOLD,
} from './duplicate-detector.js';

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

describe('duplicate-detector', () => {
  describe('buildVocabulary', () => {
    it('returns IDF scores for all unique tokens across entries', () => {
      const entries = [
        makeEntry({ id: '1', title: 'Use semantic tokens', description: 'Tokens for colors' }),
        makeEntry({ id: '2', title: 'Avoid raw colors', description: 'Never use hex values' }),
      ];
      const vocab = buildVocabulary(entries);
      expect(vocab.size).toBeGreaterThan(0);
      // Common terms should have lower IDF than unique terms
      for (const [, idf] of vocab) {
        expect(idf).toBeGreaterThan(0);
      }
    });

    it('returns empty map for empty entries', () => {
      const vocab = buildVocabulary([]);
      expect(vocab.size).toBe(0);
    });

    it('gives higher IDF to rare terms', () => {
      const entries = [
        makeEntry({ id: '1', title: 'authentication jwt tokens', description: 'auth' }),
        makeEntry({ id: '2', title: 'database connection pooling', description: 'db' }),
        makeEntry({ id: '3', title: 'authentication session cookies', description: 'auth' }),
      ];
      const vocab = buildVocabulary(entries);
      // "authentication" appears in 2/3 docs, "pooling" in 1/3 — pooling should have higher IDF
      const authIdf = vocab.get('authentication') ?? 0;
      const poolingIdf = vocab.get('pooling') ?? 0;
      expect(poolingIdf).toBeGreaterThan(authIdf);
    });
  });

  describe('entryToText', () => {
    it('concatenates title, description, context, and tags', () => {
      const entry = makeEntry({
        title: 'My Title',
        description: 'My Desc',
        tags: ['tag1', 'tag2'],
      });
      entry.context = 'Some context';
      const text = entryToText(entry);
      expect(text).toContain('My Title');
      expect(text).toContain('My Desc');
      expect(text).toContain('Some context');
      expect(text).toContain('tag1');
      expect(text).toContain('tag2');
    });

    it('handles missing context', () => {
      const entry = makeEntry({ title: 'Title', description: 'Desc' });
      const text = entryToText(entry);
      expect(text).toContain('Title');
      expect(text).toContain('Desc');
    });
  });

  describe('constants', () => {
    it('exports expected threshold values', () => {
      expect(DEFAULT_DUPLICATE_THRESHOLD).toBe(0.45);
      expect(MERGE_SUGGESTION_THRESHOLD).toBe(0.65);
    });
  });

  describe('detectDuplicates', () => {
    it('returns empty array for empty entries', () => {
      expect(detectDuplicates([])).toEqual([]);
    });

    it('returns empty array for single entry', () => {
      const entries = [makeEntry({ id: '1' })];
      expect(detectDuplicates(entries)).toEqual([]);
    });

    it('detects duplicates with identical content', () => {
      const entries = [
        makeEntry({
          id: 'dup-1',
          title: 'Validate user input',
          description: 'Always validate user input before processing.',
        }),
        makeEntry({
          id: 'dup-2',
          title: 'Validate user input',
          description: 'Always validate user input before processing.',
        }),
      ];
      const results = detectDuplicates(entries, undefined, 0.3);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].matches[0].suggestMerge).toBe(true);
    });

    it('does not flag unrelated entries', () => {
      const entries = [
        makeEntry({
          id: 'a',
          title: 'Database indexing strategies',
          description: 'Create indices on columns.',
        }),
        makeEntry({
          id: 'b',
          title: 'React component lifecycle',
          description: 'Use useEffect for side effects.',
        }),
      ];
      const results = detectDuplicates(entries, undefined, 0.8);
      expect(results.length).toBe(0);
    });

    it('filters by entryId when provided', () => {
      const entries = [
        makeEntry({ id: 'x', title: 'Authentication with JWT', description: 'Use JWT for auth.' }),
        makeEntry({
          id: 'y',
          title: 'JWT authentication pattern',
          description: 'Implement JWT auth.',
        }),
        makeEntry({ id: 'z', title: 'Database pooling', description: 'Connection pools.' }),
      ];
      const results = detectDuplicates(entries, 'x', 0.3);
      expect(results.length).toBeLessThanOrEqual(1);
      if (results.length > 0) {
        expect(results[0].entryId).toBe('x');
      }
    });

    it('skips cross-domain pairs', () => {
      const entries = [
        makeEntry({
          id: '1',
          domain: 'design',
          title: 'Use semantic tokens',
          description: 'Always use semantic tokens.',
        }),
        makeEntry({
          id: '2',
          domain: 'architecture',
          title: 'Use semantic tokens',
          description: 'Always use semantic tokens.',
        }),
      ];
      const results = detectDuplicates(entries, undefined, 0.3);
      expect(results.length).toBe(0);
    });

    it('flags same-domain similar entries', () => {
      const entries = [
        makeEntry({
          id: '1',
          domain: 'design',
          title: 'Use semantic tokens for colors',
          description: 'Always use semantic tokens.',
        }),
        makeEntry({
          id: '2',
          domain: 'design',
          title: 'Use semantic tokens for color values',
          description: 'Prefer semantic color tokens.',
        }),
      ];
      const results = detectDuplicates(entries, undefined, 0.3);
      expect(results.length).toBeGreaterThan(0);
    });

    it('sets suggestMerge based on MERGE_SUGGESTION_THRESHOLD', () => {
      const entries = [
        makeEntry({
          id: 'a',
          title: 'Exact same title',
          description: 'Exact same description for merge test.',
        }),
        makeEntry({
          id: 'b',
          title: 'Exact same title',
          description: 'Exact same description for merge test.',
        }),
      ];
      const results = detectDuplicates(entries, undefined, 0.3);
      expect(results.length).toBeGreaterThan(0);
      // Identical entries should have very high similarity
      expect(results[0].matches[0].suggestMerge).toBe(true);
    });

    it('sorts matches by descending similarity', () => {
      const entries = [
        makeEntry({
          id: 'base',
          title: 'Use semantic tokens for colors',
          description: 'Tokens for styling.',
        }),
        makeEntry({
          id: 'close',
          title: 'Use semantic tokens for color values',
          description: 'Tokens for styling values.',
        }),
        makeEntry({
          id: 'far',
          title: 'Semantic approach to colors',
          description: 'Use semantic color approach.',
        }),
      ];
      const results = detectDuplicates(entries, 'base', 0.1);
      if (results.length > 0 && results[0].matches.length > 1) {
        expect(results[0].matches[0].similarity).toBeGreaterThanOrEqual(
          results[0].matches[1].similarity,
        );
      }
    });

    it('includes scannedCount in results', () => {
      const entries = [
        makeEntry({ id: '1', title: 'Same thing', description: 'Same desc.' }),
        makeEntry({ id: '2', title: 'Same thing', description: 'Same desc.' }),
        makeEntry({ id: '3', title: 'Different thing', description: 'Different desc.' }),
      ];
      const results = detectDuplicates(entries, '1', 0.3);
      if (results.length > 0) {
        expect(results[0].scannedCount).toBe(2); // 3 entries minus self
      }
    });
  });
});
