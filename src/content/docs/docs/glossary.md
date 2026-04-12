---
title: Glossary
description: Key terms and concepts used throughout the Soleri documentation.
---

### Agency

Proactive mode where your agent watches file changes and surfaces relevant vault patterns without being asked. Enable with `agency_enable`, configure watch paths and thresholds. See [Capabilities — Agency](/docs/capabilities/#agency).

### Anti-pattern

A known bad approach stored in the vault. Surfaces in searches to warn you away from repeating past mistakes. See types under [Entry Types](#entry-types).

### Archive

The vault archival system. Stores snapshots of vault state, supports backup and restore, and enables vault optimization (compaction, cleanup). Managed via the archive facade. See [Sync & Export](/docs/guides/vault-sync/) and [Capabilities — Archive](/docs/capabilities/#archive).

### Auth level

Permission required to call an operation — `read` (query data), `write` (add/modify data), or `admin` (delete data, reset state). Enforced at tool registration. See [Security & Privacy](/docs/guides/security/).

### Branching

Vault branching — create isolated copies of vault state to experiment without affecting the main vault. Branches can be merged back or discarded. See [Vault Branching](/docs/guides/vault-branching/) and [Capabilities — Branching](/docs/capabilities/#branching).

### Brain

The intelligence layer on top of the vault. Tracks pattern strength, maintains TF-IDF vocabulary, and provides recommendations for plans. See [Under the Hood](/docs/guides/under-the-hood/#the-brain).

### Chat facade

The facade for chat transport integration — sessions, authentication, response chunking, voice transcription/synthesis, browser isolation, notifications, and message queue. Powers Telegram bots, web chat, and other conversational interfaces. See [Capabilities — Chat](/docs/capabilities/#chat).

### Compound loop

The self-reinforcing cycle: capture &rarr; vault &rarr; brain &rarr; plans &rarr; work &rarr; knowledge extraction &rarr; vault. Each cycle makes the next one better. See [The Knowledge-Driven Approach](/docs/guides/knowledge-driven-development/#the-compound-loop).

### Context facade

Entity extraction, knowledge retrieval, and context analysis. Analyzes prompts to extract files, functions, domains, and technologies, then retrieves relevant knowledge from vault and brain. Used internally by the orchestrator. See [Capabilities — Context](/docs/capabilities/#context).

### Curator

Automated maintenance system that keeps the vault clean — deduplication, contradiction detection, decay scanning, health audits, tag normalization, LLM enrichment. See [Under the Hood](/docs/guides/under-the-hood/#the-curator).

### Decay

The gradual reduction of an unused pattern's strength score over time. Ensures stale knowledge doesn't outrank actively useful patterns.

### Dream

Automatic memory consolidation, vault cleanup, and maintenance. The dream facade runs background processes that deduplicate entries, archive stale knowledge, and resolve contradictions. See [Capabilities — Dream](/docs/capabilities/#dream).

### Domain pack

A standalone community npm package that adds specialized operations and knowledge for a specific domain (e.g., `@soleri/domain-design`, `@soleri/domain-code-review`). Each pack has its own repository and release cycle. Install with `soleri pack add <name>` and register in `agent.yaml`. See [Domain Packs](/docs/guides/domain-packs/) and [Customizing Your Agent](/docs/guides/customizing/#domain-packs).

### Domain

A knowledge area (e.g., `frontend`, `security`, `infrastructure`). Each domain gets its own search partition and facade with 5 operations. Added via `npx @soleri/cli add-domain <name>`. See [Customizing Your Agent](/docs/guides/customizing/#adding-domains).

### Domain facade

An MCP tool entry point scoped to a single domain. Each domain facade exposes 5 operations: `get_patterns`, `search`, `get_entry`, `capture`, `remove`.

### Drift

The difference between what a plan intended and what actually happened during execution. Measured during reconciliation. Low drift means the plan was accurate; high drift means reality diverged. See [Planning](/docs/guides/planning/#step-4-reconciliation).

### Embedding

Embedding management for the vault's vector search layer. Provides status checks, batch rebuilds, and single-entry embedding operations. See [Capabilities — Embedding](/docs/capabilities/#embedding).

### Entry types

The kind of knowledge stored in the vault: `pattern`, `anti-pattern`, `rule`, `playbook`, `workflow`, `principle`, `reference`.

### Facade

A single MCP tool entry point that dispatches to multiple operations via the `op` parameter. Every agent has 22 semantic facades plus one per domain. See [API Reference](/docs/api-reference/#how-facades-work).

### FTS5

SQLite's Full-Text Search extension, version 5. Powers the vault's text search with porter tokenizer for stemming.

### Gate

An approval checkpoint in a plan or loop. Plans have a two-gate system (approve plan, then approve tasks). Loops use gates to decide whether to continue iterating.

### Governance

Controls how knowledge enters the vault — capture quotas, proposal gates, duplicate detection, and decay policies. Presets: `strict`, `moderate`, `permissive`. See [Customizing Your Agent](/docs/guides/customizing/#governance-policies).

### Hook

A quality gate that runs automatically during development. Checks code against rules (e.g., no `console.log`, no `any` types) and blocks violations. Installed via `npx @soleri/cli hooks`. See [Customizing Your Agent](/docs/guides/customizing/#hooks).

### Intake

The facade for ingesting external content (URLs, text, PDFs, books, batch imports) into the vault. Content is chunked, analyzed, and converted into structured knowledge entries. See [Content Ingestion](/docs/guides/content-ingestion/) and [Capabilities — Intake](/docs/capabilities/#intake).

### Links

The vault linking system (Zettelkasten connections). Entries are linked with typed relationships (`extends`, `supports`, `contradicts`, `sequences`). Links enable graph traversal and orphan detection. See [Entry Linking & Knowledge Graph](/docs/guides/entry-linking/) and [Capabilities — Links](/docs/capabilities/#links).

### Knowledge extraction

The automatic process where the brain examines a completed plan session — tools used, files modified, outcomes — and proposes reusable patterns back into the vault.

### Knowledge pack

A bundle of pre-built knowledge entries (patterns, anti-patterns, principles) that can be installed into an agent. See [Customizing Your Agent](/docs/guides/customizing/#knowledge-packs).

### Loop

An iterative validation cycle (do &rarr; validate &rarr; fix &rarr; repeat) that converges on a quality target. Built-in modes: `component-build`, `plan-iteration`, `custom`. See [Validation Loops](/docs/guides/loops/).

### Operator

The engine module that tracks the human operator's profile — expertise levels, corrections, interests, and work patterns. Learns silently from interactions and adapts agent behavior over time. See [Operator Learning](/docs/guides/operator-learning/) and [Capabilities](/docs/capabilities/#operator).

### Pack authoring

The process of creating installable capability bundles (knowledge packs, domain packs, hook packs, skill packs) for distribution. Packs are npm packages or local folders that follow the Soleri pack schema. See [Creating Packs](/docs/guides/pack-authoring/).

### MCP (Model Context Protocol)

The protocol that connects your agent to your AI editor. Your agent registers tools over MCP; your AI editor calls them based on your conversation.

### MCP Bridge

A chat facade subsystem that allows local tool execution from chat platforms (Telegram, web). Registered tools can be called via the bridge with output compression for display. See [Capabilities — Chat](/docs/capabilities/#mcp-bridge).

### Pattern

A proven approach stored in the vault. Surfaces in searches and brain recommendations to guide future work.

### Pattern strength

A score (0.0–1.0) tracked by the brain. Increases when a pattern is used successfully; decreases with disuse (decay) or drift. Higher strength means more confident recommendations.

### Playbook

A multi-step procedure with validation criteria at each step. Created from repeated workflows, run on demand. Supports start, step, complete, and match operations. See [Planning](/docs/guides/planning/#playbooks-repeatable-plans).

### RateLimiter

Transport-level request throttling. Tracks per-client request counts within configurable time windows and blocks requests that exceed the limit. See [Transports](/docs/guides/transports/#rate-limiting).

### Review

A governance workflow where vault entries can be submitted for review, approved, or rejected before becoming active. Used in `strict` governance mode to gate knowledge quality. See [Knowledge Review Workflow](/docs/guides/knowledge-review/) and [Customizing Your Agent](/docs/guides/customizing/#governance-policies).

### Routing

The control module's intent detection system. Analyzes user messages to classify intent (BUILD, FIX, REVIEW, PLAN, IMPROVE, DELIVER) and route to the appropriate workflow. See [Capabilities — Control](/docs/capabilities/#control).

### Reconciliation

The step after plan execution where the agent compares what was planned vs. what happened. Produces a drift report and accuracy score. Feeds the knowledge loop.

### SessionManager

Transport-level session tracking. Manages client sessions with TTL-based expiry, unique ID generation, and automatic reaping of expired sessions. See [Transports](/docs/guides/transports/#session-management).

### Skills

SKILL.md files that define reusable capabilities for an agent. Each skill has YAML frontmatter (name, trigger phrases, description) and a markdown body with instructions. Installed in the agent's `skills/` folder. See [Skills Catalog](/docs/guides/skills-catalog/).

### Sync

The facade for synchronizing vault state with external systems — git push/pull for vault backup, Obsidian sync for knowledge management interop. See [Sync & Export](/docs/guides/vault-sync/) and [Capabilities — Sync](/docs/capabilities/#sync).

### Severity

Priority level of a vault entry: `critical` (must follow), `warning` (should follow), `suggestion` (nice to have). Affects search ranking — critical entries always surface first.

### Tier

Multi-tier vault connections. Connect external knowledge sources (other vaults, databases) and search across all tiers simultaneously. See [Capabilities — Tier](/docs/capabilities/#tier).

### TF-IDF

Term Frequency–Inverse Document Frequency. A text ranking algorithm that weights terms by rarity. "Authentication" scores higher than "the" because it's more meaningful. The brain maintains a TF-IDF index across all vault entries.

### Transport

The communication layer between your agent and its clients. Soleri supports four transports: **stdio** (MCP for your AI editor), **HTTP/SSE** (REST APIs with Server-Sent Events), **WebSocket** (bidirectional streaming), and **LSP** (Language Server Protocol for editors). See [Transports](/docs/guides/transports/).

### Vault

The agent's long-term knowledge store. A SQLite database with FTS5 full-text search. Stores structured entries (patterns, anti-patterns, rules) organized by domain and severity. Supports branching, scoping, sharing, and multi-tier connections. See [Under the Hood](/docs/guides/under-the-hood/#the-vault).

### Workspace

The project directory where an agent is scaffolded and runs. Contains `agent.yaml`, `instructions/`, `workflows/`, `knowledge/`, `skills/`, and auto-generated files (`CLAUDE.md`, `AGENTS.md`).

### YOLO mode

Autonomous execution mode where the agent skips plan approval gates but preserves all safety invariants (tests, verification). Launch with `soleri yolo` or activate in conversation by saying "go yolo". See [YOLO Mode](/docs/guides/yolo-mode/).

### Vault branch

An isolated copy of vault state for experimentation. Create a branch, add entries, and merge back — or delete without affecting the main vault. See [Vault Branching](/docs/guides/vault-branching/) and [Capabilities — Branching](/docs/capabilities/#branching).

---

_Back to [Your Agent — Quick Reference](/docs/your-agent/) or explore [Capabilities](/docs/capabilities/) for the full operation list._
