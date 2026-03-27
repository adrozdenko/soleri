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

// ---------------------------------------------------------------------------
// Pack Tiers — determines visibility, licensing, and install behavior
// ---------------------------------------------------------------------------

export const PACK_TIERS = ['default', 'community', 'premium'] as const;
export type PackTier = (typeof PACK_TIERS)[number];

export const packManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'Pack ID must be lowercase alphanumeric with hyphens'),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be semver (x.y.z)'),
  description: z.string().optional().default(''),
  /** Pack tier: 'default' (ships with engine), 'community' (free, npm), 'premium' (unlocked today, gated later) */
  tier: z.enum(PACK_TIERS).optional().default('community'),
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

// ─── Lifecycle States ─────────────────────────────────────────────────

/** Full lifecycle state for a pack */
export type PackState =
  | 'installed' // Just installed, not yet activated
  | 'ready' // Active — capabilities, skills, hooks all live
  | 'disabled' // Temporarily deactivated — vault entries kept, capabilities off
  | 'error' // Failed to activate — error message in errorMessage field
  | 'upgrade_pending' // New version available, old version still active
  | 'uninstalled'; // Removed — vault entries remain (permanent knowledge)

/** @deprecated Use PackState instead */
export type PackStatus = PackState;

/** Valid state transitions — key is "from" state, values are allowed "to" states */
export const VALID_TRANSITIONS: Record<PackState, PackState[]> = {
  installed: ['ready', 'error', 'uninstalled'],
  ready: ['ready', 'disabled', 'error', 'upgrade_pending', 'uninstalled'],
  disabled: ['ready', 'uninstalled'],
  error: ['ready', 'uninstalled'],
  upgrade_pending: ['ready', 'error', 'uninstalled'],
  uninstalled: ['installed'],
};

/** A recorded state transition */
export interface PackTransition {
  from: PackState;
  to: PackState;
  timestamp: number;
  reason?: string;
}

export interface InstalledPack {
  id: string;
  manifest: PackManifest;
  directory: string;
  status: PackState;
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
  /** Lifecycle transition history (most recent last) */
  transitions?: PackTransition[];
  /** When the pack was disabled (if in disabled state) */
  disabledAt?: number;
  /** Error message (if in error state) */
  errorMessage?: string;
  /** Version available for upgrade (if in upgrade_pending state) */
  upgradeVersion?: string;
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
