# Recovery Prompts — Worktree Staging Disaster (2026-03-21)

All prompts below are for `cd ~/projects/soleri && claude` sessions.
**CRITICAL**: Each session must create a feature branch, commit, and PUSH before finishing.

---

## BATCH 1 — Run all 5 in parallel

### Session A: Wave 0A — persistence/ (#244)

```
You are recovering lost work from a staging disaster. Read the GitHub issue:
gh issue view 244 --repo adrozdenko/soleri

Then read the refactoring design doc at docs/plans/2026-03-20-soleri-core-tdd-refactoring-design.md for context.

Your task — implement everything in issue #244:
1. Migrate src/__tests__/persistence.test.ts → src/persistence/sqlite-provider.test.ts
2. Upgrade assertions: replace toBeTruthy()/toBeDefined() with precise matchers
3. Add test factories for DB fixtures
4. Enforce AAA (Arrange-Act-Assert) pattern in all tests
5. Add edge-case tests: corrupt DB recovery, concurrent access, WAL mode verification
6. Extract applyPerformancePragmas() helper function + unit tests
7. Delete old test file after full coverage migration

Rules:
- Create branch: git checkout -b recovery/wave-0a-persistence
- One extraction per commit (Strangler Fig pattern)
- Never-nester: max 2 levels of nesting, no else-after-return
- Functions < 30 LOC, files < 400 LOC
- Verify: npm test -w packages/core && npm run typecheck -w packages/core
- vitest --shuffle must pass (no test order dependencies)
- PUSH when done: git push -u origin recovery/wave-0a-persistence
- Comment on the issue when complete: gh issue comment 244 --body "Recovered. Branch: recovery/wave-0a-persistence"
```

### Session B: Wave 0B — migrations/ (#245)

```
You are recovering lost work from a staging disaster. Read the GitHub issue:
gh issue view 245 --repo adrozdenko/soleri

Then read the refactoring design doc at docs/plans/2026-03-20-soleri-core-tdd-refactoring-design.md for context.

Your task — implement everything in issue #245:
1. Migrate migration-runner tests to colocated src/migrations/migration-runner.test.ts
2. Upgrade assertions to precise matchers (no toBeTruthy/toBeDefined)
3. Add test factories for migration fixtures
4. Enforce AAA pattern in all tests
5. Add edge-case tests: rollback failure scenarios, semver edges (pre-release, build metadata), concurrent migrations
6. Verify all migration paths covered

Rules:
- Create branch: git checkout -b recovery/wave-0b-migrations
- One extraction per commit (Strangler Fig pattern)
- Never-nester: max 2 levels of nesting, no else-after-return
- Functions < 30 LOC, files < 400 LOC
- Verify: npm test -w packages/core && npm run typecheck -w packages/core
- vitest --shuffle must pass
- PUSH when done: git push -u origin recovery/wave-0b-migrations
- Comment on the issue when complete: gh issue comment 245 --body "Recovered. Branch: recovery/wave-0b-migrations"
```

### Session C: Wave 0C — vault/vault.ts decomposition (#246)

```
You are recovering lost work from a staging disaster. Read the GitHub issue:
gh issue view 246 --repo adrozdenko/soleri

Then read the refactoring design doc at docs/plans/2026-03-20-soleri-core-tdd-refactoring-design.md for context.

This is the BIGGEST task. Your job — decompose vault.ts (1,332 LOC) into 4 files:

Phase A — Characterization:
- Write characterization tests for all 45 public methods of vault.ts
- Pin current behavior with precise assertions
- Document method groupings by responsibility

Phase B — Decomposition (Strangler Fig, one extraction per commit):
- Define ISP interfaces: VaultReader, VaultWriter, VaultMemory, VaultMaintenance
- Extract vault-schema.ts (~270 LOC) — schema management, table creation
- Extract vault-entries.ts (~400 LOC) — CRUD for vault entries
- Extract vault-memories.ts (~300 LOC) — memory/session operations
- Slim vault.ts to facade (~250 LOC) — delegates to extracted modules

Phase C — Test Migration:
- Migrate src/__tests__/vault.test.ts → colocated
- Migrate src/__tests__/vault-entries.test.ts → colocated
- Migrate src/__tests__/vault-memories.test.ts → colocated
- Write unit tests for each extracted module

ISP interface adjustments (from previous attempt):
- VaultMemory must include: exportMemories(), importMemories(), memoryStatsDetailed()
- VaultMaintenance must include: optimize(), exportAll(), getAgeReport(), contentHashStats()

Rules:
- Create branch: git checkout -b recovery/wave-0c-vault-decomposition
- ONE extraction per commit — do not batch
- All 4 files must be under 400 LOC
- Public API must NOT change — vault.ts facade delegates everything
- Verify after EACH extraction: npm test -w packages/core && npm run typecheck -w packages/core
- vitest --shuffle must pass
- PUSH when done: git push -u origin recovery/wave-0c-vault-decomposition
- Comment on issue: gh issue comment 246 --body "Recovered. Branch: recovery/wave-0c-vault-decomposition"
```

### Session D: Trim memory responses (#283)

```
You are recovering lost work from a staging disaster. Read the GitHub issue:
gh issue view 283 --repo adrozdenko/soleri

Your task — trim memory_list and memory_search responses:
1. memory_list: return { entries: [{ id, summary (first 120 chars), project, createdAt }], total } instead of full objects
2. memory_search: return { results: [{ id, summary, score, project }], total }
3. Existing memory_get returns full entry (two-pass pattern)
4. Support verbose: true flag for full output on both ops

Code location: packages/core/src/runtime/facades/memory-facade.ts

Rules:
- Create branch: git checkout -b recovery/trim-memory-responses
- Verify: npm test -w packages/core && npm run typecheck -w packages/core
- Run E2E: npm run test:e2e (if available)
- PUSH when done: git push -u origin recovery/trim-memory-responses
- Comment on issue: gh issue comment 283 --body "Recovered. Branch: recovery/trim-memory-responses"
```

### Session E: Trim admin/vault list responses (#284)

```
You are recovering lost work from a staging disaster. Read the GitHub issue:
gh issue view 284 --repo adrozdenko/soleri

Your task — trim admin_tool_list and vault list_all responses:
1. admin_tool_list: truncate description to 120 chars, group by facade with counts
2. list_all: reduce default limit from 50 to 20, return { id, title, type, domain, tags } instead of full entries
3. Support verbose: true flag for full output on both ops

Code locations:
- packages/core/src/runtime/admin-ops.ts — admin_tool_list handler
- packages/core/src/runtime/facades/vault-facade.ts — list_all handler

Rules:
- Create branch: git checkout -b recovery/trim-admin-vault-responses
- Verify: npm test -w packages/core && npm run typecheck -w packages/core
- PUSH when done: git push -u origin recovery/trim-admin-vault-responses
- Comment on issue: gh issue comment 284 --body "Recovered. Branch: recovery/trim-admin-vault-responses"
```

---

## BATCH 2 — Run after Batch 1 merges (especially after #246)

### Session F: Wave 1A — brain/ full decomposition + TDD (#248 + #277)

```
You are recovering lost work from a staging disaster. Read both GitHub issues:
gh issue view 248 --repo adrozdenko/soleri
gh issue view 277 --repo adrozdenko/soleri

Then read the refactoring design doc at docs/plans/2026-03-20-soleri-core-tdd-refactoring-design.md for context.

This is the LARGEST recovery task — brain/ module full decomposition + TDD.

Phase 1 — intelligence.ts Full Feathers (1,303 LOC → 4 files):
- Extract strength-scorer.ts (~200 LOC) — pattern strength scoring logic
- Extract session-manager.ts (~350 LOC) — brain session lifecycle
- Extract proposal-manager.ts (~300 LOC) — proposal management
- Extract auto-learning.ts (~150 LOC) — auto-promote, auto-build, plan linking (#277)
  - Methods: autoPromoteProposals(), maybeAutoBuildIntelligence(), getSessionByPlanId()
  - brain_metadata table management
- Slim intelligence.ts to facade (~250 LOC)
- Never-nester: extract 6 rules as named functions

Phase 2 — brain.ts Contract-first TDD (685 LOC):
- Define contract interfaces for brain operations
- Write contract tests against interfaces
- Verify implementation satisfies contracts
- Add edge-case tests

Phase 3 — learning-radar.ts Contract-first TDD (340 LOC):
- Define contract interfaces for radar operations
- Write contract tests against interfaces
- Verify implementation satisfies contracts

Phase 4 — knowledge-synthesizer.ts Direct TDD (216 LOC):
- Write colocated tests directly
- Cover all synthesis paths

Phase 5 — Test Migration:
- Migrate brain-intelligence.test.ts → colocated tests
- Migrate brain.test.ts → colocated tests

Rules:
- Create branch: git checkout -b recovery/wave-1a-brain-decomposition
- ONE extraction per commit (Strangler Fig) — do not batch
- All files must be under 400 LOC
- Functions < 30 LOC
- Never-nester: max 2 levels, no else-after-return
- Verify after EACH extraction: npm test -w packages/core && npm run typecheck -w packages/core
- vitest --shuffle must pass
- PUSH AFTER EVERY 2-3 COMMITS — do not accumulate unpushed work
- Comment on both issues when complete:
  gh issue comment 248 --body "Recovered. Branch: recovery/wave-1a-brain-decomposition"
  gh issue comment 277 --body "Recovered as part of Wave 1A. Branch: recovery/wave-1a-brain-decomposition"
```

---

## BATCH 3 — Run after #248 completes

### Session G: Wave 2 sequencing (#278)

```
You are recovering lost work from a staging disaster. Read the GitHub issue:
gh issue view 278 --repo adrozdenko/soleri

Your task — document the dependency between Wave 1A (brain/) and Wave 2B (runtime/ops) caused by the auto-learning pipeline coupling.

Document in the issue and in the codebase:
1. planning-extra-ops.ts now auto-starts brain sessions on plan_split, ends on plan_complete_lifecycle, calls extractKnowledge()
2. orchestrate-ops.ts tracks entryId for vault recommendations, reuses brain session from plan_split
3. This creates a sequencing constraint: Wave 2B ops files cannot be refactored until Wave 1A brain/ decomposition is complete

Rules:
- This is documentation only — no code changes needed
- Update the issue with the full dependency mapping
- PUSH if any file changes: git push
- Comment on issue when complete: gh issue comment 278 --body "Recovered. Sequencing documented."
```
