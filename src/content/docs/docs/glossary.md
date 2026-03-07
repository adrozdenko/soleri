---
title: Glossary
description: Key terms and concepts used throughout the Soleri documentation.
---

### Anti-pattern

A known bad approach stored in the vault. Surfaces in searches to warn you away from repeating past mistakes. See types under [Entry Types](#entry-types).

### Auth level

Permission required to call an operation — `read` (query data), `write` (add/modify data), or `admin` (delete data, reset state). Enforced at tool registration. See [Security & Privacy](/docs/guides/security/).

### Brain

The intelligence layer on top of the vault. Tracks pattern strength, maintains TF-IDF vocabulary, and provides recommendations for plans. See [Under the Hood](/docs/guides/under-the-hood/#the-brain).

### Cognee

Optional open-source knowledge graph engine that adds vector similarity search alongside TF-IDF. See [Cognee Integration](/docs/guides/cognee/).

### Cognify

The process where Cognee converts vault entries into vector embeddings and knowledge graph connections. Runs automatically with debounced scheduling after captures.

### Compound loop

The self-reinforcing cycle: capture &rarr; vault &rarr; brain &rarr; plans &rarr; work &rarr; knowledge extraction &rarr; vault. Each cycle makes the next one better. See [The Knowledge-Driven Approach](/docs/guides/knowledge-driven-development/#the-compound-loop).

### Curator

Automated maintenance system that keeps the vault clean — deduplication, decay scanning, health audits, tag normalization. See [Under the Hood](/docs/guides/under-the-hood/#the-curator).

### Decay

The gradual reduction of an unused pattern's strength score over time. Ensures stale knowledge doesn't outrank actively useful patterns.

### Domain

A knowledge area (e.g., `frontend`, `security`, `infrastructure`). Each domain gets its own search partition and facade with 5 operations. Added via `npx @soleri/cli add-domain <name>`. See [Customizing Your Agent](/docs/guides/customizing/#adding-domains).

### Domain facade

An MCP tool entry point scoped to a single domain. Each domain facade exposes 5 operations: `get_patterns`, `search`, `get_entry`, `capture`, `remove`.

### Drift

The difference between what a plan intended and what actually happened during execution. Measured during reconciliation. Low drift means the plan was accurate; high drift means reality diverged. See [Planning](/docs/guides/planning/#step-4-reconciliation).

### Entry types

The kind of knowledge stored in the vault: `pattern`, `anti-pattern`, `rule`, `playbook`, `workflow`, `principle`, `reference`.

### Facade

A single MCP tool entry point that dispatches to multiple operations via the `op` parameter. Every agent has a core facade and one facade per domain. See [API Reference](/docs/api-reference/#how-facades-work).

### FTS5

SQLite's Full-Text Search extension, version 5. Powers the vault's text search with porter tokenizer for stemming.

### Gate

An approval checkpoint in a plan or loop. Plans have a two-gate system (approve plan, then approve tasks). Loops use gates to decide whether to continue iterating.

### Governance

Controls how knowledge enters the vault — capture quotas, proposal gates, duplicate detection, and decay policies. Presets: `strict`, `moderate`, `permissive`. See [Customizing Your Agent](/docs/guides/customizing/#governance-policies).

### Hook

A quality gate that runs automatically during development. Checks code against rules (e.g., no `console.log`, no `any` types) and blocks violations. Installed via `npx @soleri/cli hooks`. See [Customizing Your Agent](/docs/guides/customizing/#hooks).

### Knowledge extraction

The automatic process where the brain examines a completed plan session — tools used, files modified, outcomes — and proposes reusable patterns back into the vault.

### Knowledge pack

A bundle of pre-built knowledge entries (patterns, anti-patterns, principles) that can be installed into an agent. See [Customizing Your Agent](/docs/guides/customizing/#knowledge-packs).

### Loop

An iterative validation cycle (do &rarr; validate &rarr; fix &rarr; repeat) that converges on a quality target. Built-in modes: `component-build`, `plan-iteration`, `custom`. See [Validation Loops](/docs/guides/loops/).

### MCP (Model Context Protocol)

The protocol that connects your agent to Claude Code. Your agent registers tools over MCP; Claude Code calls them based on your conversation.

### Pattern

A proven approach stored in the vault. Surfaces in searches and brain recommendations to guide future work.

### Pattern strength

A score (0.0–1.0) tracked by the brain. Increases when a pattern is used successfully; decreases with disuse (decay) or drift. Higher strength means more confident recommendations.

### Playbook

A multi-step procedure with validation criteria at each step. Created from repeated workflows, run on demand. Each execution creates a full plan with brain recommendations. See [Planning](/docs/guides/planning/#playbooks-repeatable-plans).

### Reconciliation

The step after plan execution where the agent compares what was planned vs. what happened. Produces a drift report and accuracy score. Feeds the knowledge loop.

### Severity

Priority level of a vault entry: `critical` (must follow), `warning` (should follow), `suggestion` (nice to have). Affects search ranking — critical entries always surface first.

### TF-IDF

Term Frequency–Inverse Document Frequency. A text ranking algorithm that weights terms by rarity. "Authentication" scores higher than "the" because it's more meaningful. The brain maintains a TF-IDF index across all vault entries.

### Vault

The agent's long-term knowledge store. A SQLite database with FTS5 full-text search. Stores structured entries (patterns, anti-patterns, rules) organized by domain and severity. See [Under the Hood](/docs/guides/under-the-hood/#the-vault).

---

_Back to [Your Agent — Quick Reference](/docs/your-agent/) or explore [Capabilities](/docs/capabilities/) for the full operation list._
