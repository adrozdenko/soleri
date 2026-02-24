# Soleri

**An open-source framework for building AI assistants that learn, remember, and grow with you.**

Named after [Paolo Soleri](https://en.wikipedia.org/wiki/Paolo_Soleri), the Italian architect who coined "arcology" — self-sustaining living architecture. Soleri believed structures should be alive, adaptive, and evolving. This framework follows the same philosophy.

## What is Soleri?

Soleri is the engine that powers AI assistants (personas) with persistent knowledge, learning capabilities, and cross-session memory. Each persona is a thin configuration layer — Soleri is the living foundation they all grow from.

### Core Capabilities

- **Vault** — Persistent knowledge storage with intelligent search
- **Brain** — Learning loop that captures intelligence from real work sessions
- **Planning** — Structured task planning with state tracking
- **Memory** — Cross-session, cross-project persistence
- **Personas** — Thin identity layers with domain-specific expertise
- **Forge** — CLI tool to create, update, and manage personas

## Quick Start

```bash
npm install -g soleri

soleri forge my-assistant    # Create a new persona
soleri update                # Update all personas to latest
soleri doctor                # Check system health
soleri list                  # Show all registered personas
```

## Architecture

```
Soleri (engine)
├── Core          vault, brain, planning, memory, session, intent
├── Transports    MCP (Claude Code), REST (future), LSP (future)
├── Domains       design, security, architecture, testing (pluggable)
└── Forge         CLI for persona lifecycle management
```

Personas are runtime context switches on a single engine process. One MCP server entry, unlimited personas.

## Official Personas

| Persona | Domain | Activation |
|---------|--------|------------|
| Salvador | Design system intelligence | "Hola, Salvador!" |
| Gaudi | Architecture | "Hola, Gaudi!" |
| Sentinel | Security | "Hola, Sentinel!" |

## Status

🚧 **Early development** — Architecture defined, implementation in progress.

## License

MIT
