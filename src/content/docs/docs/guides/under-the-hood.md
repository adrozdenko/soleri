---
title: 'Under the Hood'
description: 'How the vault, brain, and memory actually work.'
---

Your Soleri agent is an MCP tool server. It runs locally, stores everything in files on your machine, and exposes tools that your AI editor calls when needed. This page explains how each piece works so you can trust what's happening.

## Your agent is a tool server

When your AI editor starts, it launches your agent as a child process. The agent registers its tools (22 engine modules with 350+ operations) over the Model Context Protocol (MCP).

Your AI editor decides when to call these tools based on your conversation. When you ask "what do we know about error handling?", your AI editor recognizes this as a knowledge question and calls the agent's `search_intelligent` tool. The agent returns ranked results, and your AI editor uses them in its response.

The agent never acts on its own. It only responds to tool calls from your AI editor.

## The vault

The vault is a SQLite database with FTS5 (full-text search) enabled. It stores knowledge entries (patterns, anti-patterns, rules, playbooks) as structured records.

Each entry has:

- Type: pattern, anti-pattern, rule, playbook, workflow, principle, reference
- Domain: the knowledge area (frontend, security, infrastructure, or your custom domains)
- Severity: critical, warning, or suggestion
- Tags: free-form labels for discovery
- Description: the actual knowledge, in your words

The vault file lives in your agent's data directory. It's a regular SQLite file. You can inspect it with any SQLite client if you're curious.

### How search works

When your AI editor calls the search tool, the agent doesn't just do a keyword match. It combines six signals into a single relevance score:

| Signal                    | What it measures                                                      |
| ------------------------- | --------------------------------------------------------------------- |
| **TF-IDF text relevance** | How well the query matches the entry's text, weighted by term rarity |
| **Severity weight**       | Critical entries get a boost over suggestions                         |
| **Recency**               | Recently added or modified entries rank slightly higher               |
| **Tag overlap**           | Entries whose tags match the query context score higher               |
| **Domain match**          | Entries in the matching domain get a boost                            |
| **Usage history**         | Entries that have been useful before rank higher over time            |

This is why a critical security pattern about JWT storage outranks a suggestion about loading spinners when you search for "authentication", even if both mention tokens.

For the full technical deep dive (FTS5 configuration, BM25 weights, hybrid vector search, adaptive weight learning, and federated tier search), see [Search Architecture](/docs/guides/search-architecture/).

## The brain

The brain sits on top of the vault. It tracks which patterns actually work and uses that information to improve recommendations.

### Pattern strength

Every vault entry has a strength score tracked by the brain. Strength increases when:

- The pattern is found in a search and used in work
- A plan that included this pattern completes successfully
- You give positive feedback on a search result

Strength decreases when:

- The pattern is found but dismissed
- Plans that used the pattern have high drift (things didn't go as planned)
- The entry goes unused for a long period (decay)

### TF-IDF vocabulary

The brain maintains a TF-IDF (Term Frequency-Inverse Document Frequency) index across all vault entries. This is what makes search work well: it knows that "authentication" is more meaningful than "the" and ranks accordingly.

The index rebuilds automatically when you add entries. You can trigger a manual rebuild after bulk imports.

### Recommendations

When the agent creates a plan, it asks the brain: "what patterns are relevant to this task?" The brain returns recommendations ranked by strength. A pattern with strength 0.9 (proven across many successful sessions) gets recommended more confidently than one with strength 0.3 (untested).

These recommendations appear as decisions in the plan. The agent tells you what it knows before you start working.

### Knowledge extraction

After a plan completes, the brain examines the session and proposes new knowledge. Here's the process:

1. Session scan: the brain reviews the session record. Which tools were called, what files were modified, how long each step took, and whether the outcome matched the plan.
2. Pattern detection: it looks for repeatable signals. The same tool sequence appearing across multiple sessions, steps that consistently take longer than estimated (planning insight), and solutions that resolved drift in past plans.
3. Proposal generation: detected patterns are proposed as new vault entries with auto-inferred type, severity, and tags. They enter the governance pipeline. In `moderate` mode, suggestions are auto-approved while warnings and critical entries go to proposal review.
4. Strength initialization: newly extracted patterns start with a moderate strength score. If the same pattern is independently extracted from multiple sessions, its confidence increases.

This is the automatic part of the compound loop. You don't have to manually capture everything. The brain finds patterns in your work and proposes them. You can review what was extracted after any plan completes:

> **You:** "What patterns were extracted from the last session?"
>
> **Agent:** _2 patterns proposed: "GraphQL resolvers should validate input before calling service layer" (auto-approved, suggestion), "Always add deprecation headers before removing REST endpoints" (pending review, warning)._

## Memory and persistence

Everything your agent knows persists in files:

- Vault: SQLite database with knowledge entries
- Brain state: JSON file with strength scores, session history, TF-IDF vocabulary
- Plans: JSON file with plan history and reconciliation reports
- Config: your agent's identity, domains, and settings

When you close your AI editor and open it again, nothing is lost. The agent loads its state from these files and picks up exactly where it left off.

### Cross-project knowledge

If you work on multiple projects, you can link them:

```
"Link this project to my-other-project as related"
```

Linked projects can search each other's vaults. A security pattern you captured in one project becomes discoverable in another.

You can also promote high-value patterns to a global pool, available to every agent you run across all projects.

## Governance

Not everything you capture goes straight into the vault. The governance layer evaluates each capture:

- Quotas: prevent the vault from growing without bounds
- Proposal gates: certain entry types require approval before becoming active
- Duplicate detection: if a similar entry already exists, the capture may be rejected or merged

This keeps the vault clean and useful over time. Without governance, knowledge bases tend to accumulate noise: duplicates, contradictions, entries nobody needs.

## The curator

The curator is an automated maintenance system that keeps vault quality high:

- Deduplication: finds entries that say the same thing and proposes merging them
- Decay scanning: identifies entries that haven't been used in a long time
- Health audits: reports on overall vault quality, including duplicate rate, staleness, and gaps
- Tag normalization: cleans up inconsistent tags across entries

You can run curator operations manually, or let them happen as part of the brain's lifecycle.

## All engine modules

The engine registers 22 modules as MCP tools. Each module is a single tool with op-based dispatch:

| Module | Purpose |
| ------ | ------- |
| **Vault** | Knowledge store — CRUD, search, FTS5 indexing |
| **Brain** | Intelligence — pattern strength, TF-IDF, recommendations |
| **Plan** | Planning lifecycle — create, approve, split, reconcile |
| **Memory** | Session history — capture, search, cross-project |
| **Admin** | Health checks, tool listing, diagnostics |
| **Curator** | Vault maintenance — dedup, decay, health audits |
| **Loop** | Iterative validation cycles |
| **Orchestrate** | High-level workflow — plan + execute + complete |
| **Control** | Intent routing, behavior morphing |
| **Context** | Entity extraction, knowledge retrieval |
| **Agency** | Proactive file watching, pattern surfacing |
| **Chat** | Chat transport — sessions, bridge, notifications |
| **Operator** | Operator profiling — expertise, corrections, adaptation |
| **Archive** | Vault snapshots, backup, restore, optimization |
| **Sync** | Git push/pull, Obsidian sync |
| **Review** | Governance review workflow — submit, approve, reject |
| **Intake** | External ingestion — URLs, text, PDFs, batch |
| **Links** | Zettelkasten connections — link, traverse, orphan detection |
| **Branching** | Vault branching — isolate, experiment, merge |
| **Tier** | Multi-tier vault connections — external sources |
| **Embedding** | Embedding management — vector storage and retrieval |
| **Dream** | Memory consolidation — dedup, archive stale entries, resolve contradictions |

Domain packs add additional modules on top of these (e.g., `@soleri/domain-design` adds design-specific facades).

## Testing

Soleri ships with a test suite to verify all of this works correctly:

- Unit tests (`npm test`): test individual modules within each package
- E2E tests (`npm run test:e2e`): 800+ integration tests across 30 files that exercise every engine feature. Vault persistence, brain intelligence, curator health audits, governance policies, plan state machine, MCP transport, HTTP/WebSocket servers, CLI commands, scaffold pipeline, operator profiling, knowledge traceability, and concurrent operations.

The E2E suite uses real SQLite databases, real MCP stdio transport, and real scaffolded agents, not mocks. When tests pass, the engine works.

For details on running and writing tests, see [Testing](/docs/guides/testing/).

---

_Next: [Security & Privacy](/docs/guides/security/) — understand where your data lives and who can access it._
