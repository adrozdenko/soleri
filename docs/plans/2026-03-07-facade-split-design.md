# Design: Split Mega-Core Facade into Semantic Facades

**Issue:** #167
**Milestone:** v6.3.0 — Facade Architecture & Auth
**Date:** 2026-03-07

## Problem

Generated agents expose all 209+ ops in a single `{agentId}_core` MCP tool. This causes:
- Poor op discoverability for Claude (one massive tool with 200+ op enum)
- No per-facade auth/permission gating
- Divergence from Salvador's 20-facade architecture

## Decisions

1. **Clean break** — delete `createCoreOps()`, no backward compat shim (pre-1.0, no external agents)
2. **Match Salvador's engine-level facades** — 10 semantic facades matching Salvador's naming
3. **Approach A: Facade builder functions** — one `create{Facade}FacadeOps()` per domain

## Facade Definitions

| Facade | Description | Approx Ops | Sources |
|--------|-------------|:---:|---------|
| `{id}_vault` | Knowledge management — CRUD, search, import/export, intake | ~35 | inline vault ops + `vault-extra-ops` + `capture-ops` + `intake-ops` |
| `{id}_plan` | Plan lifecycle — create/approve/execute/reconcile/complete, grading | ~32 | inline plan ops + `planning-extra-ops` + `grading-ops` |
| `{id}_brain` | Learning system — intelligence, patterns, strengths, feedback, lifecycle | ~19 | inline brain + brain intelligence ops |
| `{id}_memory` | Session & cross-project memory — capture, search, dedup | ~15 | inline memory ops + `memory-extra-ops` + `memory-cross-project-ops` |
| `{id}_admin` | Infrastructure — health, config, telemetry, tokens, LLM, prompts | ~36 | inline llm/prompt ops + `admin-ops` + `admin-extra-ops` |
| `{id}_curator` | Quality — duplicate detection, contradictions, grooming, health | ~13 | inline curator ops + `curator-extra-ops` |
| `{id}_loop` | Iterative validation loops | 9 | `loop-ops` |
| `{id}_orchestrate` | Execution orchestration — project, playbooks, orchestrate | ~23 | inline register + `orchestrate-ops` + `project-ops` + `playbook-ops` |
| `{id}_control` | Agent behavior — identity, intent, morphing, guidelines, governance | ~13 | inline control + governance ops |
| `{id}_cognee` | Knowledge graph — search, sync, export | ~11 | inline cognee ops + `cognee-sync-ops` |

**Agent-specific ops** (5: `health`, `identity`, `activate`, `inject_claude_md`, `setup`) remain in the entry-point template as `{id}_core`.

## File Structure

```
packages/core/src/runtime/facades/
├── vault-facade.ts          → createVaultFacadeOps(runtime)
├── plan-facade.ts           → createPlanFacadeOps(runtime)
├── brain-facade.ts          → createBrainFacadeOps(runtime)
├── memory-facade.ts         → createMemoryFacadeOps(runtime)
├── admin-facade.ts          → createAdminFacadeOps(runtime)
├── curator-facade.ts        → createCuratorFacadeOps(runtime)
├── loop-facade.ts           → createLoopFacadeOps(runtime)
├── orchestrate-facade.ts    → createOrchestrateFacadeOps(runtime)
├── control-facade.ts        → createControlFacadeOps(runtime)
├── cognee-facade.ts         → createCogneeFacadeOps(runtime)
└── index.ts                 → createSemanticFacades(runtime, agentId)
```

Each facade file:
- Imports from existing satellite op modules (unchanged)
- Contains inline ops moved from `core-ops.ts`
- Returns `OpDefinition[]`

`index.ts` assembles all facades into `FacadeConfig[]` with proper names and descriptions.

## Template Changes

### entry-point.ts

```typescript
// Before
const coreOps = createCoreOps(runtime);
const coreFacade = { name: '${config.id}_core', ops: [...coreOps, ...agentOps] };
const facades = [coreFacade, ...domainFacades];

// After
const semanticFacades = createSemanticFacades(runtime, '${config.id}');
const agentFacade = { name: '${config.id}_core', description: 'Agent-specific ops', ops: agentOps };
const facades = [...semanticFacades, agentFacade, ...domainFacades];
```

### test-facades.ts

Test each semantic facade independently — verify op counts, key op existence, and handler invocation per facade.

### core-facade.ts

Delete or repurpose (ops are now defined in `@soleri/core` directly).

## Exports

```typescript
// packages/core/src/index.ts
// Remove: export { createCoreOps } from './runtime/core-ops.js';
// Add:    export { createSemanticFacades } from './runtime/facades/index.js';
```

## Migration Steps

1. Create `runtime/facades/` with 10 facade files + index
2. Move inline ops from `core-ops.ts` into facade files
3. Update `core/src/index.ts` exports
4. Update `forge/src/templates/entry-point.ts`
5. Update `forge/src/templates/test-facades.ts`
6. Delete `core-ops.ts` and `forge/src/templates/core-facade.ts`
7. Build, scaffold test agent, run tests

## Non-Goals

- Per-op auth enforcement (that's #168)
- Feature flags (that's #173)
- Domain facade changes (already separate)
