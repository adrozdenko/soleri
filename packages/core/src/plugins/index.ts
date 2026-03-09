/**
 * Plugin System — Barrel Exports
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
