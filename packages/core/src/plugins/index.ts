/**
 * Plugin System — Barrel Exports
 *
 * @deprecated Prefer knowledge packs (soleri-pack.json) for new extensions.
 * The plugin system is maintained for backwards compatibility and is used
 * internally by the pack installer for facade registration.
 */

export {
  pluginManifestSchema,
  type PluginManifest,
  type PluginStatus,
  type PluginProvenance,
  type LoadedPlugin,
  type RegisteredPlugin,
  type PluginFacadeBuilder,
  type PluginContext,
  type LoadResult,
} from './types.js';

export { loadPlugins, validateDependencies, sortByDependencies } from './plugin-loader.js';

export { PluginRegistry } from './plugin-registry.js';
