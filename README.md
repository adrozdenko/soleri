<p align="center">
  <strong>S O L E R I</strong>
</p>

<p align="center">
  <em>AI assistants that learn, remember, and grow with you.</em>
</p>

<p align="center">
  <a href="https://github.com/adrozdenko/soleri/actions/workflows/ci.yml"><img src="https://github.com/adrozdenko/soleri/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/soleri"><img src="https://img.shields.io/npm/v/soleri.svg" alt="npm version"></a>
  <a href="https://github.com/adrozdenko/soleri/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/soleri.svg" alt="License"></a>
  <a href="https://www.npmjs.com/package/soleri"><img src="https://img.shields.io/npm/dm/soleri.svg" alt="Downloads"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/soleri.svg" alt="Node version"></a>
</p>

---

Soleri is an open-source framework for building AI assistants — called **personas** — that maintain persistent knowledge, learn from real work sessions, and carry context across projects and conversations.

Unlike stateless AI integrations, Soleri gives your assistants a **vault** they can write to, a **brain** that compounds learning over time, and **memory** that persists across sessions. One engine, unlimited personas — each with its own identity, expertise, and growing knowledge base.

> Named after [Paolo Soleri](https://en.wikipedia.org/wiki/Paolo_Soleri), the Italian architect who coined *arcology* — self-sustaining living architecture. He believed structures should be alive, adaptive, and evolving. This framework follows the same philosophy.

## How It Works

```
┌─────────────────────────────────────────────────────────┐
│  Personas       Salvador · Gaudi · Sentinel · yours     │
├─────────────────────────────────────────────────────────┤
│  Domains        design · security · architecture · ...  │
├─────────────────────────────────────────────────────────┤
│  Engine         vault · brain · planning · memory       │
├─────────────────────────────────────────────────────────┤
│  Transports     MCP (Claude Code) · REST · LSP          │
└─────────────────────────────────────────────────────────┘
```

**Personas** are thin configuration layers — identity, voice, domain bindings, and intent rules. The engine does the heavy lifting. Personas are runtime context switches on a single process: one integration entry, unlimited assistants.

## Features

| | Feature | Description |
|---|---------|-------------|
| **Vault** | Persistent knowledge | Structured storage with intelligent search — patterns, anti-patterns, workflows, decisions. Your assistant's long-term memory. |
| **Brain** | Compounding learning | Captures intelligence from real work sessions. The more you use it, the smarter it gets. |
| **Planning** | Structured execution | Multi-step task planning with state tracking, approval gates, and progress persistence. |
| **Memory** | Cross-session context | Remembers across sessions, projects, and conversations. No repeated explanations. |
| **Domains** | Pluggable expertise | Modular knowledge domains (design, security, architecture, testing) that any persona can load. |
| **Forge** | Lifecycle management | CLI to create, update, inspect, and manage personas with template versioning and three-way merge updates. |

## Quick Start

```bash
# Install globally
npm install -g soleri

# Create your first persona
soleri forge my-assistant

# Manage your personas
soleri list       # Show all registered personas
soleri update     # Update personas to latest templates
soleri doctor     # Check system health & compatibility
```

## Official Personas

| Persona | Domain | Description |
|---------|--------|-------------|
| **Salvador** | Design Systems | Design system intelligence — tokens, components, accessibility, visual validation |
| **Gaudi** | Architecture | System design, API patterns, database design, performance optimization |
| **Sentinel** | Security | Security patterns, vulnerability analysis, API hardening, threat modeling |

Each ships with a starter knowledge pack. Community personas welcome via `personas/community/`.

## Architecture

Soleri is designed around **separation of concerns**:

- **Core** — Pure logic, zero protocol dependencies. Vault, brain, planning, memory, session management, intent routing, and persona management.
- **Vault Backends** — Pluggable storage: local filesystem (default), git (team sharing), remote API (hosted teams). All behind a single interface.
- **Transports** — Protocol adapters that wrap core services. MCP for Claude Code (primary), with REST and LSP planned.
- **Domains** — Pluggable expertise modules. Official domains are maintained by core team; community domains go through a contribution and promotion process.
- **Forge** — CLI for the full persona lifecycle: scaffolding, registry management, template updates with three-way merge, project scanning, and system diagnostics.

## Project Structure

```
soleri/
├── core/                 Pure engine logic (no protocol deps)
├── vault-backends/       Pluggable storage (local, git, remote)
├── transports/           Protocol adapters (MCP, REST, LSP)
├── facades/              Generic facade layer
├── domains/              Pluggable domain modules
│   ├── official/         Maintained by core team
│   └── community/        Community contributions
├── forge/                CLI tool
├── personas/             Reference personas
│   ├── official/         Salvador, Gaudi, Sentinel, ...
│   └── community/        Community contributions
├── knowledge-packs/      Starter & community knowledge
├── migrations/           Vault format migrations
├── tests/                Unit, integration, search quality, snapshots
└── docs/                 Documentation
```

## Contributing

We welcome contributions at every level — from fixing typos to building new domain modules. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:

- **Quick fixes** — Bug fixes, docs, typos (standard PR process)
- **Engine features** — RFC issue first, two maintainer reviews
- **Domain modules** — Must implement `DomainModule` interface
- **Persona templates** — Must include persona.yaml + starter vault
- **Knowledge entries** — Community namespace first, promotion after review

## Roadmap

See [GitHub Milestones](https://github.com/adrozdenko/soleri/milestones) for the current plan.

## License

[Apache 2.0](LICENSE)

---

<p align="center">
  <a href="https://soleri.ai">soleri.ai</a> · <a href="https://www.npmjs.com/package/soleri">npm</a> · <a href="https://github.com/adrozdenko/soleri/issues">Issues</a> · <a href="https://github.com/adrozdenko/soleri/discussions">Discussions</a>
</p>
