# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## create-soleri@1.0.0 — 2026-03-04

### Added

- **`npm create soleri my-agent`** — Standard npm create shorthand for scaffolding agents
- Thin wrapper that delegates to `@soleri/cli` — no extra dependencies or configuration
- Supports all `@soleri/cli create` flags via pass-through args

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
