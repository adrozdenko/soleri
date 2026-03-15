/**
 * Knowledge Pack — Types & Manifest Schema
 *
 * A knowledge pack is a superset of a plugin: it bundles domain facades,
 * vault entries, skills, and hooks into one installable unit.
 *
 * Directory structure:
 *   my-pack/
 *     soleri-pack.json       # manifest (required)
 *     index.js               # facade builder (optional, like plugins)
 *     vault/                 # intelligence JSON bundles to seed (optional)
 *       patterns.json
 *       anti-patterns.json
 *     skills/                # skill markdown files (optional)
 *       review.md
 *     hooks/                 # hook markdown files (optional)
 *       no-inline-styles.md
 */

import { z } from 'zod';

// =============================================================================
// MANIFEST SCHEMA
// =============================================================================

export const packManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'Pack ID must be lowercase alphanumeric with hyphens'),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be semver (x.y.z)'),
  description: z.string().optional().default(''),
  /** Domains this pack covers */
  domains: z.array(z.string()).optional().default([]),
  /** Minimum engine version required (semver range) */
  engine: z.string().optional(),
  /** Pack dependencies (other pack IDs) */
  dependencies: z.array(z.string()).optional().default([]),
  /** Capability declarations — what this pack can do and what it needs */
  capabilities: z
    .array(
      z.object({
        id: z
          .string()
          .regex(
            /^[a-z][a-z0-9]*\.[a-z][a-z0-9]*$/,
            'Capability ID must be domain.action format (e.g., color.validate)',
          ),
        description: z.string().min(1),
        provides: z.array(z.string()),
        requires: z.array(z.string()),
        depends: z.array(z.string()).optional().default([]),
        knowledge: z.array(z.string()).optional().default([]),
      }),
    )
    .optional()
    .default([]),
  /** Facade definitions (same as plugin manifest) */
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
  /** Vault configuration */
  vault: z
    .object({
      /** Subdirectory containing intelligence JSON bundles. Default: "vault" */
      dir: z.string().optional().default('vault'),
    })
    .optional(),
  /** Skills configuration */
  skills: z
    .object({
      /** Subdirectory containing skill .md files. Default: "skills" */
      dir: z.string().optional().default('skills'),
    })
    .optional(),
  /** Hooks configuration */
  hooks: z
    .object({
      /** Subdirectory containing hook .md files. Default: "hooks" */
      dir: z.string().optional().default('hooks'),
    })
    .optional(),
});

export type PackManifest = z.infer<typeof packManifestSchema>;

// =============================================================================
// INSTALL TYPES
// =============================================================================

export type PackStatus = 'installed' | 'error' | 'uninstalled';

export interface InstalledPack {
  id: string;
  manifest: PackManifest;
  directory: string;
  status: PackStatus;
  error?: string;
  /** Number of vault entries seeded */
  vaultEntries: number;
  /** Skill files found */
  skills: string[];
  /** Hook files found */
  hooks: string[];
  /** Whether facades were registered via plugin system */
  facadesRegistered: boolean;
  installedAt: number;
}

export interface InstallResult {
  id: string;
  installed: boolean;
  vaultEntries: number;
  skills: string[];
  hooks: string[];
  facades: number;
  error?: string;
}

export interface ValidateResult {
  valid: boolean;
  manifest?: PackManifest;
  errors: string[];
  warnings: string[];
  /** Counts of what would be installed */
  counts?: {
    vaultEntries: number;
    skills: number;
    hooks: number;
    facades: number;
    ops: number;
  };
}
