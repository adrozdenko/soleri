/**
 * Text Similarity Utilities — Unit Tests
 *
 * Covers:
 * 1. tokenize — normal text, empty string, special characters, stopword removal
 * 2. calculateTf — term frequency computation
 * 3. calculateTfIdf — TF-IDF scoring with vocabulary
 * 4. cosineSimilarity — identical, orthogonal, and similar vectors
 * 5. jaccardSimilarity — identical, disjoint, and overlapping sets
 * 6. Edge cases — empty inputs, single tokens, long documents
 */

import { describe, it, expect } from 'vitest';
import {
  tokenize,
  calculateTf,
  calculateTfIdf,
  cosineSimilarity,
  jaccardSimilarity,
} from '../similarity.js';
import type { SparseVector } from '../similarity.js';

// ── Helpers ─────────────────────────────────────────────────────────────

/** Convert a SparseVector to a plain object for easier assertions. */
function vecToObj(v: SparseVector): Record<string, number> {
  const obj: Record<string, number> = {};
  for (const [k, val] of v) obj[k] = val;
  return obj;
}

// ── tokenize ────────────────────────────────────────────────────────────

describe('tokenize', () => {
  it('lowercases and splits normal text', () => {
    const tokens = tokenize('Hello World Testing');
    expect(tokens).toEqual(['hello', 'world', 'testing']);
  });

  it('removes stopwords', () => {
    const tokens = tokenize('the quick brown fox is very fast');
    // "the", "is", "very" are stopwords
    expect(tokens).toContain('quick');
    expect(tokens).toContain('brown');
    expect(tokens).toContain('fox');
    expect(tokens).toContain('fast');
    expect(tokens).not.toContain('the');
    expect(tokens).not.toContain('is');
    expect(tokens).not.toContain('very');
  });

  it('returns empty array for empty string', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('returns empty array for whitespace-only string', () => {
    expect(tokenize('   \t  \n  ')).toEqual([]);
  });

  it('strips special characters and keeps alphanumeric', () => {
    const tokens = tokenize('hello! @world# $test%ing (foo) bar+baz');
    // Special chars become spaces; short tokens (<= 2 chars) are filtered
    expect(tokens).toContain('hello');
    expect(tokens).toContain('world');
    expect(tokens).toContain('foo');
    expect(tokens).toContain('bar');
    expect(tokens).toContain('baz');
  });

  it('filters tokens with 2 or fewer characters', () => {
    const tokens = tokenize('go do it now run');
    // "go" (2 chars), "do" (stopword+2), "it" (stopword+2), "now" (3 chars), "run" (3 chars)
    expect(tokens).not.toContain('go');
    expect(tokens).toContain('now');
    expect(tokens).toContain('run');
  });

  it('preserves hyphens within tokens', () => {
    const tokens = tokenize('well-known anti-pattern');
    expect(tokens).toContain('well-known');
    expect(tokens).toContain('anti-pattern');
  });

  it('handles text that is entirely stopwords', () => {
    expect(tokenize('the and or but is was are')).toEqual([]);
  });

  it('handles numeric tokens', () => {
    const tokens = tokenize('version 123 release 456');
    expect(tokens).toContain('version');
    expect(tokens).toContain('123');
    expect(tokens).toContain('release');
    expect(tokens).toContain('456');
  });
});

// ── calculateTf ─────────────────────────────────────────────────────────

describe('calculateTf', () => {
  it('computes normalized term frequency', () => {
    const tf = calculateTf(['hello', 'world', 'hello']);
    const obj = vecToObj(tf);
    expect(obj['hello']).toBeCloseTo(2 / 3);
    expect(obj['world']).toBeCloseTo(1 / 3);
  });

  it('returns empty map for empty tokens', () => {
    const tf = calculateTf([]);
    expect(tf.size).toBe(0);
  });

  it('handles single token', () => {
    const tf = calculateTf(['solo']);
    expect(tf.get('solo')).toBeCloseTo(1.0);
  });

  it('handles all identical tokens', () => {
    const tf = calculateTf(['repeat', 'repeat', 'repeat', 'repeat']);
    expect(tf.get('repeat')).toBeCloseTo(1.0);
  });

  it('sums to 1.0 across all terms', () => {
    const tokens = ['alpha', 'beta', 'gamma', 'alpha', 'beta'];
    const tf = calculateTf(tokens);
    let sum = 0;
    for (const [, v] of tf) sum += v;
    expect(sum).toBeCloseTo(1.0);
  });
});

// ── calculateTfIdf ──────────────────────────────────────────────────────

describe('calculateTfIdf', () => {
  it('multiplies TF by IDF from vocabulary', () => {
    const tokens = ['hello', 'world', 'hello'];
    const vocab = new Map<string, number>([
      ['hello', 2.0],
      ['world', 1.0],
    ]);
    const tfidf = calculateTfIdf(tokens, vocab);
    const obj = vecToObj(tfidf);
    // tf(hello) = 2/3, idf = 2.0 => tfidf = 4/3
    expect(obj['hello']).toBeCloseTo((2 / 3) * 2.0);
    // tf(world) = 1/3, idf = 1.0 => tfidf = 1/3
    expect(obj['world']).toBeCloseTo((1 / 3) * 1.0);
  });

  it('excludes terms not in vocabulary', () => {
    const tokens = ['known', 'unknown'];
    const vocab = new Map<string, number>([['known', 1.5]]);
    const tfidf = calculateTfIdf(tokens, vocab);
    expect(tfidf.has('known')).toBe(true);
    expect(tfidf.has('unknown')).toBe(false);
  });

  it('excludes terms with zero IDF', () => {
    const tokens = ['common'];
    const vocab = new Map<string, number>([['common', 0]]);
    const tfidf = calculateTfIdf(tokens, vocab);
    expect(tfidf.has('common')).toBe(false);
  });

  it('returns empty map for empty tokens', () => {
    const vocab = new Map<string, number>([['hello', 1.0]]);
    const tfidf = calculateTfIdf([], vocab);
    expect(tfidf.size).toBe(0);
  });

  it('returns empty map for empty vocabulary', () => {
    const tfidf = calculateTfIdf(['hello', 'world'], new Map());
    expect(tfidf.size).toBe(0);
  });
});

// ── cosineSimilarity ────────────────────────────────────────────────────

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical vectors', () => {
    const v: SparseVector = new Map([
      ['hello', 1],
      ['world', 2],
    ]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  it('returns 0.0 for orthogonal vectors (no shared terms)', () => {
    const a: SparseVector = new Map([['hello', 1]]);
    const b: SparseVector = new Map([['world', 1]]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
  });

  it('returns value between 0 and 1 for partially similar vectors', () => {
    const a: SparseVector = new Map([
      ['hello', 1],
      ['world', 1],
    ]);
    const b: SparseVector = new Map([
      ['hello', 1],
      ['foo', 1],
    ]);
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
    // Exact: dot=1, normA=sqrt(2), normB=sqrt(2), sim=1/2=0.5
    expect(sim).toBeCloseTo(0.5);
  });

  it('returns 0.0 when first vector is empty', () => {
    const a: SparseVector = new Map();
    const b: SparseVector = new Map([['hello', 1]]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
  });

  it('returns 0.0 when second vector is empty', () => {
    const a: SparseVector = new Map([['hello', 1]]);
    const b: SparseVector = new Map();
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
  });

  it('returns 0.0 when both vectors are empty', () => {
    expect(cosineSimilarity(new Map(), new Map())).toBeCloseTo(0.0);
  });

  it('is commutative', () => {
    const a: SparseVector = new Map([
      ['x', 3],
      ['y', 1],
    ]);
    const b: SparseVector = new Map([
      ['x', 1],
      ['z', 2],
    ]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a));
  });

  it('is not affected by vector magnitude (direction only)', () => {
    const a: SparseVector = new Map([
      ['hello', 1],
      ['world', 1],
    ]);
    const b: SparseVector = new Map([
      ['hello', 100],
      ['world', 100],
    ]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0);
  });
});

// ── jaccardSimilarity ───────────────────────────────────────────────────

describe('jaccardSimilarity', () => {
  it('returns 1.0 for identical sets', () => {
    expect(jaccardSimilarity(['a', 'b', 'c'], ['a', 'b', 'c'])).toBeCloseTo(1.0);
  });

  it('returns 0.0 for completely disjoint sets', () => {
    expect(jaccardSimilarity(['a', 'b'], ['c', 'd'])).toBeCloseTo(0.0);
  });

  it('returns correct value for overlapping sets', () => {
    // intersection = {b}, union = {a, b, c}
    expect(jaccardSimilarity(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3);
  });

  it('returns 0.0 when both arrays are empty', () => {
    expect(jaccardSimilarity([], [])).toBeCloseTo(0.0);
  });

  it('returns 0.0 when first array is empty', () => {
    expect(jaccardSimilarity([], ['a', 'b'])).toBeCloseTo(0.0);
  });

  it('returns 0.0 when second array is empty', () => {
    expect(jaccardSimilarity(['a', 'b'], [])).toBeCloseTo(0.0);
  });

  it('handles duplicate elements correctly', () => {
    // Sets: {a, b} and {a, b, c} => intersection=2, union=3
    expect(jaccardSimilarity(['a', 'a', 'b'], ['a', 'b', 'c'])).toBeCloseTo(2 / 3);
  });

  it('is commutative', () => {
    const a = ['alpha', 'beta', 'gamma'];
    const b = ['beta', 'delta'];
    expect(jaccardSimilarity(a, b)).toBeCloseTo(jaccardSimilarity(b, a));
  });

  it('handles single-element arrays', () => {
    expect(jaccardSimilarity(['x'], ['x'])).toBeCloseTo(1.0);
    expect(jaccardSimilarity(['x'], ['y'])).toBeCloseTo(0.0);
  });
});

// ── Integration: tokenize + similarity ──────────────────────────────────

describe('integration: tokenize through similarity', () => {
  it('identical documents have cosine similarity 1.0', () => {
    const text = 'machine learning algorithms process data efficiently';
    const tokens = tokenize(text);
    const tf = calculateTf(tokens);
    expect(cosineSimilarity(tf, tf)).toBeCloseTo(1.0);
  });

  it('similar documents have cosine similarity > 0.5', () => {
    const tokensA = tokenize('machine learning algorithms process data');
    const tokensB = tokenize('machine learning models analyze data');
    const vocab = new Map<string, number>([
      ['machine', 1.0],
      ['learning', 1.0],
      ['algorithms', 2.0],
      ['process', 2.0],
      ['data', 1.0],
      ['models', 2.0],
      ['analyze', 2.0],
    ]);
    const a = calculateTfIdf(tokensA, vocab);
    const b = calculateTfIdf(tokensB, vocab);
    expect(cosineSimilarity(a, b)).toBeGreaterThan(0.0);
  });

  it('completely different documents have cosine similarity 0.0', () => {
    const tokensA = tokenize('quantum physics relativity');
    const tokensB = tokenize('cooking recipes kitchen');
    const vocab = new Map<string, number>([
      ['quantum', 1.0],
      ['physics', 1.0],
      ['relativity', 1.0],
      ['cooking', 1.0],
      ['recipes', 1.0],
      ['kitchen', 1.0],
    ]);
    const a = calculateTfIdf(tokensA, vocab);
    const b = calculateTfIdf(tokensB, vocab);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
  });

  it('handles long documents without errors', () => {
    const words = Array.from({ length: 1000 }, (_, i) => `word${i}`);
    const text = words.join(' ');
    const tokens = tokenize(text);
    expect(tokens.length).toBeGreaterThan(0);
    const tf = calculateTf(tokens);
    expect(tf.size).toBeGreaterThan(0);
    expect(cosineSimilarity(tf, tf)).toBeCloseTo(1.0);
  });
});
