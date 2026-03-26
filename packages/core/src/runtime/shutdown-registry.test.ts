/**
 * Unit tests for ShutdownRegistry — centralized cleanup for agent runtime.
 */

import { describe, it, expect, vi } from 'vitest';
import { ShutdownRegistry } from './shutdown-registry.js';

describe('ShutdownRegistry', () => {
  it('starts with zero entries and not closed', () => {
    const registry = new ShutdownRegistry();
    expect(registry.size).toBe(0);
    expect(registry.isClosed).toBe(false);
  });

  it('tracks registered entries', () => {
    const registry = new ShutdownRegistry();
    registry.register('a', vi.fn());
    registry.register('b', vi.fn());
    expect(registry.size).toBe(2);
  });

  it('calls callbacks in LIFO order on closeAll', async () => {
    const order: string[] = [];
    const registry = new ShutdownRegistry();
    registry.register('first', () => {
      order.push('first');
    });
    registry.register('second', () => {
      order.push('second');
    });
    registry.register('third', () => {
      order.push('third');
    });

    await registry.closeAll();
    expect(order).toEqual(['third', 'second', 'first']);
  });

  it('calls callbacks in LIFO order on closeAllSync', () => {
    const order: string[] = [];
    const registry = new ShutdownRegistry();
    registry.register('first', () => {
      order.push('first');
    });
    registry.register('second', () => {
      order.push('second');
    });
    registry.register('third', () => {
      order.push('third');
    });

    registry.closeAllSync();
    expect(order).toEqual(['third', 'second', 'first']);
  });

  it('is idempotent — second closeAll is a no-op', async () => {
    const callback = vi.fn();
    const registry = new ShutdownRegistry();
    registry.register('test', callback);

    await registry.closeAll();
    await registry.closeAll();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(registry.isClosed).toBe(true);
  });

  it('is idempotent — second closeAllSync is a no-op', () => {
    const callback = vi.fn();
    const registry = new ShutdownRegistry();
    registry.register('test', callback);

    registry.closeAllSync();
    registry.closeAllSync();

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('handles async callbacks in closeAll', async () => {
    const order: string[] = [];
    const registry = new ShutdownRegistry();
    registry.register('sync', () => {
      order.push('sync');
    });
    registry.register('async', async () => {
      await new Promise((r) => setTimeout(r, 5));
      order.push('async');
    });

    await registry.closeAll();
    expect(order).toEqual(['async', 'sync']);
  });

  it('continues on error — remaining callbacks still execute', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const order: string[] = [];
    const registry = new ShutdownRegistry();
    registry.register('first', () => {
      order.push('first');
    });
    registry.register('failing', () => {
      throw new Error('boom');
    });
    registry.register('third', () => {
      order.push('third');
    });

    await registry.closeAll();

    // third runs first (LIFO), failing throws but first still runs
    expect(order).toEqual(['third', 'first']);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('boom'));
    stderrSpy.mockRestore();
  });

  it('closeAllSync swallows errors silently', () => {
    const order: string[] = [];
    const registry = new ShutdownRegistry();
    registry.register('first', () => {
      order.push('first');
    });
    registry.register('failing', () => {
      throw new Error('boom');
    });
    registry.register('third', () => {
      order.push('third');
    });

    // Should not throw
    registry.closeAllSync();
    expect(order).toEqual(['third', 'first']);
  });

  it('ignores registrations after close', async () => {
    const registry = new ShutdownRegistry();
    await registry.closeAll();

    const callback = vi.fn();
    registry.register('late', callback);
    expect(registry.size).toBe(0);
  });

  it('clears entries after closeAll', async () => {
    const registry = new ShutdownRegistry();
    registry.register('test', vi.fn());
    expect(registry.size).toBe(1);

    await registry.closeAll();
    expect(registry.size).toBe(0);
  });
});
