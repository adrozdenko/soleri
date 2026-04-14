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

**Soleri is an open-source knowledge engine for AI agents.** It gives your agent a persistent vault, a learning brain, vector embeddings, Zettelkasten-linked knowledge, and a planning system. Works with Claude Code, Codex, OpenCode, and any MCP-compatible editor.

Every AI session starts from zero. You explain your conventions, your architecture, your preferences, and then the session ends and it's all gone.

Soleri fixes that. Your agent remembers across sessions, learns what works, and gets better the more you use it. Build a personal dev assistant or ship agents to your users, same engine.

## How It Works

Your agent is a **folder**. No TypeScript, no build step, no `npm install`.

```
my-agent/
├── agent.yaml          # identity + engine config
├── instructions/       # how I think
├── workflows/          # how I work
├── knowledge/          # what I've learned
└── .mcp.json           # connects to Soleri Knowledge Engine
```

Your AI editor reads the folder natively. The **Soleri Engine** runs behind it: a vault for knowledge, a brain that tracks what works, and a planner for multi-step tasks. Enable what you need.

## What You Get

**Platform:** macOS, Linux, and Windows (via Git Bash). See the [Windows setup guide](https://soleri.ai/docs/guides/windows/) for details.

**Prerequisites:**
- [Node.js 18+](https://nodejs.org) (npm ships with it)
- An MCP-compatible AI editor: [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Codex](https://github.com/openai/codex), or [OpenCode](https://github.com/opencode-ai/opencode)

```bash
npx --yes soleri create my-agent       # Build your agent (~3 seconds)
npx --yes soleri install               # Connect to your editor
npx --yes soleri dev                   # Start learning
npx --yes soleri doctor                # Check system health
```

> **npx vs global install:** The commands above use `npx --yes` which downloads and runs the CLI without a global install. The `--yes` flag skips the confirmation prompt. If you prefer a persistent install, run `npm install -g soleri` and then use bare `soleri` commands (e.g. `soleri create my-agent`).

Your agent is ready the moment it's created. No build step needed.

### Persona System

Every agent has a composable persona that defines HOW it communicates — voice, traits, quirks, opinions, and cultural texture. New agents ship with the Italian Craftsperson persona (inspired by Paolo Soleri): warm, opinionated about quality, universal across domains. Define your own in `agent.yaml` under the `persona:` block.

### The Engine

**Vault** stores patterns, anti-patterns, workflows, and architecture decisions organized by domain, graph-connected for cross-domain discovery. Self-maintaining: deduplication, decay detection, and confidence tracking run automatically. Knowledge packs export and import with Zettelkasten links, so new agents inherit the full knowledge graph, not orphaned entries.

**Brain** captures intelligence from real sessions. Search combines SQLite FTS5 with TF-IDF scoring. Tracks pattern strength with confidence scores, surfaces high-confidence patterns first, and operates on a rolling window. No manual tagging needed, capture is automatic.

**Memory** provides cross-session, cross-project continuity. Switch conversations, switch projects, nothing is lost. Link projects as related, parent/child, or fork, then search across all of them with weighted relevance.

**Playbooks** are multi-step validated procedures stored in the vault. Token migrations, component setup, contrast audits: each step includes validation criteria so the agent can execute and verify autonomously.

### Intelligence

Beyond storage, the engine actively surfaces and applies knowledge:

| Feature | What it does |
|---------|-------------|
| Two-pass search | Scans titles first, loads only what's relevant. Saves 60-80% context tokens. |
| Session briefing | Opens every session with context: last session's work, active plans, recent learnings, brain recommendations. |
| Learning radar | Detects patterns from corrections, search misses, and workarounds. Captures silently or queues for review. |
| Content synthesis | Turns vault knowledge into briefs, outlines, talking points, or post drafts. |
| Skill chains | Multi-step workflows with data flow between steps and approval gates. |
| External ingestion | Pulls in articles, transcripts, and notes from outside coding sessions. |
| Evidence-based reconciliation | Cross-references plan tasks against actual git changes. |
| OAuth discovery | Uses your Claude Code subscription for free Anthropic API access (macOS + Linux). |

### Architecture

Two layers:

```
┌─────────────────────────────────────────────────────────┐
│  Agent Folder     agent.yaml · instructions/ · workflows/ │
│  (the shell)      knowledge/ · skills/ · CLAUDE.md (auto) │
├─────────────────────────────────────────────────────────┤
│  Knowledge Engine 22 modules: vault · brain · curator · planner │
│  (the brain)      memory · archive · sync · review · links … │
├─────────────────────────────────────────────────────────┤
│  Transports       MCP · HTTP/SSE · WebSocket · Telegram   │
└─────────────────────────────────────────────────────────┘
```

The **Agent Folder** is plain files (YAML, Markdown, JSON). Your AI editor reads them natively. No code generation, no compilation.

The **Knowledge Engine** (`@soleri/core`) handles persistent state: Vault (SQLite + FTS5), Brain (TF-IDF scoring), Planner (state machine), Curator (dedup, grooming), and cross-project memory.

**Extensions** come in two tiers: **Domain Packs** (npm packages like `@soleri/domain-design`) for published intelligence, and **Local Packs** (project directories with `soleri-pack.json`) for project-specific knowledge, skills, and hooks. All extensions receive a narrowed `PackRuntime` (vault + projects + session checks).

The engine is **model-agnostic**, running on pure SQLite FTS5 and TF-IDF math. No API keys required, no external services.

### Persistence

Soleri uses **SQLite** (via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)) as its sole storage engine. FTS5 handles full-text search with BM25 ranking, WAL mode enables concurrent reads during writes, and there's nothing to provision or connect to. Tested at 10K vault entries with sub-50ms FTS search (see `vault-scaling.test.ts`).

The `PersistenceProvider` interface exists for future extensibility, but SQLite is the only implemented and tested backend.

### Packages

| Package                                   | Description                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------ |
| [`@soleri/core`](packages/core)           | Knowledge Engine — vault, brain, planner, curator, `registerEngine()`, engine binary |
| [`@soleri/forge`](packages/forge)         | Agent scaffolder — generates file-tree agents from config                            |
| [`@soleri/cli`](packages/cli)             | Developer CLI — create, install, dev, doctor, packs, hooks                           |
| [`create-soleri`](packages/create-soleri) | `npm create soleri` shorthand                                                        |
| [`@soleri/engine`](packages/engine)       | Engine binary — reads agent.yaml, boots vault/brain/planner via MCP                  |
| [`@soleri/tokens`](packages/tokens)       | Design system tokens — solarpunk colors, semantic themes, Tailwind preset            |
| [`@soleri/domain-*`](packages/)           | Domain packs — design, component, figma, code-review                                 |

### Guides

- [**Knowledge Management**](docs/guides/knowledge-management.md) — How to feed, train, and curate your agent's brain. The daily rhythm: search, capture, curate.

### Knowledge Packs

Install expertise in one command:

| Tier          | Source           | Cost |
| ------------- | ---------------- | ---- |
| **Starter**   | Ships with agent | Free |
| **Community** | npm registry     | Free |

```bash
npx --yes soleri install-knowledge ./bundles/react-patterns
```

### Hook Packs

Automated quality gates and safety guardrails for Claude Code:

```bash
npx --yes soleri hooks add-pack safety          # Anti-deletion staging for destructive commands
npx --yes soleri hooks add-pack flock-guard     # Parallel agent lockfile protection
npx --yes soleri hooks add-pack clean-commits   # No AI attribution in git commits
npx --yes soleri hooks add-pack typescript-safety  # Block unsafe TS patterns
npx --yes soleri hooks add-pack a11y            # Accessibility enforcement
npx --yes soleri hooks add-pack full            # All of the above
```

Convert your own skills into automated hooks:

```bash
npx --yes soleri hooks convert my-hook --event PreToolUse --matcher "Write|Edit" \
  --pattern "**/src/**" --action remind --message "Check guidelines"
npx --yes soleri hooks test my-hook             # Validate with fixtures
npx --yes soleri hooks promote my-hook          # remind → warn → block
```

### Teams & Ops

Link agent, project, and team vaults with automatic search priority. Connect projects and search across them with weighted relevance. `npx --yes soleri doctor` reports engine version, domain status, vault health, brain tracking, and team sync state.

## Testing

```bash
npm test                # Unit tests — 313 files, 3,900+ tests
npm run test:e2e        # E2E tests — 900+ tests across 30 files
```

The E2E suite covers: file-tree agent full pipeline (scaffold → engine boot → MCP → ops), all 22 engine modules across 8 vault-family facades, over-the-wire MCP transport, data persistence, concurrency, CLI commands, hook pack validation, and domain pack validation.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Roadmap

[GitHub Milestones](https://github.com/adrozdenko/soleri/milestones)

## License

[Apache 2.0](LICENSE)

---

<p align="center">
  Named after <a href="https://en.wikipedia.org/wiki/Paolo_Soleri">Paolo Soleri</a>, the architect who believed structures should be alive, adaptive, and evolving.
</p>

<p align="center">
  <a href="https://soleri.ai">soleri.ai</a> · <a href="https://www.npmjs.com/package/soleri">npm</a> · <a href="https://github.com/adrozdenko/soleri/issues">Issues</a> · <a href="https://github.com/adrozdenko/soleri/discussions">Discussions</a>
</p>
