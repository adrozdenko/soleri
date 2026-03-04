# @soleri/forge

Create production-ready MCP agents in seconds.

Soleri Forge is an MCP server that scaffolds complete [Model Context Protocol](https://modelcontextprotocol.io/) agents — each with its own knowledge vault, intelligence layer, LLM client, memory system, planning engine, and activation persona. You describe what the agent should do, and Forge generates everything: source code, tests, config, and setup scripts.

Forge is knowledge-agnostic. It builds the infrastructure — you fill in the expertise.

Part of the [Soleri](https://soleri.dev) framework — building AI assistants that learn, remember, and grow with you.

## Quick Start

### 1. Register with Claude Code

```bash
claude mcp add --scope user soleri -- node /path/to/soleri/packages/forge/dist/index.js
```

### 2. Create an agent

In any Claude Code session, tell Claude what agent you want:

```
I need an agent called Gaudi that advises on backend architecture.
Domains: api-design, database, architecture, security, testing, performance.
Principles: "Security is not optional", "Simple beats clever", "Test everything that can break".
```

Claude will use the `forge` tool to scaffold it. Under the hood:

```
forge op:preview params:{ id: "gaudi", name: "Gaudi", ... }   # See what will be created
forge op:create  params:{ id: "gaudi", name: "Gaudi", ... }   # Scaffold the agent
```

You can also run `forge op:guide` to get a step-by-step creation flow.

### 3. Build and activate

```bash
cd gaudi
./scripts/setup.sh                # Install, build, register with Claude Code
```

Then in a new Claude Code session:

```
Hello, Gaudi!
```

Your agent is live.

## What Gets Generated

Every agent ships with a complete, tested architecture — and zero pre-loaded knowledge:

```
my-agent/
  src/
    facades/           # MCP tool dispatch (one per domain + core)
    vault/             # SQLite + FTS5 full-text search
    brain/             # TF-IDF intelligence layer
    llm/               # Unified OpenAI/Anthropic client (optional)
    intelligence/      # Domain knowledge (empty JSON bundles)
    identity/          # Agent persona and principles
    activation/        # CLAUDE.md injection + activation flow
    planning/          # Multi-step plan state machine
    __tests__/         # 6 test suites (~220 tests)
  scripts/
    setup.sh           # One-command install, build, register
    copy-assets.js     # Build script for intelligence data
```

### Core Capabilities

| Capability                     | What It Does                                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Knowledge Vault**            | SQLite-backed storage with FTS5 full-text search and BM25 ranking                                                                    |
| **Intelligence Layer (Brain)** | TF-IDF hybrid scoring across 5 dimensions, auto-tagging, duplicate detection, adaptive weight tuning                                 |
| **LLM Client**                 | Unified OpenAI/Anthropic caller with multi-key rotation, per-key circuit breakers, model routing (optional — works without API keys) |
| **Domain Facades**             | Each knowledge domain becomes its own MCP tool with search, capture, and pattern ops                                                 |
| **Memory System**              | Persists session summaries, lessons learned, and preferences across sessions                                                         |
| **Planning Engine**            | State machine for multi-step tasks: draft, approve, execute, complete                                                                |
| **Activation**                 | Persona-based activation with `Hello!` / `Goodbye!` — injects CLAUDE.md automatically                                                |

### Generated Operations

Each agent exposes two types of MCP tools:

**Domain tools** (`{agent}_{domain}`) — one per knowledge domain:

- `get_patterns` `search` `get_entry` `capture` `remove`

**Core tool** (`{agent}_core`) — shared infrastructure:

- `search` `vault_stats` `list_all` `health` `identity`
- `activate` `inject_claude_md` `setup` `register`
- `memory_search` `memory_capture` `memory_list`
- `session_capture` `export`
- `create_plan` `get_plan` `approve_plan` `update_task` `complete_plan`
- `record_feedback` `rebuild_vocabulary` `brain_stats`
- `llm_status`

Total: `(domains x 5) + 24` operations per agent.

## Forge Operations

Soleri Forge exposes one MCP tool (`forge`) with 6 ops:

| Op                  | Purpose                                         |
| ------------------- | ----------------------------------------------- |
| `guide`             | Step-by-step creation flow for the AI to follow |
| `preview`           | See what files and facades will be created      |
| `create`            | Scaffold the complete agent project             |
| `list_agents`       | Scan a directory for existing agents            |
| `install_knowledge` | Install knowledge packs into an existing agent  |
| `add_domain`        | Add a new knowledge domain to an existing agent |

## Installing Knowledge Packs

Agents start empty — but you don't have to populate them one entry at a time. Knowledge packs are pre-built JSON bundles containing patterns, anti-patterns, and rules for specific domains.

```
forge op:install_knowledge params:{
  agentPath: "/path/to/gaudi",
  bundlePath: "/path/to/knowledge-packs/bundles"
}
```

### Bundle Format

```json
{
  "domain": "accessibility",
  "version": "1.0.0",
  "entries": [
    {
      "id": "a11y-color-contrast",
      "type": "pattern",
      "domain": "accessibility",
      "title": "Color Contrast Ratios",
      "severity": "critical",
      "description": "Ensure text meets WCAG AA contrast ratio...",
      "tags": ["wcag", "contrast", "color"]
    }
  ]
}
```

## Configuration

```json
{
  "id": "gaudi",
  "name": "Gaudi",
  "role": "Backend Architecture Advisor",
  "description": "Gaudi provides guidance on API design, database patterns, and system architecture.",
  "domains": ["api-design", "database", "architecture", "security", "testing", "performance"],
  "principles": [
    "Security is not optional",
    "Simple beats clever",
    "Test everything that can break"
  ],
  "greeting": "Gaudi here. Let's build something solid.",
  "outputDir": "/Users/you/projects"
}
```

## Development

```bash
# From monorepo root
npm install
npm run build --workspace=@soleri/forge
npm run test --workspace=@soleri/forge

# Or from packages/forge
npm run dev           # Run with tsx (no build needed)
npm test              # Run tests
```

### Programmatic API

Import forge functions directly without starting the MCP server:

```typescript
import { scaffold, addDomain, installKnowledge, listAgents } from '@soleri/forge/lib';
```

This is how `@soleri/cli` wraps forge under the hood.

### Architecture

Soleri Forge is itself an MCP server built on the same patterns it generates:

- **`src/index.ts`** — MCP server entry point, registers the `forge` tool
- **`src/facades/forge.facade.ts`** — Op dispatch for all forge operations
- **`src/scaffolder.ts`** — Core scaffolding logic (preview, create, list)
- **`src/knowledge-installer.ts`** — Knowledge pack installer
- **`src/domain-manager.ts`** — Domain addition logic (add to existing agents)
- **`src/patching.ts`** — Shared source file patching utilities
- **`src/lib.ts`** — Public API re-exports for programmatic access
- **`src/types.ts`** — Config schema and result types (Zod-validated)
- **`src/templates/`** — 27 template generators

## Requirements

- Node.js 18+
- macOS or Linux (Windows via [WSL2](https://learn.microsoft.com/en-us/windows/wsl/install))
- Claude Code (for MCP registration and activation)

## License

Apache-2.0
