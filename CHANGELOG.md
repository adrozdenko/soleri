# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
