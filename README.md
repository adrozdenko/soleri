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

An open-source framework for building AI assistants that **remember what you taught them**, **learn from real work sessions**, and **carry context across every project and conversation**. One engine, unlimited personas — each with its own identity, expertise, and growing knowledge base.

## Quick Start

```bash
npm install -g soleri

soleri forge my-assistant    # Create a persona
soleri list                  # Show registered personas
soleri update                # Update to latest templates
soleri doctor                # Check system health
```

## Why Soleri

AI assistants today are stateless — you explain your conventions, your architecture, your preferences, and then the session ends and it's all gone. Soleri gives assistants persistent infrastructure so knowledge compounds instead of evaporating.

You build assistants called **personas**. Each persona has its own voice, domains, and growing knowledge — but they all run on a shared engine and can switch instantly.

## Core Concepts

**Vault** — Persistent knowledge storage. Patterns, anti-patterns, workflows, decisions — structured, searchable, always there. Your assistant's long-term memory.

**Brain** — A learning loop that captures intelligence from real work. The more you use it, the sharper it gets.

**Memory** — Cross-session, cross-project context. Switch conversations, switch projects — nothing is lost.

**Personas** — Thin identity layers on a shared engine. Each has its own expertise and knowledge, but they share context and switch without losing state.

**Forge** — CLI for the full persona lifecycle. Create, update, inspect, and manage personas with template versioning and three-way merge updates.

## Official Personas

| Persona | Domain | What it does |
|---------|--------|--------------|
| **Salvador** | Design Systems | Tokens, components, accessibility, visual validation |
| **Gaudi** | Architecture | System design, API patterns, databases, performance |
| **Sentinel** | Security | Vulnerability analysis, API hardening, threat modeling |

> Salvador sees design. Gaudi sees architecture. Sentinel sees security.
> **Soleri is the living foundation they all grow from.**

Each ships with starter knowledge. Community personas welcome via `personas/community/`.

## Architecture

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

- **Core** — Pure logic, zero protocol dependencies
- **Transports** — MCP for Claude Code today, REST and LSP tomorrow
- **Domains** — Pluggable expertise modules
- **Vault Backends** — Local filesystem, git for teams, remote API for hosted teams
- **Single process** — One engine, unlimited personas, no config bloat

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
  <a href="https://soleri.ai">soleri.ai</a> · <a href="https://www.npmjs.com/package/soleri">npm</a> · <a href="https://github.com/adrozdenko/soleri/issues">Issues</a> · <a href="https://github.com/adrozdenko/soleri/discussions">Discussions</a>
</p>
