# Soleri — Project Instructions

## Architecture: Two-Layer Split (v7)

Soleri uses a **file-tree agent architecture**. Agents are folders, not TypeScript projects.

### Layer 1: File Tree (Agent Definition)

- `agent.yaml` — identity, domains, principles, engine config
- `instructions/` — behavioral rules (composed into CLAUDE.md)
- `workflows/` — playbooks as folders with prompt.md + gates.yaml + tools.yaml
- `knowledge/` — domain intelligence bundles (JSON)
- `skills/` — SKILL.md files
- `.mcp.json` — points to Soleri Knowledge Engine
- `CLAUDE.md` — **auto-generated**, never edit manually

### Layer 2: Knowledge Engine (@soleri/core)

- Vault, brain, curator, planner, memory, learning — the persistent state
- Single MCP server that all file-tree agents connect to
- Direct tool registration via `registerEngine()` (no facade factory)
- Domain packs provide additional ops

### Key Principle

The file tree is the **shell**. The knowledge engine is the **brain**.
Claude Code reads the folder natively. The engine provides persistence and learning.
No TypeScript generation. No build step. No `npm install` for agent definitions.

### Reference Agent

Salvador at `agents/salvador-filetree/` is the reference file-tree agent.
Old Salvador MCP (`~/projects/salvador-mcp`) is retired.

**Key Salvador source locations:**

| Feature            | Salvador path                                           |
| ------------------ | ------------------------------------------------------- |
| Facades            | `src/tools/facades/*.facade.ts`                         |
| Vault engine       | `src/vault/`                                            |
| Brain/intelligence | `src/intelligence/`, `src/memory/`                      |
| Planning           | `src/planner/`                                          |
| Curator            | `src/curator/`                                          |
| Telegram bot       | `src/telegram/`                                         |
| Color science      | `src/color/`                                            |
| Orchestration      | `src/orchestrate/`                                      |
| Vault patterns     | `docs/vault/patterns/` (283 files across 14 categories) |

### Additional Principles

1. **Generated agents = Salvador-grade** — A scaffolded agent must ship with the same capabilities as Salvador (minus domain-specific design system intelligence). Curator, brain intelligence pipeline, loops, orchestration, identity, governance — these are all engine features, not Salvador-specific.
2. **Consult Salvador vault docs first** — Before building any feature, read the Salvador wiki documentation in `docs/vault/patterns/` and `docs/vault/patterns/`. These describe exactly how each feature works, what ops it exposes, and how it integrates.

### Adding Engine Features

New engine features go in `@soleri/core`. The engine exposes ops via `registerEngine()`:

| File                                            | Purpose                                        |
| ----------------------------------------------- | ---------------------------------------------- |
| `packages/core/src/`                            | Implementation (new module or extend existing) |
| `packages/core/src/engine/register-engine.ts`   | Register new module tool if adding one         |
| `packages/core/src/runtime/facades/*-facade.ts` | Op definitions (handler + schema + auth)       |

### CLAUDE.md Composition

CLAUDE.md is **auto-generated** by `composeClaudeMd()` from the file tree:

1. Agent identity (from `agent.yaml`)
2. Engine rules (from `instructions/_engine.md` — auto-generated)
3. User instructions (from `instructions/*.md` — sorted alphabetically)
4. Tools table (from engine registration)
5. Workflow index (from `workflows/`)
6. Skills index (from `skills/`)

**Key files:**

| File                                           | Purpose                 |
| ---------------------------------------------- | ----------------------- |
| `packages/forge/src/templates/shared-rules.ts` | Engine rules content    |
| `packages/forge/src/compose-claude-md.ts`      | Composition algorithm   |
| `packages/forge/src/agent-schema.ts`           | `agent.yaml` Zod schema |

**When adding engine-level rules:** Edit `shared-rules.ts`, then `soleri dev` auto-regenerates.
**When adding agent-specific rules:** Create a new `.md` file in the agent's `instructions/` folder.

### Package Architecture

| Package            | Role                                                                      | Key files                                 |
| ------------------ | ------------------------------------------------------------------------- | ----------------------------------------- |
| `@soleri/core`     | Knowledge Engine — vault, brain, planner, cognee, LLM, `registerEngine()` | `packages/core/src/`                      |
| `@soleri/forge`    | Scaffold — generates file-tree agents from config                         | `packages/forge/src/scaffold-filetree.ts` |
| `@soleri/cli`      | Developer CLI — create, install, dev, doctor, hooks                       | `packages/cli/src/`                       |
| `create-soleri`    | npm create shorthand                                                      | `packages/create-soleri/`                 |
| `@soleri/domain-*` | Domain packs (design, component, figma, code-review)                      | `packages/domain-*/`                      |

### Testing Protocol

**Three layers of testing — all must pass before merge:**

| Layer | Command            | What it covers                                  |
| ----- | ------------------ | ----------------------------------------------- |
| Unit  | `npm test`         | Package-level tests in core, forge, CLI         |
| E2E   | `npm run test:e2e` | Cross-package integration (124 tests, 10 files) |
| Smoke | Manual             | Scaffold a real agent, build, run               |

**Unit tests:**

1. Core engine tests (`packages/core/src/__tests__/`)
2. Scaffold template tests (`packages/forge/src/__tests__/`)
3. CLI command tests (`packages/cli/src/__tests__/`)

**E2E tests (`e2e/`):**

1. `scaffold-and-build` — Template → npm install → tsc --noEmit pipeline
2. `full-pipeline` — All 13+ facades through the dispatch layer (vault, brain, plan, memory, admin, curator, loop, control, cognee, orchestrate, domain)
3. `mcp-transport` — Over-the-wire MCP via real stdio subprocess
4. `scaffold-edge-cases` — Many domains, telegram, tones, skills filter, duplicates
5. `persistence` — Vault/brain/plan data survives runtime close/reopen
6. `curator-brain-governance` — Health audits, learning loop, policy lifecycle, orchestrate
7. `concurrent-and-performance` — Parallel facade calls, bulk ops, latency bounds
8. `cli-commands` — Non-interactive create, list, doctor, add-domain, governance
9. `transports` — SessionManager, RateLimiter, HTTP/SSE, WebSocket servers
10. `skills-and-domains` — SKILL.md validation, domain data integrity, skills filtering

**When to run E2E:**

- After any change to `@soleri/core` facades or engine modules
- After any change to `@soleri/forge` templates
- After any change to `@soleri/cli` commands
- Before any release

**Smoke test:** Always scaffold a test agent and run its tests after template changes — forge tests verify the template generates, but only a scaffolded agent verifies the generated code compiles and passes. Smoke test with real Cognee when touching hybrid search.

### Conventions

- Zero new npm dependencies in core (use Node.js built-ins)
- Every HTTP call uses `AbortSignal.timeout()`
- Graceful degradation — if Cognee/LLM/external service is down, return empty/no-op, don't throw
- SQLite FTS5 with porter tokenizer for all text search
- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`
