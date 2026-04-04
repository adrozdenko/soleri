/**
 * Capability Registry — runtime resolution engine for the three-layer architecture.
 *
 * Maps capability IDs (domain.action) to pack handlers. Resolves dependencies,
 * checks availability, and supports graceful degradation when capabilities are
 * missing.
 *
 * Registration flow:
 * 1. Pack manifest declares capabilities (static, serializable)
 * 2. Pack's onActivate() provides handlers (runtime, async)
 * 3. registerPack() reconciles declarations with handlers
 *
 * @see docs/architecture/capability-packs.md
 */

import type {
  CapabilityDefinition,
  CapabilityHandler,
  RegisteredCapability,
  ResolvedCapability,
  PackSuggestion,
  FlowValidation,
} from './types.js';
import { chainToCapability } from './chain-mapping.js';

// ---------------------------------------------------------------------------
// Flow shape accepted by validateFlow — intentionally minimal so callers
// don't need to import the full Flow type from ../flows/types.js.
// ---------------------------------------------------------------------------

export interface FlowForValidation {
  steps: Array<{
    needs?: string[];
    chains?: string[];
  }>;
  'on-missing-capability'?: {
    default?: string;
    blocking?: string[];
  };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class CapabilityRegistry {
  private capabilities = new Map<string, RegisteredCapability>();
  private packs = new Map<string, { id: string; capabilities: CapabilityDefinition[] }>();

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------

  /**
   * Register all capabilities from an installed pack.
   *
   * For each definition in `definitions`, the corresponding handler is looked
   * up in `handlers`. If no handler is found the capability is skipped with a
   * warning. When multiple packs provide the same capability, providers are
   * sorted by priority (descending) — highest priority wins on resolve().
   *
   * @param packId      - Unique identifier for the pack
   * @param definitions - Capability definitions from the pack manifest
   * @param handlers    - Map of capabilityId → handler from onActivate()
   * @param priority    - Higher = preferred (core=100, user=75, domain=50, fallback=0)
   */
  registerPack(
    packId: string,
    definitions: CapabilityDefinition[],
    handlers: Map<string, CapabilityHandler>,
    priority: number = 0,
  ): void {
    for (const definition of definitions) {
      const handler = handlers.get(definition.id);
      if (!handler) {
        console.warn(
          `Pack "${packId}" declares capability "${definition.id}" but no handler provided — skipping`,
        );
        continue;
      }

      const existing = this.capabilities.get(definition.id);
      if (existing) {
        // Add as additional provider, keep sorted by priority descending
        existing.providers.push({ packId, handler, priority });
        existing.providers.sort((a, b) => b.priority - a.priority);
      } else {
        this.capabilities.set(definition.id, {
          definition,
          providers: [{ packId, handler, priority }],
        });
      }
    }

    // Store pack metadata for suggestPacksFor() lookups
    this.packs.set(packId, { id: packId, capabilities: definitions });
  }

  // -----------------------------------------------------------------------
  // Query
  // -----------------------------------------------------------------------

  /**
   * Check if a capability is registered (has at least one provider).
   */
  has(capabilityId: string): boolean {
    return this.capabilities.has(capabilityId);
  }

  /**
   * Resolve a capability — returns the highest-priority handler, knowledge
   * refs, and provider list. If the capability is missing or has unsatisfied
   * dependencies, returns `available: false` with suggestions.
   */
  resolve(capabilityId: string): ResolvedCapability {
    const registered = this.capabilities.get(capabilityId);

    if (!registered) {
      return {
        available: false,
        capabilityId,
        suggestion: this.suggestPacksFor([capabilityId]),
      };
    }

    // Check dependency satisfaction
    const depends = registered.definition.depends ?? [];
    const missingDeps = depends.filter((dep) => !this.capabilities.has(dep));

    if (missingDeps.length > 0) {
      return {
        available: false,
        capabilityId,
        missingDependencies: missingDeps,
        suggestion: this.suggestPacksFor(missingDeps),
      };
    }

    // Resolved — return the highest-priority provider (index 0 after sort)
    const primary = registered.providers[0];
    return {
      available: true,
      capabilityId,
      handler: primary.handler,
      providers: registered.providers.map((p) => p.packId),
      knowledge: registered.definition.knowledge ?? [],
    };
  }

  /**
   * List all registered capabilities grouped by domain.
   *
   * Domain is derived from the first segment of the capability ID
   * (e.g., "color" from "color.validate").
   */
  list(): Map<string, CapabilityDefinition[]> {
    const grouped = new Map<string, CapabilityDefinition[]>();

    for (const [id, registered] of this.capabilities) {
      const domain = id.split('.')[0];
      const group = grouped.get(domain) ?? [];
      group.push(registered.definition);
      grouped.set(domain, group);
    }

    return grouped;
  }

  /**
   * Search registered packs for capabilities matching the requested IDs.
   *
   * This searches ALL packs (not just capabilities currently registered with
   * handlers) — useful for suggesting which packs to install when a capability
   * is missing.
   */
  suggestPacksFor(capabilityIds: string[]): PackSuggestion[] {
    if (capabilityIds.length === 0) return [];

    const idSet = new Set(capabilityIds);
    const suggestions: PackSuggestion[] = [];

    for (const [, pack] of this.packs) {
      const provides = pack.capabilities.filter((cap) => idSet.has(cap.id)).map((cap) => cap.id);

      if (provides.length > 0) {
        suggestions.push({ packId: pack.id, provides });
      }
    }

    return suggestions;
  }

  // -----------------------------------------------------------------------
  // Validation
  // -----------------------------------------------------------------------

  /**
   * Validate a flow's capability requirements against installed packs.
   *
   * Reads both `needs` (v2 preferred) and `chains` (v1 deprecated) fields.
   * For v1 chains, attempts best-effort mapping via chainToCapability().
   *
   * Missing capabilities are classified as either "blocking" or "degraded"
   * based on the flow's onMissingCapability config.
   */
  validateFlow(flow: FlowForValidation): FlowValidation {
    // Collect all capability IDs needed across all steps
    const needed = new Set<string>();

    for (const step of flow.steps) {
      // v2: needs field (preferred)
      if (step.needs) {
        for (const cap of step.needs) {
          needed.add(cap);
        }
      }

      // v1: chains field (deprecated, best-effort mapping)
      if (step.chains) {
        for (const chain of step.chains) {
          const capId = chainToCapability(chain);
          if (capId) needed.add(capId);
        }
      }
    }

    // Partition into available vs missing
    const available: string[] = [];
    const missing: string[] = [];

    for (const capId of needed) {
      if (this.has(capId)) {
        available.push(capId);
      } else {
        missing.push(capId);
      }
    }

    // Classify missing capabilities by impact
    const blockingSet = new Set(flow['on-missing-capability']?.blocking ?? []);

    const degraded = missing.map((capability) => ({
      capability,
      impact: blockingSet.has(capability) ? ('blocking' as const) : ('degraded' as const),
      suggestion: this.suggestPacksFor([capability]),
    }));

    const hasBlocker = degraded.some((d) => d.impact === 'blocking');

    return {
      valid: missing.length === 0,
      available,
      missing,
      degraded,
      canRunPartially: !hasBlocker,
    };
  }

  // -----------------------------------------------------------------------
  // Inspection (useful for debugging / CLI commands)
  // -----------------------------------------------------------------------

  /**
   * Total number of registered capabilities.
   */
  get size(): number {
    return this.capabilities.size;
  }

  /**
   * Total number of registered packs.
   */
  get packCount(): number {
    return this.packs.size;
  }

  /**
   * Get all registered capability IDs.
   */
  ids(): string[] {
    return [...this.capabilities.keys()];
  }

  /**
   * Get the RegisteredCapability for a given ID, or undefined.
   */
  get(capabilityId: string): RegisteredCapability | undefined {
    return this.capabilities.get(capabilityId);
  }
}
