import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeTag,
  normalizeTags,
  normalizeAndDedup,
  addTagAlias,
  getCanonicalTags,
  seedDefaultAliases,
  DEFAULT_TAG_ALIASES,
  type TagStore,
} from './tag-manager.js';

function mockTagStore(): TagStore {
  const aliases = new Map<string, string>();
  const canonicals = new Map<string, string | null>();

  return {
    getAlias: vi.fn((lower: string) => aliases.get(lower) ?? null),
    insertCanonical: vi.fn((tag: string) => { canonicals.set(tag, null); }),
    upsertAlias: vi.fn((alias: string, canonical: string) => { aliases.set(alias, canonical); }),
    getCanonicalRows: vi.fn(() =>
      Array.from(canonicals.entries()).map(([tag, description]) => ({
        tag,
        description,
        alias_count: Array.from(aliases.values()).filter((c) => c === tag).length,
      })),
    ),
    countTagUsage: vi.fn(() => 0),
  };
}

describe('tag-manager', () => {
  let store: TagStore;

  beforeEach(() => {
    store = mockTagStore();
  });

  describe('DEFAULT_TAG_ALIASES', () => {
    it('exports expected alias count', () => {
      expect(DEFAULT_TAG_ALIASES.length).toBe(13);
    });

    it('includes common aliases', () => {
      const aliasMap = new Map(DEFAULT_TAG_ALIASES);
      expect(aliasMap.get('a11y')).toBe('accessibility');
      expect(aliasMap.get('ts')).toBe('typescript');
      expect(aliasMap.get('js')).toBe('javascript');
      expect(aliasMap.get('perf')).toBe('performance');
    });
  });

  describe('normalizeTag', () => {
    it('returns aliased result when store has alias', () => {
      (store.getAlias as ReturnType<typeof vi.fn>).mockReturnValue('accessibility');
      const result = normalizeTag('a11y', store);
      expect(result).toEqual({ original: 'a11y', normalized: 'accessibility', wasAliased: true });
    });

    it('returns lowercased tag when no alias found', () => {
      const result = normalizeTag('MyCustomTag', store);
      expect(result).toEqual({ original: 'MyCustomTag', normalized: 'mycustomtag', wasAliased: false });
    });

    it('trims whitespace', () => {
      const result = normalizeTag('  spaced  ', store);
      expect(result.normalized).toBe('spaced');
    });

    it('lowercases before lookup', () => {
      normalizeTag('A11Y', store);
      expect(store.getAlias).toHaveBeenCalledWith('a11y');
    });
  });

  describe('normalizeTags', () => {
    it('normalizes each tag in the array', () => {
      (store.getAlias as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce('accessibility')
        .mockReturnValueOnce(null);
      const results = normalizeTags(['a11y', 'custom'], store);
      expect(results).toHaveLength(2);
      expect(results[0].wasAliased).toBe(true);
      expect(results[1].wasAliased).toBe(false);
    });

    it('returns empty array for empty input', () => {
      expect(normalizeTags([], store)).toEqual([]);
    });
  });

  describe('normalizeAndDedup', () => {
    it('deduplicates after normalization', () => {
      (store.getAlias as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce('styling')  // css -> styling
        .mockReturnValueOnce('styling'); // tailwind -> styling
      const { results, dedupedTags, changed } = normalizeAndDedup(['css', 'tailwind'], store);
      expect(results).toHaveLength(2);
      expect(dedupedTags).toEqual(['styling']);
      expect(changed).toBe(true);
    });

    it('reports changed=false when no aliases applied', () => {
      const { changed } = normalizeAndDedup(['custom', 'other'], store);
      expect(changed).toBe(false);
    });

    it('reports changed=true when any tag is aliased', () => {
      (store.getAlias as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce('accessibility')
        .mockReturnValueOnce(null);
      const { changed } = normalizeAndDedup(['a11y', 'custom'], store);
      expect(changed).toBe(true);
    });
  });

  describe('addTagAlias', () => {
    it('inserts canonical and upserts alias', () => {
      addTagAlias('react', 'frontend', store);
      expect(store.insertCanonical).toHaveBeenCalledWith('frontend');
      expect(store.upsertAlias).toHaveBeenCalledWith('react', 'frontend');
    });

    it('lowercases and trims both alias and canonical', () => {
      addTagAlias('  React  ', '  Frontend  ', store);
      expect(store.insertCanonical).toHaveBeenCalledWith('frontend');
      expect(store.upsertAlias).toHaveBeenCalledWith('react', 'frontend');
    });
  });

  describe('getCanonicalTags', () => {
    it('maps rows to CanonicalTag objects', () => {
      (store.getCanonicalRows as ReturnType<typeof vi.fn>).mockReturnValue([
        { tag: 'styling', description: 'CSS stuff', alias_count: 3 },
      ]);
      (store.countTagUsage as ReturnType<typeof vi.fn>).mockReturnValue(5);

      const tags = getCanonicalTags(store);
      expect(tags).toEqual([
        { tag: 'styling', description: 'CSS stuff', usageCount: 5, aliasCount: 3 },
      ]);
    });

    it('returns empty array when no canonicals', () => {
      (store.getCanonicalRows as ReturnType<typeof vi.fn>).mockReturnValue([]);
      expect(getCanonicalTags(store)).toEqual([]);
    });
  });

  describe('seedDefaultAliases', () => {
    it('inserts all unique canonical tags', () => {
      seedDefaultAliases(store);
      const uniqueCanonicals = new Set(DEFAULT_TAG_ALIASES.map(([, c]) => c));
      expect(store.insertCanonical).toHaveBeenCalledTimes(uniqueCanonicals.size);
    });

    it('upserts all alias pairs', () => {
      seedDefaultAliases(store);
      expect(store.upsertAlias).toHaveBeenCalledTimes(DEFAULT_TAG_ALIASES.length);
      // Spot check
      expect(store.upsertAlias).toHaveBeenCalledWith('a11y', 'accessibility');
      expect(store.upsertAlias).toHaveBeenCalledWith('ts', 'typescript');
    });
  });
});
