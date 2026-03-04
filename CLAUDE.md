# Soleri — Project Instructions

## Core Principle: Salvador is the Reference

Salvador MCP is the reference implementation for Soleri. Every engine-level feature in Salvador should exist in every Soleri-generated agent.

### Development Strategy

1. **Port from Salvador** — Salvador's code is the blueprint. Copy patterns, abstractions, and battle-tested logic from Salvador into `@soleri/core` and `@soleri/forge`. Don't reinvent — adapt.
2. **Generated agents = Salvador-grade** — A scaffolded agent must ship with the same capabilities as Salvador (minus domain-specific design system intelligence). Curator, brain intelligence pipeline, loops, orchestration, identity, governance — these are all engine features, not Salvador-specific.
3. **Consult Salvador vault docs first** — Before building any feature, read the Salvador wiki documentation in `docs/vault/wiki/salvador-mcp/` and `docs/vault/wiki/salvador-vault/`. These describe exactly how each feature works, what ops it exposes, and how it integrates.

### The 4-File Rule

Every new core feature requires changes in all 4 template files:

| File | What to add |
|------|-------------|
| `packages/core/src/` | Implementation (new module or extend existing) |
| `packages/forge/src/templates/core-facade.ts` | Facade ops with Zod schemas |
| `packages/forge/src/templates/test-facades.ts` | Tests for every new op |
| `packages/forge/src/templates/entry-point.ts` | Initialization if the feature needs setup |

If any of the 4 are missed, the generated agent ships incomplete.

### Feature Gap

Currently generated agents have ~36 ops across 2 facades. Salvador has 181+ ops across 14 facades. See GitHub milestones v5.1–v7.0 for the structured plan to close this gap.

### Package Architecture

| Package | Role | Key files |
|---------|------|-----------|
| `@soleri/core` | Engine — vault, brain, planner, cognee, LLM utils, facades | `packages/core/src/` |
| `@soleri/forge` | Scaffold — generates agent projects from config | `packages/forge/src/templates/` |
| `@soleri/cli` | Developer CLI — create, list, add-domain, dev, doctor, hooks | `packages/cli/src/` |
| `create-soleri` | npm create shorthand | `packages/create-soleri/` |

### Testing Protocol

1. Unit tests in core (`packages/core/src/__tests__/`)
2. Scaffold tests in forge (`packages/forge/src/__tests__/`)
3. **Always scaffold a test agent and run its tests** after template changes — forge tests verify the template generates, but only a scaffolded agent verifies the generated code compiles and passes
4. Smoke test with real Cognee when touching hybrid search

### Conventions

- Zero new npm dependencies in core (use Node.js built-ins)
- Every HTTP call uses `AbortSignal.timeout()`
- Graceful degradation — if Cognee/LLM/external service is down, return empty/no-op, don't throw
- SQLite FTS5 with porter tokenizer for all text search
- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`
