import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RuntimeAdapterRegistry } from '../../adapters/registry.js';
import type { RuntimeAdapter } from '../../adapters/types.js';

function createMockAdapter(type: string): RuntimeAdapter {
  return {
    type,
    execute: vi.fn().mockResolvedValue({ exitCode: 0 }),
    testEnvironment: vi.fn().mockResolvedValue({ available: true }),
  };
}

describe('RuntimeAdapterRegistry', () => {
  let registry: RuntimeAdapterRegistry;

  beforeEach(() => {
    registry = new RuntimeAdapterRegistry();
  });

  it('should store an adapter via register() and retrieve it via get()', () => {
    const adapter = createMockAdapter('claude-code');
    registry.register('claude-code', adapter);

    const result = registry.get('claude-code');
    expect(result).toBe(adapter);
  });

  it('should throw when getting an unknown adapter type', () => {
    expect(() => registry.get('nonexistent')).toThrow(/unknown adapter type/i);
  });

  it('should return all registered types via list()', () => {
    registry.register('claude-code', createMockAdapter('claude-code'));
    registry.register('codex', createMockAdapter('codex'));

    const types = registry.list();
    expect(types).toContain('claude-code');
    expect(types).toContain('codex');
    expect(types).toHaveLength(2);
  });

  it('should set the default adapter via setDefault()', () => {
    const adapter = createMockAdapter('claude-code');
    registry.register('claude-code', adapter);
    registry.setDefault('claude-code');

    const result = registry.getDefault();
    expect(result).toBe(adapter);
  });

  it('should return the default adapter via getDefault()', () => {
    const a1 = createMockAdapter('claude-code');
    const a2 = createMockAdapter('codex');
    registry.register('claude-code', a1);
    registry.register('codex', a2);
    registry.setDefault('codex');

    expect(registry.getDefault()).toBe(a2);
  });

  it('should throw when setDefault() is called with an unregistered type', () => {
    expect(() => registry.setDefault('nonexistent')).toThrow(/unregistered type/i);
  });

  it('should throw when register() is called with a duplicate type', () => {
    registry.register('claude-code', createMockAdapter('claude-code'));

    expect(() => registry.register('claude-code', createMockAdapter('claude-code'))).toThrow(
      /already registered/i,
    );
  });

  it('should return an empty array from list() when no adapters are registered', () => {
    expect(registry.list()).toEqual([]);
  });

  it('should allow multiple adapters to coexist', () => {
    const adapters = ['claude-code', 'codex', 'cursor'];
    adapters.forEach((type) => registry.register(type, createMockAdapter(type)));

    expect(registry.list()).toHaveLength(3);
    adapters.forEach((type) => {
      expect(registry.get(type).type).toBe(type);
    });
  });

  it('should throw when getDefault() is called with no default set', () => {
    expect(() => registry.getDefault()).toThrow(/no default/i);
  });

  it('should include registered type names in error message when get() fails', () => {
    registry.register('codex', createMockAdapter('codex'));

    expect(() => registry.get('missing')).toThrow(/codex/);
  });

  it('should show "(none)" in error message when no adapters are registered and get() fails', () => {
    expect(() => registry.get('missing')).toThrow(/\(none\)/);
  });
});
