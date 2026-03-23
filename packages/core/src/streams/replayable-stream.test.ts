import { describe, it, expect } from 'vitest';
import { ReplayableStream, fanOut } from './replayable-stream.js';

async function* asyncGen<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) {
    yield item;
  }
}

async function* delayedGen<T>(items: T[], delayMs = 1): AsyncIterable<T> {
  for (const item of items) {
    await new Promise((r) => setTimeout(r, delayMs));
    yield item;
  }
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
}

describe('ReplayableStream', () => {
  describe('single consumer', () => {
    it('should yield all items from source', async () => {
      const stream = new ReplayableStream(asyncGen([1, 2, 3]));
      const result = await stream.collect();
      expect(result).toEqual([1, 2, 3]);
    });

    it('should handle empty source', async () => {
      const stream = new ReplayableStream(asyncGen([]));
      const result = await stream.collect();
      expect(result).toEqual([]);
    });

    it('should handle single item source', async () => {
      const stream = new ReplayableStream(asyncGen(['only']));
      const result = await stream.collect();
      expect(result).toEqual(['only']);
    });
  });

  describe('multiple consumers', () => {
    it('should replay all items to each consumer', async () => {
      const stream = new ReplayableStream(asyncGen([10, 20, 30]));
      const [a, b] = await Promise.all([stream.collect(), stream.collect()]);
      expect(a).toEqual([10, 20, 30]);
      expect(b).toEqual([10, 20, 30]);
    });

    it('should allow a late consumer to replay from buffer', async () => {
      const stream = new ReplayableStream(asyncGen([1, 2, 3]));
      const first = await stream.collect();
      const second = await stream.collect();
      expect(first).toEqual([1, 2, 3]);
      expect(second).toEqual([1, 2, 3]);
    });
  });

  describe('bufferedCount', () => {
    it('should track buffer size', async () => {
      const stream = new ReplayableStream(asyncGen([1, 2, 3]));
      expect(stream.bufferedCount).toBe(0);
      await stream.collect();
      expect(stream.bufferedCount).toBe(3);
    });
  });

  describe('isDone', () => {
    it('should be false before consumption', () => {
      const stream = new ReplayableStream(asyncGen([1]));
      expect(stream.isDone).toBe(false);
    });

    it('should be true after full consumption', async () => {
      const stream = new ReplayableStream(asyncGen([1]));
      await stream.collect();
      expect(stream.isDone).toBe(true);
    });
  });

  describe('maxBuffer', () => {
    it('should evict oldest items when buffer exceeds max', async () => {
      const stream = new ReplayableStream(asyncGen([1, 2, 3, 4, 5]), { maxBuffer: 3 });
      const result = await stream.collect();
      expect(result).toEqual([1, 2, 3, 4, 5]);
      expect(stream.bufferedCount).toBe(3);
    });

    it('should throw when a slow consumer falls behind', async () => {
      const stream = new ReplayableStream(asyncGen([1, 2, 3, 4]), { maxBuffer: 2 });
      // First consumer reads everything, causing eviction
      await stream.collect();
      // Second consumer starts at index 0 but items 0-1 are evicted
      await expect(stream.collect()).rejects.toThrow(/consumer fell behind/);
    });
  });

  describe('error propagation', () => {
    it('should propagate source errors to consumers', async () => {
      async function* failing(): AsyncIterable<number> {
        yield 1;
        throw new Error('source broke');
      }
      const stream = new ReplayableStream(failing());
      await expect(stream.collect()).rejects.toThrow('source broke');
    });

    it('should propagate error to late consumers after source failed', async () => {
      async function* failing(): AsyncIterable<number> {
        yield 1;
        throw new Error('boom');
      }
      const stream = new ReplayableStream(failing());
      await expect(stream.collect()).rejects.toThrow('boom');
      // Late consumer should also see the error after replaying buffered item
      await expect(stream.collect()).rejects.toThrow('boom');
    });
  });

  describe('concurrent consumers with delayed source', () => {
    it('should deliver items to parallel consumers', async () => {
      const stream = new ReplayableStream(delayedGen([1, 2, 3], 5));
      const [a, b] = await Promise.all([collect(stream), collect(stream)]);
      expect(a).toEqual([1, 2, 3]);
      expect(b).toEqual([1, 2, 3]);
    });
  });
});

describe('fanOut', () => {
  it('should feed source to all consumers', async () => {
    const results: number[][] = [[], []];
    await fanOut(asyncGen([1, 2, 3]), [
      async (items) => {
        for await (const item of items) results[0].push(item);
      },
      async (items) => {
        for await (const item of items) results[1].push(item);
      },
    ]);
    expect(results[0]).toEqual([1, 2, 3]);
    expect(results[1]).toEqual([1, 2, 3]);
  });

  it('should handle empty consumers array', async () => {
    await expect(fanOut(asyncGen([1, 2]), [])).resolves.toBeUndefined();
  });

  it('should pass maxBuffer option through', async () => {
    const results: number[] = [];
    await fanOut(
      asyncGen([1, 2, 3]),
      [
        async (items) => {
          for await (const item of items) results.push(item);
        },
      ],
      { maxBuffer: 10 },
    );
    expect(results).toEqual([1, 2, 3]);
  });
});
