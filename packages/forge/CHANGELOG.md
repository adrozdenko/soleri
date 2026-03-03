# Changelog

All notable changes to Agent Forge are documented here.

## [2.1.0] - 2026-02-28

Feature release — knowledge pack installer. Agents can now receive pre-built domain knowledge after scaffolding.

### Added

- **Knowledge Pack Installer (`forge op:install_knowledge`)** — Install intelligence bundles into existing agents in a single operation. Validates bundles, copies data files, generates domain facades, patches `src/index.ts` and `src/activation/claude-md-content.ts`, and rebuilds the agent
- **Architecture detection** — Installer detects vault+brain vs vault-only agents and generates appropriately typed facades (`brain.intelligentSearch()` vs `vault.search()`)
- **Vault-only facade generator** — `generateVaultOnlyDomainFacade()` produces facades matching older agent patterns that use raw vault queries
- **Source file patching** — Regex-based patching for `index.ts` (imports + facade array) and `claude-md-content.ts` (facade table rows) with fallback anchors for older agent formats
- **Bundle validation** — Validates domain, version, and all entry fields (id, type, domain, title, severity, description, tags) before installation. Partial success supported — valid bundles install even if others fail
- **`InstallKnowledgeResult` type** — Structured result with counts, domain lists, patched files, build output, and warnings
- **Knowledge installer test suite** — 35 tests covering validation, bundle handling, copying, facade generation, source patching, and integration

### Changed

- `pascalCase()` and `capitalize()` in `src/templates/domain-facade.ts` are now exported for reuse
- Agent-forge tests: 56 (was 21)
- Forge operations: 5 (was 4)

## [2.0.1] - 2026-02-20

Patch release — 8 bug fixes found during code audit.

### Fixed

- **`listAgents` runtime crash** — Used `require()` in ESM module; replaced with already-imported `readFileSync`
- **`parseResetDuration` double-counting** — Seconds regex `/(\d+)s/` matched the trailing "s" in "200ms", producing 200,200ms instead of 200ms; reordered to check `ms` first with lookbehind
- **`process.env.HOME || '~'` fallback** — `path.join('~', ...)` doesn't expand tildes; replaced with `homedir()` from `node:os` in generated key-pool and LLM client
- **Undefined `$MCP_FILE` in setup script** — Referenced undefined bash variable with `set -u` active; replaced with literal `~/.claude/settings.json`
- **`rotateOnError` race condition** — Circuit breaker was tripped via fire-and-forget async; added synchronous `recordFailure()` method to `CircuitBreaker`
- **`rotatePreemptive` misleading log** — Logged `this.activeIndex` after mutation; now captures previous index before rotation
- **`validateEntry` silently dropping entries** — Required `tags.length > 0` but type allows empty arrays; removed length requirement
- **Dead code** — Removed unused `personaPath` variable in `listAgents`

### Added

- `CircuitBreaker.recordFailure()` — Synchronous failure recording for use by KeyPool
- Generated agent README: "Populating Your Agent" section (conversational, bulk, JSON methods)
- Generated agent README: "Why {name}" value proposition, expanded "How to Use" with daily workflow, "Growing Your Agent" section

## [2.0.0] - 2026-02-20

Major release. Agents now ship with an intelligence layer (Brain) and optional LLM infrastructure — every generated agent is smarter out of the box.

### Added

- **Intelligence Layer (Brain)** — TF-IDF hybrid scoring across 5 dimensions: semantic similarity (40%), severity (15%), recency (15%), tag overlap (15%), domain match (15%). Auto-tags entries on capture. Detects duplicates before writing (blocks at >= 0.8, warns at >= 0.6). Adaptive weight tuning after 30+ feedback entries
- **LLM Client** — Unified OpenAI/Anthropic caller with multi-key rotation, per-key circuit breakers (threshold 3, reset 30s), shared provider breaker (threshold 5, reset 60s), exponential backoff with jitter, and model routing. Optional — agents work without API keys
- **Key Pool** — Multi-key management for OpenAI with preemptive quota rotation (threshold 50). Loads from `~/.{agentId}/keys.json` or falls back to env vars
- **Model Router** — Routes LLM calls by caller/task. Reads `~/.{agentId}/model-routing.json` for custom routing rules
- **SecretString** — Credential wrapper using ES2022 private fields. Prevents key leakage in JSON.stringify, console.log, template literals, and Node inspect
- **Circuit Breaker** — 3-state protection (closed/open/half-open) for external service calls. Only counts retryable errors toward threshold
- **Rate Limit Parser** — Parses OpenAI `x-ratelimit-remaining-requests`, `x-ratelimit-reset-requests`, and `retry-after` headers for quota tracking
- **Brain ops** — `record_feedback`, `rebuild_vocabulary`, `brain_stats` on core facade
- **`llm_status` op** — Provider availability, key pool status (per-key circuit breaker states), model routing config
- **LLM test suite** — ~51 tests covering SecretString, CircuitBreaker states, retry, rate limits, KeyPool rotation, LLMClient availability
- **Brain test suite** — ~38 tests covering TF-IDF scoring, auto-tagging, duplicate detection, adaptive weights
- **Roadmap** — Each generated agent README includes an 8-item improvement roadmap: curator, intake, learning, embeddings, cross-project memory, context engine, proactive agency, plugin system

### Changed

- Domain facades now use Brain for search (`intelligentSearch`) and capture (`enrichAndCapture` with auto-tags and dedup) instead of raw vault queries
- Core facade signature expanded: `createCoreFacade(vault, planner, brain, llmClient?, openaiKeyPool?, anthropicKeyPool?)`
- Generated agents include `@anthropic-ai/sdk` as a dependency
- Activation triggers normalized: "Hola/Adios" → "Hello/Goodbye"
- Vault schema adds `brain_vocabulary` and `brain_feedback` tables
- Total core ops per agent: 24 (was 20)
- Total generated tests per 3-domain agent: ~220 (was ~120)
- Agent-forge tests: 21 (was 19)
- Template generators: 27 (was 22)
- Generated files per agent: ~37 (was ~30)

## [1.0.0] - 2026-02-19

First stable release. Forge is a pure scaffolding tool — knowledge-agnostic, zero opinions on content. It builds the infrastructure; you fill in the expertise.

### Added

- **MCP Server** — Agent Forge runs as an MCP server with a single `forge` tool and 4 operations: `guide`, `preview`, `create`, `list_agents`
- **Scaffolding Engine** — Generates 30 files per agent from 22 TypeScript template generators
- **Knowledge Vault** — Each agent gets SQLite storage with FTS5 full-text search and BM25 ranking. Domains start empty
- **Domain Facades** — Each knowledge domain becomes its own MCP tool with `get_patterns`, `search`, `get_entry`, `capture`, and `remove` operations
- **Core Facade** — 20 shared operations including search, vault stats, health, identity, activation, memory, session capture, export, and planning
- **Memory System** — Three memory types (session, lesson, preference) with FTS5 search, stored in the vault database
- **Session Capture** — PreCompact hook auto-captures session summaries before Claude Code compacts context
- **Planning Engine** — JSON-backed state machine with 4 plan states (draft, approved, executing, completed) and 5 task states (pending, in_progress, completed, skipped, failed)
- **Export** — Dumps vault entries back to JSON intelligence bundles for version control and sharing
- **Activation System** — Persona-based activation with automatic CLAUDE.md injection
- **Project Registration** — Agents track which projects they're advising and surface context on activation
- **Setup Script** — One-command install, build, and `claude mcp add --scope user` registration
- **Test Generation** — 4 test suites per agent (vault, loader, facades, planner) totaling 120+ tests
- **README Generation** — Each agent gets a complete README with quick start, domains, principles, and commands
- **Zod Validation** — All agent configs validated at creation time with clear error messages
