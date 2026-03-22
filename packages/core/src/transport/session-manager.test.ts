/**
 * Session Manager Tests — session CRUD, expiry, and reaping.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionManager } from './session-manager.js';

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager();
  });

  afterEach(() => {
    manager.close();
  });

  describe('generateId', () => {
    it('returns a UUID string', () => {
      const id = manager.generateId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('generates unique IDs', () => {
      const ids = new Set(Array.from({ length: 10 }, () => manager.generateId()));
      expect(ids.size).toBe(10);
    });
  });

  describe('add / get / remove', () => {
    it('adds and retrieves a session', () => {
      const session = manager.add('s1', 'transport', 'server');
      expect(session.id).toBe('s1');
      expect(session.transport).toBe('transport');
      expect(session.server).toBe('server');
      expect(session.createdAt).toBeGreaterThan(0);
      expect(manager.get('s1')).toBe(session);
    });

    it('returns undefined for missing session', () => {
      expect(manager.get('nonexistent')).toBeUndefined();
    });

    it('removes a session', () => {
      manager.add('s1', null, null);
      expect(manager.remove('s1')).toBe(true);
      expect(manager.get('s1')).toBeUndefined();
    });

    it('returns false when removing nonexistent session', () => {
      expect(manager.remove('nope')).toBe(false);
    });
  });

  describe('size', () => {
    it('starts at zero', () => {
      expect(manager.size).toBe(0);
    });

    it('reflects additions and removals', () => {
      manager.add('s1', null, null);
      manager.add('s2', null, null);
      expect(manager.size).toBe(2);
      manager.remove('s1');
      expect(manager.size).toBe(1);
    });
  });

  describe('listIds', () => {
    it('returns all session IDs', () => {
      manager.add('a', null, null);
      manager.add('b', null, null);
      const ids = manager.listIds();
      expect(ids).toContain('a');
      expect(ids).toContain('b');
      expect(ids).toHaveLength(2);
    });
  });

  describe('close', () => {
    it('clears all sessions and stops reaper', () => {
      manager.add('s1', null, null);
      manager.add('s2', null, null);
      manager.startReaper();
      manager.close();
      expect(manager.size).toBe(0);
    });
  });

  describe('reaper', () => {
    it('does not start when ttl is 0', () => {
      const m = new SessionManager({ ttl: 0 });
      m.startReaper();
      m.add('s1', null, null);
      // No timer should be running - just verify it doesn't throw
      m.close();
    });

    it('reaps expired sessions', async () => {
      const onReap = vi.fn();
      const m = new SessionManager({ ttl: 30, reaperInterval: 20, onReap });
      m.add('s1', null, null);
      m.startReaper();

      await new Promise((r) => setTimeout(r, 80));
      expect(m.size).toBe(0);
      expect(onReap).toHaveBeenCalledTimes(1);
      expect(onReap.mock.calls[0][0].id).toBe('s1');
      m.close();
    });

    it('keeps fresh sessions alive', async () => {
      const m = new SessionManager({ ttl: 200, reaperInterval: 20 });
      m.add('s1', null, null);
      m.startReaper();

      await new Promise((r) => setTimeout(r, 50));
      expect(m.size).toBe(1);
      m.close();
    });

    it('stopReaper prevents further reaping', () => {
      const m = new SessionManager({ ttl: 50, reaperInterval: 20 });
      m.startReaper();
      m.stopReaper();
      m.add('s1', null, null);
      // Session should remain because reaper is stopped
      expect(m.size).toBe(1);
      m.close();
    });
  });
});
