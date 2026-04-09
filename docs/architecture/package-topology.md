# Package Topology & Runtime Architecture

Status: **Active** | Created: 2026-04-09 | Plan: `plan-1775741365371-wmc9u3`

## Objective

Define the canonical end-user package topology so that:
- A clean machine can create and register a file-tree agent with the intended persona
- All runtime references stay version-aligned after upgrades
- One CLI upgrade path updates the full usable stack without manual repair

## Package Map

| Package | npm name | Role | Published |
|---------|----------|------|-----------|
| @soleri/core | `@soleri/core` | Knowledge engine (vault, brain, planner, MCP infra) | Yes (lockstep) |
| @soleri/forge | `@soleri/forge` | Agent scaffolder (file-tree v7, legacy v6) | Yes (lockstep) |
| @soleri/cli | `@soleri/cli` | Developer CLI (create, install, dev, update) | Yes (lockstep) |
| @soleri/engine | `@soleri/engine` | Thin MCP entry point, delegates to core's engine binary | Yes (lockstep) |
| create-soleri | `create-soleri` | `npm create soleri` shorthand, delegates to CLI | Yes (lockstep) |
| soleri | `soleri` | Thin wrapper CLI, delegates to @soleri/cli | Yes (lockstep) |
| @soleri/tokens | `@soleri/tokens` | Design tokens (CSS/Tailwind) | Independent cadence |

## Dependency Graph

```
User installs:   soleri  OR  @soleri/cli  (either works, same result)
                    │              │
                    └──────┬───────┘
                           ▼
                     @soleri/cli ◄── canonical upgrade authority
                      │       │
                      ▼       ▼
               @soleri/forge  @soleri/core
                      │
                      ▼
               @soleri/core

MCP runtime:   @soleri/engine ──► @soleri/core/dist/engine/bin/soleri-engine.js
               (only used as npx fallback when core not resolvable locally)
```

## Canonical Upgrade Authority

**`@soleri/cli` is the single upgrade authority.**

Users should not need to know about or independently update core, forge, engine, or the wrapper package. A single `soleri update` (or `soleri upgrade`) must update `@soleri/cli`, which transitively pulls the correct versions of core and forge.

### Resolution (fixed)

| Command | Installs |
|---------|----------|
| `soleri update` | `npm install -g @soleri/cli@latest` |
| `soleri upgrade` | `npm install -g @soleri/cli@latest` |

Both commands are aliases for the same operation. The `soleri` wrapper package depends on `@soleri/cli` so `npm install -g soleri` also works but the canonical target is always `@soleri/cli`.

## Engine Resolution Strategy

**One function, one strategy, used everywhere.**

`resolveEngineBin()` in `packages/cli/src/commands/install.ts`:
1. Try `import.meta.resolve('@soleri/core')` to find core locally
2. If found: `node <core>/dist/engine/bin/soleri-engine.js`
3. If not found: `npx @soleri/engine` (fallback)

### Where engine resolution must be consistent

| Entry point | Currently | Target |
|-------------|-----------|--------|
| `install` (Claude/Codex/OpenCode) | `resolveEngineBin()` with npx fallback | Same (correct) |
| `create` (auto-register after scaffold) | `resolveEngineBin()` with npx fallback | Same (correct) |
| `dev` (local development) | Hard-coded local path, errors if missing | Use `resolveEngineBin()` |
| Scaffolded MCP configs | Baked at create-time | Use `resolveEngineBin()` at install-time |

The `dev` command currently has its own engine resolution that hard-errors without npx fallback (`dev.ts:41-56`). It must use `resolveEngineBin()` like everything else.

## Lockstep Release

**All 6 publishable packages must be built, tested, and published on every tag push.**

Currently published in release.yml:
- @soleri/core
- @soleri/forge
- @soleri/cli
- create-soleri

**Missing from release (must be added):**
- @soleri/engine
- soleri (wrapper)

All packages share the root version from `package.json`. The release workflow must publish all 6 and fail loudly if any publish fails for reasons other than "already published at this version."

## Quick Create Persona Consistency

**Quick create (`--yes`) must emit the same default persona block as the interactive wizard.**

Currently (`create.ts:73-93`):
- Interactive wizard: prompts for optional persona configuration
- Quick create (`--yes`): skips persona entirely, no persona block in agent.yaml

This means agents created with `--yes` behave differently at runtime -- no greeting override, no voice, no persona traits. The fix: quick create must populate a default persona block (using the "Italian Craftsperson" defaults that already exist for other fields).

## Invariants

1. **Version alignment:** All packages in a user's install resolve to the same major.minor version
2. **Engine resolution:** One function (`resolveEngineBin()`) used by all code paths
3. **Persona consistency:** All create paths produce agents with identical default behavior
4. **Upgrade simplicity:** `soleri update` and `soleri upgrade` are aliases for the same operation
5. **Release completeness:** Every tag publish includes all 6 publishable packages
6. **Failure loudness:** Publish errors (auth, network, registry) are never swallowed as "already published"
