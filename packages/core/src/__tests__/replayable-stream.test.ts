import { describe, it, expect } from 'vitest';
import { ReplayableStream } from '../streams/replayable-stream.js';

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
});
