import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadPlugins, validateDependencies, sortByDependencies } from './plugin-loader.js';
import { pluginManifestSchema } from './types.js';
import type { LoadedPlugin, PluginManifest } from './types.js';

// =============================================================================
// HELPERS
// =============================================================================

let testDirs: string[] = [];

function makeTempDir(): string {
  const dir = join(tmpdir(), `soleri-loader-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  testDirs.push(dir);
  return dir;
}

function writePlugin(parentDir: string, id: string, manifest: Record<string, unknown>): string {
  const dir = join(parentDir, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'soleri-plugin.json'), JSON.stringify(manifest));
  return dir;
}

function makeLoaded(overrides: Partial<LoadedPlugin & { manifest: Partial<PluginManifest> }> = {}): LoadedPlugin {
  return {
    manifest: pluginManifestSchema.parse({
      id: 'test-plugin',
      name: 'Test',
      version: '1.0.0',
      ...(overrides.manifest ?? {}),
    }),
    directory: overrides.directory ?? '/tmp/test',
    provenance: overrides.provenance ?? 'global',
  };
}

afterEach(() => {
  for (const dir of testDirs) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* noop */ }
  }
  testDirs = [];
});

// =============================================================================
// loadPlugins
// =============================================================================

describe('loadPlugins — colocated', () => {
  it('loads from multiple custom directories and deduplicates by id', () => {
    const dir1 = makeTempDir();
    const dir2 = makeTempDir();

    writePlugin(dir1, 'alpha', { id: 'alpha', name: 'Alpha', version: '1.0.0' });
    writePlugin(dir2, 'alpha', { id: 'alpha', name: 'Alpha v2', version: '2.0.0' });
    writePlugin(dir2, 'beta', { id: 'beta', name: 'Beta', version: '1.0.0' });

    const result = loadPlugins('test-agent', undefined, [dir1, dir2]);

    expect(result.loaded).toHaveLength(2);
    const ids = result.loaded.map(p => p.manifest.id);
    expect(ids).toContain('alpha');
    expect(ids).toContain('beta');
    // First occurrence wins
    expect(result.loaded.find(p => p.manifest.id === 'alpha')!.manifest.name).toBe('Alpha');
  });

  it('skips files (non-directories) inside plugin dir', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'not-a-directory.txt'), 'ignore me');
    writePlugin(dir, 'valid', { id: 'valid', name: 'Valid', version: '1.0.0' });

    const result = loadPlugins('test-agent', undefined, [dir]);

    expect(result.loaded).toHaveLength(1);
    expect(result.loaded[0].manifest.id).toBe('valid');
  });

  it('returns error for directory without manifest file', () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, 'empty-dir'), { recursive: true });

    const result = loadPlugins('test-agent', undefined, [dir]);

    expect(result.loaded).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain('No soleri-plugin.json');
  });

  it('returns error for invalid JSON in manifest', () => {
    const dir = makeTempDir();
    const pluginDir = join(dir, 'broken');
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(join(pluginDir, 'soleri-plugin.json'), '{{not json}}');

    const result = loadPlugins('test-agent', undefined, [dir]);

    expect(result.loaded).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain('Invalid JSON');
  });

  it('returns error for manifest failing schema validation', () => {
    const dir = makeTempDir();
    writePlugin(dir, 'bad', { id: 'UPPERCASE', name: '', version: 'invalid' });

    const result = loadPlugins('test-agent', undefined, [dir]);

    expect(result.loaded).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain('Invalid manifest');
  });

  it('handles nonexistent custom directories gracefully', () => {
    const result = loadPlugins('test-agent', undefined, ['/nonexistent/path/xyz123']);

    expect(result.loaded).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('loads with project path when directory exists', () => {
    const projectDir = makeTempDir();
    const pluginsDir = join(projectDir, '.test-agent', 'plugins');
    mkdirSync(pluginsDir, { recursive: true });
    writePlugin(pluginsDir, 'project-plugin', {
      id: 'project-plugin',
      name: 'Project Plugin',
      version: '1.0.0',
    });

    const result = loadPlugins('test-agent', projectDir);

    expect(result.loaded).toHaveLength(1);
    expect(result.loaded[0].manifest.id).toBe('project-plugin');
    expect(result.loaded[0].provenance).toBe('project');
  });
});

// =============================================================================
// validateDependencies
// =============================================================================

describe('validateDependencies — colocated', () => {
  it('returns empty array when all dependencies are satisfied', () => {
    const plugins = [
      makeLoaded({ manifest: { id: 'base' } }),
      makeLoaded({ manifest: { id: 'child', dependencies: ['base'] } }),
    ];
    expect(validateDependencies(plugins)).toEqual([]);
  });

  it('detects multiple missing dependencies', () => {
    const plugins = [
      makeLoaded({ manifest: { id: 'lonely', dependencies: ['dep-a', 'dep-b'] } }),
    ];
    const errors = validateDependencies(plugins);
    expect(errors).toHaveLength(2);
    expect(errors.map(e => e.missingDep)).toEqual(['dep-a', 'dep-b']);
  });

  it('handles plugins with no dependencies', () => {
    const plugins = [
      makeLoaded({ manifest: { id: 'standalone' } }),
    ];
    expect(validateDependencies(plugins)).toEqual([]);
  });
});

// =============================================================================
// sortByDependencies
// =============================================================================

describe('sortByDependencies — colocated', () => {
  it('sorts three-level dependency chain correctly', () => {
    const c = makeLoaded({ manifest: { id: 'c', dependencies: ['b'] } });
    const b = makeLoaded({ manifest: { id: 'b', dependencies: ['a'] } });
    const a = makeLoaded({ manifest: { id: 'a' } });

    const sorted = sortByDependencies([c, b, a]);
    const ids = sorted.map(p => p.manifest.id);

    expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('b'));
    expect(ids.indexOf('b')).toBeLessThan(ids.indexOf('c'));
  });

  it('handles circular dependency without infinite loop', () => {
    const x = makeLoaded({ manifest: { id: 'x', dependencies: ['y'] } });
    const y = makeLoaded({ manifest: { id: 'y', dependencies: ['x'] } });

    // Should not hang or throw
    const sorted = sortByDependencies([x, y]);
    expect(sorted.length).toBeLessThanOrEqual(2);
  });

  it('returns empty array for empty input', () => {
    expect(sortByDependencies([])).toEqual([]);
  });

  it('preserves all plugins when no dependencies exist', () => {
    const plugins = [
      makeLoaded({ manifest: { id: 'a' } }),
      makeLoaded({ manifest: { id: 'b' } }),
      makeLoaded({ manifest: { id: 'c' } }),
    ];
    const sorted = sortByDependencies(plugins);
    expect(sorted).toHaveLength(3);
  });
});
