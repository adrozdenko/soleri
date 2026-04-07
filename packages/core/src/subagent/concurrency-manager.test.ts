import { describe, it, expect, beforeEach } from 'vitest';
import { ConcurrencyManager } from './concurrency-manager.js';

describe('ConcurrencyManager', () => {
  let cm: ConcurrencyManager;

  beforeEach(() => {
    cm = new ConcurrencyManager();
  });

  describe('acquire / release', () => {
    it('acquires immediately when under capacity', async () => {
      await cm.acquire('test', 2);
      expect(cm.getActive('test')).toBe(1);
    });

    it('increments active count on each acquire', async () => {
      await cm.acquire('test', 3);
      await cm.acquire('test', 3);
      expect(cm.getActive('test')).toBe(2);
    });

    it('uses default max concurrent (3) when omitted', async () => {
      await cm.acquire('test');
      await cm.acquire('test');
      await cm.acquire('test');
      expect(cm.getActive('test')).toBe(3);
      // Fourth acquire should queue
      expect(cm.getWaiting('test')).toBe(0);
    });

    it('queues when at capacity', async () => {
      await cm.acquire('test', 1);
      // Second acquire should not resolve immediately
      let resolved = false;
      const p = cm.acquire('test', 1).then(() => {
        resolved = true;
      });
      // Give microtask queue a tick
      await Promise.resolve();
      expect(resolved).toBe(false);
      expect(cm.getWaiting('test')).toBe(1);

      // Release unblocks the waiter
      cm.release('test');
      await p;
      expect(resolved).toBe(true);
      expect(cm.getWaiting('test')).toBe(0);
      expect(cm.getActive('test')).toBe(1);
    });

    it('enforces FIFO ordering for waiters', async () => {
      const order: number[] = [];

      await cm.acquire('test', 1);

      const p1 = cm.acquire('test', 1).then(() => order.push(1));
      const p2 = cm.acquire('test', 1).then(() => order.push(2));
      const p3 = cm.acquire('test', 1).then(() => order.push(3));

      // Release three times to unblock all waiters
      cm.release('test');
      await p1;
      cm.release('test');
      await p2;
      cm.release('test');
      await p3;

      expect(order).toEqual([1, 2, 3]);
    });

    it('tracks types independently', async () => {
      await cm.acquire('alpha', 1);
      await cm.acquire('beta', 1);

      expect(cm.getActive('alpha')).toBe(1);
      expect(cm.getActive('beta')).toBe(1);

      // Alpha is at capacity — queue a waiter
      const alphaPromise = cm.acquire('alpha', 1);
      expect(cm.getWaiting('alpha')).toBe(1);

      // Releasing beta does not unblock alpha
      cm.release('beta');
      await Promise.resolve();
      expect(cm.getWaiting('alpha')).toBe(1);

      // Releasing alpha unblocks the alpha waiter
      cm.release('alpha');
      await alphaPromise;
      expect(cm.getWaiting('alpha')).toBe(0);
      expect(cm.getActive('alpha')).toBe(1);
    });
  });

  describe('release', () => {
    it('is a no-op for untracked types', () => {
      cm.release('nonexistent');
      expect(cm.getActive('nonexistent')).toBe(0);
    });

    it('does not go below zero', async () => {
      await cm.acquire('test', 2);
      cm.release('test');
      cm.release('test');
      cm.release('test'); // extra release
      expect(cm.getActive('test')).toBe(0);
    });
  });

  describe('getActive / getWaiting', () => {
    it('returns 0 for untracked types', () => {
      expect(cm.getActive('unknown')).toBe(0);
      expect(cm.getWaiting('unknown')).toBe(0);
    });
  });

  describe('reset', () => {
    it('clears all state and resolves pending waiters', async () => {
      await cm.acquire('test', 1);
      const p = cm.acquire('test', 1);
      expect(cm.getWaiting('test')).toBe(1);

      cm.reset();
      await p; // should resolve

      expect(cm.getActive('test')).toBe(0);
      expect(cm.getWaiting('test')).toBe(0);
    });

    it('handles reset with no state', () => {
      cm.reset(); // should not throw
      expect(cm.getActive('any')).toBe(0);
    });

    it('resolves multiple waiters on reset', async () => {
      await cm.acquire('a', 1);
      await cm.acquire('b', 1);
      const p1 = cm.acquire('a', 1);
      const p2 = cm.acquire('b', 1);

      cm.reset();
      await Promise.all([p1, p2]); // both should resolve
    });
  });
});
