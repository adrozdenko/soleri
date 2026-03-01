---
id: architecture-open-source-opensource-repo-structure
title: Open Source Release — Repository Structure
category: open-source
severity: critical
tags:
  - open-source
  - repo
  - structure
  - monorepo
  - testing
  - ci
  - transports
knowledge_type: architecture
status: archived
created: 2026-02-24
updated: 2026-02-24
curator_version: 3
confidence: 1
source: unknown
---

# Open Source Release — Repository Structure

## Context

Distribution via npm registry for engine, forge CLI, domain modules. GitHub for source + reference personas + community contributions. Optional: user's site for premium knowledge packs + docs. Claude Code plugin registry (when available) for one-click install. Engine name TBD — needs to convey: learns, personal, grows, companion. Short and CLI-friendly.

## Pattern

```
soleri/
├── core/                            # Pure logic, ZERO protocol dependencies
│   ├── vault.ts                     # VaultService (backend-agnostic)
│   ├── brain.ts                     # BrainService
│   ├── planning.ts                  # PlanningService
│   ├── memory.ts                    # MemoryService
│   ├── session.ts                   # SessionService
│   ├── intent.ts                    # IntentRouter
│   └── persona.ts                   # PersonaManager (load/switch/context)
│
├── vault-backends/                  # Pluggable vault storage
│   ├── interface.ts                 # VaultBackend interface
│   ├── local.ts                     # LocalVaultBackend (filesystem, default)
│   ├── git.ts                       # GitVaultBackend (team sharing via git)
│   └── remote.ts                    # RemoteVaultBackend (API sync, hosted teams)
│
├── transports/                      # Protocol adapters (core has no protocol deps)
│   ├── mcp.ts                       # Claude Code MCP adapter (primary, v1)
│   ├── rest.ts                      # REST API adapter (future)
│   └── lsp.ts                       # LSP adapter (future: VS Code, Cursor, Zed)
│
├── facades/                         # Generic facade layer
│   ├── loader.ts                    # Reads persona config, loads facades
│   ├── vault.ts                     # Vault facade
│   ├── brain.ts                     # Brain facade
│   └── planning.ts                  # Planning facade
│
├── domains/                         # Pluggable domain modules
│   ├── official/                    # Maintained by core team
│   │   ├── design.ts
│   │   ├── security.ts
│   │   ├── architecture.ts
│   │   └── testing.ts
│   ├── community/                   # Community-contributed domains
│   │   └── CONTRIBUTING.md
│   └── interface.ts                 # DomainModule interface
│
├── migrations/                      # Vault format migrations
│   ├── v1-to-v2.ts
│   ├── v2-to-v3.ts
│   └── migrate.ts                   # Runs chain automatically on startup
│
├── forge/                           # The creation tool (CLI)
│   ├── cli.ts                       # soleri forge/update/list/doctor
│   ├── templates/                   # Persona scaffolding (versioned)
│   ├── registry.ts                  # Local registry management
│   ├── merge.ts                     # Three-way merge for updates
│   └── scan.ts                      # Project scanner (cold start tier 2)
│
├── personas/                        # Reference personas (open source)
│   ├── official/
│   │   ├── salvador/                # Design system intelligence
│   │   │   ├── persona.yaml
│   │   │   ├── vault/              # Starter knowledge (free)
│   │   │   └── ops/               # check-contrast, validate-token, etc.
│   │   ├── gaudi/
│   │   ├── sentinel/
│   │   └── ...
│   └── community/                   # Community-contributed personas
│       └── CONTRIBUTING.md
│
├── knowledge-packs/                 # The product
│   ├── starter/                     # Free — basic patterns per domain
│   │   ├── design/
│   │   ├── security/
│   │   └── architecture/
│   ├── premium/                     # Paid (not in open-source repo)
│   └── community/                   # Community-contributed packs
│       └── CONTRIBUTING.md
│
├── tests/                           # Four-layer test suite
│   ├── unit/                        # Fast, deterministic
│   │   ├── vault-crud.test.ts
│   │   ├── brain-capture.test.ts
│   │   ├── planning-state.test.ts
│   │   ├── memory-search.test.ts
│   │   ├── persona-switch.test.ts
│   │   └── migration.test.ts
│   ├── integration/                 # Persona lifecycle
│   │   ├── forge-generate.test.ts
│   │   ├── forge-update.test.ts
│   │   ├── activate-switch.test.ts
│   │   ├── domain-loading.test.ts
│   │   ├── vault-backend.test.ts    # Test each backend type
│   │   └── cross-persona.test.ts    # Shared vault, persona switching
│   ├── search-quality/              # Vault search relevance
│   │   ├── fixtures/
│   │   └── relevance.test.ts
│   └── snapshots/                   # Template output stability
│       ├── forge-output.snap
│       └── claude-md.snap
│
├── docs/
│   ├── getting-started.md
│   ├── creating-personas.md
│   ├── creating-domains.md
│   ├── team-setup.md
│   └── knowledge-packs.md
│
├── .github/
│   └── workflows/
│       ├── ci.yml                   # lint + unit + integration + search + snapshots
│       └── release.yml              # npm publish on tag
│
├── CONTRIBUTING.md                  # Top-level contribution guide
├── LICENSE
└── README.md
```

## Example

```bash
npm install -g soleri && soleri forge my-assistant
# Scaffolds persona in ~/.config/soleri/personas/my-assistant/
# Registers in ~/.config/soleri/forge-registry.yaml
# Adds single MCP entry to ~/.claude.json (if not already present)
# Includes free starter pack for chosen domain
# First activation offers project scan
# Ready to use

soleri doctor   # Check system health + compatibility
soleri update   # Pull latest templates, patch all agents
soleri list     # Show all registered agents + versions
```

## Why

Monorepo with clear boundaries. Core is pure logic with no protocol dependencies — transport adapters wrap it for different platforms. Vault backends are pluggable — local for v1, git/remote for team features, all behind the same interface. Domains and personas have official/ and community/ namespaces to channel contributions without compromising quality. Test suite covers engine mechanics (unit), persona lifecycle (integration), search quality (relevance fixtures), and template stability (snapshots). CI prevents quality erosion from day one.
