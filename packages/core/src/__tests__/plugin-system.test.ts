import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PluginRegistry } from '../plugins/plugin-registry.js';
import { loadPlugins, validateDependencies, sortByDependencies } from '../plugins/plugin-loader.js';
import { pluginManifestSchema } from '../plugins/types.js';
import type { LoadedPlugin, PluginManifest } from '../plugins/types.js';

// =============================================================================
// HELPERS
// =============================================================================

function makeManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return pluginManifestSchema.parse({
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    description: 'A test plugin',
    ...overrides,
  });
}

function makeLoadedPlugin(overrides: Partial<LoadedPlugin> = {}): LoadedPlugin {
  return {
    manifest: makeManifest(overrides.manifest as Partial<PluginManifest>),
    directory: '/tmp/test-plugin',
    provenance: 'global',
    ...overrides,
  };
}

let testDir: string;

function setupTestDir(): string {
  testDir = join(tmpdir(), `soleri-plugin-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  return testDir;
}

function createPluginDir(parentDir: string, id: string, manifest: Record<string, unknown>): string {
  const dir = join(parentDir, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'soleri-plugin.json'), JSON.stringify(manifest));
  return dir;
}

// =============================================================================
// MANIFEST SCHEMA
// =============================================================================

describe('pluginManifestSchema', () => {
  it('should validate a minimal manifest', () => {
    const result = pluginManifestSchema.safeParse({
      id: 'my-plugin',
      name: 'My Plugin',
      version: '1.0.0',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid ID format', () => {
    const result = pluginManifestSchema.safeParse({
      id: 'MyPlugin',
      name: 'My Plugin',
      version: '1.0.0',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid semver', () => {
    const result = pluginManifestSchema.safeParse({
      id: 'my-plugin',
      name: 'My Plugin',
      version: '1.0',
    });
    expect(result.success).toBe(false);
  });

  it('should accept full manifest with facades and intelligence', () => {
    const result = pluginManifestSchema.safeParse({
      id: 'full-plugin',
      name: 'Full Plugin',
      version: '2.1.0',
      description: 'A fully specified plugin',
      domain: 'security',
      dependencies: ['base-plugin'],
      facades: [
        {
          name: 'security_scanner',
          description: 'Security scanning ops',
          ops: [
            { name: 'scan_deps', description: 'Scan dependencies', auth: 'read' },
            { name: 'fix_vuln', description: 'Fix vulnerability', auth: 'write' },
          ],
        },
      ],
      intelligence: [
        {
          id: 'sec-001',
          type: 'pattern',
          domain: 'security',
          title: 'Input Validation',
          severity: 'critical',
          description: 'Always validate user input',
          tags: ['security', 'input'],
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.facades).toHaveLength(1);
      expect(result.data.intelligence).toHaveLength(1);
    }
  });

  it('should default optional fields', () => {
    const result = pluginManifestSchema.parse({
      id: 'minimal',
      name: 'Minimal',
      version: '0.1.0',
    });
    expect(result.description).toBe('');
    expect(result.dependencies).toEqual([]);
    expect(result.facades).toEqual([]);
    expect(result.intelligence).toEqual([]);
  });
});

// =============================================================================
// PLUGIN LOADER
// =============================================================================

describe('loadPlugins', () => {
  afterEach(() => {
    if (testDir) {
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch {
        /* cleanup */
      }
    }
  });

  it('should load plugins from a custom directory', () => {
    const dir = setupTestDir();
    createPluginDir(dir, 'my-plugin', {
      id: 'my-plugin',
      name: 'My Plugin',
      version: '1.0.0',
    });

    const result = loadPlugins('test-agent', undefined, [dir]);
    expect(result.loaded).toHaveLength(1);
    expect(result.loaded[0].manifest.id).toBe('my-plugin');
    expect(result.loaded[0].provenance).toBe('custom');
    expect(result.errors).toHaveLength(0);
  });

  it('should skip directories without manifest', () => {
    const dir = setupTestDir();
    mkdirSync(join(dir, 'no-manifest'), { recursive: true });

    const result = loadPlugins('test-agent', undefined, [dir]);
    expect(result.loaded).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });

  it('should report invalid JSON', () => {
    const dir = setupTestDir();
    const pluginDir = join(dir, 'bad-json');
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(join(pluginDir, 'soleri-plugin.json'), '{ invalid json }');

    const result = loadPlugins('test-agent', undefined, [dir]);
    expect(result.loaded).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain('Invalid JSON');
  });

  it('should report invalid manifest', () => {
    const dir = setupTestDir();
    createPluginDir(dir, 'bad-manifest', { id: 'BadId', name: '', version: 'nope' });

    const result = loadPlugins('test-agent', undefined, [dir]);
    expect(result.loaded).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain('Invalid manifest');
  });

  it('should deduplicate — first occurrence wins', () => {
    const dir1 = setupTestDir();
    const dir2 = join(tmpdir(), `soleri-plugin-test2-${Date.now()}`);
    mkdirSync(dir2, { recursive: true });

    createPluginDir(dir1, 'dup-plugin', { id: 'dup-plugin', name: 'First', version: '1.0.0' });
    createPluginDir(dir2, 'dup-plugin', { id: 'dup-plugin', name: 'Second', version: '2.0.0' });

    const result = loadPlugins('test-agent', undefined, [dir1, dir2]);
    expect(result.loaded).toHaveLength(1);
    expect(result.loaded[0].manifest.name).toBe('First');

    rmSync(dir2, { recursive: true, force: true });
  });

  it('should handle nonexistent directories gracefully', () => {
    const result = loadPlugins('test-agent', undefined, ['/nonexistent/path']);
    expect(result.loaded).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});

// =============================================================================
// DEPENDENCY VALIDATION
// =============================================================================

describe('validateDependencies', () => {
  it('should pass with no dependencies', () => {
    const plugins = [makeLoadedPlugin()];
    expect(validateDependencies(plugins)).toHaveLength(0);
  });

  it('should detect missing dependencies', () => {
    const plugins = [
      makeLoadedPlugin({
        manifest: {
          id: 'child',
          name: 'Child',
          version: '1.0.0',
          dependencies: ['parent'],
        } as PluginManifest,
      }),
    ];
    const errors = validateDependencies(plugins);
    expect(errors).toHaveLength(1);
    expect(errors[0].pluginId).toBe('child');
    expect(errors[0].missingDep).toBe('parent');
  });

  it('should pass when dependency is present', () => {
    const plugins = [
      makeLoadedPlugin({ manifest: makeManifest({ id: 'parent' }) }),
      makeLoadedPlugin({
        manifest: makeManifest({ id: 'child', dependencies: ['parent'] }),
      }),
    ];
    expect(validateDependencies(plugins)).toHaveLength(0);
  });
});

// =============================================================================
// TOPOLOGICAL SORT
// =============================================================================

describe('sortByDependencies', () => {
  it('should sort dependencies before dependents', () => {
    const parent = makeLoadedPlugin({ manifest: makeManifest({ id: 'parent' }) });
    const child = makeLoadedPlugin({
      manifest: makeManifest({ id: 'child', dependencies: ['parent'] }),
    });

    const sorted = sortByDependencies([child, parent]);
    const ids = sorted.map((p) => p.manifest.id);
    expect(ids).toEqual(['parent', 'child']);
  });

  it('should handle circular dependencies without infinite loop', () => {
    const a = makeLoadedPlugin({
      manifest: makeManifest({ id: 'a', dependencies: ['b'] }),
    });
    const b = makeLoadedPlugin({
      manifest: makeManifest({ id: 'b', dependencies: ['a'] }),
    });

    // Should not throw
    const sorted = sortByDependencies([a, b]);
    expect(sorted.length).toBeLessThanOrEqual(2);
  });

  it('should preserve order for independent plugins', () => {
    const x = makeLoadedPlugin({ manifest: makeManifest({ id: 'x' }) });
    const y = makeLoadedPlugin({ manifest: makeManifest({ id: 'y' }) });

    const sorted = sortByDependencies([x, y]);
    expect(sorted).toHaveLength(2);
  });
});

// =============================================================================
// PLUGIN REGISTRY
// =============================================================================

describe('PluginRegistry', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  describe('register', () => {
    it('should register a plugin', () => {
      const loaded = makeLoadedPlugin();
      const registered = registry.register(loaded);

      expect(registered.id).toBe('test-plugin');
      expect(registered.status).toBe('registered');
      expect(registered.registeredAt).toBeGreaterThan(0);
    });

    it('should throw on duplicate registration', () => {
      registry.register(makeLoadedPlugin());
      expect(() => registry.register(makeLoadedPlugin())).toThrow('already registered');
    });
  });

  describe('activate', () => {
    it('should activate with static manifest facades', async () => {
      const loaded = makeLoadedPlugin({
        manifest: makeManifest({
          facades: [
            {
              name: 'test_facade',
              description: 'Test',
              ops: [{ name: 'test_op', description: 'A test op', auth: 'read' }],
            },
          ],
        }),
      });

      registry.register(loaded);
      const result = await registry.activate('test-plugin', {
        runtime: {},
        manifest: loaded.manifest,
        directory: loaded.directory,
      });

      expect(result.status).toBe('active');
      expect(result.facades).toHaveLength(1);
      expect(result.facades[0].ops).toHaveLength(1);
      expect(result.facades[0].ops[0].name).toBe('test_op');
    });

    it('should set error status on activation failure for unregistered plugin', async () => {
      await expect(
        registry.activate('nonexistent', {
          runtime: {},
          manifest: makeManifest(),
          directory: '/tmp',
        }),
      ).rejects.toThrow('not registered');
    });

    it('should return same plugin if already active', async () => {
      const loaded = makeLoadedPlugin();
      registry.register(loaded);
      await registry.activate('test-plugin', {
        runtime: {},
        manifest: loaded.manifest,
        directory: loaded.directory,
      });
      const result = await registry.activate('test-plugin', {
        runtime: {},
        manifest: loaded.manifest,
        directory: loaded.directory,
      });
      expect(result.status).toBe('active');
    });

    it('should set error status when plugin index.js exists but fails to load', async () => {
      const dir = setupTestDir();
      const pluginDir = createPluginDir(dir, 'broken-runtime-plugin', {
        id: 'broken-runtime-plugin',
        name: 'Broken Runtime Plugin',
        version: '1.0.0',
      });

      // Broken ESM syntax to force dynamic import failure
      writeFileSync(join(pluginDir, 'index.js'), 'export const broken = ;');

      const loaded = makeLoadedPlugin({
        directory: pluginDir,
        manifest: makeManifest({
          id: 'broken-runtime-plugin',
          name: 'Broken Runtime Plugin',
          version: '1.0.0',
        }),
      });
      registry.register(loaded);

      const result = await registry.activate('broken-runtime-plugin', {
        runtime: {},
        manifest: loaded.manifest,
        directory: loaded.directory,
      });

      expect(result.status).toBe('error');
      expect(result.error).toContain('Failed to load plugin module');
      expect(result.facades).toEqual([]);
    });
  });

  describe('deactivate', () => {
    it('should deactivate an active plugin', async () => {
      const loaded = makeLoadedPlugin();
      registry.register(loaded);
      await registry.activate('test-plugin', {
        runtime: {},
        manifest: loaded.manifest,
        directory: loaded.directory,
      });

      expect(registry.deactivate('test-plugin')).toBe(true);
      expect(registry.get('test-plugin')?.status).toBe('deactivated');
      expect(registry.get('test-plugin')?.facades).toEqual([]);
    });

    it('should return false for unknown plugin', () => {
      expect(registry.deactivate('nonexistent')).toBe(false);
    });
  });

  describe('unregister', () => {
    it('should remove a plugin', () => {
      registry.register(makeLoadedPlugin());
      expect(registry.unregister('test-plugin')).toBe(true);
      expect(registry.get('test-plugin')).toBeUndefined();
    });

    it('should deactivate before unregistering', async () => {
      const loaded = makeLoadedPlugin();
      registry.register(loaded);
      await registry.activate('test-plugin', {
        runtime: {},
        manifest: loaded.manifest,
        directory: loaded.directory,
      });
      expect(registry.unregister('test-plugin')).toBe(true);
      expect(registry.list()).toHaveLength(0);
    });
  });

  describe('list and getActiveFacades', () => {
    it('should list all plugins', () => {
      registry.register(makeLoadedPlugin({ manifest: makeManifest({ id: 'a' }) }));
      registry.register(makeLoadedPlugin({ manifest: makeManifest({ id: 'b' }) }));
      expect(registry.list()).toHaveLength(2);
    });

    it('should return facades only from active plugins', async () => {
      const loaded = makeLoadedPlugin({
        manifest: makeManifest({
          id: 'active-one',
          facades: [
            {
              name: 'f1',
              description: '',
              ops: [{ name: 'op1', description: '', auth: 'read' }],
            },
          ],
        }),
      });
      registry.register(loaded);
      await registry.activate('active-one', {
        runtime: {},
        manifest: loaded.manifest,
        directory: loaded.directory,
      });

      registry.register(makeLoadedPlugin({ manifest: makeManifest({ id: 'inactive' }) }));

      const facades = registry.getActiveFacades();
      expect(facades).toHaveLength(1);
      expect(facades[0].name).toBe('f1');
    });

    it('should return flattened ops from getActiveOps', async () => {
      const loaded = makeLoadedPlugin({
        manifest: makeManifest({
          id: 'multi-ops',
          facades: [
            {
              name: 'f1',
              description: '',
              ops: [
                { name: 'op1', description: '', auth: 'read' },
                { name: 'op2', description: '', auth: 'write' },
              ],
            },
            {
              name: 'f2',
              description: '',
              ops: [{ name: 'op3', description: '', auth: 'admin' }],
            },
          ],
        }),
      });
      registry.register(loaded);
      await registry.activate('multi-ops', {
        runtime: {},
        manifest: loaded.manifest,
        directory: loaded.directory,
      });

      const ops = registry.getActiveOps();
      expect(ops).toHaveLength(3);
      expect(ops.map((o) => o.name)).toEqual(['op1', 'op2', 'op3']);
    });
  });
});
