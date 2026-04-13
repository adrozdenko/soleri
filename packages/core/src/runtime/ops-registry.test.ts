import { describe, it, expect, beforeEach } from 'vitest';
import { OpsRegistry } from './ops-registry.js';

describe('OpsRegistry', () => {
  let registry: OpsRegistry;

  beforeEach(() => {
    registry = new OpsRegistry();
  });

  describe('add + get', () => {
    it('registers an op and retrieves it by name', () => {
      registry.add('ernesto_vault', 'vault', {
        name: 'vault_search',
        description: 'Search the vault',
        auth: 'read',
      });
      const op = registry.get('vault_search');
      expect(op).toBeDefined();
      expect(op?.name).toBe('vault_search');
      expect(op?.facade).toBe('vault');
      expect(op?.toolName).toBe('ernesto_vault');
      expect(op?.auth).toBe('read');
      expect(op?.visibility).toBe('user');
    });

    it("defaults visibility to 'user' when not provided", () => {
      registry.add('ernesto_admin', 'admin', {
        name: 'admin_health',
        description: 'Health check',
        auth: 'read',
      });
      expect(registry.get('admin_health')?.visibility).toBe('user');
    });

    it('respects explicit internal visibility', () => {
      registry.add('ernesto_admin', 'admin', {
        name: 'admin_vault_size',
        description: 'Internal',
        auth: 'admin',
        visibility: 'internal',
      });
      expect(registry.get('admin_vault_size')?.visibility).toBe('internal');
    });

    it('treats repeated add as idempotent overwrite', () => {
      registry.add('ernesto_vault', 'vault', {
        name: 'vault_search',
        description: 'first',
        auth: 'read',
      });
      registry.add('ernesto_vault', 'vault', {
        name: 'vault_search',
        description: 'second',
        auth: 'read',
      });
      expect(registry.count()).toBe(1);
      expect(registry.get('vault_search')?.description).toBe('second');
    });
  });

  describe('addAll', () => {
    it('registers a batch of ops in one call', () => {
      registry.addAll('ernesto_plan', 'plan', [
        { name: 'create_plan', description: 'Create', auth: 'write' },
        { name: 'approve_plan', description: 'Approve', auth: 'write' },
        { name: 'plan_split', description: 'Split', auth: 'write' },
      ]);
      expect(registry.count()).toBe(3);
      expect(registry.facadeCount()).toBe(1);
    });
  });

  describe('list + visibility filter', () => {
    beforeEach(() => {
      registry.add('ernesto_admin', 'admin', {
        name: 'admin_health',
        description: 'Health',
        auth: 'read',
      });
      registry.add('ernesto_admin', 'admin', {
        name: 'admin_vault_size',
        description: 'Size',
        auth: 'admin',
        visibility: 'internal',
      });
      registry.add('ernesto_vault', 'vault', {
        name: 'vault_search',
        description: 'Search',
        auth: 'read',
      });
    });

    it('excludes internal ops by default', () => {
      const ops = registry.list();
      expect(ops).toHaveLength(2);
      expect(ops.map((o) => o.name)).toEqual(['admin_health', 'vault_search']);
    });

    it('includes internal ops when includeInternal: true', () => {
      const ops = registry.list({ includeInternal: true });
      expect(ops).toHaveLength(3);
      expect(ops.map((o) => o.name).sort()).toEqual([
        'admin_health',
        'admin_vault_size',
        'vault_search',
      ]);
    });
  });

  describe('byFacade', () => {
    beforeEach(() => {
      registry.addAll('ernesto_vault', 'vault', [
        { name: 'vault_search', description: '', auth: 'read' },
        { name: 'vault_capture', description: '', auth: 'write' },
      ]);
      registry.addAll('ernesto_plan', 'plan', [
        { name: 'create_plan', description: '', auth: 'write' },
      ]);
    });

    it('groups ops by facade', () => {
      const grouped = registry.byFacade();
      expect(Object.keys(grouped).sort()).toEqual(['plan', 'vault']);
      expect(grouped.vault.sort()).toEqual(['vault_capture', 'vault_search']);
      expect(grouped.plan).toEqual(['create_plan']);
    });

    it('sorts op names within each facade', () => {
      registry.addAll('ernesto_vault', 'vault', [
        { name: 'vault_zzz', description: '', auth: 'read' },
        { name: 'vault_aaa', description: '', auth: 'read' },
      ]);
      const grouped = registry.byFacade();
      // vault_aaa and vault_search both start with a; sorted lex
      expect(grouped.vault[0]).toBe('vault_aaa');
    });
  });

  describe('count + facadeCount + facadeList', () => {
    it('returns 0 / 0 / [] for empty registry', () => {
      expect(registry.count()).toBe(0);
      expect(registry.facadeCount()).toBe(0);
      expect(registry.facadeList()).toEqual([]);
    });

    it('counts distinct facades correctly', () => {
      registry.add('x_vault', 'vault', { name: 'v1', description: '', auth: 'read' });
      registry.add('x_vault', 'vault', { name: 'v2', description: '', auth: 'read' });
      registry.add('x_plan', 'plan', { name: 'p1', description: '', auth: 'write' });
      expect(registry.count()).toBe(3);
      expect(registry.facadeCount()).toBe(2);
      expect(registry.facadeList()).toEqual(['plan', 'vault']);
    });

    it('count with includeInternal excludes or includes hidden ops', () => {
      registry.add('x_admin', 'admin', { name: 'p', description: '', auth: 'read' });
      registry.add('x_admin', 'admin', {
        name: 'q',
        description: '',
        auth: 'admin',
        visibility: 'internal',
      });
      expect(registry.count()).toBe(1);
      expect(registry.count({ includeInternal: true })).toBe(2);
    });
  });

  describe('has + clear', () => {
    it('has() returns true for registered, false otherwise', () => {
      registry.add('x', 'x', { name: 'a', description: '', auth: 'read' });
      expect(registry.has('a')).toBe(true);
      expect(registry.has('b')).toBe(false);
    });

    it('clear() empties the registry', () => {
      registry.add('x', 'x', { name: 'a', description: '', auth: 'read' });
      registry.clear();
      expect(registry.count()).toBe(0);
      expect(registry.facadeCount()).toBe(0);
      expect(registry.has('a')).toBe(false);
    });
  });
});
