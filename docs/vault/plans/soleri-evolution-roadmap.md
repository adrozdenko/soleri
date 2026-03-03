# Soleri Evolution Roadmap

**Type:** plan
**Domain:** architecture
**Status:** approved
**Tags:** roadmap, evolution, core, cli, plugins, knowledge-packs

## Current State (v3.0.0)

Soleri Forge scaffolds standalone agents by copying 35 files. Each agent is self-contained — vault, brain, planner, memory, LLM client are duplicated. Salvador MCP is the reference persona, built by hand.

## The Architectural Shift

Agents go from **copied code** to **shared runtime**. The core engine becomes a dependency, agents become thin config + domain facades.

---

## Phase 1: `@soleri/core` — Shared Engine

**Goal:** Extract the common runtime into `packages/core`.

**Modules:**
- `vault/` — SQLite + FTS5 storage and search
- `brain/` — TF-IDF intelligence layer, auto-tagging, duplicate detection
- `planner/` — Plan state machine (draft → approve → execute → complete)
- `memory/` — Session persistence, cross-session recall
- `llm/` — Multi-provider client (OpenAI/Anthropic) with key rotation and circuit breakers
- `activation/` — Persona injection, CLAUDE.md management

**Source of truth:** Salvador MCP's implementations (most battle-tested).

**Impact on Forge:** Generated agents become thin — config + domain facades + `@soleri/core` dependency. Updates to core benefit all agents without re-scaffolding.

**Deliverable:** `@soleri/core` published to npm.

---

## Phase 2: `@soleri/cli` — Developer CLI

**Goal:** Developer-facing CLI alongside Forge's MCP interface.

**Commands:**
- `npx @soleri/cli create <name> --role "..."` — scaffold an agent
- `npx @soleri/cli add-domain <domain>` — add a knowledge domain
- `npx @soleri/cli install-knowledge <pack>` — install knowledge packs
- `npx @soleri/cli dev` — run agent locally
- `npx @soleri/cli doctor` — health check

**Coexistence:** Forge = AI creates agents via conversation. CLI = developers create agents via terminal.

**Deliverable:** `@soleri/cli` published to npm.

---

## Phase 3: Knowledge Packs as Packages

**Goal:** Move from file-based bundles to npm-distributed knowledge.

**Format:**
- `@soleri/knowledge-security` — security patterns and anti-patterns
- `@soleri/knowledge-accessibility` — WCAG, a11y rules
- `@soleri/knowledge-react-patterns` — component patterns
- Community: `soleri-knowledge-*` convention

**Discovery:** Auto-discovered from `node_modules` at agent startup. Loaded into vault.

**Deliverable:** Knowledge pack SDK + first official packs.

---

## Phase 4: Plugin System

**Goal:** Runtime-extensible agents.

**Plugin types:**
- `@soleri/plugin-github` — PR review, issue triage
- `@soleri/plugin-figma` — Design token sync
- `@soleri/plugin-telegram` — Chat interface (extracted from Salvador)
- `@soleri/plugin-embeddings` — Vector search alongside TF-IDF

**Capabilities:** Plugins register facades, hooks, and capabilities. Hot-reloadable.

**Deliverable:** `@soleri/plugin-sdk` + reference plugins.

---

## Phase 5: Salvador as Reference Persona

**Goal:** Prove Soleri can generate a production-grade agent equivalent to hand-built Salvador MCP.

**Approach:**
- Extract Salvador's persona, knowledge, and design system intelligence into Soleri-native format
- `npx @soleri/cli create salvador --from @soleri/persona-salvador`
- Generated Salvador should match hand-built Salvador in capability

**Deliverable:** `@soleri/persona-salvador` — the reference implementation.

---

## Target Monorepo Structure

```
soleri/
├── packages/
│   ├── core/              ← @soleri/core (shared engine)
│   ├── forge/             ← @soleri/forge (MCP scaffolder)
│   ├── cli/               ← @soleri/cli (developer CLI)
│   ├── create-soleri/     ← @soleri/create (npx create-soleri)
│   └── plugin-sdk/        ← @soleri/plugin-sdk (plugin authoring)
├── knowledge-packs/
│   ├── security/          ← @soleri/knowledge-security
│   ├── accessibility/     ← @soleri/knowledge-accessibility
│   └── ...
├── personas/
│   ├── salvador/          ← @soleri/persona-salvador
│   └── ...
├── website/
└── docs/
```

## Priority Order

Phase 1 is the foundation — everything else depends on the shared engine existing. Each subsequent phase builds on the previous.
