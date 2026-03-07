import { describe, it, expect } from 'vitest';
import { ReplayableStream, fanOut } from '../streams/replayable-stream.js';

async function* generate(items: number[]): AsyncIterable<number> {
  for (const item of items) yield item;
}

let sourceCallCount = 0;
async function* trackedGenerate(items: number[]): AsyncIterable<number> {
  sourceCallCount++;
  for (const item of items) yield item;
}

describe('ReplayableStream', () => {
  it('single consumer iterates all items', async () => {
    const stream = new ReplayableStream(generate([1, 2, 3]));
    const result = await stream.collect();
    expect(result).toEqual([1, 2, 3]);
  });

  it('multiple consumers each see full stream', async () => {
    const stream = new ReplayableStream(generate([10, 20, 30]));
    const a = stream.collect();
    const b = stream.collect();
    expect(await a).toEqual([10, 20, 30]);
    expect(await b).toEqual([10, 20, 30]);
  });

  it('source executes exactly once', async () => {
    sourceCallCount = 0;
    const stream = new ReplayableStream(trackedGenerate([1, 2]));
    await stream.collect();
    await stream.collect();
    await stream.collect();
    expect(sourceCallCount).toBe(1);
  });

  it('bufferedCount tracks buffer size', async () => {
    const stream = new ReplayableStream(generate([1, 2, 3]));
    expect(stream.bufferedCount).toBe(0);
    await stream.collect();
    expect(stream.bufferedCount).toBe(3);
  });

  it('empty stream returns empty array', async () => {
    const stream = new ReplayableStream(generate([]));
    expect(await stream.collect()).toEqual([]);
    expect(stream.isDone).toBe(true);
  });

  it('error propagates to all consumers', async () => {
    async function* failing(): AsyncIterable<number> {
      yield 1;
      throw new Error('source failed');
    }
    const stream = new ReplayableStream(failing());
    await expect(stream.collect()).rejects.toThrow('source failed');
  });

  it('for-await-of works', async () => {
    const stream = new ReplayableStream(generate([5, 6]));
    const items: number[] = [];
    for await (const item of stream) items.push(item);
    expect(items).toEqual([5, 6]);
  });

  it('works with slow async source', async () => {
    async function* slow(): AsyncIterable<number> {
      for (let i = 1; i <= 3; i++) {
        await new Promise((r) => setTimeout(r, 10));
        yield i;
      }
    }
    const stream = new ReplayableStream(slow());
    expect(await stream.collect()).toEqual([1, 2, 3]);
  });

  it('concurrent consumers on slow source all see identical results', async () => {
    async function* slow(): AsyncIterable<number> {
      for (let i = 1; i <= 5; i++) {
        await new Promise((r) => setTimeout(r, 5));
        yield i;
      }
    }
    const stream = new ReplayableStream(slow());
    const [a, b, c] = await Promise.all([stream.collect(), stream.collect(), stream.collect()]);
    expect(a).toEqual([1, 2, 3, 4, 5]);
    expect(b).toEqual([1, 2, 3, 4, 5]);
    expect(c).toEqual([1, 2, 3, 4, 5]);
  });

  it('late consumer replays full stream after completion', async () => {
    const stream = new ReplayableStream(generate([10, 20, 30]));
    // Drain the stream first
    await stream.collect();
    expect(stream.isDone).toBe(true);
    // Late consumer should still see everything
    expect(await stream.collect()).toEqual([10, 20, 30]);
  });

  it('maxBuffer evicts oldest entries', async () => {
    const stream = new ReplayableStream(generate([1, 2, 3, 4, 5]), {
      maxBuffer: 3,
    });
    await stream.collect();
    // Buffer should only hold the last 3 items
    expect(stream.bufferedCount).toBe(3);
  });

  it('late consumer throws when evicted items are needed', async () => {
    async function* slow(): AsyncIterable<number> {
      for (let i = 1; i <= 5; i++) {
        await new Promise((r) => setTimeout(r, 2));
        yield i;
      }
    }
    const stream = new ReplayableStream(slow(), { maxBuffer: 2 });
    // Drain the stream fully — evicts items 1, 2, 3
    await stream.collect();
    // Late consumer starts at index 0 but items 0-2 are evicted
    await expect(stream.collect()).rejects.toThrow('consumer fell behind');
  });
});

describe('fanOut', () => {
  it('feeds one source to multiple consumers in parallel', async () => {
    async function* source(): AsyncIterable<string> {
      yield 'plan-result';
      yield 'session-data';
      yield 'extraction';
    }

    const brainLog: string[] = [];
    const vaultLog: string[] = [];
    const cogneeLog: string[] = [];

    await fanOut(source(), [
      async (items) => {
        for await (const item of items) brainLog.push(`brain:${item}`);
      },
      async (items) => {
        for await (const item of items) vaultLog.push(`vault:${item}`);
      },
      async (items) => {
        for await (const item of items) cogneeLog.push(`cognee:${item}`);
      },
    ]);

    const expected = ['plan-result', 'session-data', 'extraction'];
    expect(brainLog).toEqual(expected.map((e) => `brain:${e}`));
    expect(vaultLog).toEqual(expected.map((e) => `vault:${e}`));
    expect(cogneeLog).toEqual(expected.map((e) => `cognee:${e}`));
  });

  it('source executes only once with fanOut', async () => {
    let callCount = 0;
    async function* tracked(): AsyncIterable<number> {
      callCount++;
      yield 1;
      yield 2;
    }

    const results: number[][] = [[], []];
    await fanOut(tracked(), [
      async (items) => {
        for await (const item of items) results[0].push(item);
      },
      async (items) => {
        for await (const item of items) results[1].push(item);
      },
    ]);

    expect(callCount).toBe(1);
    expect(results[0]).toEqual([1, 2]);
    expect(results[1]).toEqual([1, 2]);
  });
});
