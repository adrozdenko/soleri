# Soleri Release Plan

Active release plan as of 2026-03-27. Source of truth for release sequencing, dependencies, and priorities.

## Release Sequence

```
v9.1.1 → v9.1 → v9.2 → v9.3 → v9.4 → v9.5 → v9.6 → v9.7 → v10.0
```

| Release    | Milestone                           | Issues | Status                 | Depends On                  | Release Checklist |
| ---------- | ----------------------------------- | ------ | ---------------------- | --------------------------- | ----------------- |
| **v9.1.1** | Bug Fixes                           | 6      | Ready to ship          | Nothing — independent       | #274              |
| **v9.1**   | Core Refactoring Waves              | 17     | In progress            | Nothing — foundation        | #275              |
| **v9.2**   | Operator Profile + Engine Hardening | 29     | **Shipped 2026-03-22** | v9.1 (stable runtime)       | #276              |
| **v9.3**   | Persona Overlay & Auto-Assessment   | —      | **Shipped 2026-03-23** | v9.2                        | —                 |
| **v9.4**   | YOLO Mode, Op Visibility & Brain    | —      | **Shipped 2026-03-26** | v9.3                        | —                 |
| **v9.5**   | Performance, Windows & Forge Polish | 16     | **Shipped 2026-03-27** | v9.4                        | #401              |
| **v9.6**   | Adapter & Subagent Foundations      | 12     | **Shipped 2026-03-27** | v9.5                        | —                 |
| **v9.7**   | Paperclip Adaptation                | 29     | **Shipped 2026-03-27** | v9.6                        | #442              |
| **v10.0**  | soleri.dev Platform                 | 17     | Future                 | Nothing — independent track | —                 |

## v9.1.1: Bug Fixes

Ships independently. Patch release — no breaking changes.

| #    | Priority | Title                                                               |
| ---- | -------- | ------------------------------------------------------------------- |
| #260 | P1       | Persona template overrides identity layer on activation             |
| #261 | P2       | Morph op rejects all mode values — valid modes undocumented         |
| #262 | P2       | governance_policy set action fails with NOT NULL constraint         |
| #263 | P2       | Curator quality score flags cross-domain entries as duplicates      |
| #264 | P3       | complete_plan op description misleading — should guide to reconcile |

## v9.1: Core Refactoring Waves

TDD refactoring of @soleri/core. Waves execute sequentially — each wave depends on the previous.

### Execution Order

```
Wave 0: #244 → #245 → #246 (critical) → #247
Wave 1: #248 (critical) → #249 (critical) → #250 → #251
Wave 2: #252 (critical) → #253 → #254 → #255
Parallel: #256 (can run alongside Wave 2)
Wave 3: #257
Wave 4: #258
Verify: #259
```

### Critical Path

Issues marked `critical-path` must complete before dependent work starts:

```
#246 (vault.ts decomposition)
  → #248 (brain/ decomposition)
    → #249 (planner.ts decomposition)
      → #252 (facades TDD)
```

| Wave   | Issues                 | Summary                                          |
| ------ | ---------------------- | ------------------------------------------------ |
| 0      | #244, #245, #246, #247 | persistence/, migrations/, vault.ts, vault files |
| 1      | #248, #249, #250, #251 | brain/, planner.ts, curator/, planning/          |
| 2      | #252, #253, #254, #255 | facades, ops files, transport, engine            |
| 2.5    | #256                   | governance, agency, context, loop (parallel)     |
| 3      | #257                   | chat, flows, control, domain-packs               |
| 4      | #258                   | 19 supporting modules                            |
| Verify | #259                   | Cleanup, E2E verification, coverage report       |

## v9.2: Operator Profile — Personality Learning

New engine module. Blocked by v9.1 — needs stable runtime, facade registration, and engine module system.

### Execution Order

```
#265 (types) → #266 (core class, critical) → #267 (signal extraction)
  → #268 (facade, critical) → #269 (register module)
    → #270 (signal pipeline) → #271 (subagent prompts)
      → #272 (session briefing) → #273 (tests)
```

### Dependencies on v9.1

| Issue | Blocked By                                     | Reason                                          |
| ----- | ---------------------------------------------- | ----------------------------------------------- |
| #268  | #252 (Wave 2A: facades)                        | Facade registration pattern must be stable      |
| #269  | #255 (Wave 2D: engine)                         | ENGINE_MODULES array must be finalized          |
| #270  | #248 (Wave 1A: brain), #250 (Wave 1C: curator) | Signal pipeline hooks into brain/curator events |

## v10.0: soleri.dev Platform

Cloud platform — independent of engine releases. Foundation-first dependency chain.

### Dependency Graph

```
#118 (backend API) ─┬→ #107 (accounts) ─┬→ #108 (agent registration)
                    │                    ├→ #109 (teams)
                    │                    ├→ #112 (creator dashboard)
                    │                    └→ #113 (ratings)
                    │
                    ├→ #115 (security) ──┐
                    ├→ #117 (legal) ─────┼→ #110 (marketplace) → #111 (pricing) → #114 (rental)
                    └→ #100 (registry) ──┘
```

### Execution Phases

| Phase            | Issues               | Description                                       |
| ---------------- | -------------------- | ------------------------------------------------- |
| **Foundation**   | #118, #100           | Backend API + registry abstraction                |
| **Auth**         | #107                 | Accounts, profiles, API keys                      |
| **Registration** | #108, #109           | Agent connect + team management                   |
| **Marketplace**  | #110, #115, #117     | Storefront + security + legal                     |
| **Commerce**     | #111, #112, #113     | Pricing + dashboard + ratings                     |
| **Advanced**     | #106, #114           | Subscriptions + knowledge rental                  |
| **Standalone**   | #43, #91, #119, #230 | Registry, plugin marketplace, workbench, Postgres |

## Labels

| Label           | Meaning                      |
| --------------- | ---------------------------- |
| `P1`            | Active work — current sprint |
| `P2`            | Backlog — next sprint        |
| `P3`            | Nice to have                 |
| `critical-path` | Blocks downstream work       |
| `core`          | @soleri/core package         |
| `cli`           | @soleri/cli package          |
| `forge`         | @soleri/forge package        |
| `platform`      | soleri.dev cloud platform    |

## Release Rule

Every milestone has a release checklist issue (the last issue to close). No version ships without it.

**Checklist covers:** version bump → changelog → README/RELEASES.md → build → npm publish → GitHub release → smoke test → close milestone.

**When to create:** when creating a new milestone or when the last non-release issue is about to close.

See Ernesto skill `release-gate` for the full rule and template.

## How to Start a New Session

```bash
# See current release status
gh issue list --state open --milestone "v9.1.1: Bug Fixes"
gh issue list --state open --milestone "v9.1: Core Refactoring Waves" --label "critical-path"
gh issue list --state open --milestone "v9.2: Operator Profile — Personality Learning"

# Pick next work item — critical path first
gh issue list --state open --label "critical-path,P1" --limit 5

# Read full release plan
cat RELEASES.md
```
