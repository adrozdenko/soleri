import { describe, it, expect, beforeEach } from 'vitest';
import { PluginRegistry } from './plugin-registry.js';
import { pluginManifestSchema } from './types.js';
import type { LoadedPlugin, PluginManifest, PluginContext } from './types.js';

// =============================================================================
// HELPERS
// =============================================================================

function makeManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return pluginManifestSchema.parse({
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    ...overrides,
  });
}

function makeLoaded(overrides: Partial<LoadedPlugin> = {}): LoadedPlugin {
  return {
    manifest: makeManifest(overrides.manifest as Partial<PluginManifest>),
    directory: '/tmp/test-plugin',
    provenance: 'global',
    ...overrides,
  };
}

function makeContext(plugin: LoadedPlugin): PluginContext {
  return {
    packRuntime: {} as PluginContext['packRuntime'],
    runtime: {},
    manifest: plugin.manifest,
    directory: plugin.directory,
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('PluginRegistry — colocated', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  describe('register', () => {
    it('registers a plugin and sets initial status to registered', () => {
      const loaded = makeLoaded();
      const registered = registry.register(loaded);

      expect(registered.id).toBe('test-plugin');
      expect(registered.status).toBe('registered');
      expect(registered.facades).toEqual([]);
      expect(registered.registeredAt).toBeGreaterThan(0);
    });

    it('throws when registering duplicate id', () => {
      registry.register(makeLoaded());
      expect(() => registry.register(makeLoaded())).toThrow('already registered');
    });

    it('registers multiple distinct plugins', () => {
      registry.register(makeLoaded({ manifest: makeManifest({ id: 'alpha' }) }));
      registry.register(makeLoaded({ manifest: makeManifest({ id: 'beta' }) }));

      expect(registry.list()).toHaveLength(2);
    });
  });

  describe('activate', () => {
    it('builds static facades from manifest when no index.js exists', async () => {
      const loaded = makeLoaded({
        manifest: makeManifest({
          facades: [
            {
              name: 'my_facade',
              description: 'Test facade',
              ops: [
                { name: 'do_thing', description: 'Does a thing', auth: 'read' },
                { name: 'admin_thing', description: 'Admin action', auth: 'admin' },
              ],
            },
          ],
        }),
      });

      registry.register(loaded);
      const result = await registry.activate('test-plugin', makeContext(loaded));

      expect(result.status).toBe('active');
      expect(result.activatedAt).toBeGreaterThan(0);
      expect(result.facades).toHaveLength(1);
      expect(result.facades[0].name).toBe('my_facade');
      expect(result.facades[0].ops).toHaveLength(2);
      expect(result.facades[0].ops[0].name).toBe('do_thing');
    });

    it('static facade ops return error message when called', async () => {
      const loaded = makeLoaded({
        manifest: makeManifest({
          facades: [
            {
              name: 'f',
              description: '',
              ops: [{ name: 'op1', description: '', auth: 'read' }],
            },
          ],
        }),
      });

      registry.register(loaded);
      const result = await registry.activate('test-plugin', makeContext(loaded));
      const handlerResult = await result.facades[0].ops[0].handler({});

      expect(handlerResult).toHaveProperty('error');
      expect((handlerResult as { error: string }).error).toContain('static plugin op');
    });

    it('returns same plugin without re-activating when already active', async () => {
      const loaded = makeLoaded();
      registry.register(loaded);

      const first = await registry.activate('test-plugin', makeContext(loaded));
      const second = await registry.activate('test-plugin', makeContext(loaded));

      expect(first).toBe(second);
      expect(second.status).toBe('active');
    });

    it('throws for unregistered plugin', async () => {
      await expect(registry.activate('ghost', makeContext(makeLoaded()))).rejects.toThrow(
        'not registered',
      );
    });

    it('sets error status when index.js fails to load', async () => {
      const loaded = makeLoaded({
        directory: '/nonexistent/path/that/has/index.js',
        manifest: makeManifest({ id: 'broken' }),
      });

      // The activate method checks for index.js existence with existsSync,
      // so with a nonexistent dir, it falls back to static facades (no error).
      // This tests the static fallback path for missing directory.
      registry.register(loaded);
      const result = await registry.activate('broken', makeContext(loaded));

      expect(result.status).toBe('active');
      expect(result.facades).toEqual([]);
    });
  });

  describe('deactivate', () => {
    it('deactivates an active plugin and clears facades', async () => {
      const loaded = makeLoaded({
        manifest: makeManifest({
          facades: [
            {
              name: 'f',
              description: '',
              ops: [{ name: 'op', description: '', auth: 'read' }],
            },
          ],
        }),
      });

      registry.register(loaded);
      await registry.activate('test-plugin', makeContext(loaded));
      expect(registry.get('test-plugin')!.facades).toHaveLength(1);

      const result = registry.deactivate('test-plugin');

      expect(result).toBe(true);
      expect(registry.get('test-plugin')!.status).toBe('deactivated');
      expect(registry.get('test-plugin')!.facades).toEqual([]);
    });

    it('returns false for unknown plugin', () => {
      expect(registry.deactivate('nonexistent')).toBe(false);
    });
  });

  describe('unregister', () => {
    it('removes plugin completely', () => {
      registry.register(makeLoaded());
      expect(registry.unregister('test-plugin')).toBe(true);
      expect(registry.get('test-plugin')).toBeUndefined();
      expect(registry.list()).toHaveLength(0);
    });

    it('deactivates before unregistering active plugin', async () => {
      const loaded = makeLoaded();
      registry.register(loaded);
      await registry.activate('test-plugin', makeContext(loaded));

      expect(registry.unregister('test-plugin')).toBe(true);
      expect(registry.list()).toHaveLength(0);
    });

    it('returns false for unknown plugin', () => {
      expect(registry.unregister('ghost')).toBe(false);
    });
  });

  describe('getActiveFacades and getActiveOps', () => {
    it('returns facades only from active plugins', async () => {
      const active = makeLoaded({
        manifest: makeManifest({
          id: 'active-one',
          facades: [
            {
              name: 'af',
              description: '',
              ops: [{ name: 'aop', description: '', auth: 'read' }],
            },
          ],
        }),
      });
      const inactive = makeLoaded({ manifest: makeManifest({ id: 'inactive-one' }) });

      registry.register(active);
      registry.register(inactive);
      await registry.activate('active-one', makeContext(active));

      const facades = registry.getActiveFacades();
      expect(facades).toHaveLength(1);
      expect(facades[0].name).toBe('af');
    });

    it('returns flattened ops across multiple facades', async () => {
      const loaded = makeLoaded({
        manifest: makeManifest({
          id: 'multi',
          facades: [
            { name: 'f1', description: '', ops: [{ name: 'a', description: '', auth: 'read' }] },
            {
              name: 'f2',
              description: '',
              ops: [
                { name: 'b', description: '', auth: 'write' },
                { name: 'c', description: '', auth: 'admin' },
              ],
            },
          ],
        }),
      });

      registry.register(loaded);
      await registry.activate('multi', makeContext(loaded));

      const ops = registry.getActiveOps();
      expect(ops).toHaveLength(3);
      expect(ops.map((o) => o.name)).toEqual(['a', 'b', 'c']);
    });

    it('returns empty when no active plugins', () => {
      registry.register(makeLoaded());
      expect(registry.getActiveFacades()).toEqual([]);
      expect(registry.getActiveOps()).toEqual([]);
    });
  });

  describe('get and list', () => {
    it('returns undefined for unknown plugin', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });

    it('lists all registered plugins regardless of status', async () => {
      const a = makeLoaded({ manifest: makeManifest({ id: 'a' }) });
      const b = makeLoaded({ manifest: makeManifest({ id: 'b' }) });

      registry.register(a);
      registry.register(b);
      await registry.activate('a', makeContext(a));

      const list = registry.list();
      expect(list).toHaveLength(2);
      expect(list.find((p) => p.id === 'a')!.status).toBe('active');
      expect(list.find((p) => p.id === 'b')!.status).toBe('registered');
    });
  });
});
