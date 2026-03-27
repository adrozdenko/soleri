import { describe, it, expect, beforeEach } from 'vitest';
import { ConcurrencyManager } from '../../subagent/concurrency-manager.js';

describe('ConcurrencyManager', () => {
  let cm: ConcurrencyManager;

  beforeEach(() => {
    cm = new ConcurrencyManager();
  });

  it('acquire() resolves immediately when under the limit', async () => {
    await cm.acquire('test', 3);
    expect(cm.getActive('test')).toBe(1);
  });

  it('acquire() queues when at the limit', async () => {
    // Fill all 2 slots
    await cm.acquire('test', 2);
    await cm.acquire('test', 2);
    expect(cm.getActive('test')).toBe(2);

    // Third acquire should queue
    let resolved = false;
    const pending = cm.acquire('test', 2).then(() => {
      resolved = true;
    });

    // Give microtask queue a tick
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(cm.getWaiting('test')).toBe(1);

    // Release one slot to unblock
    cm.release('test');
    await pending;
    expect(resolved).toBe(true);
  });

  it('release() unblocks the next waiter in FIFO order', async () => {
    await cm.acquire('test', 1);

    const order: number[] = [];
    const p1 = cm.acquire('test', 1).then(() => order.push(1));
    const p2 = cm.acquire('test', 1).then(() => order.push(2));

    expect(cm.getWaiting('test')).toBe(2);

    cm.release('test');
    await p1;
    cm.release('test');
    await p2;

    expect(order).toEqual([1, 2]);
  });

  it('getActive() returns correct count', async () => {
    expect(cm.getActive('test')).toBe(0);
    await cm.acquire('test', 5);
    await cm.acquire('test', 5);
    expect(cm.getActive('test')).toBe(2);
  });

  it('getWaiting() returns correct count', async () => {
    await cm.acquire('test', 1);
    expect(cm.getWaiting('test')).toBe(0);

    // These will queue
    cm.acquire('test', 1);
    cm.acquire('test', 1);
    await Promise.resolve();
    expect(cm.getWaiting('test')).toBe(2);
  });

  it('reset() resolves all waiters and clears state', async () => {
    await cm.acquire('test', 1);

    let waiterResolved = false;
    const pending = cm.acquire('test', 1).then(() => {
      waiterResolved = true;
    });

    cm.reset();
    await pending;
    expect(waiterResolved).toBe(true);
    expect(cm.getActive('test')).toBe(0);
    expect(cm.getWaiting('test')).toBe(0);
  });

  it('multiple types are independent', async () => {
    await cm.acquire('typeA', 1);
    await cm.acquire('typeB', 1);

    expect(cm.getActive('typeA')).toBe(1);
    expect(cm.getActive('typeB')).toBe(1);

    // typeA is at limit=1, but typeB should still be acquirable
    let typeBResolved = false;
    const pending = cm.acquire('typeB', 2).then(() => {
      typeBResolved = true;
    });
    await pending;
    expect(typeBResolved).toBe(true);
    expect(cm.getActive('typeB')).toBe(2);
  });

  it('default maxConcurrent is 3', async () => {
    // Acquire 3 without specifying max (uses default of 3)
    await cm.acquire('test');
    await cm.acquire('test');
    await cm.acquire('test');
    expect(cm.getActive('test')).toBe(3);

    // Fourth should queue
    let queued = false;
    cm.acquire('test').then(() => {
      queued = true;
    });
    await Promise.resolve();
    expect(queued).toBe(false);
    expect(cm.getWaiting('test')).toBe(1);
  });

  it('release() is a no-op for untracked types', () => {
    // Should not throw
    cm.release('nonexistent');
    expect(cm.getActive('nonexistent')).toBe(0);
  });

  it('getActive() returns 0 for untracked types', () => {
    expect(cm.getActive('unknown')).toBe(0);
  });
});
