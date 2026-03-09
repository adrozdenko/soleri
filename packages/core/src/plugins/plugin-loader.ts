/**
 * Plugin Loader — scans directories, validates manifests, loads plugins.
 *
 * Plugin directories (checked in order, first occurrence wins):
 *   1. ~/.{agentId}/plugins/ (global plugins)
 *   2. .{agentId}/plugins/  (project plugins)
 *   3. Custom directories (via config)
 *
 * Each plugin is a directory containing `soleri-plugin.json`.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  pluginManifestSchema,
  type LoadedPlugin,
  type LoadResult,
  type PluginProvenance,
} from './types.js';

// =============================================================================
// LOADER
// =============================================================================

const MANIFEST_FILENAME = 'soleri-plugin.json';

/**
 * Load all plugins from standard + custom directories.
 */
export function loadPlugins(
  agentId: string,
  projectPath?: string,
  extraDirs: string[] = [],
): LoadResult {
  const result: LoadResult = { loaded: [], errors: [] };
  const seen = new Set<string>();

  const dirs: Array<{ path: string; provenance: PluginProvenance }> = [];

  // Global: ~/.{agentId}/plugins/
  const globalDir = join(homedir(), `.${agentId}`, 'plugins');
  if (existsSync(globalDir)) {
    dirs.push({ path: globalDir, provenance: 'global' });
  }

  // Project: .{agentId}/plugins/
  if (projectPath) {
    const projectDir = join(projectPath, `.${agentId}`, 'plugins');
    if (existsSync(projectDir)) {
      dirs.push({ path: projectDir, provenance: 'project' });
    }
  }

  // Custom
  for (const dir of extraDirs) {
    if (existsSync(dir)) {
      dirs.push({ path: dir, provenance: 'custom' });
    }
  }

  for (const { path: parentDir, provenance } of dirs) {
    try {
      const entries = readdirSync(parentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const pluginDir = join(parentDir, entry.name);
        const loaded = loadSinglePlugin(pluginDir, provenance);

        if (loaded.error) {
          result.errors.push({ directory: pluginDir, error: loaded.error });
          continue;
        }

        if (loaded.plugin) {
          if (seen.has(loaded.plugin.manifest.id)) continue; // first wins
          seen.add(loaded.plugin.manifest.id);
          result.loaded.push(loaded.plugin);
        }
      }
    } catch {
      // Directory not scannable — skip
    }
  }

  return result;
}

/**
 * Load a single plugin from a directory.
 */
function loadSinglePlugin(
  pluginDir: string,
  provenance: PluginProvenance,
): { plugin?: LoadedPlugin; error?: string } {
  const manifestPath = join(pluginDir, MANIFEST_FILENAME);

  if (!existsSync(manifestPath)) {
    return { error: `No ${MANIFEST_FILENAME} found in ${pluginDir}` };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch (e) {
    return {
      error: `Invalid JSON in ${manifestPath}: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const parseResult = pluginManifestSchema.safeParse(raw);
  if (!parseResult.success) {
    const issues = parseResult.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    return { error: `Invalid manifest in ${pluginDir}: ${issues}` };
  }

  return {
    plugin: {
      manifest: parseResult.data,
      directory: pluginDir,
      provenance,
    },
  };
}

// =============================================================================
// DEPENDENCY HELPERS
// =============================================================================

/**
 * Validate that all plugin dependencies are satisfiable.
 */
export function validateDependencies(
  plugins: LoadedPlugin[],
): Array<{ pluginId: string; missingDep: string }> {
  const available = new Set(plugins.map((p) => p.manifest.id));
  const errors: Array<{ pluginId: string; missingDep: string }> = [];

  for (const { manifest } of plugins) {
    for (const dep of manifest.dependencies) {
      if (!available.has(dep)) {
        errors.push({ pluginId: manifest.id, missingDep: dep });
      }
    }
  }

  return errors;
}

/**
 * Topological sort by dependency order (no-deps first).
 * Detects and breaks circular dependencies.
 */
export function sortByDependencies(plugins: LoadedPlugin[]): LoadedPlugin[] {
  const byId = new Map(plugins.map((p) => [p.manifest.id, p]));
  const sorted: LoadedPlugin[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(id: string): void {
    if (visited.has(id)) return;
    if (visiting.has(id)) return; // circular — break
    visiting.add(id);
    const plugin = byId.get(id);
    if (plugin) {
      for (const dep of plugin.manifest.dependencies) {
        visit(dep);
      }
      sorted.push(plugin);
    }
    visiting.delete(id);
    visited.add(id);
  }

  for (const { manifest } of plugins) {
    visit(manifest.id);
  }

  return sorted;
}
