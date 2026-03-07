import { describe, it, expect } from 'vitest';
import { normalize, collect } from '../streams/normalize.js';

describe('normalize', () => {
  it('passes through a single value', async () => {
    expect(await collect(normalize(42))).toEqual([42]);
  });

  it('flattens an array', async () => {
    expect(await collect(normalize([1, 2, 3]))).toEqual([1, 2, 3]);
  });

  it('resolves a promise', async () => {
    expect(await collect(normalize(Promise.resolve(99)))).toEqual([99]);
  });

  it('resolves a promise of array', async () => {
    expect(await collect(normalize(Promise.resolve([4, 5])))).toEqual([4, 5]);
  });

  it('consumes an async iterable', async () => {
    async function* gen() {
      yield 'a';
      yield 'b';
    }
    expect(await collect(normalize(gen()))).toEqual(['a', 'b']);
  });

  it('flattens nested arrays', async () => {
    const input = [
      [1, 2],
      [3, [4, 5]],
    ];
    expect(await collect(normalize(input))).toEqual([1, 2, 3, 4, 5]);
  });

  it('handles mixed nesting', async () => {
    async function* gen() {
      yield 30;
    }
    const input = [10, Promise.resolve(20), gen()];
    expect(await collect(normalize(input))).toEqual([10, 20, 30]);
  });

  it('handles empty array', async () => {
    expect(await collect(normalize([]))).toEqual([]);
  });

  it('handles string as leaf (not iterable)', async () => {
    expect(await collect(normalize('hello'))).toEqual(['hello']);
  });

  it('handles deeply nested structure', async () => {
    const input = [[[1]], [[2, [3]]]];
    expect(await collect(normalize(input))).toEqual([1, 2, 3]);
  });
});

describe('collect', () => {
  it('collects async iterable to array', async () => {
    async function* gen() {
      yield 1;
      yield 2;
      yield 3;
    }
    expect(await collect(gen())).toEqual([1, 2, 3]);
  });

  it('returns empty for empty iterable', async () => {
    async function* gen() {
      /* empty */
    }
    expect(await collect(gen())).toEqual([]);
  });
});
