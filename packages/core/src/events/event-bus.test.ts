import { describe, it, expect, vi } from 'vitest';
import { TypedEventBus } from './event-bus.js';

type TestEvents = {
  'entry:created': { id: string; title: string };
  'entry:deleted': { id: string };
  'count:updated': number;
};

describe('TypedEventBus', () => {
  describe('on / emit', () => {
    it('delivers payload to a listener', () => {
      const bus = new TypedEventBus<TestEvents>();
      const listener = vi.fn();
      bus.on('entry:created', listener);
      bus.emit('entry:created', { id: '1', title: 'Hello' });
      expect(listener).toHaveBeenCalledWith({ id: '1', title: 'Hello' });
    });

    it('delivers to multiple listeners', () => {
      const bus = new TypedEventBus<TestEvents>();
      const a = vi.fn();
      const b = vi.fn();
      bus.on('entry:created', a);
      bus.on('entry:created', b);
      bus.emit('entry:created', { id: '2', title: 'World' });
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);
    });

    it('returns false when no listeners exist', () => {
      const bus = new TypedEventBus<TestEvents>();
      const result = bus.emit('entry:deleted', { id: '1' });
      expect(result).toBe(false);
    });

    it('returns true when listeners exist', () => {
      const bus = new TypedEventBus<TestEvents>();
      bus.on('entry:deleted', vi.fn());
      const result = bus.emit('entry:deleted', { id: '1' });
      expect(result).toBe(true);
    });

    it('handles primitive payloads', () => {
      const bus = new TypedEventBus<TestEvents>();
      const listener = vi.fn();
      bus.on('count:updated', listener);
      bus.emit('count:updated', 42);
      expect(listener).toHaveBeenCalledWith(42);
    });
  });

  describe('once', () => {
    it('fires listener only once', () => {
      const bus = new TypedEventBus<TestEvents>();
      const listener = vi.fn();
      bus.once('entry:deleted', listener);
      bus.emit('entry:deleted', { id: '1' });
      bus.emit('entry:deleted', { id: '2' });
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({ id: '1' });
    });
  });

  describe('off', () => {
    it('removes a specific listener', () => {
      const bus = new TypedEventBus<TestEvents>();
      const listener = vi.fn();
      bus.on('entry:created', listener);
      bus.off('entry:created', listener);
      bus.emit('entry:created', { id: '1', title: 'nope' });
      expect(listener).not.toHaveBeenCalled();
    });

    it('does not affect other listeners', () => {
      const bus = new TypedEventBus<TestEvents>();
      const keep = vi.fn();
      const remove = vi.fn();
      bus.on('entry:created', keep);
      bus.on('entry:created', remove);
      bus.off('entry:created', remove);
      bus.emit('entry:created', { id: '1', title: 'test' });
      expect(keep).toHaveBeenCalledTimes(1);
      expect(remove).not.toHaveBeenCalled();
    });
  });

  describe('listenerCount', () => {
    it('returns 0 for new bus', () => {
      const bus = new TypedEventBus<TestEvents>();
      expect(bus.listenerCount()).toBe(0);
    });

    it('counts listeners across all events', () => {
      const bus = new TypedEventBus<TestEvents>();
      bus.on('entry:created', vi.fn());
      bus.on('entry:deleted', vi.fn());
      bus.on('entry:deleted', vi.fn());
      expect(bus.listenerCount()).toBe(3);
    });

    it('decreases after off', () => {
      const bus = new TypedEventBus<TestEvents>();
      const listener = vi.fn();
      bus.on('entry:created', listener);
      expect(bus.listenerCount()).toBe(1);
      bus.off('entry:created', listener);
      expect(bus.listenerCount()).toBe(0);
    });
  });

  describe('removeAllListeners', () => {
    it('removes all listeners from all events', () => {
      const bus = new TypedEventBus<TestEvents>();
      bus.on('entry:created', vi.fn());
      bus.on('entry:deleted', vi.fn());
      bus.on('count:updated', vi.fn());
      expect(bus.listenerCount()).toBe(3);
      bus.removeAllListeners();
      expect(bus.listenerCount()).toBe(0);
    });

    it('returns this for chaining', () => {
      const bus = new TypedEventBus<TestEvents>();
      const result = bus.removeAllListeners();
      expect(result).toBe(bus);
    });
  });

  describe('chaining', () => {
    it('on returns this', () => {
      const bus = new TypedEventBus<TestEvents>();
      const result = bus.on('entry:created', vi.fn());
      expect(result).toBe(bus);
    });

    it('once returns this', () => {
      const bus = new TypedEventBus<TestEvents>();
      const result = bus.once('entry:created', vi.fn());
      expect(result).toBe(bus);
    });

    it('off returns this', () => {
      const bus = new TypedEventBus<TestEvents>();
      const result = bus.off('entry:created', vi.fn());
      expect(result).toBe(bus);
    });
  });
});
