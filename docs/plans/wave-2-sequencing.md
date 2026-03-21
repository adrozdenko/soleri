# Wave 2B Sequencing — Brain Dependency Analysis

**Date:** 2026-03-21
**Issue:** #278
**Scope:** Wave 2B ops files that depend on Wave 1A brain decomposition

---

## Problem

The auto-learning pipeline introduced bidirectional coupling between planner/orchestrator ops and the brain module. Two Wave 2B ops files (`planning-extra-ops.ts` and `orchestrate-ops.ts`) directly consume `BrainIntelligence` methods that are scheduled for decomposition in Wave 1A. These files **cannot be safely refactored until Wave 1A completes**, because:

1. The `BrainIntelligence` class API will change as it decomposes into 5 sub-modules.
2. Writing characterization tests against the current API would be invalidated by the decomposition.
3. The ops files destructure `brainIntelligence` from `AgentRuntime` — the type must remain stable.

---

## Import Dependency Map

### `planning-extra-ops.ts` (~868 LOC)

**Runtime destructuring (line 32):**
```typescript
const { planner, vault, brain, brainIntelligence } = runtime;
```

**Brain module calls:**

| Method | Op | Purpose | Target sub-module (Wave 1A) |
|--------|----|---------|-----------------------------|
| `brainIntelligence.lifecycle({ action: 'start', ... })` | `plan_split` | Auto-start brain session linked to plan | `session-manager.ts` |
| `brainIntelligence.getSessionByPlanId(planId)` | `plan_complete_lifecycle` | Find brain session for a plan | `auto-learning.ts` |
| `brainIntelligence.lifecycle({ action: 'end', ... })` | `plan_complete_lifecycle` | End brain session on plan completion | `session-manager.ts` |
| `brainIntelligence.extractKnowledge(sessionId)` | `plan_complete_lifecycle` | Trigger learning pipeline | `proposal-manager.ts` |
| `brain.recordFeedback(objective, entryId, 'accepted')` | `plan_complete_lifecycle` | Record positive feedback for vault recommendations | `brain.ts` (Wave 1A) |

**Non-brain imports (independent):**
- `z` from `zod`
- `OpDefinition` from `../facades/types.js`
- `AgentRuntime` from `./types.js`
- `DriftItem`, `TaskEvidence` from `../planning/planner.js` (Wave 1B)
- `collectGitEvidence` from `../planning/evidence-collector.js` (Wave 1D)
- `matchPlaybooks`, `entryToPlaybookDefinition` from `../playbooks/index.js`

### `orchestrate-ops.ts` (~573 LOC)

**Runtime destructuring (line 130):**
```typescript
const { planner, brainIntelligence, vault } = runtime;
```

**Brain module calls:**

| Method | Op | Purpose | Target sub-module (Wave 1A) |
|--------|----|---------|-----------------------------|
| `brainIntelligence.recommend({ domain, task, limit })` | `orchestrate_plan` | Get brain recommendations for plan context | `strength-scorer.ts` |
| `brainIntelligence.getSessionByPlanId(planId)` | `orchestrate_execute` | Reuse existing brain session from `plan_split` | `auto-learning.ts` |
| `brainIntelligence.lifecycle({ action: 'start', ... })` | `orchestrate_execute` | Start new brain session if none exists | `session-manager.ts` |
| `brainIntelligence.lifecycle({ action: 'end', ... })` | `orchestrate_complete` | End brain session | `session-manager.ts` |
| `brainIntelligence.extractKnowledge(sessionId)` | `orchestrate_complete` | Trigger knowledge extraction | `proposal-manager.ts` |
| `brainIntelligence.getSessionContext(limit)` | `orchestrate_status` | Get recent session context | `session-manager.ts` |
| `brainIntelligence.recommend({ domain, limit })` | `orchestrate_status` | Get recommendations for status display | `strength-scorer.ts` |
| `brainIntelligence.getStats()` | `orchestrate_status` | Brain statistics | `intelligence.ts` (facade) |
| `brainIntelligence.lifecycle({ action: 'start'/'end', ... })` | `orchestrate_quick_capture` | Quick session lifecycle for capture | `session-manager.ts` |
| `brainIntelligence.extractKnowledge(sessionId)` | `orchestrate_quick_capture` | Extract knowledge from quick session | `proposal-manager.ts` |

**Non-brain imports (independent):**
- `z` from `zod`
- `OpDefinition`, `FacadeConfig` from `../facades/types.js`
- `AgentRuntime` from `./types.js`
- `buildPlan` from `../flows/plan-builder.js`
- `FlowExecutor` from `../flows/executor.js`
- `createDispatcher` from `../flows/dispatch-registry.js`
- `runEpilogue` from `../flows/epilogue.js`
- `OrchestrationPlan`, `ExecutionResult` from `../flows/types.js`
- GitHub projection helpers from `../planning/github-projection.js`

---

## BrainIntelligence API Surface Used by Blocked Files

These are the `BrainIntelligence` methods consumed by the two blocked ops files, mapped to their Wave 1A decomposition targets:

| Method | Used by | Decomposition target |
|--------|---------|---------------------|
| `lifecycle(input)` | Both | `session-manager.ts` |
| `getSessionByPlanId(planId)` | Both | `auto-learning.ts` |
| `extractKnowledge(sessionId)` | Both | `proposal-manager.ts` |
| `recommend(context)` | `orchestrate-ops.ts` | `strength-scorer.ts` |
| `getSessionContext(limit)` | `orchestrate-ops.ts` | `session-manager.ts` |
| `getStats()` | `orchestrate-ops.ts` | `intelligence.ts` (facade) |

Additionally, `planning-extra-ops.ts` uses `brain.recordFeedback()` from `brain.ts` (also Wave 1A scope).

---

## Sequencing Decision

### Blocked by Wave 1A (must wait)

| File | LOC | Reason |
|------|-----|--------|
| `planning-extra-ops.ts` | ~868 | Uses `brainIntelligence.lifecycle()`, `.getSessionByPlanId()`, `.extractKnowledge()`, `brain.recordFeedback()` |
| `orchestrate-ops.ts` | ~573 | Uses 6 distinct `brainIntelligence` methods across 5 ops |

**Why they must wait:** These files integrate deeply with `BrainIntelligence` internals. After Wave 1A decomposes `intelligence.ts` into 5 files, the `BrainIntelligence` facade class will still exist but its internal structure changes. The ops files consume the public facade API (which stays stable), but:

1. Writing characterization tests now would test against monolithic `BrainIntelligence` — those tests remain valid post-decomposition but won't cover the new seam boundaries.
2. The ops files should be refactored to depend on narrow interfaces (`SessionManager`, `ProposalManager`, `StrengthScorer`) rather than the full `BrainIntelligence` class — but those interfaces don't exist yet.
3. Refactoring both simultaneously creates merge conflict risk at the `AgentRuntime` type boundary.

**Recommended approach:** After Wave 1A completes, the `AgentRuntime` type can expose narrow interfaces (e.g., `sessionManager: SessionManager`) alongside the existing `brainIntelligence` facade for backward compatibility. Then Wave 2B can migrate the ops files to use the narrow interfaces.

### Independent (can proceed in parallel with Wave 1)

All other Wave 2B ops files have no brain dependency and can proceed independently:

| File | LOC | Brain dependency |
|------|-----|-----------------|
| `admin-extra-ops.ts` | 853 | None (uses `brainIntelligence` only in status ops — read-only, stable API) |
| `vault-extra-ops.ts` | 682 | None |
| `admin-setup-ops.ts` | 664 | None |
| `capture-ops.ts` | 567 | None |
| `memory-extra-ops.ts` | 494 | None |
| `vault-linking-ops.ts` | 491 | None |
| `vault-sharing-ops.ts` | 431 | None |
| `runtime.ts` | 342 | Constructs `BrainIntelligence` — depends on Wave 1A type exports |
| `admin-ops.ts` | 307 | None |
| All files < 300 LOC | — | None (except `session-briefing.ts` which reads brain data — read-only, stable) |

**Note on `admin-extra-ops.ts`:** While it references `brainIntelligence`, it only calls read-only status methods (`getStats()`, `recommend()`). These are stable facade methods that will survive decomposition unchanged. It can proceed.

**Note on `runtime.ts`:** This file constructs the `BrainIntelligence` instance. It depends on Wave 1A completing so it can wire up the new sub-modules if the constructor changes. However, the Wave 1A design preserves the existing constructor signature, so `runtime.ts` can proceed with the caveat that it may need a minor update post-Wave 1A.

---

## Updated Dependency Graph

```
Wave 0 (Foundation)
├── 0A: persistence/
├── 0B: migrations/
├── 0C: vault.ts decomposition
└── 0D: other vault files
        │
        ▼
Wave 1 (Intelligence Core)
├── 1A: brain/ (intelligence.ts → 5 files) ◄── BLOCKING
├── 1B: planner.ts → 4 files
├── 1C: curator/ → 4 files
└── 1D: gap-analysis.ts → 3 files
        │
        ├─────────────────────────────────────┐
        ▼                                     ▼
Wave 2B (ops files)                     Wave 2B (ops files)
BLOCKED — wait for 1A:                  INDEPENDENT — proceed now:
├── planning-extra-ops.ts (868 LOC)     ├── admin-extra-ops.ts (853 LOC)
└── orchestrate-ops.ts (573 LOC)        ├── vault-extra-ops.ts (682 LOC)
                                        ├── admin-setup-ops.ts (664 LOC)
                                        ├── capture-ops.ts (567 LOC)
                                        ├── memory-extra-ops.ts (494 LOC)
                                        ├── vault-linking-ops.ts (491 LOC)
                                        ├── vault-sharing-ops.ts (431 LOC)
                                        ├── runtime.ts (342 LOC)
                                        ├── admin-ops.ts (307 LOC)
                                        └── 17 files < 300 LOC
```

---

## Summary

- **2 files blocked** by Wave 1A: `planning-extra-ops.ts`, `orchestrate-ops.ts` (combined ~1,441 LOC)
- **27 files independent**: can proceed in Wave 2B without waiting for brain decomposition
- **Key coupling point**: `BrainIntelligence` class from `brain/intelligence.ts`, consumed via `AgentRuntime.brainIntelligence`
- **6 distinct methods** form the coupling surface: `lifecycle()`, `getSessionByPlanId()`, `extractKnowledge()`, `recommend()`, `getSessionContext()`, `getStats()`
- **Migration path**: After Wave 1A, expose narrow interfaces on `AgentRuntime` and migrate the 2 blocked ops files to use them
