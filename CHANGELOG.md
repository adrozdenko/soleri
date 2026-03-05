# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
