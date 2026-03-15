/**
 * Domain Pack types — the contract for plug-and-play domain intelligence.
 *
 * A DomainPack is an npm package that bundles:
 * - Custom ops with real algorithmic logic (e.g., WCAG contrast checking)
 * - Optional standalone facades (one pack can register multiple MCP tools)
 * - Tiered knowledge (canonical/curated/captured)
 * - CLAUDE.md behavioral rules
 * - Skills
 *
 * One pack = one npm package, can register multiple facades.
 */

import { z } from 'zod';
import type { OpDefinition, FacadeConfig } from '../facades/types.js';
import type { AgentRuntime } from '../runtime/types.js';
import type { PackRuntime } from './pack-runtime.js';

// ---------------------------------------------------------------------------
// Reserved names — packs cannot claim these as facade names
// ---------------------------------------------------------------------------

export const SEMANTIC_FACADE_NAMES: ReadonlyArray<string> = [
  'vault',
  'plan',
  'brain',
  'memory',
  'admin',
  'curator',
  'loop',
  'orchestrate',
  'control',
  'cognee',
  'governance',
  'context',
  'agency',
  'chat',
  'playbook',
] as const;

// ---------------------------------------------------------------------------
// Knowledge Manifest — tiered knowledge with different lifecycle rules
// ---------------------------------------------------------------------------

/** Three-tier knowledge structure. Each tier has different lifecycle rules. */
export interface KnowledgeManifest {
  /** Immutable rules and axioms. Never overwritten by curator. Highest search authority. */
  canonical?: string;
  /** Patterns and anti-patterns. Curator can groom, deduplicate, enrich. */
  curated?: string;
  /** Seed learnings. Rarely shipped — normally emerges from agent usage. */
  captured?: string;
}

// ---------------------------------------------------------------------------
// Skill Definition (for pack-bundled skills)
// ---------------------------------------------------------------------------

export interface PackSkillDefinition {
  /** Skill file name (without .md extension) */
  name: string;
  /** Path to the .md skill file relative to the pack */
  path: string;
}

// ---------------------------------------------------------------------------
// DomainPack — the main interface
// ---------------------------------------------------------------------------

/** The contract every domain pack must implement. */
export interface DomainPack {
  /** Unique pack name (e.g., 'design', 'security-intelligence') */
  name: string;
  /** Semver version */
  version: string;
  /** Domains this pack claims. Ops inject into these domain facades. */
  domains: string[];
  /** Custom operations with real logic — injected into claimed domain facades. */
  ops: OpDefinition[];
  /** Additional standalone facades (one pack can register multiple MCP tools). */
  facades?: FacadeConfig[];
  /** Tiered knowledge to install into the agent's vault. */
  knowledge?: KnowledgeManifest;
  /** CLAUDE.md behavioral rules fragment (markdown). */
  rules?: string;
  /** Skills to install into the agent's skills directory. */
  skills?: PackSkillDefinition[];
  /** Capability handler factory — returns handlers for declared capabilities */
  capabilities?: (
    runtime: PackRuntime,
  ) => Map<string, import('../capabilities/types.js').CapabilityHandler>;
  /** Other packs this pack depends on (by name). */
  requires?: string[];
  /** Called after pack is installed (one-time setup). */
  onInstall?: (runtime: AgentRuntime) => Promise<void>;
  /** Called each time the agent starts (runtime initialization). */
  onActivate?: (runtime: AgentRuntime) => Promise<void>;
}

// ---------------------------------------------------------------------------
// DomainPackRef — lightweight reference for AgentConfig
// ---------------------------------------------------------------------------

/** Reference to a domain pack in agent configuration. */
export interface DomainPackRef {
  /** Display name */
  name: string;
  /** npm package name (e.g., '@soleri/domain-design') */
  package: string;
  /** Optional version constraint */
  version?: string;
}

// ---------------------------------------------------------------------------
// DomainPackManifest — validated and resolved pack
// ---------------------------------------------------------------------------

/** A DomainPack that has been validated and resolved. */
export interface DomainPackManifest extends DomainPack {
  /** Resolved from npm package name */
  packageName: string;
  /** Absolute path to the pack's root directory */
  rootDir?: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const knowledgeManifestSchema = z.object({
  canonical: z.string().optional(),
  curated: z.string().optional(),
  captured: z.string().optional(),
});

const packSkillSchema = z.object({
  name: z.string(),
  path: z.string(),
});

/** Zod schema for validating DomainPack structure (data fields only). */
const domainPackSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  domains: z.array(z.string().min(1)).min(1),
  ops: z.array(
    z.object({
      name: z.string().min(1),
      description: z.string(),
      auth: z.enum(['read', 'write', 'admin']),
      handler: z.function(),
      schema: z.any().optional(),
      hot: z.boolean().optional(),
    }),
  ),
  facades: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string(),
        ops: z.array(z.any()),
      }),
    )
    .optional(),
  knowledge: knowledgeManifestSchema.optional(),
  rules: z.string().optional(),
  skills: z.array(packSkillSchema).optional(),
  requires: z.array(z.string()).optional(),
  onInstall: z.function().optional(),
  onActivate: z.function().optional(),
});

export type ValidateResult =
  | { success: true; data: DomainPack }
  | { success: false; errors: z.ZodError };

/**
 * Validate an unknown value as a DomainPack.
 *
 * Beyond Zod shape validation, also checks:
 * - Op names are unique within the pack
 * - Facade names don't collide with semantic facades
 */
export function validateDomainPack(value: unknown): ValidateResult {
  const parsed = domainPackSchema.safeParse(value);
  if (!parsed.success) {
    return { success: false, errors: parsed.error };
  }

  const pack = parsed.data as DomainPack;

  // Check for duplicate op names
  const opNames = new Set<string>();
  for (const op of pack.ops) {
    if (opNames.has(op.name)) {
      return {
        success: false,
        errors: new z.ZodError([
          {
            code: 'custom',
            path: ['ops'],
            message: `Duplicate op name: "${op.name}"`,
          },
        ]),
      };
    }
    opNames.add(op.name);
  }

  // Check facade name collisions with semantic facades
  if (pack.facades) {
    for (const facade of pack.facades) {
      if (SEMANTIC_FACADE_NAMES.includes(facade.name)) {
        return {
          success: false,
          errors: new z.ZodError([
            {
              code: 'custom',
              path: ['facades'],
              message: `Facade name "${facade.name}" collides with semantic facade. Reserved names: ${SEMANTIC_FACADE_NAMES.join(', ')}`,
            },
          ]),
        };
      }
    }
  }

  return { success: true, data: pack };
}
