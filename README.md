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

Every AI session starts from zero. You explain your conventions, your architecture, your preferences — and then the session ends and it's all gone. You do it again tomorrow. And the day after that. The assistant never gets better, never remembers, never grows.

**We believe AI assistants should compound knowledge, not lose it.**

Soleri is the open-source engine that makes that real.

## How It Works

Soleri gives agents persistent infrastructure — a **vault** that remembers, a **brain** that learns, and **memory** that carries across every project and conversation. Knowledge flows through a lifecycle: **capture** from real sessions → **store** with domain classification → **strengthen** through confidence scoring → **compound** by surfacing what works first.

Instead of one generic assistant, you build specialized **agents** — each with its own voice, expertise, and growing knowledge base — all running on a shared engine. The more you use them, the sharper they get.

## What You Get

**Platform:** macOS and Linux. Windows users need [WSL2](https://learn.microsoft.com/en-us/windows/wsl/install).

```bash
npm create soleri my-agent              # Quickest way — npm create shorthand
npx @soleri/cli create my-agent        # Interactive wizard — scaffold a new agent
npx @soleri/cli list                   # Show agents in current directory
npx @soleri/cli add-domain security    # Add a knowledge domain to your agent
npx @soleri/cli dev                    # Run agent locally in dev mode
npx @soleri/cli doctor                 # Check system health
npx @soleri/cli hooks add claude-code  # Install editor hooks
```

Your agent ships with a complete architecture and auto-captures patterns from your sessions.

### The Engine

**Vault** — Domain-separated knowledge store. Patterns, anti-patterns, workflows, and architecture decisions organized by domain (frontend, backend, cross-cutting), vectorized with [Cognee](https://github.com/topoteretes/cognee) for semantic search and graph-connected for cross-domain discovery. Self-maintaining: deduplication, decay detection, and confidence tracking happen automatically.

**Brain** — Learning loop that captures intelligence from real sessions. Tracks pattern strength with confidence scores, surfaces high-confidence patterns first, and operates on a rolling window. No manual tagging — capture is automatic.

**Memory** — Cross-session, cross-project continuity. Switch conversations, switch projects — nothing is lost. Link projects as related, parent/child, or fork and search across all of them with weighted relevance.

**Playbooks** — Multi-step validated procedures stored in the vault. Token migrations, component setup, contrast audits — each step includes validation criteria so the agent can execute and verify autonomously.

### Your Agent

Soleri is an agent forge. You create specialized agents — each with its own persona, domain expertise, and growing vault — all running on a shared engine.

```bash
npm create soleri my-agent   # Forge a new agent
```

Give it a name, a domain, a voice. It ships with starter knowledge and learns from every session.

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Agents         yours · your team's · community          │
├─────────────────────────────────────────────────────────┤
│  Domains        design · security · architecture · ...  │
├─────────────────────────────────────────────────────────┤
│  Engine         @soleri/core (vault · brain · planner)  │
├─────────────────────────────────────────────────────────┤
│  Scaffold       @soleri/forge (config-driven templates) │
├─────────────────────────────────────────────────────────┤
│  Transports     MCP (Claude Code) · REST · LSP          │
└─────────────────────────────────────────────────────────┘
```

- **Engine (`@soleri/core`)** — Shared infrastructure for all agents. Vault (SQLite + FTS5), Brain (TF-IDF scoring), Planner (state machine), LLM utilities (circuit breaker, key pool, retry), and facade system. Pure logic, zero protocol dependencies.
- **Scaffold (`@soleri/forge`)** — Generates config-driven agent projects that import from `@soleri/core`. Creates persona, activation, LLM client, and domain facades — the agent-specific parts.
- **Transports** — MCP for Claude Code and Cursor today, REST and LSP designed into the architecture.
- **Domains** — Pluggable expertise modules (frontend, backend, cross-cutting, and custom).
- **Vault Backends** — Three-tier model: agent vault (personal), project vault (team conventions), team vault (shared across all projects). Local filesystem, git sync, or remote API.
- **Model-agnostic** — The engine runs on pure SQLite FTS5 and TF-IDF math. Works without API keys for local vault search, pattern matching, and brain tracking.

### Packages

| Package | Version | Description |
|---------|---------|-------------|
| [`@soleri/core`](packages/core) | 1.0.0 | Shared engine — Vault, Brain, Planner, LLM utilities, facade infrastructure |
| [`@soleri/forge`](packages/forge) | 4.1.0 | Agent scaffolder — generates config-driven MCP agents |
| [`@soleri/cli`](packages/cli) | 1.0.0 | Developer CLI — create, manage, and develop agents from the terminal |
| [`create-soleri`](packages/create-soleri) | 1.0.0 | `npm create soleri` shorthand — delegates to `@soleri/cli` |

### Knowledge Packs

Install expertise in one command:

| Tier | Source | Cost |
|------|--------|------|
| **Starter** | Ships with agent | Free |
| **Community** | npm registry | Free |

```bash
npx @soleri/cli install-knowledge ./bundles/react-patterns
```

### Teams & Ops

- **Connected vaults** — Link agent, project, and team vaults with automatic search priority.
- **Cross-project knowledge** — Link projects and search across them with weighted relevance.
- **Health checks** — `soleri doctor` reports engine version, domain status, vault health, brain tracking, and team sync state.

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
