/**
 * Capability type system for Soleri's three-layer architecture.
 *
 * Capabilities are the atomic unit of agent functionality — what the agent
 * CAN DO, not which tool it calls. Flows reference capabilities by intent
 * (e.g., "color.validate"), and the registry resolves them to pack handlers
 * at runtime.
 *
 * @see docs/architecture/capability-packs.md
 */

import type { PackRuntime } from '../domain-packs/pack-runtime.js';
import type { IntelligenceEntry } from '../intelligence/types.js';

// ---------------------------------------------------------------------------
// Capability definition & handler
// ---------------------------------------------------------------------------

export interface CapabilityDefinition {
  /** Namespaced ID: domain.action (e.g., "color.validate", "token.check") */
  id: string;

  /** Human-readable description of what this capability does */
  description: string;

  /** What this capability produces (output contract) */
  provides: string[];

  /** What this capability requires as input */
  requires: string[];

  /** Other capabilities that must be available (auto-resolved) */
  depends?: string[];

  /** Vault knowledge entry IDs to auto-load when this capability runs */
  knowledge?: string[];
}

/**
 * Capability handler — the actual implementation.
 *
 * Declared separately from CapabilityDefinition because:
 * - Manifest declares the definition (static, serializable)
 * - Pack's onActivate() registers the handler (runtime, async)
 */
export type CapabilityHandler = (
  params: Record<string, unknown>,
  context: CapabilityContext,
) => Promise<CapabilityResult>;

// ---------------------------------------------------------------------------
// Capability context & result
// ---------------------------------------------------------------------------

/**
 * CapabilityContext — extends PackRuntime with knowledge and composition.
 *
 * PackRuntime already provides: vault, getProject, listProjects, createCheck,
 * validateCheck, validateAndConsume. This adds:
 * - knowledge: auto-loaded from pack bundle + user vault
 * - brain: recommendations from the learning loop
 * - invoke: call another capability (composition)
 */
export interface CapabilityContext {
  /** Pack runtime (vault, projects, checks) — from existing PackRuntime */
  runtime: PackRuntime;

  /** Auto-loaded knowledge from pack + user vault */
  knowledge: KnowledgeContext;

  /** Brain recommendations for this capability */
  brain: BrainRecommendation[];

  /** Request another capability (for composition) */
  invoke: (capabilityId: string, params: Record<string, unknown>) => Promise<CapabilityResult>;
}

export interface CapabilityResult {
  success: boolean;
  data: Record<string, unknown>;
  /** Which "provides" fields were actually produced */
  produced: string[];
}

// ---------------------------------------------------------------------------
// Knowledge & brain
// ---------------------------------------------------------------------------

export interface KnowledgeContext {
  /** Entries from the pack's bundled knowledge (IntelligenceBundle) */
  pack: IntelligenceEntry[];
  /** Entries from user's project vault (searched by capability's knowledge[] IDs) */
  vault: IntelligenceEntry[];
  /** Combined, deduplicated, ranked by relevance */
  merged: IntelligenceEntry[];
}

export interface BrainRecommendation {
  pattern: string;
  strength: number;
  source: string;
}

// ---------------------------------------------------------------------------
// Registry types
// ---------------------------------------------------------------------------

export interface RegisteredCapability {
  definition: CapabilityDefinition;
  providers: Array<{
    packId: string;
    handler: CapabilityHandler;
    /** Higher = preferred (see Multi-Provider Resolution in RFC) */
    priority: number;
  }>;
}

export interface ResolvedCapability {
  available: boolean;
  capabilityId: string;
  handler?: CapabilityHandler;
  providers?: string[];
  knowledge?: string[];
  missingDependencies?: string[];
  suggestion?: PackSuggestion[];
}

export interface PackSuggestion {
  packId: string;
  provides: string[];
}

export interface FlowValidation {
  valid: boolean;
  available: string[];
  missing: string[];
  degraded: Array<{
    capability: string;
    impact: 'blocking' | 'degraded' | 'optional';
    suggestion: PackSuggestion[];
  }>;
  canRunPartially: boolean;
}
