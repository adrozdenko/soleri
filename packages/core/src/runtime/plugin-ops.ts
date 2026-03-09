/**
 * Plugin Operations — 5 ops for runtime plugin management.
 *
 * plugin_list, plugin_load, plugin_activate, plugin_deactivate, plugin_status
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from './types.js';
import { loadPlugins, validateDependencies, sortByDependencies } from '../plugins/index.js';

export function createPluginOps(runtime: AgentRuntime, opSink?: OpDefinition[]): OpDefinition[] {
  const { pluginRegistry, config } = runtime;
  const injectedByPlugin = new Map<string, OpDefinition[]>();

  const injectPluginOps = (pluginId: string): { injected: number; error?: string } => {
    if (!opSink) return { injected: 0 };
    if (injectedByPlugin.has(pluginId)) {
      return { injected: injectedByPlugin.get(pluginId)?.length ?? 0 };
    }

    const plugin = pluginRegistry.get(pluginId);
    if (!plugin) return { injected: 0, error: `Plugin not found: ${pluginId}` };

    const pluginOps = plugin.facades.flatMap((f) => f.ops);
    const existing = new Set(opSink.map((o) => o.name));
    const collisions = pluginOps.filter((o) => existing.has(o.name)).map((o) => o.name);
    if (collisions.length > 0) {
      return {
        injected: 0,
        error: `Plugin op name collision: ${collisions.join(', ')}`,
      };
    }

    opSink.push(...pluginOps);
    injectedByPlugin.set(pluginId, pluginOps);
    return { injected: pluginOps.length };
  };

  const removePluginOps = (pluginId: string): number => {
    const injected = injectedByPlugin.get(pluginId);
    if (!injected || !opSink) return 0;
    const names = new Set(injected.map((o) => o.name));
    for (let i = opSink.length - 1; i >= 0; i--) {
      if (names.has(opSink[i].name)) {
        opSink.splice(i, 1);
      }
    }
    injectedByPlugin.delete(pluginId);
    return names.size;
  };

  return [
    // ─── plugin_list ──────────────────────────────────────────────────
    {
      name: 'plugin_list',
      description: 'List all registered plugins with their status, version, and facade count.',
      auth: 'read',
      handler: async () => {
        const plugins = pluginRegistry.list();
        return {
          plugins: plugins.map((p) => ({
            id: p.id,
            name: p.manifest.name,
            version: p.manifest.version,
            domain: p.manifest.domain,
            status: p.status,
            provenance: p.provenance,
            facades: p.facades.length,
            ops: p.facades.reduce((sum, f) => sum + f.ops.length, 0),
            error: p.error,
          })),
          count: plugins.length,
          active: plugins.filter((p) => p.status === 'active').length,
        };
      },
    },

    // ─── plugin_load ──────────────────────────────────────────────────
    {
      name: 'plugin_load',
      description:
        'Scan plugin directories and load all valid plugins. Validates manifests and checks dependencies. Does not activate — call plugin_activate separately.',
      auth: 'admin',
      schema: z.object({
        projectPath: z.string().optional().describe('Project path for project-level plugins.'),
        extraDirs: z
          .array(z.string())
          .optional()
          .describe('Additional directories to scan for plugins.'),
      }),
      handler: async (params) => {
        const projectPath = (params.projectPath as string | undefined) ?? process.cwd();
        const extraDirs = (params.extraDirs as string[] | undefined) ?? [];

        const result = loadPlugins(config.agentId, projectPath, extraDirs);

        const loadErrors = result.errors;
        const dependencyErrors = validateDependencies(result.loaded).map((e) => ({
          id: e.pluginId,
          dependency: e.missingDep,
          error: `Plugin "${e.pluginId}" requires "${e.missingDep}" which is not available`,
        }));

        // Sort by dependency order and register
        const registered: string[] = [];
        const regErrors: Array<{ id: string; error: string }> = [];

        if (dependencyErrors.length === 0) {
          const sorted = sortByDependencies(result.loaded);
          for (const plugin of sorted) {
            try {
              // Skip already registered
              if (pluginRegistry.get(plugin.manifest.id)) continue;
              pluginRegistry.register(plugin);
              registered.push(plugin.manifest.id);
            } catch (e) {
              regErrors.push({
                id: plugin.manifest.id,
                error: e instanceof Error ? e.message : String(e),
              });
            }
          }
        }

        const errors = [
          ...loadErrors,
          ...dependencyErrors.map((e) => ({ directory: '', error: e.error })),
          ...regErrors.map((e) => ({ directory: '', error: e.error })),
        ];

        return {
          registered,
          registeredCount: registered.length,
          loadErrors,
          dependencyErrors,
          registrationErrors: regErrors,
          errors,
        };
      },
    },

    // ─── plugin_activate ──────────────────────────────────────────────
    {
      name: 'plugin_activate',
      description:
        'Activate a registered plugin — builds its facades and makes ops available. Optionally activate all registered plugins.',
      auth: 'admin',
      schema: z.object({
        pluginId: z.string().optional().describe('Plugin ID to activate. Omit to activate all.'),
      }),
      handler: async (params) => {
        const pluginId = params.pluginId as string | undefined;

        if (pluginId) {
          const plugin = pluginRegistry.get(pluginId);
          if (!plugin) return { error: `Plugin not found: ${pluginId}` };

          const result = await pluginRegistry.activate(pluginId, {
            runtime,
            manifest: plugin.manifest,
            directory: plugin.directory,
          });
          const injected = result.status === 'active' ? injectPluginOps(pluginId) : { injected: 0 };

          return {
            id: result.id,
            status: result.status,
            facades: result.facades.length,
            ops: result.facades.reduce((sum, f) => sum + f.ops.length, 0),
            injectedOps: injected.injected,
            injectionError: injected.error,
            error: result.error,
          };
        }

        // Activate all registered plugins
        const pending = pluginRegistry.list().filter((plugin) => plugin.status !== 'active');
        const results = await Promise.all(
          pending.map(async (plugin) => {
            const activated = await pluginRegistry.activate(plugin.id, {
              runtime,
              manifest: plugin.manifest,
              directory: plugin.directory,
            });
            const injected =
              activated.status === 'active' ? injectPluginOps(plugin.id) : { injected: 0 };
            return {
              id: activated.id,
              status: activated.status,
              error: activated.error ?? injected.error,
            };
          }),
        );

        return {
          activated: results.filter((r) => r.status === 'active').length,
          errors: results.filter((r) => r.status === 'error'),
          results,
        };
      },
    },

    // ─── plugin_deactivate ────────────────────────────────────────────
    {
      name: 'plugin_deactivate',
      description: 'Deactivate a plugin — removes its facades from the runtime.',
      auth: 'admin',
      schema: z.object({
        pluginId: z.string().describe('Plugin ID to deactivate.'),
      }),
      handler: async (params) => {
        const pluginId = params.pluginId as string;
        const success = pluginRegistry.deactivate(pluginId);
        if (!success) return { error: `Plugin not found: ${pluginId}` };
        const removedOps = removePluginOps(pluginId);
        return { deactivated: true, id: pluginId, removedOps };
      },
    },

    // ─── plugin_status ────────────────────────────────────────────────
    {
      name: 'plugin_status',
      description:
        'Get detailed status of a specific plugin including manifest, facades, and activation state.',
      auth: 'read',
      schema: z.object({
        pluginId: z.string().describe('Plugin ID to inspect.'),
      }),
      handler: async (params) => {
        const pluginId = params.pluginId as string;
        const plugin = pluginRegistry.get(pluginId);
        if (!plugin) return { error: `Plugin not found: ${pluginId}` };

        return {
          id: plugin.id,
          name: plugin.manifest.name,
          version: plugin.manifest.version,
          description: plugin.manifest.description,
          domain: plugin.manifest.domain,
          status: plugin.status,
          provenance: plugin.provenance,
          directory: plugin.directory,
          error: plugin.error,
          dependencies: plugin.manifest.dependencies,
          facades: plugin.facades.map((f) => ({
            name: f.name,
            description: f.description,
            ops: f.ops.map((o) => o.name),
          })),
          intelligence: plugin.manifest.intelligence.length,
          registeredAt: plugin.registeredAt,
          activatedAt: plugin.activatedAt,
        };
      },
    },
  ];
}
