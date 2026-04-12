# Capability Packs Architecture

> RFC v2 — Soleri's evolution beyond Salvador's static atomic chains
> Updated after multi-layer gap analysis against Soleri codebase

## Status: Draft (v2) — Partially Implemented

> **Note:** The extension model has been consolidated (see `extension-tiers.md`).
> PackRuntime narrowing (#224) and plugin deprecation (#226) are complete.
> The capability registry exists but is not yet wired to domain packs at runtime.
> This RFC remains as the design document for the capability system.

## Problem

Salvador has 87 atomic chains in `chains/atomic.yaml`, each mapping 1:1 to an MCP tool by name. This is:

- **Static** — YAML synced manually with `npm run sync-atomic`, gets stale
- **Rigid** — every chain = exactly one tool, can't compose
- **Hardcoded** — `salvador_check_contrast` baked into chain names, can't swap implementations
- **All-or-nothing** — agent gets all 87 chains or none
- **Knowledge-disconnected** — chains don't know which vault entries are relevant
- **Fragile** — flow references a missing chain → breaks

Soleri already has pack infrastructure (`soleri-pack.json`, `PackRuntime`, `createDomainFacades`, `IntelligenceBundle`, `DomainPack`). What's missing is a **capability abstraction** that lets flows reference what they NEED without knowing which pack provides it.

### Existing Soleri Infrastructure (build on, don't reinvent)

| Component             | File                                             | Status                             |
| --------------------- | ------------------------------------------------ | ---------------------------------- |
| Pack manifest schema  | `packages/core/src/packs/types.ts`               | v1 exists, extensible              |
| PackRuntime interface | `packages/core/src/domain-packs/pack-runtime.ts` | Minimal (vault, projects, checks)  |
| DomainPack loader     | `packages/core/src/domain-packs/`                | Works, needs capability hooks      |
| createDomainFacades   | `packages/core/src/runtime/domain-ops.ts`        | Merges pack ops with 5-op fallback |
| IntelligenceBundle    | `packages/core/src/intelligence/types.ts`        | Knowledge pack format              |
| Pack CLI              | `packages/cli/src/commands/pack.ts`              | list, install, remove              |
| Entry-point template  | `packages/forge/src/templates/entry-point.ts`    | Loads domain packs via onActivate  |
| Dispatch registry     | `packages/core/src/flows/dispatch-registry.ts`   | Routes tool names → facades        |
| Plan builder          | `packages/core/src/flows/plan-builder.ts`        | Converts chains → tool names       |
| Context router        | `packages/core/src/flows/context-router.ts`      | Dynamic step injection/skip        |

## Proposal: Three-Layer Architecture

```
┌─────────────────────────────────────────────────┐
│  Layer 3: FLOWS                                 │
│  Reference capabilities by intent               │
│  "I need color.validate and token.check"         │
│  Don't know or care which pack provides them     │
└───────────────────┬─────────────────────────────┘
                    │ resolved at runtime
┌───────────────────▼─────────────────────────────┐
│  Layer 2: CAPABILITY REGISTRY                   │
│  Maps capability IDs → pack handlers            │
│  Resolves dependencies, checks availability     │
│  Graceful degradation when capability missing   │
└───────────────────┬─────────────────────────────┘
                    │ provided by
┌───────────────────▼─────────────────────────────┐
│  Layer 1: PACKS                                 │
│  Bundle: capabilities + knowledge + skills       │
│  Self-register via onActivate() + manifest       │
│  Multiple packs can provide same capability     │
└─────────────────────────────────────────────────┘
```

## Capability Schema

A capability is the atomic unit of agent functionality — what the agent CAN DO, not which tool it calls.

```typescript
// packages/core/src/capabilities/types.ts

import type { PackRuntime } from '../domain-packs/pack-runtime.js';
import type { IntelligenceEntry } from '../intelligence/types.js';

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
 * Declared separately from CapabilityDefinition because:
 * - Manifest declares the definition (static, serializable)
 * - Pack's onActivate() registers the handler (runtime, async)
 */
export type CapabilityHandler = (
  params: Record<string, unknown>,
  context: CapabilityContext,
) => Promise<CapabilityResult>;

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

// --- Registry types ---

export interface RegisteredCapability {
  definition: CapabilityDefinition;
  providers: Array<{
    packId: string;
    handler: CapabilityHandler;
    priority: number; // higher = preferred (see Multi-Provider Resolution)
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
```

## Pack Manifest v2

Extend the existing `soleri-pack.json` schema with a `capabilities` section. This is a **non-breaking extension** — existing packs without `capabilities` continue to work.

```typescript
// Addition to packages/core/src/packs/types.ts
// Add to packManifestSchema:

capabilities: z
  .array(
    z.object({
      id: z.string().regex(
        /^[a-z][a-z0-9]*\.[a-z][a-z0-9]*$/,
        'Capability ID must be domain.action format (e.g., color.validate)'
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
```

### Example: Design System Pack

```jsonc
// soleri-pack.json (v2)
{
  "id": "design-system",
  "name": "Design System Intelligence",
  "version": "1.0.0",
  "description": "Color validation, token enforcement, component workflows",
  "engine": ">=1.0.0",
  "dependencies": ["core"],

  "capabilities": [
    {
      "id": "color.validate",
      "description": "Check color contrast against WCAG standards",
      "provides": ["contrast-ratio", "wcag-level", "pass-fail"],
      "requires": ["foreground", "background"],
      "depends": ["color.parse"],
      "knowledge": ["a11y-contrast-requirements"],
    },
    {
      "id": "color.parse",
      "description": "Parse color string to normalized format",
      "provides": ["parsed-color", "color-space"],
      "requires": ["color-string"],
    },
    {
      "id": "color.suggest",
      "description": "Suggest accessible color alternatives",
      "provides": ["color-pairs", "suggestions"],
      "requires": ["base-color", "target-ratio"],
      "depends": ["color.validate"],
    },
    {
      "id": "token.check",
      "description": "Validate semantic token usage",
      "provides": ["valid", "suggestion", "priority-level"],
      "requires": ["token-value"],
      "knowledge": ["color-token-priority"],
    },
    {
      "id": "token.migrate",
      "description": "Migrate hardcoded values to semantic tokens",
      "provides": ["migrated-code", "replacements"],
      "requires": ["source-code"],
      "depends": ["token.check"],
    },
    {
      "id": "component.scaffold",
      "description": "Create component following design system workflow",
      "provides": ["component-files", "story-file", "test-file"],
      "requires": ["component-name", "component-type"],
      "depends": ["color.validate", "token.check"],
      "knowledge": ["component-creation-workflow"],
    },
  ],

  "domains": ["design", "accessibility", "styling"],
  "facades": [],
  "vault": { "dir": "vault" },
  "skills": { "dir": "skills" },
  "hooks": { "dir": "hooks" },
}
```

## Capability Registry

The registry is the runtime resolution engine. It maps capability IDs to handlers from installed packs.

```typescript
// packages/core/src/capabilities/registry.ts

export class CapabilityRegistry {
  private capabilities = new Map<string, RegisteredCapability>();
  private packs = new Map<string, PackManifest>();

  /**
   * Register all capabilities from an installed pack.
   *
   * Handlers come from the pack's onActivate() — NOT from the manifest.
   * The manifest declares WHAT the pack provides (static).
   * onActivate() provides HOW (runtime handlers).
   *
   * This reconciles the gap analysis finding that DomainPack.onActivate()
   * is async and flexible, while manifest declarations are static.
   */
  registerPack(
    pack: PackManifest,
    handlers: Map<string, CapabilityHandler>,
    priority: number = 0,
  ): void {
    for (const cap of pack.capabilities ?? []) {
      const handler = handlers.get(cap.id);
      if (!handler) {
        console.warn(`Pack "${pack.id}" declares capability "${cap.id}" but no handler provided`);
        continue;
      }

      const existing = this.capabilities.get(cap.id);
      if (existing) {
        existing.providers.push({ packId: pack.id, handler, priority });
        // Sort by priority descending — highest priority provider is default
        existing.providers.sort((a, b) => b.priority - a.priority);
      } else {
        this.capabilities.set(cap.id, {
          definition: cap,
          providers: [{ packId: pack.id, handler, priority }],
        });
      }
    }
    this.packs.set(pack.id, pack);
  }

  /** Check if a capability is available */
  has(capabilityId: string): boolean {
    return this.capabilities.has(capabilityId);
  }

  /** Resolve a capability — returns handler + knowledge refs */
  resolve(capabilityId: string): ResolvedCapability {
    const cap = this.capabilities.get(capabilityId);
    if (!cap) {
      return {
        available: false,
        capabilityId,
        suggestion: this.suggestPacksFor([capabilityId]),
      };
    }

    const missingDeps = (cap.definition.depends ?? []).filter((dep) => !this.capabilities.has(dep));

    if (missingDeps.length > 0) {
      return {
        available: false,
        capabilityId,
        missingDependencies: missingDeps,
        suggestion: this.suggestPacksFor(missingDeps),
      };
    }

    return {
      available: true,
      capabilityId,
      handler: cap.providers[0].handler, // highest priority provider
      providers: cap.providers.map((p) => p.packId),
      knowledge: cap.definition.knowledge ?? [],
    };
  }

  /** List all registered capabilities grouped by domain */
  list(): Map<string, CapabilityDefinition[]> {
    const grouped = new Map<string, CapabilityDefinition[]>();
    for (const [id, reg] of this.capabilities) {
      const domain = id.split('.')[0];
      const list = grouped.get(domain) ?? [];
      list.push(reg.definition);
      grouped.set(domain, list);
    }
    return grouped;
  }

  /** Find which installed packs could provide missing capabilities */
  suggestPacksFor(capabilityIds: string[]): PackSuggestion[] {
    // Search known pack manifests for capabilities that match
    const suggestions: PackSuggestion[] = [];
    for (const [packId, manifest] of this.packs) {
      const provides = (manifest.capabilities ?? [])
        .filter((c) => capabilityIds.includes(c.id))
        .map((c) => c.id);
      if (provides.length > 0) {
        suggestions.push({ packId, provides });
      }
    }
    return suggestions;
  }

  /**
   * Validate a flow's capability requirements against installed packs.
   *
   * Reads both `needs` (v2) and `chains` (v1, deprecated) fields.
   * For v1 chains, attempts best-effort mapping via chainToCapability().
   */
  validateFlow(flow: FlowDefinition): FlowValidation {
    const needed = new Set<string>();
    for (const step of flow.steps) {
      // v2: needs field (preferred)
      for (const cap of step.needs ?? []) {
        needed.add(cap);
      }
      // v1: chains field (deprecated, best-effort mapping)
      for (const chain of step.chains ?? []) {
        const capId = chainToCapability(chain);
        if (capId) needed.add(capId);
      }
    }

    const available = [...needed].filter((c) => this.has(c));
    const missing = [...needed].filter((c) => !this.has(c));

    const blockingCaps = new Set(flow.onMissingCapability?.blocking ?? []);
    const degraded = missing.map((c) => ({
      capability: c,
      impact: blockingCaps.has(c) ? ('blocking' as const) : ('degraded' as const),
      suggestion: this.suggestPacksFor([c]),
    }));

    return {
      valid: missing.length === 0,
      available,
      missing,
      degraded,
      canRunPartially: degraded.every((d) => d.impact !== 'blocking'),
    };
  }
}
```

## DomainPack Integration

**Gap finding:** DomainPack's `onActivate(runtime)` is async and flexible. The RFC originally assumed static manifest declarations. The fix: **manifest declares, onActivate registers**.

```typescript
// packages/core/src/domain-packs/types.ts — extend existing DomainPack

export interface DomainPack {
  name: string;
  requires: string[];
  facades: DomainFacadeSpec[];

  // NEW: capability handler factory
  // Called during onActivate, returns handlers for declared capabilities
  capabilities?: (runtime: PackRuntime) => Map<string, CapabilityHandler>;

  // Existing
  onActivate?: (runtime: PackRuntime) => Promise<void>;
}
```

**Registration flow in entry-point:**

```typescript
// In generated entry-point.ts

// 1. Create registry (before any flow execution)
const registry = new CapabilityRegistry();

// 2. Register core pack (always, synchronous)
registry.registerPack(corePack.manifest, corePack.handlers, 100); // priority 100 = highest

// 3. Load and register domain packs (async, via existing loadDomainPacksFromConfig)
const domainPacks = await loadDomainPacksFromConfig(config.domainPacks);
for (const pack of domainPacks) {
  // Existing: activate pack (registers facades)
  if (pack.onActivate) await pack.onActivate(packRuntime);

  // NEW: register capability handlers
  if (pack.capabilities) {
    const handlers = pack.capabilities(packRuntime);
    const manifest = getPackManifest(pack); // reads soleri-pack.json
    registry.registerPack(manifest, handlers, 50); // priority 50 = domain pack
  }
}

// 4. Validate active flows
for (const flow of loadedFlows) {
  const validation = registry.validateFlow(flow);
  if (!validation.valid && !validation.canRunPartially) {
    console.error(`Flow ${flow.id} cannot run: missing ${validation.missing.join(', ')}`);
  } else if (validation.missing.length > 0) {
    console.warn(`Flow ${flow.id} degraded: missing ${validation.missing.join(', ')}`);
  }
}

// 5. Expose to flow engine
runtime.capabilities = registry;
```

## Flow Schema v2

### Dual-schema migration strategy

During transition, flows support BOTH `chains:` (v1) and `needs:` (v2). The plan-builder tries `needs` first, falls back to `chains` via the mapping function.

```typescript
// Addition to packages/core/src/flows/types.ts

// Add to flowStepSchema:
needs: z.array(z.string()).optional(),  // v2: capability IDs

// Add to flowSchema (top level):
onMissingCapability: z.object({
  default: z.enum(['skip-with-warning', 'fail', 'ask-user']).default('skip-with-warning'),
  blocking: z.array(z.string()).optional().default([]),
}).optional(),
```

### Chain-to-capability mapping (v1 → v2 bridge)

Based on Soleri's **actual 26 chain names** (not Salvador's 87):

```typescript
// packages/core/src/capabilities/chain-mapping.ts

/**
 * Maps Soleri's existing v1 chain names to capability IDs.
 * Used during migration — flows with chains: [] are auto-translated.
 * Remove this file when all flows use needs: [] exclusively.
 */
const CHAIN_TO_CAPABILITY: Record<string, string> = {
  // Vault & Knowledge
  'vault-search': 'vault.search',
  'vault-search-antipatterns': 'vault.search',
  'memory-search': 'memory.search',
  'playbook-search': 'vault.playbook',

  // Brain
  'brain-recommend': 'brain.recommend',
  'brain-strengths': 'brain.strengths',

  // Components
  'component-search': 'component.search',
  'component-workflow': 'component.workflow',
  'validate-component': 'component.validate',

  // Design
  'contrast-check': 'color.validate',
  'validate-tokens': 'token.check',
  'design-rules-check': 'design.rules',
  'recommend-design-system': 'design.recommend',
  'recommend-palette': 'design.palette',
  'recommend-style': 'design.style',
  'recommend-typography': 'design.typography',
  'get-stack-guidelines': 'stack.guidelines',

  // Architecture
  'architecture-search': 'architecture.search',
  'embedding-design-search': 'embedding.search',

  // Planning
  'plan-create': 'plan.create',

  // Review & Quality
  'review-report': 'review.report',
  'accessibility-audit': 'a11y.audit',
  'performance-audit': 'perf.audit',
  'test-coverage-check': 'test.coverage',
  'error-pattern-search': 'debug.patterns',
  'delivery-checklist': 'deliver.checklist',
};

export function chainToCapability(chain: string): string | undefined {
  return CHAIN_TO_CAPABILITY[chain];
}
```

### Example: BUILD flow (v2 with backwards compat)

```yaml
# data/flows/build.flow.yaml (v2)
id: BUILD-flow
triggers:
  modes: [BUILD, CREATE]
  contexts: [component, feature, ui]
  min-confidence: HIGH

steps:
  - id: discover
    description: 'Check for duplicates and gather context'
    needs: [vault.search, component.search, brain.recommend]
    chains: [vault-search, component-search, brain-recommend] # deprecated, kept for migration
    gate:
      type: GATE
      condition: 'no-duplicate-found'
      on-false: STOP

  - id: design
    description: 'Validate design decisions'
    needs: [color.validate, token.check, design.rules]
    chains: [contrast-check, validate-tokens, design-rules-check] # deprecated
    parallel: true

  - id: implement
    description: 'Create the component'
    needs: [component.workflow]
    chains: [component-workflow] # deprecated
    gate:
      type: SCORE
      condition: '>= 80'

  - id: validate
    description: 'Final validation'
    needs: [component.validate, a11y.audit]
    chains: [validate-component, accessibility-audit] # deprecated
    parallel: true

on-missing-capability:
  default: skip-with-warning
  blocking: [vault.search, component.search]
```

## Flow Executor Integration

**Gap finding:** The executor currently calls `dispatcher(toolName, params)`. It needs to call `registry.resolve()` → build CapabilityContext → call handler.

```typescript
// packages/core/src/flows/executor.ts — additions

/**
 * Execute a flow step using the capability registry.
 *
 * Tries capability resolution first (v2), falls back to
 * chain→tool dispatch (v1) for backwards compatibility.
 */
async function executeStep(
  step: FlowStep,
  runtime: AgentRuntime,
  registry: CapabilityRegistry,
): Promise<StepResult> {
  const capabilityIds = step.needs ?? (step.chains ?? []).map(chainToCapability).filter(Boolean);

  const results: CapabilityResult[] = [];
  const skipped: string[] = [];

  for (const capId of capabilityIds) {
    const resolved = registry.resolve(capId);

    if (!resolved.available) {
      // Graceful degradation
      const flow = runtime.activeFlow;
      const isBlocking = flow?.onMissingCapability?.blocking?.includes(capId);
      if (isBlocking) {
        return { success: false, error: `Blocking capability missing: ${capId}` };
      }
      skipped.push(capId);
      continue;
    }

    // Build CapabilityContext
    const context = await buildCapabilityContext(resolved, runtime, registry);

    // Execute
    const result = await resolved.handler!(step.params ?? {}, context);
    results.push(result);
  }

  return { success: true, results, skipped };
}

/**
 * Build a CapabilityContext for a resolved capability.
 * Extends PackRuntime with knowledge auto-loading, brain, and invoke().
 */
async function buildCapabilityContext(
  resolved: ResolvedCapability,
  runtime: AgentRuntime,
  registry: CapabilityRegistry,
): Promise<CapabilityContext> {
  const packRuntime = createPackRuntime(runtime);

  // Auto-load knowledge from pack bundle + user vault
  const knowledgeIds = resolved.knowledge ?? [];
  const packKnowledge = await loadPackKnowledge(runtime.vault, knowledgeIds, 'pack');
  const vaultKnowledge = await loadPackKnowledge(runtime.vault, knowledgeIds, 'user');
  const merged = deduplicateKnowledge([...packKnowledge, ...vaultKnowledge]);

  // Brain recommendations
  const brain = runtime.brain
    ? await runtime.brain.recommend({ capability: resolved.capabilityId })
    : [];

  return {
    runtime: packRuntime,
    knowledge: { pack: packKnowledge, vault: vaultKnowledge, merged },
    brain,
    invoke: async (capId, params) => {
      const inner = registry.resolve(capId);
      if (!inner.available || !inner.handler) {
        return { success: false, data: {}, produced: [] };
      }
      const innerContext = await buildCapabilityContext(inner, runtime, registry);
      return inner.handler(params, innerContext);
    },
  };
}
```

## Multi-Provider Resolution (Decision)

When two packs provide the same capability (e.g., both `design-system` and `brand-guardian` provide `color.validate`):

**Strategy: Priority-based with explicit override**

```typescript
// Priority levels (higher = preferred)
const PRIORITY = {
  CORE: 100, // core pack — always wins for core capabilities
  USER: 75, // user-installed packs — override domain defaults
  DOMAIN: 50, // domain packs from scaffolding
  FALLBACK: 0, // generic fallbacks
};
```

- Default: **highest priority provider wins** (first in sorted providers array)
- User can override in agent config:
  ```yaml
  # agent.config.yaml
  capability-overrides:
    color.validate: brand-guardian # force specific pack
  ```
- Future: merge results from multiple providers (not in v1)

## Core Pack

Every agent gets this. Non-removable. These capabilities map to the existing 13+ semantic facades.

```jsonc
// @soleri/core internally provides these (not a separate soleri-pack.json)
{
  "id": "core",
  "name": "Soleri Core",
  "version": "1.0.0",
  "capabilities": [
    // Vault
    { "id": "vault.search", "provides": ["search-results"], "requires": ["query"] },
    { "id": "vault.capture", "provides": ["entry-id"], "requires": ["title", "description"] },
    { "id": "vault.playbook", "provides": ["playbook"], "requires": ["query"] },

    // Brain
    { "id": "brain.recommend", "provides": ["recommendations"], "requires": ["context"] },
    { "id": "brain.strengths", "provides": ["patterns", "scores"], "requires": [] },
    { "id": "brain.learn", "provides": ["learned"], "requires": ["session-data"] },

    // Memory
    { "id": "memory.search", "provides": ["memories"], "requires": ["query"] },
    { "id": "memory.capture", "provides": ["memory-id"], "requires": ["summary"] },

    // Planning
    { "id": "plan.create", "provides": ["plan-id", "steps"], "requires": ["prompt"] },
    { "id": "plan.approve", "provides": ["approved"], "requires": ["plan-id"] },
    { "id": "plan.execute", "provides": ["result"], "requires": ["plan-id"] },
    { "id": "plan.reconcile", "provides": ["drift-report"], "requires": ["plan-id"] },

    // Orchestration
    { "id": "orchestrate.plan", "provides": ["plan"], "requires": ["prompt"] },
    { "id": "orchestrate.execute", "provides": ["result"], "requires": ["plan-id"] },
    { "id": "orchestrate.complete", "provides": ["epilogue"], "requires": ["plan-id"] },

    // Identity & Routing
    { "id": "identity.activate", "provides": ["persona"], "requires": [] },
    {
      "id": "identity.route",
      "provides": ["intent", "mode", "confidence"],
      "requires": ["prompt"],
    },

    // Embedding (hybrid search)
    { "id": "embedding.search", "provides": ["graph-results"], "requires": ["query"] },

    // Admin
    { "id": "admin.health", "provides": ["status"], "requires": [] },
    { "id": "admin.tools", "provides": ["tool-list"], "requires": [] },

    // Debug
    { "id": "debug.patterns", "provides": ["error-patterns"], "requires": ["query"] },
  ],
}
```

## CLI Integration

### Existing commands (extend)

```bash
# Already works:
soleri pack list          # list installed packs
soleri pack install <id>  # install pack from local/npm/built-in

# Extend to show capabilities:
soleri pack list
#   core (built-in)     21 capabilities
#   design-system       6 capabilities   [installed]
#   code-review         8 capabilities   [not installed]
```

### New commands

```bash
# List all capabilities across installed packs
soleri agent capabilities
#   core (21):
#     vault.search, vault.capture, vault.playbook,
#     brain.recommend, brain.strengths, brain.learn,
#     memory.search, memory.capture,
#     plan.create, plan.approve, plan.execute, plan.reconcile,
#     orchestrate.plan, orchestrate.execute, orchestrate.complete,
#     identity.activate, identity.route,
#     embedding.search, admin.health, admin.tools, debug.patterns
#   design-system (6):
#     color.validate, color.parse, color.suggest,
#     token.check, token.migrate, component.scaffold
#   Total: 27 capabilities across 2 packs

# Validate flows against installed capabilities
soleri agent validate
#   BUILD-flow:   ✓ all 9 capabilities available
#   REVIEW-flow:  ⚠ review.report missing (install code-review pack)
#   FIX-flow:     ✓ all 5 capabilities available
#   DELIVER-flow: ⚠ deliver.checklist missing (install delivery pack)
#   4 flows checked: 2 fully satisfied, 2 degraded
```

## Forge Template Updates

Changes required by the 4-File Rule:

| File                                              | Change                                                 | LOC  |
| ------------------------------------------------- | ------------------------------------------------------ | ---- |
| `packages/core/src/capabilities/types.ts`         | New file — all types                                   | ~150 |
| `packages/core/src/capabilities/registry.ts`      | New file — CapabilityRegistry class                    | ~200 |
| `packages/core/src/capabilities/chain-mapping.ts` | New file — v1→v2 chain bridge                          | ~60  |
| `packages/core/src/capabilities/index.ts`         | New file — barrel export                               | ~10  |
| `packages/core/src/packs/types.ts`                | Extend — add `capabilities` to schema                  | +15  |
| `packages/core/src/flows/types.ts`                | Extend — add `needs`, `onMissingCapability`            | +20  |
| `packages/core/src/flows/plan-builder.ts`         | Refactor — resolve via registry, keep chain fallback   | +50  |
| `packages/core/src/flows/executor.ts`             | Extend — buildCapabilityContext, executeStep v2        | +80  |
| `packages/core/src/domain-packs/types.ts`         | Extend — add `capabilities` factory to DomainPack      | +5   |
| `packages/forge/src/templates/entry-point.ts`     | Extend — init registry, register packs, validate flows | +30  |
| `packages/forge/src/templates/test-facades.ts`    | Extend — test capability registration                  | +40  |
| `packages/cli/src/commands/agent.ts`              | Extend — `capabilities` + `validate` subcommands       | +60  |
| `packages/core/data/flows/*.flow.yaml` (8 files)  | Migrate — add `needs:` alongside `chains:`             | +50  |

**Total: ~770 LOC** across 4 new files + 9 modified files.

## Migration Path

### Phase 1: Foundation (Sprint 1)

1. Create `packages/core/src/capabilities/` module (types, registry, chain-mapping, index)
2. Extend pack manifest schema with `capabilities[]` (non-breaking)
3. Extend flow schema with `needs[]` and `onMissingCapability` (non-breaking)
4. Unit tests for registry: register, resolve, validate, multi-provider

### Phase 2: Flow Integration (Sprint 2)

1. Update plan-builder to try `needs` first, fallback to `chains`
2. Add `needs:` to all 8 flow YAML files (keep `chains:` for backwards compat)
3. Update executor with `buildCapabilityContext` and knowledge auto-loading
4. Integration tests: flow execution with capabilities

### Phase 3: Runtime & CLI (Sprint 3)

1. Update entry-point template: init registry, register core + domain packs
2. Extend DomainPack interface with `capabilities` factory
3. Add `agent capabilities` and `agent validate` CLI commands
4. Update test-facades template for capability tests

### Phase 4: Pack Migration (Sprint 4)

1. Add `capabilities[]` to existing starter packs (design, etc.)
2. Create capability handlers in starter pack code
3. E2E tests: scaffold agent → install pack → validate flows → execute
4. Documentation

### Phase 5: Deprecation (Sprint 5+)

1. Log deprecation warnings when flows use `chains:` without `needs:`
2. Remove `chains:` from flow YAML files
3. Remove `chain-mapping.ts` bridge
4. Update all docs

## Resolved Questions

| Question                            | Decision                                                           | Rationale                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **Pack registry location**          | npm + local directory + built-in                                   | npm for community, local for development, built-in for starters. Existing `soleri pack install` already supports all three. |
| **Multi-provider resolution**       | Priority-based (core=100, user=75, domain=50) with config override | Simple, predictable, explicit. Merge strategy deferred to v2.                                                               |
| **Capability composition**          | Yes, via `context.invoke()`                                        | Capabilities can call each other. Registry prevents circular deps.                                                          |
| **Hot reload**                      | Deferred to v2                                                     | Restart required for now. Pack add/remove is a dev-time operation.                                                          |
| **DomainPack vs manifest handlers** | Manifest declares, `onActivate()` registers                        | Manifest is static/serializable, handlers need runtime context. Both paths coexist.                                         |
| **Dual schema duration**            | 2 major versions                                                   | `chains:` deprecated in v1.x, removed in v3.0.                                                                              |

## Decision Record

| Decision                                           | Rationale                                                                                    |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Capabilities use namespaced IDs (`domain.action`)  | Avoids collisions, self-documenting, enables wildcard queries                                |
| Flows reference capabilities, not tools            | Decouples flow logic from implementation                                                     |
| Packs bundle knowledge with capabilities           | Knowledge should travel with the code that uses it                                           |
| Core pack is non-removable                         | Every agent needs vault, brain, planning                                                     |
| Missing capabilities degrade gracefully by default | Agents should work with partial packs                                                        |
| `context.invoke()` enables capability composition  | Capabilities can call each other without knowing implementations                             |
| Manifest declares, onActivate registers handlers   | Static metadata + async runtime registration coexist                                         |
| Priority-based multi-provider resolution           | Simple, predictable, overridable                                                             |
| Dual-schema migration (chains + needs)             | Non-breaking rollout, 2-version deprecation window                                           |
| Context router preserved                           | Soleri's context-aware step injection is stronger than Salvador's composite chains — keep it |
