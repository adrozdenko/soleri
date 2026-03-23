# Soleri Core TDD-Driven Refactoring Design

**Date:** 2026-03-20
**Scope:** `@soleri/core` (296 files, ~44.8k LOC)
**Approach:** Layered Safety Net — characterize large files, contract-first TDD medium files, direct TDD small files
**Parallel execution:** Git worktrees per module, waves gate on prior wave completion

---

## Objective

Refactor the entire `@soleri/core` package to follow clean code principles, achieve full test coverage with colocated unit tests, and decompose all files exceeding 400 LOC — using TDD as the driving methodology.

## Scope

| Included                                                  | Excluded                                         |
| --------------------------------------------------------- | ------------------------------------------------ |
| `@soleri/core` — all 46 modules                           | `@soleri/cli`, `@soleri/forge`, `@soleri/engine` |
| Colocated unit tests for every module                     | E2E test rewrite                                 |
| Migration of existing `src/__tests__/` to colocated files | Architectural changes (no package splitting)     |
| Decomposition of 6 files over 900 LOC                     | Public API changes (facade API stays identical)  |
| Vault knowledge capture (fill pattern gaps)               | New features or capabilities                     |
| Never-nester compliance across all code                   | Domain packs refactoring                         |

## Strategy: Layered Safety Net

The refactoring strategy adapts to file size and risk:

| File Size              | Strategy                                                | Rationale                                                            |
| ---------------------- | ------------------------------------------------------- | -------------------------------------------------------------------- |
| **900+ LOC** (6 files) | Full Feathers: characterize → decompose → unit test     | Hidden behavior lives here — needs characterization tests for safety |
| **300-900 LOC**        | Contract-first: design target interface, TDD against it | Well-understood enough to design target interfaces directly          |
| **< 300 LOC**          | Direct TDD: write unit tests, refactor inline           | Blast radius is tiny — safe to TDD directly                          |

### Per-Module Protocol

```
Phase A: CHARACTERIZE (for 900+ LOC files only)
  1. Read the module, identify responsibilities
  2. Write characterization tests that pin current behavior (black-box)
  3. Run them GREEN — they describe what IS, not what should be
  4. BUG DISCOVERY PROTOCOL: If a characterization test reveals a bug:
     a. Mark with comment: // KNOWN_BUG: [description]
     b. Log it in BUGS.md in the wave's worktree
     c. Keep the test GREEN as-is (pin the buggy behavior)
     d. File a follow-up issue — bug fixes happen AFTER structural refactoring
     e. NEVER fix bugs during the characterization/decomposition phase

Phase B: DECOMPOSE & TDD
  1. Design target interfaces (what the clean API should look like)
  2. Write unit tests for each new sub-module (RED)
  3. Extract code from the monolith into sub-modules (GREEN)
  4. Refactor internals for clean code (REFACTOR)
  5. Migrate relevant existing __tests__/ tests into colocated files
  6. Delete old test file when fully absorbed

Phase C: VERIFY
  1. All new colocated tests pass
  2. E2E tests still pass (regression safety net)
  3. No public API changes (consumers don't break)
```

## Clean Code Rules

All refactored code must comply with these rules:

| Rule                      | Threshold              | Enforcement                                    |
| ------------------------- | ---------------------- | ---------------------------------------------- |
| **Max nesting depth**     | 2 levels               | Extract to named function at level 3+          |
| **Guard clauses**         | Mandatory              | Invert conditions, return/throw/continue early |
| **No else-after-return**  | Zero tolerance         | oxlint `no-else-return`                        |
| **Function length**       | < 30 LOC (ideal < 15)  | > 35 = critical smell                          |
| **File length**           | < 400 LOC              | Decompose if exceeding                         |
| **Extraction threshold**  | Nested block > 5 lines | Extract to named pure function                 |
| **Cyclomatic complexity** | < 10 per function      | Flag and decompose                             |
| **Parameters**            | < 5 per function       | Use options object above 3                     |
| **Single Responsibility** | File level             | One concern per file                           |
| **Dependency Injection**  | Constructors           | No `new ConcreteClass()` inside modules        |
| **No circular deps**      | Zero tolerance         | Module dependency flows one direction          |
| **Loop nesting**          | Prefer `filter/map`    | Use `continue` as guard in `for...of`          |

**Vault references:**

- `typescript-1774041194727-ddn81w` — Never Nester rules
- `typescript-1774043995779-g0rmzj` — DRY, KISS, YAGNI
- `typescript-1774043995805-3momgt` — SOLID Principles
- `testing-1774043995823-k3vmw7` — Characterization Testing (Feathers)
- `testing-1774043995838-g604b6` — Test Quality Standards
- `testing-1774043995851-czzlzy` — Dependency Injection & Testability Patterns
- `typescript-1774043995865-s49986` — Strangler Fig Pattern at Class Level

## Clean Code Principles

All rules above derive from three foundational principles:

**DRY — Don't Repeat Yourself**

- 3+ lines duplicated across 2+ locations → extract to shared function (Rule of Three)
- DRY applies to KNOWLEDGE, not syntax. Similar-looking code for different concepts stays separate.
- Anti-pattern: catch-all `utils.ts` files. Shared functions belong in the module that owns the concept.

**KISS — Keep It Simple, Stupid**

- Function > class when possible. Sync > async when possible. Built-in > library when possible.
- Litmus test: can a developer understand this function in 30 seconds without scrolling?
- If you need a comment to explain WHAT (not WHY), the code is too complex.

**YAGNI — You Aren't Gonna Need It**

- No unused parameters "for future use." No abstract classes with one implementation.
- During refactoring: extract exactly what current callers need. No speculative parameters.
- Exception: DI interfaces ARE justified with one implementation — they enable testing (a current need).

**SOLID Principles** (concrete enforcement):

- **SRP:** One concept per file. If the name needs "And"/"Manager"/"Handler," it's doing too much.
- **Open/Closed:** Strategy/DI instead of growing if/else chains. New passes addable without modifying runners.
- **LSP:** Every `PersistenceProvider` implementation must actually implement all methods (no "not implemented" throws).
- **ISP:** Consumers depend on narrow interfaces, not 45-method classes. Define `VaultReader`, `VaultWriter`, etc.
- **DIP:** Constructors accept interfaces, not concrete classes. No `new ConcreteClass()` in business logic.

## Test Quality Standards — THE KING

Tests are the specification. They define correct behavior with more authority than comments or documentation. A test that passes for the wrong reason is worse than no test.

### Naming Convention (mandatory)

```
✗ it('works')
✗ it('should work correctly')
✓ it('returns empty array when no entries match query')
✓ it('throws TypeError when entry id is null')
✓ it('applies iteration leniency — minor gaps free on iter 1')
```

### Assertion Precision (mandatory)

```typescript
// FORBIDDEN — vague assertions that hide bugs:
expect(result).toBeTruthy(); // passes for [], 0, ' '
expect(result).toBeDefined(); // passes for wrong type/shape
expect(result).not.toBeNull(); // passes for wrong everything

// REQUIRED — precise assertions that catch regressions:
expect(result.score).toBe(0.85);
expect(results).toHaveLength(3);
expect(results.map((r) => r.id)).toEqual(['first', 'second', 'third']);
expect(result).toMatchObject({ id: expect.any(String), score: expect.any(Number) });
expect(() => vault.add(null)).toThrow(TypeError);
```

**Quality gate:** Precision rate >= 90%. No more than 1 weak assertion (toBeTruthy/toBeDefined) per 10 test cases.

### Test Isolation (mandatory)

```typescript
// Every test gets a fresh instance. No shared mutable state.
let vault: Vault;

beforeEach(() => {
  vault = new Vault(':memory:'); // Fresh SQLite per test
});

afterEach(() => {
  vault.close();
});
```

- Module-level caches must be reset via `resetConfigCache()` pattern in `beforeEach`
- Test order must not matter: `vitest --shuffle` must pass
- No test reads data created by another test

### Factory Functions (mandatory per module)

```typescript
// One makeX() factory per entity type. Defaults for everything, overrides for what matters.
function makeEntry(overrides: Partial<IntelligenceEntry> = {}): IntelligenceEntry {
  return {
    id: `test-${Date.now()}`,
    title: 'Test entry',
    type: 'pattern',
    domain: 'testing',
    severity: 'suggestion',
    tags: ['test'],
    ...overrides,
  };
}
```

### Arrange-Act-Assert (mandatory structure)

```typescript
it('returns entries filtered by domain', () => {
  // Arrange — set up preconditions
  vault.seed([makeEntry({ domain: 'typescript' }), makeEntry({ domain: 'react' })]);

  // Act — execute the behavior under test
  const results = vault.search('entry', { domain: 'typescript' });

  // Assert — verify the outcome
  expect(results).toHaveLength(1);
  expect(results[0].entry.domain).toBe('typescript');
});
```

### Mock vs Real Dependencies

| Dependency Type    | Strategy                           | Reason                               |
| ------------------ | ---------------------------------- | ------------------------------------ |
| SQLite (in-memory) | **REAL** `:memory:`                | Fast, deterministic, tests real SQL  |
| File system        | **REAL** with `os.tmpdir()`        | Fast, tests real I/O                 |
| LLM/API calls      | **MOCK**                           | Slow, non-deterministic, costs money |
| Time/Date          | **INJECT** `() => Date.now()`      | Deterministic assertions             |
| Other core modules | **REAL when fast**, MOCK when slow | Prefer integration over isolation    |

### What Makes a Test Trustworthy

A test must fail for **exactly one reason**: the behavior it describes is broken. If it can fail for unrelated reasons (shared state, network, timing), it is not trustworthy.

- Test behavior through PUBLIC API, not implementation details
- If refactoring internals breaks a test, the test was testing implementation, not behavior — fix the test
- Each `it()` block tests ONE behavior. If you need "and" to describe it, split it.

### Migration Quality Gate

When migrating tests from `src/__tests__/` to colocated files:

1. Migrate the test as-is (preserve existing assertions)
2. Run it GREEN in the new location
3. **Then raise the bar**: replace any weak assertions (toBeTruthy/toBeDefined) with precise ones
4. Add missing edge cases (empty, null, boundary)
5. Add factory functions if not already present

This is NOT just a file move. It is a quality upgrade.

## Test Organization

- **Pattern:** Adjacent files — `vault/vault.ts` → `vault/vault.test.ts`
- **Migration:** Existing `src/__tests__/` tests absorbed into colocated files incrementally (Approach B — migrate as we go, delete old file when fully replaced)
- **Framework:** Vitest 3.0.5 (existing)
- **E2E tests:** Unchanged — serve as regression safety net

## Execution Model

- **Git worktrees** per parallel task
- **Waves** gate on prior wave completion
- **No public API changes** — consumers never know internals changed

---

## Wave 0: Foundation Layer

**Goal:** Establish clean, testable interfaces for the data layer — the seams everything else depends on.
**Prerequisite:** None (first wave).

### Wave 0A: `persistence/` (3 files, 193 LOC)

**Strategy:** Direct TDD

| Task           | Details                                                                                 |
| -------------- | --------------------------------------------------------------------------------------- |
| Migrate tests  | `src/__tests__/persistence.test.ts` (291 lines) → `persistence/sqlite-provider.test.ts` |
| Add edge cases | Corrupt DB handling, concurrent access, WAL mode verification                           |
| Minor refactor | Extract pragma setup → `applyPerformancePragmas()`                                      |

**Current state:** Clean abstraction, zero core deps, well-tested. Minimal work needed.

### Wave 0B: `migrations/` (2 files, 191 LOC)

**Strategy:** Direct TDD

| Task           | Details                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------- |
| Migrate tests  | `src/__tests__/migration-runner.test.ts` (170 lines) → `migrations/migration-runner.test.ts` |
| Add edge cases | Rollback failure paths, semver edge cases, concurrent migration attempts                     |

**Current state:** Solid implementation with verify/rollback support.

### Wave 0C: `vault/vault.ts` (1,332 LOC → 4 files)

**Strategy:** Full Feathers — highest priority decomposition in Wave 0

**Current structure:** Single `Vault` class with **53 public methods** across 6 responsibilities. _(Updated 2026-03-21: was 45, +8 methods added post-plan)_

**Decomposition plan:**

| New File            | Responsibility                                          | Methods                                                                                                                                                                                                                                                                                       | Est. LOC                  |
| ------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `vault-schema.ts`   | Schema DDL, migrations, format versioning               | `initialize()`, 6 `migrate*()`, `checkFormatVersion()`                                                                                                                                                                                                                                        | ~270                      |
| `vault-entries.ts`  | Entry CRUD, search, analytics, lifecycle                | `seed`, `seedDedup`, `installPack`, `add`, `remove`, `update`, `get`, `list`, `search`, `stats`, `getTags`, `getDomains`, `getRecent`, `getAgeReport`, `findByContentHash`, `contentHashStats`, `findExpiring`, `findExpired`, `setTemporal`, `bulkRemove`, `archive`, `restore`, `exportAll` | ~400                      |
| `vault-memories.ts` | Memory CRUD, search, analytics, pruning                 | `captureMemory`, `getMemory`, `deleteMemory`, `searchMemories`, `listMemories`, `memoryStats`, `memoryStatsDetailed`, `exportMemories`, `importMemories`, `memoriesByProject`, `memoryTopics`, `pruneMemories`, `deduplicateMemories`                                                         | **~350-380** _(was ~300)_ |
| `vault.ts` (facade) | Orchestrates sub-modules, project registry, maintenance | Constructor, project methods, `rebuildFtsIndex`, `optimize`, `close`, delegates to sub-modules                                                                                                                                                                                                | **~200-220** _(was ~250)_ |

**Phases:**

1. Write characterization tests for all **53** public methods (black-box) _(was 45)_
2. Extract to 4 files, keeping characterization tests green
3. Write unit tests for each new file
4. Migrate from `src/__tests__/vault.test.ts` (750 lines), `vault-extra-ops.test.ts` (482 lines), `vault-integrity.test.ts` (71 lines)
5. Delete old test files

**Critical constraint:** `Vault` class public API does NOT change. All 45 methods remain accessible via the facade. 20+ consuming modules are unaffected.

**Interface Segregation (ISP):** Define 3-4 narrow TypeScript interfaces that the `Vault` class implements:

| Interface          | Methods                                                 | Consumers                                       |
| ------------------ | ------------------------------------------------------- | ----------------------------------------------- |
| `VaultReader`      | `search()`, `get()`, `list()`, `stats()`                | Brain, StrengthScorer, most read-only consumers |
| `VaultWriter`      | `add()`, `update()`, `remove()`, `seed()`               | Curator, capture ops                            |
| `VaultMemory`      | `captureMemory()`, `searchMemories()`, `listMemories()` | Memory ops, session capture                     |
| `VaultMaintenance` | `rebuildFtsIndex()`, `optimize()`, `close()`            | Admin ops                                       |

The `Vault` class implements all four: `class Vault implements VaultReader, VaultWriter, VaultMemory, VaultMaintenance`. Consumers receive the narrowest interface they need. This does NOT break the public API — it adds type safety on top of it. Benefits: (1) consumers can't use methods they shouldn't, (2) test mocks only need to implement 3-5 methods instead of 45.

### Wave 0D: Other vault files

All already well-sized. Write colocated tests, migrate existing tests, apply never-nester rules.

| File                  | LOC    | Existing Tests                        | Action                                                             |
| --------------------- | ------ | ------------------------------------- | ------------------------------------------------------------------ |
| `vault-manager.ts`    | 237    | `vault-manager.test.ts` (238 lines)   | Migrate + colocate                                                 |
| `linking.ts`          | 427    | (none colocated)                      | Write tests, never-nester refactor                                 |
| `vault-branching.ts`  | 264    | `vault-branching.test.ts` (274 lines) | Migrate + colocate                                                 |
| `git-vault-sync.ts`   | 318    | `git-vault-sync.test.ts` (230 lines)  | Migrate + colocate                                                 |
| `obsidian-sync.ts`    | 346    | `obsidian-sync.test.ts`               | Migrate + colocate                                                 |
| `scope-detector.ts`   | 219    | `scope-detector.test.ts`              | Migrate + colocate                                                 |
| `knowledge-review.ts` | 221    | (none)                                | Write tests                                                        |
| `playbook.ts`         | 87     | (none)                                | Write tests                                                        |
| `content-hash.ts`     | 31     | (none)                                | Write tests                                                        |
| **`vault-types.ts`**  | **96** | **(none)**                            | **Write tests if runtime logic; audit types** _(added 2026-03-21)_ |

### Wave 0 Parallelism

```
Worktree 1: persistence/ (0A)  ─────────► merge
Worktree 2: migrations/ (0B)   ─────────► merge
Worktree 3: vault.ts decomp (0C) ───────────────────► merge
Worktree 4: other vault files (0D) ─────────────────► merge
                                                    ▼
                                              Wave 1 starts
```

---

## Wave 1: Intelligence Core

**Goal:** Decompose the three largest remaining files. All 900+ LOC, all tightly coupled to Wave 0.
**Prerequisite:** Wave 0 complete.

### Wave 1A: `brain/` module (full — 2,800 LOC total)

**Strategy:** Full Feathers for `intelligence.ts` (**~1,453 LOC** _(was 1,303, +150 from auto-learning pipeline)_); Contract-first for `brain.ts` (685 LOC); Direct TDD for others.

**Files in scope:**

| File                       | LOC                      | Strategy                                           | Existing Tests                                       |
| -------------------------- | ------------------------ | -------------------------------------------------- | ---------------------------------------------------- |
| `intelligence.ts`          | **~1,453** _(was 1,303)_ | Full Feathers → decompose to **5 files** _(was 4)_ | `brain-intelligence.test.ts` (828 lines)             |
| `brain.ts`                 | 685                      | Contract-first TDD                                 | `brain.test.ts` (exists)                             |
| `learning-radar.ts`        | 340                      | Contract-first TDD                                 | (none — tested implicitly via second-brain-features) |
| `knowledge-synthesizer.ts` | 216                      | Direct TDD                                         | (none — tested implicitly via second-brain-features) |
| `types.ts`                 | 256                      | No refactoring needed (type definitions)           | N/A                                                  |

**`intelligence.ts` decomposition:** _(Updated 2026-03-21: 5 files, was 4. See #277)_

| New File                   | Responsibility                                                       | Key Methods                                                                                                                                   | Est. LOC |
| -------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `strength-scorer.ts`       | 4-component strength metric (usage, spread, success, recency)        | `computeStrengths()`, `getStrengths()`, `recommend()`                                                                                         | ~200     |
| `session-manager.ts`       | Session lifecycle, quality scoring, archival                         | `lifecycle()`, `getSessionContext()`, `archiveSessions()`, `getSessionById()`, `listSessions()`, `computeSessionQuality()`, `replaySession()` | ~350     |
| `proposal-manager.ts`      | Knowledge proposal capture, confidence gating, vault promotion       | `extractKnowledge()`, `resetExtracted()`, `getProposals()`, `promoteProposals()`                                                              | ~300     |
| **`auto-learning.ts`**     | **Auto-promote proposals, auto-build trigger, plan-session linking** | **`autoPromoteProposals()`, `maybeAutoBuildIntelligence()`, `getSessionByPlanId()`**                                                          | **~150** |
| `intelligence.ts` (facade) | Orchestrates sub-modules, stats, export/import                       | Constructor, `buildIntelligence()`, `getStats()`, `export()`, `import()`                                                                      | ~250     |

**Never-nester focus:** The 6 extraction rules in `extractKnowledge()` — each rule becomes a named function: `detectRepeatedTools()`, `detectMultiFileEdits()`, `detectLongSessions()`, etc.

**Migrate from:** `src/__tests__/brain-intelligence.test.ts` (828 lines), `src/__tests__/brain.test.ts`

### Wave 1B: `planning/planner.ts` (1,423 LOC → 4 files)

**Strategy:** Full Feathers

**Current:** Largest file in Soleri. 8-state FSM, task dependencies, deliverables, evidence, reconciliation, grading.

**Decomposition:**

| New File                   | Responsibility                                   | Key Methods                                                                                                                              | Est. LOC |
| -------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `task-verifier.ts`         | Evidence, deliverables, acceptance criteria      | `submitDeliverable()`, `verifyDeliverables()`, `submitEvidence()`, `verifyTask()`, `verifyPlan()`                                        | ~300     |
| `reconciliation-engine.ts` | Drift calculation, auto-reconcile, accuracy      | `reconcile()`, `autoReconcile()`, `calculateDriftScore()`                                                                                | ~200     |
| `plan-lifecycle.ts`        | FSM transitions, task status, execution tracking | `approve()`, `startExecution()`, `updateTask()`, `startValidation()`, `startReconciliation()`, `complete()`, `iterate()`, `splitTasks()` | ~350     |
| `planner.ts` (facade)      | CRUD, dispatch, grading                          | Constructor, `create()`, `get()`, `list()`, `remove()`, `getDispatch()`, `gradeCheck()`                                                  | ~300     |

**Never-nester focus:** FSM transition validation and task dependency resolution — prime guard clause candidates.

**DI constraint for Planner:** The `Planner` uses file-based persistence (`readFileSync`/`writeFileSync` with a `filePath` constructor param) — NOT the `PersistenceProvider` interface. The `save()` method must remain EXCLUSIVELY in `planner.ts` (the facade). Sub-modules (`plan-lifecycle.ts`, `task-verifier.ts`, `reconciliation-engine.ts`) receive mutable plan state via parameter and return modified state — they must NOT call `save()` directly. The facade is the only writer. This enables unit testing sub-modules without touching the filesystem.

**Migrate from:** `src/__tests__/planner.test.ts`, `planning-extra-ops.test.ts`

### Wave 1C: `curator/` module (full — 1,276 LOC total)

**Strategy:** Full Feathers for `curator.ts` (949 LOC); Direct TDD for existing sub-files.

**Pre-decomposition audit required:** The `curator/` directory already has partial decomposition:

- `classifier.ts` (86 LOC) — entry classification helper
- `quality-gate.ts` (127 LOC) — governance gating for consolidation
- `types.ts` (114 LOC) — type definitions

The decomposition plan must account for these existing files to avoid duplication. Specifically, `tag-manager.ts` extraction must be checked against `classifier.ts` for overlap.

**`curator.ts` decomposition (949 LOC → 4 files):**

| New File                    | Responsibility                                                                       | Key Methods                                                                        | Est. LOC |
| --------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | -------- |
| `duplicate-detector.ts`     | TF-IDF cosine similarity, merge suggestions                                          | `detectDuplicates()`, `buildVocabulary()`                                          | ~200     |
| `contradiction-detector.ts` | Pattern vs anti-pattern, 2-stage retrieval                                           | `detectContradictions()`, `detectContradictionsHybrid()`, `resolveContradiction()` | ~250     |
| `tag-manager.ts`            | Alias mapping, canonicalization, normalization (audit against `classifier.ts` first) | `normalizeTag()`, `normalizeTags()`, `addTagAlias()`, `getCanonicalTags()`         | ~150     |
| `curator.ts` (facade)       | Grooming, consolidation, health audit                                                | `getStatus()`, `groom()`, `groomAll()`, `consolidate()`, `healthAudit()`           | ~250     |

**Existing sub-files:** Write colocated tests for `classifier.ts`, `quality-gate.ts`, `types.ts`.

**Reuse constraint:** `duplicate-detector.ts` contains TF-IDF logic that Brain also uses. However, both already share functions from `text/similarity.js`. The `duplicate-detector.ts` MUST be self-contained: it builds its own vocabulary from entries passed to it, sourcing functions from `text/similarity.js` only. It must NOT import from `brain/`. This prevents a curator → brain dependency that would create circular coupling.

**Migrate from:** `src/__tests__/curator.test.ts`, `curator-extra-ops.test.ts`

### Wave 1D: `planning/` supporting files

**Strategy:** Contract-first TDD

**`gap-analysis.ts` (914 LOC → 3 files):**

| New File                    | Responsibility                                                                                        | Est. LOC |
| --------------------------- | ----------------------------------------------------------------------------------------------------- | -------- |
| `gap-patterns.ts`           | 40+ keyword arrays, severity weights, category caps, constants                                        | ~300     |
| `gap-passes.ts`             | 7 built-in analysis passes (structure, completeness, feasibility, risk, clarity, semantic, knowledge) | ~350     |
| `gap-analysis.ts` (slimmed) | 3 factory functions + `runGapAnalysis()` orchestrator                                                 | ~250     |

> Note: Original 2-file split left `gap-analysis.ts` at ~600 LOC, violating the 400 LOC rule. 3-way split keeps all files under 400.

**`evidence-collector.ts` (247 LOC):** Direct TDD — write colocated tests. No decomposition needed.

**`gap-types.ts` (71 LOC):** No refactoring needed (type definitions).

### Wave 1 Parallelism

```
                    Wave 0 complete
                         │
            ┌────────────┼────────────┬──────────────┐
            ▼            ▼            ▼              ▼
    Worktree 1:    Worktree 2:   Worktree 3:   Worktree 4:
    intelligence   planner       curator        gap-analysis
    (1A)           (1B)          (1C)           (1D)
            │            │            │              │
            └────────────┼────────────┴──────────────┘
                         ▼
                   Wave 2 starts
```

---

## Wave 2: Runtime Layer

**Goal:** Clean up runtime facades, ops files, and transport plumbing. This is the largest wave by file count.
**Prerequisite:** Waves 0-1 complete.

### Wave 2A: `runtime/facades/` (13 files, 3,191 LOC — zero test coverage)

**Decomposition target: `chat-facade.ts` (918 LOC → 3 files)**

| New File                   | Responsibility                                      | Est. LOC |
| -------------------------- | --------------------------------------------------- | -------- |
| `chat-session.ts`          | Session creation, context tracking, message history | ~250     |
| `chat-transport.ts`        | Transport normalization (MCP/HTTP/WS/Telegram)      | ~250     |
| `chat-facade.ts` (slimmed) | Dispatch, delegates to session + transport          | ~300     |

**Contract-first TDD (300-900 LOC):**

| File                | LOC | Has Tests |
| ------------------- | --- | --------- |
| `brain-facade.ts`   | 532 | No        |
| `vault-facade.ts`   | 508 | No        |
| `control-facade.ts` | 324 | No        |
| `agency-facade.ts`  | 179 | No        |

**Direct TDD (< 300 LOC):**

| File                    | LOC | Has Tests |
| ----------------------- | --- | --------- |
| `curator-facade.ts`     | 132 | No        |
| `memory-facade.ts`      | 132 | No        |
| `plan-facade.ts`        | 121 | No        |
| `admin-facade.ts`       | 119 | No        |
| `index.ts`              | 91  | No        |
| `orchestrate-facade.ts` | 68  | No        |
| `context-facade.ts`     | 55  | No        |
| `loop-facade.ts`        | 12  | No        |

### Wave 2B: `runtime/` ops files (28 files, 9,109 LOC)

**Contract-first TDD (300-900 LOC):**

| File                    | LOC                       | Has Tests | Notes                                      |
| ----------------------- | ------------------------- | --------- | ------------------------------------------ |
| `admin-extra-ops.ts`    | 853                       | Yes       | Largest ops file                           |
| `planning-extra-ops.ts` | **~868** _(was 812, +56)_ | Yes       | **Depends on Wave 1A brain decomposition** |
| `vault-extra-ops.ts`    | 682                       | Yes       |                                            |
| `admin-setup-ops.ts`    | 664                       | Yes       |                                            |
| `capture-ops.ts`        | 567                       | Yes       |                                            |
| `memory-extra-ops.ts`   | 494                       | Yes       |                                            |
| `vault-linking-ops.ts`  | 491                       | No        |                                            |
| `orchestrate-ops.ts`    | **~573** _(was 487, +86)_ | Yes       | **Depends on Wave 1A brain decomposition** |
| `vault-sharing-ops.ts`  | 431                       | No        |                                            |
| `runtime.ts`            | 342                       | Yes       |                                            |
| `admin-ops.ts`          | 307                       | Yes       |                                            |

**Direct TDD (< 300 LOC):**

| File                          | LOC                       | Has Tests |
| ----------------------------- | ------------------------- | --------- |
| `domain-ops.ts`               | 281                       | Yes       |
| `loop-ops.ts`                 | 277                       | Yes       |
| `playbook-ops.ts`             | 273                       | No        |
| `plugin-ops.ts`               | 261                       | Yes       |
| `intake-ops.ts`               | 228                       | No        |
| `claude-md-helpers.ts`        | 218                       | No        |
| `project-ops.ts`              | 202                       | Yes       |
| `memory-cross-project-ops.ts` | 191                       | Yes       |
| `session-briefing.ts`         | **~206** _(was 175, +31)_ | No        |
| `curator-extra-ops.ts`        | 168                       | Yes       |
| `grading-ops.ts`              | 130                       | Yes       |
| `types.ts`                    | 128                       | N/A       |
| `chain-ops.ts`                | 121                       | No        |
| `pack-ops.ts`                 | 110                       | Yes       |
| `feature-flags.ts`            | 101                       | Yes       |
| `deprecation.ts`              | 58                        | Yes       |
| `telemetry-ops.ts`            | 57                        | No        |

### Wave 2C: `transport/`

Contract-first TDD per transport (MCP stdio, HTTP/SSE, WebSocket, Telegram). 4 parallel worktrees.

### Wave 2D: `engine/`

Direct TDD — small wrapper. Colocated tests, verify bootstrap sequence. Includes `module-manifest.ts`, `core-ops.ts`.

### Wave 2 Parallelism

2A (facades), 2B (ops — can sub-parallelize by file), 2C (x4 transports), 2D — up to 8+ parallel worktrees. This is the highest-parallelism wave.

---

## Wave 2.5: Early Feature Modules (parallel with Wave 2)

**Goal:** Start feature modules that depend only on Waves 0-1 (not Wave 2 runtime layer).
**Prerequisite:** Wave 1 complete. Runs **in parallel** with Wave 2.

These modules depend on vault/brain/planning (Waves 0-1) but NOT on runtime facades:

| Module        | Strategy       | Depends On                                  |
| ------------- | -------------- | ------------------------------------------- |
| `governance/` | Contract-first | vault (Wave 0), brain/intelligence (Wave 1) |
| `agency/`     | Contract-first | vault (Wave 0), context (Wave 2.5)          |
| `context/`    | Contract-first | vault (Wave 0), llm                         |
| `loop/`       | Direct TDD     | brain (Wave 1), vault (Wave 0)              |

**Parallelism:** 4 worktrees, running simultaneously with Wave 2.

---

## Wave 3: Remaining Feature Modules

**Goal:** TDD the feature modules that depend on Wave 2 runtime layer.
**Prerequisite:** Wave 2 complete.

| Module          | Strategy       | Notes                                        |
| --------------- | -------------- | -------------------------------------------- |
| `chat/`         | Contract-first | Depends on Wave 2A chat-facade decomposition |
| `flows/`        | Contract-first | Flow orchestration                           |
| `control/`      | Contract-first | Intent routing                               |
| `domain-packs/` | Direct TDD     | Pack infrastructure                          |

**Parallelism:** 4 worktrees.

---

## Wave 4: Supporting Modules

**Goal:** Complete coverage on remaining modules.
**Prerequisite:** Wave 3 complete.

| Module                        | Strategy                  |
| ----------------------------- | ------------------------- |
| `prompts/`                    | Direct TDD                |
| `persona/`                    | Direct TDD                |
| `logging/`                    | Direct TDD                |
| `health/`                     | Direct TDD                |
| `plugins/`                    | Contract-first            |
| `queue/`                      | Direct TDD                |
| `streams/`                    | Direct TDD                |
| `events/`                     | Direct TDD                |
| `errors/`                     | Direct TDD                |
| `extensions/`                 | Direct TDD                |
| `capabilities/`               | Direct TDD                |
| `enforcement/`                | Direct TDD                |
| `intake/`                     | Contract-first            |
| `playbooks/`                  | Direct TDD                |
| `claudemd/`                   | Direct TDD                |
| `llm/`                        | Contract-first (mock LLM) |
| `telemetry/`                  | Direct TDD                |
| `facades/facade-factory.ts`   | Direct TDD                |
| `project/project-registry.ts` | Contract-first            |

**Parallelism:** Maximum — all independent. Final cleanup wave.

---

## Vault Knowledge Capture (Parallel Stream)

Runs continuously alongside all waves.

### Pre-Refactoring Captures Needed

| Entry                                     | Type    | Status                                       |
| ----------------------------------------- | ------- | -------------------------------------------- |
| Never Nester rules                        | rule    | **DONE** ✓ `typescript-1774041194727-ddn81w` |
| DRY, KISS, YAGNI                          | rule    | **DONE** ✓ `typescript-1774043995779-g0rmzj` |
| SOLID Principles                          | rule    | **DONE** ✓ `typescript-1774043995805-3momgt` |
| Characterization test patterns (Feathers) | pattern | **DONE** ✓ `testing-1774043995823-k3vmw7`    |
| Test Quality Standards                    | rule    | **DONE** ✓ `testing-1774043995838-g604b6`    |
| DI & Testability Patterns                 | pattern | **DONE** ✓ `testing-1774043995851-czzlzy`    |
| Strangler Fig at class level              | pattern | **DONE** ✓ `typescript-1774043995865-s49986` |

### During-Refactoring

Capture anti-patterns, surprising behaviors, and effective decomposition strategies as discovered.

---

## Per-Module Definition of Done

**Code quality:**

- [ ] Never-nester rules: max 2 nesting levels, no else-after-return
- [ ] Functions < 30 LOC (ideally < 15)
- [ ] Files < 400 LOC
- [ ] Cyclomatic complexity < 10 per function
- [ ] DRY: no 3+ line duplication across files
- [ ] KISS: no unnecessary abstractions, generics, or indirection
- [ ] YAGNI: no speculative parameters or unused code paths
- [ ] No public API changes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes

**Test quality (THE KING):**

- [ ] All public methods have colocated unit tests
- [ ] Characterization tests pass (for 900+ LOC files)
- [ ] Test names are specifications: `it('returns [expected] when [condition]')`
- [ ] Assertion precision rate >= 90% (no vague toBeTruthy/toBeDefined)
- [ ] Arrange-Act-Assert structure in every test
- [ ] Factory functions present for all entity types (`makeEntry()`, `makePlan()`, etc.)
- [ ] Test isolation: fresh instance in `beforeEach`, no shared mutable state
- [ ] `vitest --shuffle` passes (order independence)
- [ ] Edge cases covered: empty, null, boundary, error paths
- [ ] Existing `__tests__/` tests migrated, quality-upgraded, and old file deleted
- [ ] E2E tests still pass

## Per-Worktree Gate (before opening PR)

Before a worktree's PR is opened, the developer must run:

```bash
npm test                    # All unit tests pass
npm run typecheck           # No type errors
npm run lint                # No lint violations
```

This catches regressions before they contaminate the wave branch. E2E runs after merge.

## Global Safety Net

| Check                                                          | When                                     |
| -------------------------------------------------------------- | ---------------------------------------- |
| E2E suite: `npm run test:e2e` (10 files, 124 tests in `/e2e/`) | After each wave merges to main           |
| Unit suite: `npm test`                                         | Before each PR + after wave merge        |
| `npm run typecheck`                                            | Before each PR                           |
| `npm run lint`                                                 | Before each PR                           |
| `vitest --shuffle`                                             | Before each PR (test order independence) |
| Coverage report (`@vitest/coverage-v8`)                        | After Wave 4 — measure delta             |

## Wave Rollback Protocol

If E2E tests fail after a wave merge:

1. **Immediate:** `git revert <merge-commit>` on the wave branch (not main)
2. **Diagnose:** Identify which worktree introduced the regression
3. **Fix:** In the offending worktree, add a characterization test that catches the regression, fix the code, re-run full suite
4. **Re-merge:** Only after E2E green on the worktree branch
5. **Escalate:** If 3 fix-and-remerge attempts fail, escalate to manual review of the characterization test coverage — the safety net has a hole

## Exit Criteria

- All 38 previously-untested modules have colocated tests
- All 6 files over 900 LOC decomposed to < 400 LOC each
- All `src/__tests__/` files migrated — central folder empty or deleted
- Never-nester rules pass across entire `@soleri/core`
- Vault captures: all gap entries filled + patterns discovered during refactoring

## Wave Summary

| Wave           | Scope                                                                 | Strategy                                          | Parallelism     | Depends On                                                     |
| -------------- | --------------------------------------------------------------------- | ------------------------------------------------- | --------------- | -------------------------------------------------------------- |
| **0**          | persistence, vault, migrations                                        | TDD + Feathers (vault.ts)                         | 4 worktrees     | None                                                           |
| **1**          | brain (full), planner, curator, gap-analysis, evidence-collector      | Feathers (900+ LOC) + Contract-first + Direct TDD | 4 worktrees     | Wave 0                                                         |
| **2**          | runtime facades (13 files), runtime ops (28 files), transport, engine | TDD + Feathers (chat-facade)                      | 8+ worktrees    | Wave 1 (planning-extra-ops + orchestrate-ops wait for Wave 1A) |
| **2.5**        | governance, agency, context, loop                                     | Contract-first / Direct TDD                       | 4 worktrees     | Wave 1 (parallel with Wave 2)                                  |
| **3**          | chat, flows, control, domain-packs                                    | Contract-first / Direct TDD                       | 4 worktrees     | Wave 2                                                         |
| **4**          | 21 supporting modules (+paths.ts, +update-check.ts)                   | Direct TDD                                        | Maximum         | Wave 3                                                         |
| **continuous** | Vault knowledge capture                                               | Ongoing                                           | Parallel stream | None                                                           |

---

## Drift Addendum (2026-03-21)

Post-feature audit conducted after new features were added between plan creation and execution start. All findings documented in GitHub issue comments and new issues.

### Changes Since Plan Creation

| Commit    | Feature                                                      | Impact                                                  |
| --------- | ------------------------------------------------------------ | ------------------------------------------------------- |
| `e22cda0` | Centralized `~/.soleri/` home + brain auto-learning pipeline | +150 LOC to intelligence.ts, new brain-planner coupling |
| `6e5169a` | Bundle 17 skills with new agents                             | No refactoring impact                                   |
| `31aab23` | Creating-skills skill                                        | No refactoring impact                                   |
| `e12b07b` | Automatic vault ingestion                                    | No refactoring impact                                   |
| `4f3c87f` | Remove Postgres provider (#231)                              | Simplifies Wave 0A (persistence/)                       |

### Wave 0 Drift

| Issue     | Finding                                                                      | Action                                 |
| --------- | ---------------------------------------------------------------------------- | -------------------------------------- |
| #244 (0A) | Postgres removal simplifies persistence — fewer constructor branches         | No plan change needed                  |
| #245 (0B) | No drift — exact match                                                       | No plan change needed                  |
| #246 (0C) | vault.ts has 53 public methods (was 45). vault-memories.ts target +50-80 LOC | Updated decomposition targets in issue |
| #247 (0D) | New file `vault-types.ts` (96 LOC) not in plan                               | Added to scope (10 files, was 9)       |

### Wave 1 Drift

| Issue     | Finding                                                                              | Action                                          |
| --------- | ------------------------------------------------------------------------------------ | ----------------------------------------------- |
| #248 (1A) | intelligence.ts grew to ~1,453 LOC (+150). Auto-learning pipeline adds 3 new methods | Decomposition → 5 files (was 4). New issue #277 |
| #248 (1A) | Bidirectional coupling: planner now writes to brain sessions                         | New sequencing constraint. Issue #278           |

### Wave 2 Drift

| Issue     | Finding                                                                                | Action                                   |
| --------- | -------------------------------------------------------------------------------------- | ---------------------------------------- |
| #253 (2B) | planning-extra-ops.ts +56 LOC, orchestrate-ops.ts +86 LOC, session-briefing.ts +31 LOC | LOC updates in issue comment             |
| #253 (2B) | Brain-dependent ops must wait for Wave 1A                                              | Sequencing constraint documented in #278 |

### Wave 4 Drift

| Issue | Finding                                                      | Action                                     |
| ----- | ------------------------------------------------------------ | ------------------------------------------ |
| #258  | 2 new modules: paths.ts (111 LOC), update-check.ts (111 LOC) | Added to Wave 4 scope (21 modules, was 19) |

### New Issues Created

| #    | Title                                                                      | Wave |
| ---- | -------------------------------------------------------------------------- | ---- |
| #277 | Brain auto-learning module extraction                                      | 1A   |
| #278 | Wave 2 sequencing — planner/orchestrator ops depend on brain decomposition | 2    |

### Updated Parallelism Diagram (Wave 1 → Wave 2)

```
Wave 1A (brain) ─────────────► Wave 2B: planning-extra-ops.ts, orchestrate-ops.ts
                                         (must wait for brain decomposition)
Wave 1B (planner) ───┐
Wave 1C (curator) ───┤── Wave 2B: all other ops files (unchanged)
Wave 1D (planning/) ─┘
```
