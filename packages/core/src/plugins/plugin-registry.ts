/**
 * Plugin Registry — tracks loaded plugins and their lifecycle.
 *
 * Not a singleton — lives on AgentRuntime for testability.
 * Lifecycle: load → register → activate → (deactivate | error)
 */

import type {
  LoadedPlugin,
  RegisteredPlugin,
  PluginContext,
  PluginFacadeBuilder,
} from './types.js';
import type { FacadeConfig, OpDefinition } from '../facades/types.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export class PluginRegistry {
  private plugins = new Map<string, RegisteredPlugin>();

  /**
   * Register a loaded plugin. Does NOT activate it — call activate() separately.
   */
  register(loaded: LoadedPlugin): RegisteredPlugin {
    const existing = this.plugins.get(loaded.manifest.id);
    if (existing) {
      throw new Error(`Plugin "${loaded.manifest.id}" is already registered`);
    }

    const registered: RegisteredPlugin = {
      id: loaded.manifest.id,
      manifest: loaded.manifest,
      directory: loaded.directory,
      provenance: loaded.provenance,
      status: 'registered',
      facades: [],
      registeredAt: Date.now(),
    };

    this.plugins.set(registered.id, registered);
    return registered;
  }

  /**
   * Activate a plugin — builds facades from its manifest or JS module.
   *
   * If the plugin directory contains an `index.js` with a `createFacades` export,
   * that function is called to build facades dynamically. Otherwise, facade stubs
   * are created from the manifest's `facades` array (static ops with no-op handlers).
   */
  async activate(pluginId: string, ctx: PluginContext): Promise<RegisteredPlugin> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin "${pluginId}" is not registered`);
    if (plugin.status === 'active') return plugin;

    try {
      // Try dynamic facade builder first
      let facades = await this.tryLoadFacadeBuilder(plugin, ctx);

      // Fall back to static manifest facades
      if (!facades) {
        facades = this.buildStaticFacades(plugin);
      }

      plugin.facades = facades;
      plugin.status = 'active';
      plugin.activatedAt = Date.now();
      plugin.error = undefined;
    } catch (e) {
      plugin.status = 'error';
      plugin.error = e instanceof Error ? e.message : String(e);
    }

    return plugin;
  }

  /**
   * Deactivate a plugin — removes its facades from the runtime.
   */
  deactivate(pluginId: string): boolean {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;

    plugin.status = 'deactivated';
    plugin.facades = [];
    return true;
  }

  /**
   * Unregister a plugin completely.
   */
  unregister(pluginId: string): boolean {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;

    if (plugin.status === 'active') {
      this.deactivate(pluginId);
    }

    return this.plugins.delete(pluginId);
  }

  /**
   * Get a registered plugin by ID.
   */
  get(pluginId: string): RegisteredPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * List all registered plugins.
   */
  list(): RegisteredPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get all active facades from all active plugins.
   */
  getActiveFacades(): FacadeConfig[] {
    const facades: FacadeConfig[] = [];
    for (const plugin of this.plugins.values()) {
      if (plugin.status === 'active') {
        facades.push(...plugin.facades);
      }
    }
    return facades;
  }

  /**
   * Get all active ops (flattened from all active plugin facades).
   */
  getActiveOps(): OpDefinition[] {
    return this.getActiveFacades().flatMap((f) => f.ops);
  }

  // ─── Private ────────────────────────────────────────────────────────

  /**
   * Try to load a JS module with `createFacades` export from the plugin directory.
   * Returns null if no module found or no export.
   */
  private async tryLoadFacadeBuilder(
    plugin: RegisteredPlugin,
    ctx: PluginContext,
  ): Promise<FacadeConfig[] | null> {
    const moduleFile = join(plugin.directory, 'index.js');
    if (!existsSync(moduleFile)) {
      return null;
    }

    try {
      // Dynamic import of plugin's index.js
      const mod = (await import(pathToFileURL(moduleFile).href)) as {
        createFacades?: PluginFacadeBuilder;
      };
      if (typeof mod.createFacades === 'function') {
        return mod.createFacades(ctx);
      }
      throw new Error(`Plugin module "${moduleFile}" must export createFacades(ctx)`);
    } catch (e) {
      throw new Error(
        `Failed to load plugin module "${moduleFile}": ${e instanceof Error ? e.message : String(e)}`, { cause: e },
      );
    }
  }

  /**
   * Build facade configs from the manifest's static facade definitions.
   * These have no-op handlers — useful for schema discovery and documentation.
   */
  private buildStaticFacades(plugin: RegisteredPlugin): FacadeConfig[] {
    return plugin.manifest.facades.map((f) => ({
      name: f.name,
      description: f.description,
      ops: f.ops.map((op) => ({
        name: op.name,
        description: op.description,
        auth: op.auth as 'read' | 'write' | 'admin',
        handler: async () => ({
          error: `Op "${op.name}" is a static plugin op — no handler implementation provided. Add an index.js with createFacades() to ${plugin.directory}`,
        }),
      })),
    }));
  }
}
