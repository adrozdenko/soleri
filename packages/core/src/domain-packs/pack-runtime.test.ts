/**
 * Colocated tests for domain-packs/pack-runtime.ts
 *
 * Tests createPackRuntime adapter: vault proxy, project registry proxy,
 * session store proxy with graceful degradation.
 */

import { describe, it, expect, vi } from 'vitest';
import { createPackRuntime } from './pack-runtime.js';
import type { PackProjectContext, PackCheckContext } from './pack-runtime.js';

function mockVault() {
  return { search: vi.fn(), get: vi.fn(), add: vi.fn() } as any;
}

function mockRegistry(projects: PackProjectContext[] = []) {
  return {
    get: vi.fn((id: string) => projects.find((p) => p.id === id) ?? null),
    list: vi.fn(() => projects.map((p) => ({ id: p.id, name: p.name, path: p.path }))),
  };
}

function mockSessionStore() {
  const checks = new Map<string, PackCheckContext>();
  return {
    createCheck: vi.fn((type: string, data: Record<string, unknown>) => {
      const id = `check-${Date.now()}`;
      checks.set(id, { id, type, data, timestamp: Date.now() });
      return id;
    }),
    validateCheck: vi.fn((id: string, type: string) => {
      const c = checks.get(id);
      return c && c.type === type ? c : null;
    }),
    validateAndConsume: vi.fn((id: string, type: string) => {
      const c = checks.get(id);
      if (c && c.type === type) {
        checks.delete(id);
        return c;
      }
      return null;
    }),
  };
}

describe('createPackRuntime', () => {
  it('exposes vault from the runtime', () => {
    const vault = mockVault();
    const pr = createPackRuntime({ vault, projectRegistry: mockRegistry() });
    expect(pr.vault).toBe(vault);
  });

  it('getProject returns project by id', () => {
    const project: PackProjectContext = { id: 'p1', name: 'Test', path: '/test' };
    const pr = createPackRuntime({ vault: mockVault(), projectRegistry: mockRegistry([project]) });
    expect(pr.getProject('p1')).toEqual(project);
  });

  it('getProject returns undefined for unknown id', () => {
    const pr = createPackRuntime({ vault: mockVault(), projectRegistry: mockRegistry() });
    expect(pr.getProject('unknown')).toBeUndefined();
  });

  it('listProjects returns all registered projects', () => {
    const projects: PackProjectContext[] = [
      { id: 'a', name: 'A', path: '/a' },
      { id: 'b', path: '/b' },
    ];
    const pr = createPackRuntime({ vault: mockVault(), projectRegistry: mockRegistry(projects) });
    const list = pr.listProjects();
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe('a');
    expect(list[1].id).toBe('b');
  });

  it('createCheck delegates to session store', () => {
    const store = mockSessionStore();
    const pr = createPackRuntime({
      vault: mockVault(),
      projectRegistry: mockRegistry(),
      sessionStore: store,
    });
    const id = pr.createCheck('contrast', { ratio: 4.5 });
    expect(typeof id).toBe('string');
    expect(store.createCheck).toHaveBeenCalledWith('contrast', { ratio: 4.5 });
  });

  it('createCheck throws when session store is unavailable', () => {
    const pr = createPackRuntime({ vault: mockVault(), projectRegistry: mockRegistry() });
    expect(() => pr.createCheck('test', {})).toThrow(/Session store not available/);
  });

  it('validateCheck returns null when session store is unavailable', () => {
    const pr = createPackRuntime({ vault: mockVault(), projectRegistry: mockRegistry() });
    expect(pr.validateCheck('id', 'type')).toBeNull();
  });

  it('validateAndConsume returns null when session store is unavailable', () => {
    const pr = createPackRuntime({ vault: mockVault(), projectRegistry: mockRegistry() });
    expect(pr.validateAndConsume('id', 'type')).toBeNull();
  });

  it('validateCheck delegates to session store', () => {
    const store = mockSessionStore();
    const pr = createPackRuntime({
      vault: mockVault(),
      projectRegistry: mockRegistry(),
      sessionStore: store,
    });
    const id = pr.createCheck('contrast', { ratio: 4.5 });
    const result = pr.validateCheck(id, 'contrast');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('contrast');
  });

  it('validateCheck returns null for wrong type', () => {
    const store = mockSessionStore();
    const pr = createPackRuntime({
      vault: mockVault(),
      projectRegistry: mockRegistry(),
      sessionStore: store,
    });
    const id = pr.createCheck('contrast', {});
    expect(pr.validateCheck(id, 'wrong-type')).toBeNull();
  });

  it('validateAndConsume removes the check after use', () => {
    const store = mockSessionStore();
    const pr = createPackRuntime({
      vault: mockVault(),
      projectRegistry: mockRegistry(),
      sessionStore: store,
    });
    const id = pr.createCheck('contrast', { ratio: 21 });
    const first = pr.validateAndConsume(id, 'contrast');
    expect(first).not.toBeNull();
    const second = pr.validateAndConsume(id, 'contrast');
    expect(second).toBeNull();
  });
});
