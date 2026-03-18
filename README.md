<p align="center">
  <strong>S O L E R I</strong>
</p>

<p align="center">
  <a href="https://github.com/adrozdenko/soleri/actions/workflows/ci.yml"><img src="https://github.com/adrozdenko/soleri/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/soleri"><img src="https://img.shields.io/npm/v/soleri.svg" alt="npm version"></a>
  <a href="https://github.com/adrozdenko/soleri/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/soleri.svg" alt="License"></a>
  <a href="https://www.npmjs.com/package/soleri"><img src="https://img.shields.io/npm/dm/soleri.svg" alt="Downloads"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/soleri.svg" alt="Node version"></a>
</p>

---

Every AI session starts from zero. You explain your conventions, your architecture, your preferences — and then the session ends and it's all gone. You do it again tomorrow. And the day after that.

**Your expertise should compound — not evaporate.**

Soleri is an open-source second brain builder. It gives your AI assistant persistent memory, structured knowledge, and intelligence that grows with every session.

## How It Works

Your second brain is a **folder**. No TypeScript, no build step, no `npm install`.

```
my-brain/
├── agent.yaml          # what do I know
├── instructions/       # how I think
├── workflows/          # how I work
├── knowledge/          # what I've learned
└── .mcp.json           # connects to Soleri Knowledge Engine
```

your AI editor reads the folder natively. The **Knowledge Engine** provides the infrastructure — a vault that remembers, a brain that learns what works, and memory that carries across every project and conversation. The more you use it, the smarter it gets.

## What You Get

**Platform:** macOS and Linux. Windows users need [WSL2](https://learn.microsoft.com/en-us/windows/wsl/install).

```bash
npx @soleri/cli create my-brain       # Build your second brain (~3 seconds)
npx @soleri/cli install               # Connect to your editor
npx @soleri/cli dev                   # Start learning
npx @soleri/cli doctor                # Check system health
```

Your second brain is ready the moment it's created. No build step needed.

### The Engine

**Vault** — Domain-separated knowledge store. Patterns, anti-patterns, workflows, and architecture decisions organized by domain (frontend, backend, cross-cutting), vectorized with [Cognee](https://github.com/topoteretes/cognee) for semantic search and graph-connected for cross-domain discovery. Self-maintaining: deduplication, decay detection, and confidence tracking happen automatically.

**Brain** — Learning loop that captures intelligence from real sessions. Hybrid search combines SQLite FTS5 with optional Cognee vector embeddings for 6-dimension scoring. Tracks pattern strength with confidence scores, surfaces high-confidence patterns first, and operates on a rolling window. No manual tagging — capture is automatic.

**Memory** — Cross-session, cross-project continuity. Switch conversations, switch projects — nothing is lost. Link projects as related, parent/child, or fork and search across all of them with weighted relevance.

**Playbooks** — Multi-step validated procedures stored in the vault. Token migrations, component setup, contrast audits — each step includes validation criteria so the agent can execute and verify autonomously.

### Second Brain (v8.0)

The engine now acts as a true second brain — it doesn't just store knowledge, it actively helps you use it:

- **Two-pass search** — Scan titles first, load only what's relevant. Saves 60-80% context tokens.
- **Session briefing** — Start every session with context: what you did last time, active plans, recent learnings, brain recommendations.
- **Learning radar** — Automatically detects patterns from corrections, search misses, and workarounds. Captures silently or queues for review.
- **Content synthesis** — Turn vault knowledge into briefs, outlines, talking points, or post drafts.
- **Skill chains** — Multi-step workflows with data flow between steps and approval gates.
- **External ingestion** — Ingest articles, transcripts, and notes from outside coding sessions.
- **Evidence-based reconciliation** — Cross-references plan tasks against actual git changes.
- **OAuth discovery** — Uses your Claude Code subscription for free Anthropic API access (macOS + Linux).

### Architecture

Two layers, cleanly separated:

```
┌─────────────────────────────────────────────────────────┐
│  Agent Folder     agent.yaml · instructions/ · workflows/ │
│  (the shell)      knowledge/ · skills/ · CLAUDE.md (auto) │
├─────────────────────────────────────────────────────────┤
│  Knowledge Engine vault · brain · curator · planner       │
│  (the brain)      memory · learning · domain packs        │
├─────────────────────────────────────────────────────────┤
│  Transports       MCP · HTTP/SSE · WebSocket · Telegram   │
└─────────────────────────────────────────────────────────┘
```

- **Agent Folder** — Plain files (YAML, Markdown, JSON). your AI editor reads them natively. No code generation, no compilation.
- **Knowledge Engine (`@soleri/core`)** — Persistent state for all agents. Vault (SQLite + FTS5), Brain (hybrid TF-IDF + optional Cognee vector search), Planner (state machine), Curator (dedup, grooming), and cross-project memory.
- **Domain Packs** — Pluggable expertise modules (`@soleri/domain-design`, `@soleri/domain-component`, etc.). Add capabilities without code changes.
- **Model-agnostic** — The engine runs on pure SQLite FTS5 and TF-IDF math. Works without API keys. Optional Cognee integration adds vector embeddings and knowledge graph.

### Persistence

Soleri uses **SQLite** (via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)) as its sole storage engine. This is a deliberate architectural choice:

- **FTS5** for full-text search with BM25 ranking — no external search service needed
- **WAL mode** for concurrent reads during writes
- **Zero ops** — no database server to provision, no connection strings to manage
- **Tested at scale** — 10K vault entries with sub-50ms FTS search (see `vault-scaling.test.ts`)

The `PersistenceProvider` interface exists for future extensibility, but SQLite is the only implemented and tested backend.

### Packages

| Package | Description |
|---------|-------------|
| [`@soleri/core`](packages/core) | Knowledge Engine — vault, brain, planner, curator, `registerEngine()`, engine binary |
| [`@soleri/forge`](packages/forge) | Agent scaffolder — generates file-tree agents from config |
| [`@soleri/cli`](packages/cli) | Developer CLI — create, install, dev, doctor, packs, hooks |
| [`create-soleri`](packages/create-soleri) | `npm create soleri` shorthand |
| [`@soleri/domain-*`](packages/) | Domain packs — design, component, figma, code-review |

### Knowledge Packs

Install expertise in one command:

| Tier          | Source           | Cost |
| ------------- | ---------------- | ---- |
| **Starter**   | Ships with agent | Free |
| **Community** | npm registry     | Free |

```bash
npx @soleri/cli install-knowledge ./bundles/react-patterns
```

### Teams & Ops

- **Connected vaults** — Link agent, project, and team vaults with automatic search priority.
- **Cross-project knowledge** — Link projects and search across them with weighted relevance.
- **Health checks** — `soleri doctor` reports engine version, domain status, vault health, brain tracking, and team sync state.

## Testing

```bash
npm test                # Unit tests (core, forge, CLI)
npm run test:e2e        # E2E tests (800+ tests across 26 files)
```

The E2E suite covers: file-tree agent full pipeline (scaffold → engine boot → MCP → ops), scaffold pipeline, all engine modules, over-the-wire MCP transport, data persistence, concurrency, CLI commands, and domain pack validation.

## Contributing

From fixing typos to building domain modules — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Roadmap

[GitHub Milestones](https://github.com/adrozdenko/soleri/milestones)

## License

[Apache 2.0](LICENSE)

---

<p align="center">
  Named after <a href="https://en.wikipedia.org/wiki/Paolo_Soleri">Paolo Soleri</a>, the architect who believed structures should be alive, adaptive, and evolving.
</p>

<p align="center">
  <a href="https://soleri.dev">soleri.dev</a> · <a href="https://www.npmjs.com/package/soleri">npm</a> · <a href="https://github.com/adrozdenko/soleri/issues">Issues</a> · <a href="https://github.com/adrozdenko/soleri/discussions">Discussions</a>
</p>
