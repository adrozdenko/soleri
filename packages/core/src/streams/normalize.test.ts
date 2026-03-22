import { describe, it, expect } from 'vitest';
import { normalize, collect } from './normalize.js';

// ─── normalize ───────────────────────────────────────────────────────

describe('normalize', () => {
  it('yields a single value', async () => {
    const result = await collect(normalize(42));
    expect(result).toEqual([42]);
  });

  it('yields a flat array', async () => {
    const result = await collect(normalize([1, 2, 3]));
    expect(result).toEqual([1, 2, 3]);
  });

  it('resolves a promise of a single value', async () => {
    const result = await collect(normalize(Promise.resolve('hello')));
    expect(result).toEqual(['hello']);
  });

  it('resolves a promise of an array', async () => {
    const result = await collect(normalize(Promise.resolve([10, 20])));
    expect(result).toEqual([10, 20]);
  });

  it('flattens an async iterable', async () => {
    async function* gen(): AsyncIterable<number> {
      yield 1;
      yield 2;
      yield 3;
    }
    const result = await collect(normalize(gen()));
    expect(result).toEqual([1, 2, 3]);
  });

  it('flattens nested sync iterables', async () => {
    const nested = [[1, 2], [3], [4, 5]];
    const result = await collect(normalize(nested));
    expect(result).toEqual([1, 2, 3, 4, 5]);
  });

  it('treats strings as leaf values (not iterables)', async () => {
    const result = await collect(normalize('hello'));
    expect(result).toEqual(['hello']);
  });

  it('treats an array of strings as individual leaves', async () => {
    const result = await collect(normalize(['a', 'b', 'c']));
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('handles mixed nested structure', async () => {
    async function* gen(): AsyncIterable<number> {
      yield 100;
    }
    const mixed = [1, [2, 3], Promise.resolve(4), gen()];
    // normalize expects NestableInput<number>, but mixed iterables work
    const result: number[] = [];
    for await (const item of normalize<number>(mixed as never)) {
      result.push(item);
    }
    expect(result).toEqual([1, 2, 3, 4, 100]);
  });

  it('handles empty array', async () => {
    const result = await collect(normalize([]));
    expect(result).toEqual([]);
  });

  it('handles deeply nested arrays', async () => {
    const deep = [[[1]], [[2, 3]]];
    const result = await collect(normalize(deep));
    expect(result).toEqual([1, 2, 3]);
  });
});

// ─── collect ─────────────────────────────────────────────────────────

describe('collect', () => {
  it('collects async iterable into array', async () => {
    async function* gen(): AsyncIterable<string> {
      yield 'a';
      yield 'b';
    }
    expect(await collect(gen())).toEqual(['a', 'b']);
  });

  it('returns empty array for empty source', async () => {
    async function* empty(): AsyncIterable<never> {
      // nothing
    }
    expect(await collect(empty())).toEqual([]);
  });
});
