/**
 * Plugin System — Types & Manifest Schema
 *
 * A plugin is a directory containing a `soleri-plugin.json` manifest
 * and optionally additional intelligence data. Plugins register
 * OpDefinition[] (facades) dynamically without re-scaffolding.
 */

import { z } from 'zod';
import type { FacadeConfig } from '../facades/types.js';

// =============================================================================
// MANIFEST SCHEMA (validated at load time)
// =============================================================================

export const pluginManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'Plugin ID must be lowercase alphanumeric with hyphens'),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be semver (x.y.z)'),
  description: z.string().optional().default(''),
  /** Domain this plugin provides knowledge/ops for */
  domain: z.string().optional(),
  /** Plugin IDs this plugin depends on (must be loaded first) */
  dependencies: z.array(z.string()).optional().default([]),
  /** Facade definitions — each becomes an MCP tool */
  facades: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().optional().default(''),
        ops: z.array(
          z.object({
            name: z.string(),
            description: z.string().optional().default(''),
            auth: z.enum(['read', 'write', 'admin']).optional().default('read'),
          }),
        ),
      }),
    )
    .optional()
    .default([]),
  /** Intelligence entries to seed into the vault */
  intelligence: z
    .array(
      z.object({
        id: z.string(),
        type: z.string(),
        domain: z.string().optional(),
        title: z.string(),
        severity: z.enum(['critical', 'warning', 'suggestion']).optional(),
        description: z.string(),
        tags: z.array(z.string()).optional().default([]),
      }),
    )
    .optional()
    .default([]),
});

export type PluginManifest = z.infer<typeof pluginManifestSchema>;

// =============================================================================
// PLUGIN TYPES
// =============================================================================

export type PluginStatus = 'registered' | 'active' | 'error' | 'deactivated';
export type PluginProvenance = 'global' | 'project' | 'custom';

/**
 * A loaded plugin — manifest validated, ready for activation.
 */
export interface LoadedPlugin {
  manifest: PluginManifest;
  directory: string;
  provenance: PluginProvenance;
}

/**
 * A registered plugin in the runtime — tracks lifecycle state.
 */
export interface RegisteredPlugin {
  id: string;
  manifest: PluginManifest;
  directory: string;
  provenance: PluginProvenance;
  status: PluginStatus;
  error?: string;
  facades: FacadeConfig[];
  activatedAt?: number;
  registeredAt: number;
}

/**
 * Plugin facade builder — plugins provide this function to create ops
 * that have access to the agent runtime.
 *
 * Plugin JS modules export: `export function createFacades(ctx): FacadeConfig[]`
 */
export type PluginFacadeBuilder = (ctx: PluginContext) => FacadeConfig[];

/**
 * Context passed to plugin facade builders during activation.
 */
export interface PluginContext {
  /** The agent runtime — full access to vault, brain, planner, etc. */
  runtime: unknown; // AgentRuntime — kept as unknown to avoid circular deps
  /** The plugin's own manifest */
  manifest: PluginManifest;
  /** The plugin's directory on disk */
  directory: string;
}

// =============================================================================
// LOAD RESULT
// =============================================================================

export interface LoadResult {
  loaded: LoadedPlugin[];
  errors: Array<{ directory: string; error: string }>;
}
