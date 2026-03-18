# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## v8.2.0 — 2026-03-19 — Cognee Sync Reliability & Zettelkasten Link Export

### Bug Fixes

- **Auth retry on 401** — `addEntries()` now retries with fresh token when Cognee returns 401 instead of silently returning `{ added: 0 }`. Fixes JWT expiry causing entire sync queue to fail. (#243)
- **Health cache stale-lock** — `drain()` refreshes the health cache before checking availability. Previously, drains after the 60s TTL silently returned 0. (#243)
- **Structured drain errors** — `drain()` returns `DrainResult` with `reason` field (`cognee_unavailable`, `auth_failed`, `queue_empty`, `partial_failure`) instead of bare `0`. MCP responses include actionable `hint` per failure code. (#243)
- **Auth error propagation** — `ensureAuth()` failures now surface as `{ code: 'AUTH_FAILED', error: '...' }` instead of being swallowed by `.catch(() => null)`. (#243)

### Features

- **`drainAll()` method** — Loops drain until queue empty with progress callback, `AbortSignal` cancellation, and `forceCognify` option. Exposed as `cognee_sync_drain_all` MCP op. Eliminates need for rapid-fire external drain calls. (#243)
- **Configurable batch size** — `SyncManagerConfig` with `batchSize` (default 50) and `maxRetries` (default 3). Agents with large vaults can tune throughput.
- **`forceCognify` parameter** — Both `drain()` and `drainAll()` accept `forceCognify` to trigger graph building immediately instead of relying on the 30s debounce timer.
- **`ensureHealthy()` on CogneeClient** — Refreshes stale health cache and returns current status in one call.
- **Zettelkasten link export** — `IntelligenceBundle` now includes optional `links` array. `vault_export_pack` exports links where both endpoints are in the export set. `vault_import_pack` remaps IDs and creates links on import. New agents inherit the full knowledge graph, not just orphaned entries.
- **Auto-link on capture** — `capture_knowledge` now auto-creates links for ALL captured entries (not just first) above 0.7 confidence threshold, max 3 per entry. Response includes `autoLinkedCount`.
- **`backfill_links` op** — One-time Zettelkasten backfill for existing vaults: processes orphan entries, generates links via FTS5 suggestions above configurable threshold. Supports dry-run preview and progress callbacks.
- **`getAllLinksForEntries()` on LinkManager** — Bulk query for links involving a set of entry IDs. Used by pack export.

### Breaking Changes

- `drain()` return type changed from `number` to `DrainResult` (`{ processed, reason?, errors? }`). Callers checking `if (drain() === 0)` must update to `if (result.processed === 0)`.
- `CogneeAddResult` now includes optional `error` and `code` fields.
- `CogneeSyncManager` constructor accepts optional 4th argument `SyncManagerConfig`.

### Types

- New: `DrainResult`, `DrainAllResult`, `DrainStopReason`, `AddErrorCode`, `SyncManagerConfig`, `IntelligenceBundleLink`

---

## v8.1.0 — 2026-03-19 — Architectural Consolidation & OSS Readiness

### Architectural Cleanup (Milestone: Contract Fragmentation Cleanup — 6/6 closed)

- **Single source of truth for tool names** — `ENGINE_MODULE_MANIFEST` in `module-manifest.ts` is now the canonical registry. All templates, docs, and scaffolds generate from it. Zero hardcoded tool names.
- **Contract drift CI** — `module-manifest-drift.test.ts` (5 assertions) ensures `ENGINE_MODULES` and `ENGINE_MODULE_MANIFEST` stay in sync. Runs in existing CI.
- **File-tree canonical** — Forge facade defaults to file-tree `create` op. Legacy scaffold moved to `create_legacy` with deprecation notice.
- **SQLite-first persistence** — Removed `PostgresPersistenceProvider` (310 lines dead code). SQLite is the only supported backend. `PersistenceProvider` interface preserved for future extensibility. Postgres roadmap tracked in #230.
- **Narrowed extension privileges** — Domain packs and plugins receive `PackRuntime` (vault + projects + session checks) instead of full `AgentRuntime` (26+ modules). Backwards compatible via deprecated second argument.
- **Consolidated extension model** — Two clear tiers: Domain Packs (npm) and Local Packs (directories). Plugin system (`soleri-plugin.json`) deprecated in favor of `soleri-pack.json`.

### Features

- **Cold start fix** — Scaffold now seeds `knowledge/` from starter packs (design, security, architecture) instead of empty bundles. New agents start with 15-45 entries. Session briefing shows "Welcome" section for new agents.
- **Hot reload for packs** — `pack_install` registers new MCP tools at runtime via `registerTool` callback. `sendToolListChanged()` notifies connected clients. No restart needed.
- **LLM provider abstraction** — Removed hardcoded `provider: 'openai'` from all 6 internal call sites. All LLM calls route through `ModelRouter`. Users configure provider preference via `~/.{agentId}/model-routing.json`.
- **Version compatibility contract** — Vault format versioned via `PRAGMA user_version`. Engine rejects newer formats. Domain pack peer deps fixed to `^8.0.0`. `ENGINE_MAJOR_VERSION` constant for runtime checks.

### Testing & Quality

- **Curator full worker** — All 14 pipeline handlers tested (was 5). Full 8-step Salvador DAG pipeline E2E test: quality-gate → enrich → normalize → dedup → contradiction → cognee → link → verify.
- **Dead code audit** — Removed `doctor-checks.ts`, 5 unused functions, 4 dead re-exports. -167 lines via knip analysis.

### Documentation

- **CONTRIBUTING.md** rewritten with per-type review guidelines, testing requirements, brain/probabilistic testing guide.
- **extension-tiers.md** — Two-tier extension model (Domain Packs + Local Packs).
- **cross-platform.md** — Transport layers, IDE support matrix, host-specific vs agnostic.
- **multi-persona.md** — Design doc for cross-domain sessions (draft).
- **version-compatibility.md** — Semver contract, breaking change definitions, compatibility matrix.
- **Persistence section** added to README documenting SQLite-first choice.

### Milestones Closed

- Architectural Consolidation — Contract Fragmentation Cleanup (6/6)
- Salvador Parity — Deep Module Porting (11/11)
- Second Brain — Cognitive Amplifier (8/8)
- Engine Hardening & OSS Readiness (8/8)

### Stats

- 13 PRs merged, 33 issues resolved
- Net: ~-300 lines (codebase got smaller and more honest)
- Tests: 1913 unit + 120 E2E

## v8.0.0 — 2026-03-18 — Second Brain & Salvador Parity

### Second Brain (Milestone #39 — 8 features)

- **Two-pass vault retrieval** — `search` with `mode: "scan"` returns lightweight results (title + score + snippet), `load_entries` fetches full content. Saves 60-80% context tokens.
- **Proactive session briefing** — `session_briefing` op gathers last session, active plans, recent captures, brain recommendations, and curator health on session start.
- **Evidence-based reconciliation** — `plan_reconcile_with_evidence` cross-references plan tasks against git diff. Reports DONE/PARTIAL/MISSING per task, detects unplanned changes.
- **Routing feedback loop** — `routing_feedback` and `routing_accuracy` ops track whether intent classification was correct, with confidence calibration per bucket.
- **Ambient learning radar** — 6 ops (`radar_analyze/candidates/approve/dismiss/flush/stats`). Detects learning moments from corrections, search misses, workarounds. Auto-captures high-confidence patterns silently.
- **External knowledge ingestion** — `ingest_url` (fetch + classify), `ingest_text` (transcripts/notes), `ingest_batch` (multiple items). LLM-powered classification with dedup.
- **Content synthesis** — `synthesize` op turns vault knowledge into briefs, outlines, talking points, or post drafts. 4 output formats, audience targeting, source attribution, gap detection.
- **Composable skill chains** — `chain_execute/status/resume/list/step_approve`. Multi-step workflows with $variable data flow between steps, user-approval/auto-test/vault-check gates, SQLite persistence for pause/resume.

### Salvador Parity (Milestone #40 — 10 features)

- **Curator async infrastructure** — Generic `TypedEventBus`, `JobQueue` (SQLite, DAG deps, retries), `PipelineRunner` (background polling). 14 job handlers registered.
- **LLM quality gate** — 5-criteria scoring (novelty, actionability, specificity, relevance, informationDensity) with ACCEPT/REJECT verdict.
- **LLM classifier** — Auto-categorize vault entries by domain, severity, and tags.
- **Agency proactive intelligence** — Rule-based suggestion engine, rich clarifier (urgency levels, typed options with implications), warning suppression, pattern dismissal (24h TTL), notification queue. 7 new ops. 6 built-in suggestion rules.
- **Context engine scoring** — Multi-signal knowledge scoring (baseScore + titleMatch + tagOverlap + intentBoost). Tunable weights. Entity span tracking.
- **Enriched session capture** — 5 new fields: intent, decisions, currentState, nextSteps, vaultEntriesReferenced. Backward compatible.
- **Plan purge** — Permanently delete archived/completed/stale/specific plans with dry-run preview.
- **Memory knowledge governance** — 10 new ops: memory_get, session_search, knowledge_audit, smart_capture, knowledge_health, merge_patterns, knowledge_reorganize, list_project_knowledge, list_projects, knowledge_debug.
- **Doctor health checks** — 8 specialized checks: config, database, vault, LLM, auth, plugins, embeddings, security.
- **LLM model routing** — Default task-to-model routes (Haiku for routine, Sonnet for reasoning). Anthropic extended thinking routes. Configurable per agent.

### Infrastructure

- **Claude Code OAuth discovery** — Cross-platform (macOS Keychain + Linux GNOME Keyring + credentials file). Free Anthropic API via Claude Code subscription. Auto-integrated into key pool.
- **79 new tests** (1913 total). 14 new source files. ~50 new ops.

## v7.0.0 — 2026-03-16 — File-Tree Architecture

### Breaking Changes

- **Agents are folders, not TypeScript projects.** `soleri create` now generates a file-tree agent (agent.yaml + instructions/ + workflows/ + knowledge/) instead of a TypeScript project. Use `--legacy` for old behavior.
- **No build step required.** File-tree agents are ready to use immediately after scaffolding.
- **Old Salvador MCP retired.** The reference agent is now `agents/salvador-filetree/`.

### Added

- **`registerEngine()`** — Direct MCP tool registration replacing the facade factory. Grouped tools (`soleri_vault op:search`) with O(1) op lookup via Map instead of linear array scan.
- **Engine binary** (`soleri-engine`) — Standalone MCP server that reads `agent.yaml` and boots the knowledge engine. Entry point for all file-tree agents.
- **`AgentYamlSchema`** — Zod schema for `agent.yaml`, the single source of truth for agent identity and configuration.
- **`scaffoldFileTree()`** — Generates folder-tree agents in ~3 seconds (vs ~40s for TypeScript scaffolding).
- **`composeClaudeMd()`** — Auto-generates CLAUDE.md from agent.yaml + instructions/ + workflows/ + skills/. Never manually edited.
- **`createCoreOps()`** — Generates agent-specific ops (health, identity, activate, register, setup) from agent.yaml config at engine startup.
- **File-tree agent detection** — CLI commands (create, install, dev, list, doctor) detect and support both file-tree and legacy agents.
- **`soleri dev` for file-tree agents** — Starts the knowledge engine AND watches files for changes, auto-regenerating CLAUDE.md.
- **`soleri install` for file-tree agents** — Registers `@soleri/engine` (not `node dist/index.js`) in editor MCP configs.
- **Salvador file-tree agent** — Full port of Salvador to file-tree format: 23 skills, 6 workflows, 4 knowledge bundles, 477-line auto-generated CLAUDE.md.
- **Minimal example agent** — `examples/minimal-agent/` demonstrating the file-tree format.
- **Architecture spec** — `docs/architecture/file-tree-agent-format.md` defining the folder structure, agent.yaml schema, and CLAUDE.md composition algorithm.
- **E2E test for file-tree flow** — Full pipeline test: scaffold → boot engine → MCP connect → call ops → verify responses (10 tests).

### Architecture

The engine is now two cleanly separated layers:

1. **File Tree (shell)** — agent.yaml, instructions/, workflows/, knowledge/. The model reads these natively.
2. **Knowledge Engine (brain)** — vault, brain, curator, planner, memory. Persistent state and learning via `@soleri/core`.

### Migration

- Existing TypeScript agents continue to work with `--legacy` flag
- To convert: create `agent.yaml` from your persona.ts, move playbooks to `workflows/`, move intelligence data to `knowledge/`
- The knowledge engine is backward-compatible — same vault schema, same ops

---

## @soleri/core@2.11.0 — 2026-03-11

### Added

- **Multi-transport layer** — HTTP/SSE, WebSocket, and LSP transports for agents reachable beyond MCP. Includes session management, fragment buffering, message chunking, and authentication primitives.
- **Chat transport infrastructure** — Agent loop with MCP bridge, output compressor, and task cancellation manager for conversational interfaces.
- **Telegram transport primitives** — Voice/TTS via Whisper, message queue for zero-cost relay mode, and per-chat browser session management with Playwright isolation.
- **Self-update engine** — Agents can update themselves in-place. Includes file handling for photos/PDFs/docs and a notification engine for proactive alerts.
- **Multi-vault architecture** — Tiered search across agent/project/team vaults with dynamic named connections and priority-weighted resolution. Connect and disconnect vaults at runtime.
- **Vault branching** — Create named vault branches for experimentation with merge, list, and delete operations.
- **Git vault sync** — Auto-commit vault changes to git for version-controlled knowledge with push/pull sync.
- **PostgreSQL persistence provider** — Full `PersistenceProvider` implementation for concurrent multi-writer environments. Vault scaling benchmarked at 10K+ entries.
- **Knowledge pack system** — Pack format spec with install, validate, and lifecycle ops. Unified resolver with lockfile, semver compatibility checks, and npm registry resolution. Obsidian bidirectional sync.
- **Knowledge scoping** — Vault export, git sync, and team review workflows (submit, approve, reject, list pending). Vault branching for experimentation.
- **Intelligence layer** — Agency mode with file watching, pattern surfacing, and warning detection. Context engine with entity extraction, knowledge retrieval, and confidence scoring. Session lifecycle with quality scoring and replay.
- **Plugin system** — Runtime plugin lifecycle with registry, load/unload, and status ops.
- **Playbook execution engine** — Start/step/complete lifecycle for multi-step validated procedures.
- **Architecture primitives** — Feature flags (file + env + runtime layers), auth level enforcement in facade factory, hybrid facade strategy promoting hot ops to standalone MCP tools, host-agnostic enforcement layer, CLAUDE.md auto-composition, health registry with graceful degradation, content-hash dedup at capture, smart capture with 3-tier scope detection.
- **Telemetry ops** — Facade and LLM telemetry metrics, migration runner for schema upgrades.
- **Pack authoring** — CLI-accessible validation and deprecation utilities for knowledge pack authors.
- **Skills system** — Skills CLI with pack search, update, and semver compatibility checks.
- **Stream utilities** — `ReplayableStream` with `fanOut` helper and `maxBuffer`, content-addressable hashing, normalize/collect helpers.

### Changed

- Removed dead code flagged by knip audit (#188)

## @soleri/forge@5.12.0 — 2026-03-11

### Added

- **Telegram forge templates** — Scaffolder generates Telegram bot, agent config, and supervisor templates. Full scaffolder integration for chat-enabled agents.
- **Chat transport templates** — Session, fragment buffer, chunker, and auth primitives generated for all new agents.
- **Pack system templates** — Unified pack system with lockfile and resolver scaffolded into generated agents.
- **Self-update and notifications** — Generated agents include self-update engine and notification infrastructure.
- **Task cancellation** — Chat transport task cancellation manager in generated code.
- **Hot op promotion** — Hybrid facade strategy scaffolded: frequently-used ops promoted to standalone MCP tools for better LLM discovery.

### Changed

- Removed dead code flagged by knip audit (#188)

## @soleri/cli@1.10.0 — 2026-03-11

### Added

- **`soleri skills`** — Skills CLI for searching, installing, updating, and managing agent skills with semver compatibility checks.
- **`soleri pack`** — Pack authoring commands: create, validate, deprecate, and publish knowledge packs.
- **`soleri telemetry`** — Telemetry ops and migration runner for agent lifecycle management.
- **Archetype system** — Multi-archetype selection with union merge strategy during `soleri create`. 2 new archetypes: Accessibility Guardian and Documentation Writer. Domain-specific principles and tier field for archetype classification.
- **Obsidian sync** — Bidirectional sync between agent vault and Obsidian via CLI.
- **Starter knowledge packs** — Pre-built packs installable during scaffolding.
- **Premium archetypes** — Extended archetype library with npm registry resolution.
- **Unified pack system** — Lockfile, resolver, and CLI commands for pack management.
- **Agent lifecycle CLI** — Telemetry ops and migration runner accessible from the command line.

### Fixed

- Auto-derive agent ID correctly during multiselect wizard flow
- Doctor `runAllChecks` test timeout increased for reliability

### Changed

- Removed dead code flagged by knip audit (#188)

## @soleri/core@2.5.0 — 2026-03-07

### Added

- **Cognee Sync Manager** — Queue-based dirty tracking with SQLite `cognee_sync_queue` table. Auto-enqueues on vault seed/remove/bulkRemove. Drain logic processes batches of 10 with max 3 retries. Health-flip detection auto-drains when Cognee comes back online. Startup reconciliation re-queues stale `processing` entries.
- **Intake Pipeline** — 6-stage book/PDF ingestion: init → chunk → classify → dedup → store → finalize. SQLite `intake_jobs` + `intake_chunks` tables. Supports PDF (via optional `pdf-parse`) and plain text. LLM-powered content classification extracts patterns, anti-patterns, rules, and workflows.
- **Content Classifier** — Uses `LLMClient.complete()` with structured JSON extraction to classify text chunks into typed knowledge items with titles, descriptions, severity, and tags.
- **Dedup Gate** — TF-IDF cosine similarity (threshold 0.85) against existing vault entries to prevent near-duplicate ingestion.
- **7 new ops** (196 → 203 total): `cognee_sync_status`, `cognee_sync_drain`, `cognee_sync_reconcile`, `intake_ingest_book`, `intake_process`, `intake_status`, `intake_preview`
- **Temporal decay scoring** — Vault entries decay over time using configurable half-life. `decayedScore()` applies exponential decay to confidence scores based on entry age.
- **Bi-temporal fields** — Vault entries track both `validFrom`/`validTo` (business time) and `recordedAt`/`supersededAt` (system time). Point-in-time queries via `vault.getAsOf(timestamp)`.
- **Cognee × Curator hybrid** — Curator contradiction detection cross-references Cognee vector search results to surface semantic contradictions beyond keyword matching.
- **Execution metrics** — Per-task timing with `startedAt`/`completedAt` auto-set on status transitions. `ExecutionSummary` aggregates across plan tasks.
- **Task deliverables** — `submitDeliverable()` records file/vault_entry/url deliverables on plan tasks with SHA-256 hashing. `verifyDeliverables()` checks existence and hash staleness.
- **Loop anomaly detection** — `detectAnomaly()` flags fast + low-score iteration combos. Per-mode duration thresholds.
- **Admin hot reload** — `admin_hot_reload` op rebuilds brain vocabulary, vault FTS index, and template cache in one call.
- `pdf-parse` added as optional dependency for PDF ingestion

## @soleri/forge@5.6.0 — 2026-03-07

### Changed

- Core facade test template updated: 201 → 208 ops (7 new Cognee sync + intake ops)
- Scaffolder preview array updated with 7 new op names
- Scaffolder test expectations updated to match 208 agent ops

## @soleri/forge@5.5.0 — 2026-03-06

### Added

- **17 built-in skills** shipped with every scaffolded agent — brainstorming, writing-plans, executing-plans, TDD, systematic-debugging, verification-before-completion, second-opinion, code-patrol, fix-and-learn, knowledge-harvest, vault-capture, vault-navigator, health-check, context-resume, brain-debrief, onboard-me, retrospective
- Skills include YAML frontmatter with agent-specific `YOUR_AGENT_core` → `{agentId}_core` substitution
- MIT attribution preserved in superpowers-adapted skills

## @soleri/cli@1.5.0 — 2026-03-06

### Added

- **`soleri test`** — Run agent test suite via `vitest run`
- **`soleri upgrade`** — Upgrade `@soleri/core` to latest in agent project
- **`hookPacks` validation** — Validate hook pack names during config-based create

## @soleri/cli@1.4.0 — 2026-03-06

### Added

- **`soleri governance`** — CLI command for governance policy management (list policies, view proposals, stats, expire stale proposals)

## create-soleri@1.1.0 — 2026-03-06

### Changed

- Delegates to `@soleri/cli@1.4.0+` with governance support

## @soleri/core@2.4.0 — 2026-03-06

### Added

- **84 new ops** across 6 modules (113 → 196 total, then +1 playbook_create = 197, then close parity gap to 185, then v6.1.0 to 191, then v6.2.0 to 196):
  - **Planning** — `plan_execution_metrics`, `plan_record_task_metrics`, `plan_submit_deliverable`, `plan_verify_deliverables`, plan grading with A–F letter grades
  - **Memory** — Cross-project search, promote to global, session capture
  - **Vault** — Advanced search filters, bulk operations, export/import
  - **Admin** — Health check, persistence check, setup global, list tools, admin hot reload
  - **Loop** — Start/cancel/status/iterate with gate, anomaly check
  - **Orchestrate** — Plan/execute/complete lifecycle
  - **Project** — Register/get/list/unregister/get_rules/link_projects
  - **Curator** — GPT-enrich, queue stats, groom all
- **Playbook system** — Structured multi-step procedures stored as vault entries with `playbook_list`, `playbook_get`, `playbook_create` ops. Full Salvador playbook architecture ported to core.
- **Errors module** — Structured error types with codes and metadata (`errors.ts`)
- **Persistence abstraction** — `PersistenceProvider` interface decouples vault from raw SQLite (`persistence/provider.ts`)
- **Prompt templates** — Compilable prompt templates with variable substitution (`templates/`)
- **30 ops closing Salvador feature parity gap** (#148–#160)

## @soleri/forge@5.4.0 — 2026-03-06

### Changed

- Core facade test template updated to match `@soleri/core@2.4.0` op count
- Scaffolder preview array synced with all new ops

## @soleri/core@2.3.0 — 2026-03-05

### Added

- **Structured logging** — `Logger` class with level-based filtering (debug/info/warn/error), JSON output mode, and context tags (#138)
- **Brain typed feedback** — `BrainFeedback` with explicit `positive`/`negative`/`neutral` types and extraction tracking (#123)
- **Auto-extraction on session end** — Brain automatically extracts knowledge when sessions complete
- **Source-aware recommendations** — Brain recommendations include provenance (vault, brain, session)
- **Governance module** — Policy engine with configurable capture gates, proposal workflow (propose → vote → approve/reject), and automatic expiration
  - `GovernanceEngine` class with SQLite persistence
  - Capture gating: `brain_promote_proposals` routed through governance approval
  - Auto-capture on proposal approval and modification
  - Governance summary in project register response
  - Stale proposal expiration on session start

## @soleri/forge@5.3.0 — 2026-03-05

### Added

- **Hook system for generated agents** — Scaffolded agents include Claude Code hooks for quality gates (#137)
- Scaffolder op sync updated to match core 2.3.0

### Changed

- Domain-facade template marked as v4 legacy (v5.0+ agents use runtime factories)

## @soleri/cli@1.3.0 — 2026-03-05

### Added

- **Hook pack system** — Installable quality gates via `soleri hooks add-pack/remove-pack/list-packs/upgrade-pack`. Ships 5 built-in packs: `typescript-safety`, `a11y`, `css-discipline`, `clean-commits`, and `full` (composed from the other 4)
- **Create wizard integration** — Multiselect prompt during `soleri create` lets users pick hook packs at scaffolding time
- **`--project` flag** — `add-pack --project` / `remove-pack --project` installs hookify files to project `.claude/` instead of global `~/.claude/`, enabling team-shared quality gates
- **`upgrade-pack` command** — Force-overwrites installed hooks with latest pack version
- **Custom/local packs** — `.soleri/hook-packs/<name>/` directories with `manifest.json` are discovered alongside built-in packs; local packs override built-in packs with the same name
- **Pack versioning** — All manifests include `version` field; hookify files embed `# Version:` headers for staleness detection
- **`hookPacks` in config file** — `"hookPacks": ["typescript-safety"]` in JSON config for non-interactive `--config` mode
- **Doctor hook pack check** — `soleri doctor` now reports hook pack installation status

## @soleri/forge@5.2.0 — 2026-03-05

### Added

- **`hookPacks` field in `AgentConfigSchema`** — Optional `string[]` field for specifying hook packs in config files

## @soleri/forge@5.1.3 — 2026-03-05

### Added

- **CLAUDE.md cleanup on deactivation** — `deactivateAgent()` now calls `removeClaudeMdGlobal()` to strip the agent's section from `~/.claude/CLAUDE.md`, preventing stale test agent instructions from accumulating
- New exports in generated `inject-claude-md.ts`: `removeClaudeMdGlobal()`, `removeClaudeMd(projectPath)`

## @soleri/cli@1.0.4 — 2026-03-05

### Fixed

- Tool name discrepancy — hook templates now use `{agentId}_core` (preserving hyphens) instead of converting to underscores, matching actual MCP tool registration

## @soleri/forge@5.1.2 — 2026-03-05

### Fixed

- Tool name discrepancy in CLAUDE.md template, activate template, setup script, and patching — all now preserve hyphens in agentId to match MCP tool registration (`my-agent_core` not `my_agent_core`)

## @soleri/cli@1.0.3 — 2026-03-05

### Changed

- Version bump to republish — 1.0.2 was published before auto-routing hook changes landed

## @soleri/cli@1.0.2 — 2026-03-05

### Added

- **Auto-routing UserPromptSubmit hook** — Generated Claude Code settings now include a bash hook that keyword-matches every user prompt and outputs a visible `[MODE]` indicator (FIX-MODE, BUILD-MODE, IMPROVE-MODE, etc.), then instructs the LLM to call `route_intent` for full behavior rules
- **SessionStart hook** — Reminds the LLM to register the project and check for active plans on session start

## @soleri/forge@5.1.1 — 2026-03-05

### Added

- **Auto-Routing section in generated CLAUDE.md** — Tells the LLM how to respond when `[MODE-NAME]` indicators appear in system context, including calling `route_intent` and following behavior rules
- **Control ops in facade table** — 8 new ops documented: `route_intent`, `morph`, `get_behavior_rules`, `get_identity`, `update_identity`, `add_guideline`, `remove_guideline`, `rollback_identity`

## @soleri/forge@5.1.0 — 2026-03-05

### Changed

- Updated `identity` op in entry-point template to delegate to `IdentityManager` with PERSONA fallback
- Updated `activate` op to seed identity from PERSONA on first activation
- Updated test template op count 42 → 50 to match `@soleri/core@2.2.0` control ops

## @soleri/core@2.2.0 — 2026-03-05

### Added

- **`IdentityManager` class** — Agent identity CRUD with versioning and rollback (`control/identity-manager.ts`)
- **`IntentRouter` class** — Keyword-based intent classification and operational mode management (`control/intent-router.ts`)
- **Control types** extracted to `control/types.ts` — identity, guideline, intent, and mode types
- **8 new control ops** in `createCoreOps()` (37 → 45 total):
  - `get_identity` — Get current agent identity with guidelines
  - `update_identity` — Update identity fields with auto-versioning
  - `add_guideline` — Add behavioral guideline (behavior/preference/restriction/style)
  - `remove_guideline` — Remove a guideline by ID
  - `rollback_identity` — Restore a previous identity version
  - `route_intent` — Classify prompt into intent + mode via keyword matching
  - `morph` — Switch operational mode manually
  - `get_behavior_rules` — Get behavior rules for current or specified mode
- **5 new SQLite tables**: `agent_identity`, `agent_identity_versions`, `agent_guidelines`, `agent_modes`, `agent_routing_log`
- **10 default operational modes** seeded on first use (BUILD, FIX, VALIDATE, DESIGN, IMPROVE, DELIVER, EXPLORE, PLAN, REVIEW, GENERAL)

## @soleri/forge@5.0.1 — 2026-03-05

### Changed

- Updated test template op count 31 → 42 to match `@soleri/core@2.1.0` brain intelligence ops

## @soleri/core@2.1.0 — 2026-03-05

### Added

- **`BrainIntelligence` class** — Pattern strength scoring, session knowledge extraction, and cross-domain intelligence pipeline (`brain/intelligence.ts`)
- **Brain types extracted** to `brain/types.ts` — all existing + 13 new intelligence types. Re-exported from `brain.ts` for backward compat
- **11 new brain ops** in `createCoreOps()` (26 → 37 total):
  - `brain_session_context` — Recent sessions, tool/file frequency
  - `brain_strengths` — 4-signal pattern scoring (usage + spread + success + recency, each 0-25)
  - `brain_global_patterns` — Cross-domain pattern registry
  - `brain_recommend` — Context-aware pattern recommendations
  - `brain_build_intelligence` — Full pipeline: strengths → registry → profiles
  - `brain_export` / `brain_import` — Brain data portability
  - `brain_extract_knowledge` — 6-rule heuristic extraction from sessions
  - `brain_archive_sessions` — Prune old sessions
  - `brain_promote_proposals` — Promote extracted knowledge to vault entries
  - `brain_lifecycle` — Start/end brain sessions
- **5 new SQLite tables**: `brain_strengths`, `brain_sessions`, `brain_proposals`, `brain_global_registry`, `brain_domain_profiles`
- `brainIntelligence` field on `AgentRuntime` interface
- 50+ new test cases in `brain-intelligence.test.ts`

## @soleri/core@2.0.0 — 2026-03-05

### Breaking Changes

- **Runtime Factory** — `createAgentRuntime(config)` replaces manual module initialization. Single call wires Vault, Brain, Planner, Curator, KeyPool, and LLMClient
- **LLMClient moved to core** — `LLMClient` and `ModelRouter` now live in `@soleri/core` (was a generated template in forge). Constructor: `LLMClient(openaiKeyPool, anthropicKeyPool, agentId?)`
- `@anthropic-ai/sdk` added as optional peer dependency (dynamic import at runtime)

### Added

- **`createAgentRuntime(config)`** — Factory that initializes all agent modules with sensible defaults (`runtime/runtime.ts`)
- **`createCoreOps(runtime)`** — Returns 26 generic `OpDefinition[]` covering search, vault, memory, export, planning, brain, and curator ops (`runtime/core-ops.ts`)
- **`createDomainFacade(runtime, agentId, domain)`** — Creates a standard 5-op domain facade at runtime (get_patterns, search, get_entry, capture, remove) (`runtime/domain-ops.ts`)
- **`createDomainFacades(runtime, agentId, domains)`** — Batch factory for multiple domain facades
- **`AgentRuntimeConfig` / `AgentRuntime` types** — Interfaces for the factory pattern (`runtime/types.ts`)
- **`LLMClient`** — Full LLM client with circuit breaker, retry, key rotation, model routing, dynamic Anthropic SDK import (`llm/llm-client.ts`)
- 33 new tests (runtime, core-ops, domain-ops, llm-client), 0 regressions in existing 201 tests

## @soleri/forge@5.0.0 — 2026-03-05

### Breaking Changes

- Generated agents now use `createAgentRuntime()`, `createCoreOps()`, `createDomainFacades()` from `@soleri/core` instead of inlined boilerplate
- Generated `package.json` depends on `@soleri/core: ^2.0.0` (was `^1.0.0`)
- `@anthropic-ai/sdk` moved to `optionalDependencies` (was `dependencies`)
- No more `src/facades/` or `src/llm/` directories generated — facades created at runtime

### Removed

- **`core-facade.ts` template** — Replaced by `createCoreOps()` from core (26 generic ops + 5 agent-specific ops in entry point)
- **`llm-client.ts` template** — `LLMClient` now lives in `@soleri/core`
- Per-domain facade file generation — `createDomainFacades()` handles this at runtime

### Changed

- Entry point template shrunk from ~100 to ~60 lines (thin shell calling core factories)
- Only 5 agent-specific ops remain in generated code: `health`, `identity`, `activate`, `inject_claude_md`, `setup`
- `domain-manager.ts` detects v5.0 agents and skips facade file generation
- `knowledge-installer.ts` detects v5.0 agents and skips facade file generation
- `patching.ts` supports both v5.0 (array literal in `createDomainFacades()`) and v4.x (import anchors) formats
- Test template uses runtime factories instead of manual module initialization
- Scaffolded agents get new core features (e.g., Curator) via `npm update @soleri/core` — zero re-scaffolding

## @soleri/core@1.1.0 — 2026-03-04

### Added

- **Curator** — Vault self-maintenance module: duplicate detection (TF-IDF cosine similarity), contradiction scanning (pattern vs anti-pattern), tag normalization with alias registry, entry grooming, consolidation (archive stale, remove duplicates), changelog audit trail, health audit (0-100 score with coverage/freshness/quality/tag metrics)
- **Text utilities** — Extracted shared TF-IDF functions (`tokenize`, `calculateTf`, `calculateTfIdf`, `cosineSimilarity`) to `text/similarity.ts` for reuse across Brain and Curator
- 39 new Curator tests, 0 regressions in existing 162 tests

### Changed

- Brain module now imports TF-IDF utilities from `text/similarity.ts` instead of inlining them

## @soleri/forge@4.2.0 — 2026-03-04

### Added

- **8 curator ops** in generated core facade: `curator_status`, `curator_detect_duplicates`, `curator_contradictions`, `curator_resolve_contradiction`, `curator_groom`, `curator_groom_all`, `curator_consolidate`, `curator_health_audit`
- 7 curator facade tests in generated test template
- Curator initialization in generated entry point (after Brain, before LLM)

### Changed

- `createCoreFacade()` signature: added optional `curator` parameter (backwards compatible — all ops gracefully return error if curator not provided)

## @soleri/forge@4.2.2 — 2026-03-04

### Added

- **Cognee operation tests in generated agents** — scaffolded test suites now cover `cognee_status`, `cognee_sync`, and `graph_search` ops, verifying graceful degradation when Cognee is unavailable

## @soleri/core@2.0.1 — 2026-03-04

### Fixed

- **Cognee hybrid search cross-referencing** — Vector scores were always 0.000 because Cognee assigns its own UUIDs to chunks and strips embedded metadata during chunking. Replaced naive ID mapping with 4-tier matching: `[vault-id:]` prefix extraction, title first-line match, title substring match, and FTS5 fallback.
- Strategy 4 (FTS5 fallback) now preserves caller filters (domain/type/severity) to avoid reintroducing excluded entries
- Title-to-ID mapping handles duplicate titles correctly via `Map<string, string[]>`

## @soleri/forge@4.2.1 — 2026-03-04

### Fixed

- **Generated test template parameter shift** — `createCoreFacade()` calls in scaffolded agent tests were missing the `cognee` parameter (4th position), causing `llmClient` to land in the wrong slot and `llm_status` tests to fail with `isAvailable is not a function`
- Extracted `makeCoreFacade()` helper in generated tests to prevent future signature drift

## create-soleri@1.0.0 — 2026-03-04

### Added

- **`npm create soleri my-agent`** — Standard npm create shorthand for scaffolding agents
- Thin wrapper that delegates to `@soleri/cli` — no extra dependencies or configuration
- Supports all `@soleri/cli create` flags via pass-through args

## @soleri/core@2.0.0 — 2026-03-04

### Breaking Changes

- **`Brain.intelligentSearch()` is now async** — returns `Promise<RankedResult[]>` instead of `RankedResult[]`. All facade handlers already await results, so callers using the generated core facade are unaffected.
- **`Brain.getRelevantPatterns()` is now async** — same change, same safe migration.
- `ScoringWeights` and `ScoreBreakdown` now include a `vector` field (defaults to `0` without Cognee).

### Added

- **Cognee integration** — Optional hybrid search combining SQLite FTS5 with Cognee vector embeddings + knowledge graph
  - `CogneeClient` — HTTP client modeled after Salvador MCP's battle-tested Cognee integration
  - Auto-register/login auth with service account (no manual token setup required)
  - `CHUNKS` search type default (reliable with small local models unlike `GRAPH_COMPLETION`)
  - 120s search timeout (handles Ollama cold start), 5s health check, 30s general
  - Debounced cognify with 30s sliding window (coalesces rapid ingests)
  - Position-based scoring fallback when Cognee omits numeric scores
  - `CogneeConfig`, `CogneeSearchResult`, `CogneeStatus` types
  - Zero new npm dependencies (uses built-in `fetch`)
- **Hybrid scoring** — When Cognee is available, search uses 6-dimension scoring (semantic TF-IDF 0.25, vector 0.35, severity 0.1, recency 0.1, tag overlap 0.1, domain match 0.1). Without Cognee, original 5-dimension weights preserved.
- **`Brain.syncToCognee()`** — Bulk sync all vault entries to Cognee and trigger knowledge graph build
- **Fire-and-forget Cognee sync** on `enrichAndCapture()` — new entries automatically sent to Cognee when available
- Docker Compose config for self-hosted Cognee stack (`docker/docker-compose.cognee.yml`)

## @soleri/cli@1.0.1 — 2026-03-04

### Added

- **`checkCognee()`** in `soleri doctor` — Checks Cognee availability at localhost:8000, returns `warn` (not `fail`) if down

## @soleri/forge@4.2.0 (Cognee) — 2026-03-04

### Added

- Cognee initialization in generated entry points (mirrors LLM client pattern) with env var overrides (`COGNEE_URL`, `COGNEE_API_TOKEN`, `COGNEE_EMAIL`, `COGNEE_PASSWORD`)
- Background vault-to-Cognee sync on agent startup when Cognee is available
- 3 new core facade operations: `cognee_status`, `cognee_sync`, `graph_search`
- `graph_search` defaults to `CHUNKS` search type (configurable via `searchType` param)

### Changed

- `createCoreFacade()` signature now accepts optional `CogneeClient` parameter
- `search` op handler now awaits `brain.intelligentSearch()` (async)

## @soleri/cli@1.0.0 — 2026-03-04

Initial release of the developer CLI.

### Added

- **`soleri create [name]`** — Interactive wizard using @clack/prompts to scaffold new agents. Supports `--config <path>` for non-interactive mode
- **`soleri list [dir]`** — Formatted table of agents in a directory with ID, domains, build status, and dependency status
- **`soleri add-domain <domain>`** — Add a new knowledge domain to an existing agent (creates bundle, generates facade, patches index.ts + claude-md-content.ts, rebuilds)
- **`soleri install-knowledge <pack>`** — Install knowledge packs from a local path into the agent in the current directory
- **`soleri dev`** — Run the agent in development mode via `npx tsx src/index.ts` with inherited stdio
- **`soleri doctor`** — Health check: Node.js version, npm, tsx, agent project detection, dependencies, build status, MCP registration
- **`soleri hooks add <editor>`** — Generate editor-specific hooks/config for claude-code, cursor, windsurf, or copilot
- **`soleri hooks remove <editor>`** — Remove editor hooks/config files
- **`soleri hooks list`** — Show which editor hooks are currently installed
- Input sanitization for agent IDs in shell hook commands
- Error handling with try/catch wrappers around forge API calls
- 51 tests across 7 test files

## @soleri/forge@4.1.0 — 2026-03-04

### Added

- **`addDomain()` function** — Programmatic API to add a knowledge domain to an existing agent (new `domain-manager.ts`)
- **`add_domain` forge operation** — MCP-accessible op wrapping `addDomain()` for AI-side parity
- **`./lib` export path** — `import { scaffold, addDomain, ... } from '@soleri/forge/lib'` for programmatic access without starting the MCP server
- **`patching.ts`** — Extracted `patchIndexTs()` and `patchClaudeMdContent()` from knowledge-installer for reuse

### Changed

- `addDomain` reports failure when source file patching fails (not just build failures)
- Malformed `package.json` in agent projects returns a structured error instead of throwing

## @soleri/core@1.0.0 — 2026-03-04

Initial release of the shared engine package.

### Added

- **Vault** — SQLite + FTS5 full-text search with BM25 ranking, domain-separated knowledge store, project registration, memory system
- **Brain** — TF-IDF 5-dimension scoring (semantic, severity, recency, tag overlap, domain match), auto-tagging, duplicate detection, adaptive weights via feedback
- **Planner** — JSON-file state machine (draft → approved → executing → completed) with task tracking
- **LLM utilities** — `SecretString`, `LLMError`, `CircuitBreaker` (closed/open/half-open), `retry()` with exponential backoff + jitter, `parseRateLimitHeaders()`
- **KeyPool** — Multi-key rotation with per-key circuit breakers, preemptive quota rotation, `loadKeyPoolConfig(agentId)` for agent-specific key paths
- **Facade system** — `OpHandler`, `FacadeConfig`, `registerFacade()`, `registerAllFacades()` for MCP tool registration
- **Intelligence loader** — `loadIntelligenceData()` with bundle validation and graceful error handling
- 162 tests covering all modules

## @soleri/forge@4.0.0 — 2026-03-04

### Breaking Changes

- Generated agents now depend on `@soleri/core` instead of carrying inlined copies of vault, brain, planner, LLM, and facade infrastructure
- Generated `package.json` includes `@soleri/core: ^1.0.0` and removes direct `better-sqlite3` dependency
- `loadKeyPoolConfig()` in generated entry points now requires `agentId` parameter

### Changed

- Scaffolder generates ~15 config-driven files instead of ~30 (10 static modules + 5 test files removed)
- Templates updated to `import { Vault, Brain, Planner, ... } from '@soleri/core'` instead of local paths
- Removed directory creation for `src/vault/`, `src/brain/`, `src/planning/` (now in core)
- Test suite reduced from 6 generated test files to 1 (`facades.test.ts`); static module tests live in `@soleri/core`

### Migration

- **Existing v3.x agents are unaffected** — they keep their local copies and have no dependency on `@soleri/core`
- New agents scaffolded with v4.0 require `npm install` to pull `@soleri/core`
- To upgrade a v3.x agent manually: replace local `src/vault/`, `src/brain/`, `src/planning/`, `src/llm/{types,utils,key-pool}.ts`, `src/facades/{types,facade-factory}.ts`, `src/intelligence/{types,loader}.ts` with imports from `@soleri/core`

## @soleri/forge@3.0.0

Previous release — standalone agents with all code inlined. See [git history](https://github.com/adrozdenko/soleri/commits/main) for details.
