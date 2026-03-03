---
id: plan-migration-agent-forge-to-soleri
title: "Migration Plan: Agent Forge → Soleri"
category: architecture
severity: critical
tags:
  - migration
  - monorepo
  - agent-forge
  - soleri
  - npm-workspaces
knowledge_type: plan
status: draft
created: 2026-03-03
updated: 2026-03-03
curator_version: 2
confidence: 0.95
source: claude-session
---

# Migration Plan: Agent Forge → Soleri

## Objective

Merge Agent Forge (working scaffolder, v2.1) into the Soleri repo as a monorepo
with npm workspaces. Preserve all existing Soleri assets (website, vault docs, brand).
Result: a single `soleri` repo that can scaffold agents under the Soleri identity,
with a clear path toward shared engine extraction.

## What Exists Today

### Agent Forge (`~/projects/agent-forge`)
- Working MCP server (v2.0.1 in package.json, v2.1 in changelog)
- Scaffolds complete MCP agents with vault, brain, facades, planning, activation
- 27 template generators, knowledge installer, 1 facade (forge)
- Registered in `~/.claude.json` as `agent-forge`
- Dependencies: `@modelcontextprotocol/sdk`, `zod`
- DevDeps: `vitest`, `tsx`, `@types/node`, `typescript`
- 5 ops: guide, preview, create, list_agents, install_knowledge
- Tests: vitest with unit tests
- "Agent Forge" branding in 6 source files (index.ts ×6, 5 templates ×1 each)
- `.mcp.json` with local dev config
- Stray `My Figma plugins/` directory (empty, exclude from migration)

### Soleri (`~/projects/soleri`)
- Architecture docs in `docs/vault/` (4 plans, 5+ ideas, 60+ sessions)
- Website HTML in `docs/` (en, uk, it) deployed to soleri.dev
- Brand assets: soleri-logo.svg, solar_punk.png, soleri-base.css, Soleri mark notes
- Stub code: `core/index.ts` (VERSION export), `forge/cli.ts` (coming soon)
- Placeholder directories: domains/, facades/, vault-backends/, personas/, knowledge-packs/
- `.salvador/` session data (sessions.db, checks.json)
- `.wrangler/` Cloudflare deployment state
- `i18n.json` + `i18n.lock` — Lingo i18n pipeline pointing at `docs/[locale]/*.html`
- Root `package.json` has exports (`.`, `./forge`, `./transports/mcp`) that must be removed
- npm: `soleri@0.0.1` reserved
- License: Apache 2.0

### Salvador MCP (`~/projects/salvador-mcp`)
- Stays separate — reference persona, not part of this migration
- Has 6 files with "Agent Forge" / "IntelligenceBundle" references (follow-up task)
- Will be exported as a persona template in a future phase

## Non-Goals (This Migration)

- NOT extracting a shared engine (future work)
- NOT implementing the three-layer architecture from the vault plans
- NOT building persona switching or transport abstraction
- NOT touching Salvador MCP (Agent Forge references updated separately)
- NOT changing how generated agents work
- NOT updating existing generated agents (they keep stale branding, harmless)

## Prerequisites

Before starting any phase:

- [ ] **Register `@soleri` npm scope** — run `npm login --scope=@soleri` and verify
      the scope is available. Scoped packages need `--access public` on first publish.
- [ ] **Verify Cloudflare Pages config** — check if soleri.dev deployment points to
      `docs/` as build output dir. If yes, must update to `website/` before or
      during the HTML move.

---

## Phase 0: Git History Strategy

Agent Forge and Soleri are separate git repos. We need to decide how to bring code in.

**Decision: `git subtree add`**

```bash
cd ~/projects/soleri
git subtree add --prefix=packages/forge ~/projects/agent-forge main --squash
```

This imports agent-forge's full history as a single squashed commit under `packages/forge/`,
then we restructure from there. Benefits:
- Clean single commit in soleri history
- `git log packages/forge/` traces back to origin
- No merge conflicts with existing soleri content

After subtree add, the files land at `packages/forge/src/`, `packages/forge/package.json`, etc.
We then restructure (remove agent-forge root files we don't need, keep src/).

**Alternative considered:** Plain file copy. Simpler but loses all history. Rejected because
the 27 templates have meaningful commit messages worth preserving.

---

## Phase 1: Monorepo Setup

Convert Soleri repo to npm workspaces monorepo.

**1.1 Strip root package.json**

The current root `package.json` has fields that conflict with a workspace root:

Remove:
- `"main"`, `"types"`, `"exports"`, `"bin"`, `"files"` — these belong on the workspace packages
- `"scripts"` — replace with workspace-aware scripts

Replace with:
```json
{
  "name": "soleri-monorepo",
  "private": true,
  "version": "3.0.0",
  "description": "An open-source framework for building AI assistants that learn, remember, and grow with you.",
  "homepage": "https://soleri.dev",
  "repository": {
    "type": "git",
    "url": "https://github.com/adrozdenko/soleri.git"
  },
  "author": "adrozdenko",
  "license": "Apache-2.0",
  "type": "module",
  "engines": { "node": ">=18.0.0" },
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "npm run build --workspaces",
    "test": "npm run test --workspaces",
    "typecheck": "npm run typecheck --workspaces",
    "dev": "npm run dev --workspace=@soleri/forge",
    "dev:forge": "tsx packages/forge/src/index.ts"
  }
}
```

**1.2 Create workspace structure**

```
soleri/
├── packages/
│   └── forge/              ← Agent Forge source (via git subtree)
│       ├── src/
│       │   ├── index.ts
│       │   ├── scaffolder.ts
│       │   ├── knowledge-installer.ts
│       │   ├── types.ts
│       │   ├── facades/
│       │   ├── templates/  (27 template generators)
│       │   └── __tests__/
│       ├── package.json     ← @soleri/forge
│       ├── tsconfig.json
│       └── vitest.config.ts
├── website/                 ← existing docs/ HTML moves here
│   ├── en/
│   ├── uk/
│   ├── it/
│   ├── index.html
│   ├── soleri-base.css
│   ├── soleri-logo.svg
│   └── solar_punk.png
├── brand/                   ← brand assets and notes
│   └── soleri-mark-design-notes.md
├── docs/
│   └── vault/              ← stays in place (architecture knowledge)
├── personas/               ← stays (future persona templates)
│   ├── official/
│   └── community/
├── domains/                ← stays (future domain modules)
├── knowledge-packs/        ← stays (future packs)
├── core/                   ← stays as stub (future shared engine)
├── package.json            ← root workspace config (private: true)
├── tsconfig.json           ← root tsconfig with references
├── i18n.json               ← updated paths (docs/ → website/)
├── CONTRIBUTING.md
├── LICENSE
└── README.md
```

**1.3 Move website HTML**

```bash
git mv docs/index.html     website/index.html
git mv docs/en             website/en
git mv docs/uk             website/uk
git mv docs/it             website/it
git mv docs/soleri-base.css website/soleri-base.css
git mv docs/soleri-logo.svg website/soleri-logo.svg
git mv docs/solar_punk.png  website/solar_punk.png
```

Keep `docs/vault/` in place — it's architecture knowledge, not a website.
Remove `docs/.gitkeep` (vault/ now provides content).

**1.4 Update i18n.json paths**

Current:
```json
"include": ["docs/[locale]/*.html"]
```

New:
```json
"include": ["website/[locale]/*.html"]
```

Regenerate `i18n.lock` after update.

**1.5 Update Cloudflare Pages / deployment config**

If soleri.dev deploys from a `docs/` output directory, update to `website/`.
Check Cloudflare Pages dashboard or `wrangler.toml`/`wrangler.json` if present.
The `.wrangler/` directory contains local state only — the deployment config
is on the Cloudflare dashboard or in CI.

**1.6 Move brand assets**

```bash
mkdir brand
git mv soleri-mark-design-notes.md brand/
```

**1.7 devDependencies strategy**

Hoist shared devDependencies to root `package.json`:
- `typescript`, `vitest`, `tsx`, `@types/node` — shared across all future packages

Keep package-specific deps in `packages/forge/package.json`:
- `@modelcontextprotocol/sdk`, `zod` — runtime dependencies specific to forge

Root devDependencies:
```json
"devDependencies": {
  "typescript": "^5.7.3",
  "vitest": "^3.0.5",
  "tsx": "^4.19.2",
  "@types/node": "^22.13.4"
}
```

---

## Phase 2: Move Agent Forge Code

**2.1 Import via git subtree**

```bash
cd ~/projects/soleri
git subtree add --prefix=packages/forge ~/projects/agent-forge main --squash
```

This brings in ALL agent-forge files under `packages/forge/`. Then clean up:

```bash
# Remove agent-forge root files we don't need in the monorepo
rm packages/forge/.gitignore        # use root .gitignore
rm packages/forge/.mcp.json         # replaced by root .mcp.json
rm packages/forge/agent_forge_logo.png  # old branding
rm -rf packages/forge/.git          # subtree handles this
rm -rf packages/forge/.salvador     # empty, not needed
rm -rf packages/forge/dist          # will be rebuilt
rm -rf packages/forge/node_modules  # will be reinstalled
rm -rf "packages/forge/My Figma plugins"  # stray directory
```

Keep:
- `packages/forge/src/` — all source code
- `packages/forge/CHANGELOG.md` — version history
- `packages/forge/README.md` — will be rewritten as technical docs
- `packages/forge/vitest.config.ts`

**2.2 Create packages/forge/package.json**

```json
{
  "name": "@soleri/forge",
  "version": "3.0.0",
  "description": "Scaffold AI agents that learn, remember, and grow.",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "soleri-forge": "dist/index.js"
  },
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.1",
    "zod": "^3.24.2"
  },
  "engines": { "node": ">=18.0.0" },
  "license": "Apache-2.0",
  "repository": {
    "type": "git",
    "url": "https://github.com/adrozdenko/soleri.git",
    "directory": "packages/forge"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

Note: `"publishConfig": { "access": "public" }` required for scoped packages on npm.

**2.3 Create packages/forge/tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "src/__tests__"]
}
```

**2.4 Update root tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "references": [
    { "path": "packages/forge" }
  ]
}
```

---

## Phase 3: Rename & Rebrand

**3.1 MCP server identity**

In `packages/forge/src/index.ts` (6 occurrences):
- Server name: `"agent-forge"` → `"soleri"`
- Server description: Update to Soleri branding
- Tool description: `"Agent Forge scaffolder"` → `"Soleri agent scaffolder"`

**3.2 Generated agent references**

In template generators (`src/templates/*.ts`):

| File | Change |
|------|--------|
| `claude-md-template.ts` | `"Agent Forge"` → `"Soleri"` |
| `llm-client.ts` | `"agent-forge"` → `"soleri"` |
| `llm-types.ts` | `"agent-forge"` → `"soleri"` |
| `llm-key-pool.ts` | `"agent-forge"` → `"soleri"` |
| `llm-utils.ts` | `"agent-forge"` → `"soleri"` |
| `readme.ts` | Update branding, links to soleri.dev |
| `package-json.ts` | Add `"generator": "soleri"` field |
| `setup-script.ts` | Update any references |

**3.3 README.md (root)**

Rewrite to combine:
- Soleri vision (from existing README.md — what/why/how)
- Agent Forge practical usage (from agent-forge README.md — quick start, commands)
- Link to soleri.dev for full docs

**3.4 packages/forge/README.md**

Rewrite as technical documentation for the forge package:
- Installation
- MCP tool API (5 ops)
- Template system
- Knowledge pack format
- Contributing

---

## Phase 4: Update Registrations

**4.1 Register @soleri npm scope**

```bash
npm login --scope=@soleri
# Or create org on npmjs.com: https://www.npmjs.com/org/create
```

Verify with `npm whoami --scope=@soleri`.

**4.2 MCP registration in ~/.claude.json**

Remove old entry, add new:

Old:
```json
"agent-forge": {
  "type": "stdio",
  "command": "node",
  "args": ["/Users/adrozdenko/projects/agent-forge/dist/index.js"],
  "env": {}
}
```

New:
```json
"soleri": {
  "type": "stdio",
  "command": "node",
  "args": ["/Users/adrozdenko/projects/soleri/packages/forge/dist/index.js"],
  "env": {}
}
```

**4.3 .mcp.json in soleri repo**

Create for local development:
```json
{
  "mcpServers": {
    "soleri": {
      "command": "node",
      "args": ["packages/forge/dist/index.js"],
      "cwd": "."
    }
  }
}
```

**4.4 npm deprecation**

After @soleri/forge is published:
```bash
npm deprecate agent-forge "Moved to @soleri/forge. See https://soleri.dev"
```

Do NOT unpublish — existing users need the deprecation message.

**4.5 GitHub**

- Push updated soleri repo
- Update `adrozdenko/agent-forge` README with deprecation notice:
  > **This project has moved to [Soleri](https://github.com/adrozdenko/soleri).**
  > Install the new package: `npm install @soleri/forge`

---

## Phase 5: CI & Build

**5.1 Update .github/workflows/ci.yml**

Replace current CI with monorepo-aware workflow:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  forge:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
      - run: npm install
      - run: npm run build --workspace=@soleri/forge
      - run: npm run test --workspace=@soleri/forge
      - run: npm run typecheck --workspace=@soleri/forge

  website:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Validate HTML files exist
        run: |
          for lang in en uk it; do
            for page in index.html how-it-works.html getting-started.html personas.html teams.html; do
              test -f "website/$lang/$page" || { echo "Missing website/$lang/$page"; exit 1; }
            done
          done
          test -f website/index.html || { echo "Missing website/index.html"; exit 1; }
          test -f website/soleri-base.css || { echo "Missing website/soleri-base.css"; exit 1; }
          echo "All expected files present."
      - name: Check for broken internal links
        run: |
          for file in website/en/*.html website/uk/*.html website/it/*.html; do
            dir=$(dirname "$file")
            grep -oP 'href="\K[^"]+\.html' "$file" 2>/dev/null | while read -r link; do
              [[ "$link" == http* ]] && continue
              target="$dir/$link"
              if [ ! -f "$target" ]; then
                echo "Broken link in $file: $link -> $target"
                exit 1
              fi
            done
          done
          echo "No broken internal links found."
```

**5.2 Add release workflow**

```yaml
name: Release

on:
  push:
    tags: ['v*']

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
          registry-url: 'https://registry.npmjs.org'
      - run: npm install
      - run: npm run build --workspace=@soleri/forge
      - run: npm run test --workspace=@soleri/forge
      - run: npm publish --workspace=@soleri/forge --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## Phase 6: Cleanup

**6.1 Remove stubs that conflict with forge**

- `forge/cli.ts` — **remove** (replaced by packages/forge)
- `forge/` directory — **remove entirely**
- `core/index.ts` — keep but update: `export const VERSION = '3.0.0';`
- `transports/mcp.ts` — keep as placeholder
- `facades/.gitkeep` — keep
- `vault-backends/.gitkeep` — keep

**6.2 Update .gitignore**

Add:
```
# Workspace builds
packages/*/dist/
packages/*/node_modules/

# Wrangler
.wrangler/
```

**6.3 Transfer relevant docs**

From `agent-forge/`:
- `CHANGELOG.md` → already at `packages/forge/CHANGELOG.md` (via subtree)
- `docs/plans/` → review and merge relevant items into `docs/vault/plans/`

**6.4 Preserve vault session history**

The 60+ session logs in `docs/vault/sessions/` stay untouched.

**6.5 Clean up root files**

- Remove `i18n.lock` and regenerate after `i18n.json` path update
- Keep `CONTRIBUTING.md`, `LICENSE`, `README.md` at root

---

## Development Workflow (Post-Migration)

### Daily development

```bash
# Build forge
npm run build --workspace=@soleri/forge

# Run forge MCP server locally (for Claude Code)
npm run dev:forge
# Or: node packages/forge/dist/index.js

# Run tests
npm run test --workspace=@soleri/forge

# Type check
npm run typecheck --workspace=@soleri/forge
```

### Testing with Claude Code

1. Build: `npm run build --workspace=@soleri/forge`
2. Verify `~/.claude.json` points to `soleri/packages/forge/dist/index.js`
3. Restart Claude Code
4. Test: invoke `soleri` tool with `op:preview` or `op:list_agents`

### Adding a new workspace package (future)

```bash
mkdir -p packages/vault/src
# Create packages/vault/package.json with name: "@soleri/vault"
# Add to root tsconfig references
# npm install from root refreshes workspaces
```

---

## File-by-File Mapping

### Agent Forge → Soleri (via git subtree)

| Agent Forge Source | Soleri Destination | Notes |
|---|---|---|
| `src/index.ts` | `packages/forge/src/index.ts` | Rebrand |
| `src/scaffolder.ts` | `packages/forge/src/scaffolder.ts` | As-is |
| `src/knowledge-installer.ts` | `packages/forge/src/knowledge-installer.ts` | As-is |
| `src/types.ts` | `packages/forge/src/types.ts` | As-is |
| `src/facades/forge.facade.ts` | `packages/forge/src/facades/forge.facade.ts` | As-is |
| `src/templates/*.ts` (27 files) | `packages/forge/src/templates/*.ts` | Rebrand 5 files |
| `src/__tests__/*.ts` | `packages/forge/src/__tests__/*.ts` | As-is |
| `vitest.config.ts` | `packages/forge/vitest.config.ts` | As-is |
| `tsconfig.json` | `packages/forge/tsconfig.json` | Rewritten |
| `CHANGELOG.md` | `packages/forge/CHANGELOG.md` | As-is |
| `README.md` | `packages/forge/README.md` | Rewritten |
| `package.json` | `packages/forge/package.json` | Rewritten |
| `.mcp.json` | REMOVED | Replaced by root .mcp.json |
| `.gitignore` | REMOVED | Use root .gitignore |
| `agent_forge_logo.png` | REMOVED | Old branding |
| `My Figma plugins/` | REMOVED | Stray directory |
| `.salvador/` | REMOVED | Empty |
| `dist/` | REMOVED | Rebuilt |
| `node_modules/` | REMOVED | Reinstalled |

### Soleri internal moves

| Soleri Source | Soleri Destination | Notes |
|---|---|---|
| `docs/index.html` | `website/index.html` | git mv |
| `docs/en/` | `website/en/` | git mv |
| `docs/uk/` | `website/uk/` | git mv |
| `docs/it/` | `website/it/` | git mv |
| `docs/soleri-base.css` | `website/soleri-base.css` | git mv |
| `docs/soleri-logo.svg` | `website/soleri-logo.svg` | git mv |
| `docs/solar_punk.png` | `website/solar_punk.png` | git mv |
| `docs/vault/` | `docs/vault/` | STAYS |
| `core/index.ts` | `core/index.ts` | Updated version |
| `forge/cli.ts` | REMOVED | Replaced by packages/forge |
| `forge/` | REMOVED | Entire directory |
| `soleri-mark-design-notes.md` | `brand/soleri-mark-design-notes.md` | git mv |

---

## Verification Checklist

After migration is complete, verify:

**Build & Test**
- [ ] `npm install` at root succeeds (workspaces resolve)
- [ ] `npm run build --workspace=@soleri/forge` compiles cleanly
- [ ] `npm run test --workspace=@soleri/forge` passes all tests
- [ ] `npm run typecheck --workspace=@soleri/forge` no errors

**MCP Server**
- [ ] `node packages/forge/dist/index.js` starts without error
- [ ] `~/.claude.json` has `soleri` entry (not `agent-forge`)
- [ ] After Claude Code restart, `soleri` tool is available
- [ ] `forge op:preview` works with Soleri branding
- [ ] `forge op:create` scaffolds an agent successfully
- [ ] `forge op:list_agents` finds existing agents
- [ ] `forge op:install_knowledge` works

**Website & Assets**
- [ ] `website/index.html` renders correctly
- [ ] `website/en/`, `website/uk/`, `website/it/` all have expected pages
- [ ] CSS and images load (soleri-base.css, soleri-logo.svg, solar_punk.png)
- [ ] Internal links not broken
- [ ] Cloudflare Pages deployment updated (if applicable)
- [ ] `i18n.json` paths updated, `i18n.lock` regenerated

**Repository**
- [ ] `docs/vault/` untouched (all 60+ sessions, plans, ideas preserved)
- [ ] Git history clean — `git log packages/forge/` shows subtree import
- [ ] No "Agent Forge" branding in source files (search: `grep -r "Agent Forge" packages/`)
- [ ] CI passes (forge build+test + website validation)
- [ ] Root package.json is `private: true` with no exports/main/bin

**Registrations**
- [ ] `@soleri` npm scope registered
- [ ] `agent-forge` npm package deprecated with pointer to `@soleri/forge`
- [ ] `agent-forge` GitHub repo has deprecation notice in README

---

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Breaking existing generated agents | Low | They're standalone — stale branding is cosmetic |
| Losing agent-forge git history | Medium | Use `git subtree add --squash` to preserve |
| Website broken by docs/ → website/ move | **High** | Update CI + i18n + Cloudflare in same commit |
| npm scope @soleri not registered | **High** | Register as prerequisite before Phase 4 |
| i18n pipeline breaks | **High** | Update i18n.json paths in Phase 1.4 |
| Cloudflare deployment breaks | **High** | Check config before moving HTML |
| MCP registration breaks Claude Code | Medium | Update ~/.claude.json, restart Claude Code |
| Salvador MCP "Agent Forge" strings | Low | Follow-up task, not blocking |
| Root package.json exports conflict | **High** | Strip in Phase 1.1 before adding workspaces |

---

## Follow-Up Tasks (Post-Migration)

These are NOT part of this migration but should be tracked:

1. **Salvador MCP rebranding** — Update 6 files with "Agent Forge" → "Soleri" references:
   - `src/vault/import-adapter.ts` — function names and comments
   - `src/tools/facades/vault.facade.ts` — tool descriptions
   - `src/plugins/types.ts`, `plugin-loader.ts`, `plugin-sdk/index.ts` — type names
   Keep `IntelligenceBundle` as the format name (it's a spec, not a brand).

2. **Existing generated agents** — Consider a `soleri migrate-agents` command that
   updates branding in previously scaffolded agents (low priority — cosmetic only).

3. **npm publish** — First publish of `@soleri/forge@3.0.0` after all verification passes.

---

## Future Phases (Not This Migration)

After the migration is stable:

1. **Extract @soleri/vault** — first shared package from template code
2. **Extract @soleri/brain** — second shared package
3. **Salvador persona export** — export Salvador MCP as reference persona template
4. **Plugin system** — manifest + loader for integrations
5. **Knowledge marketplace** — `soleri packs` CLI commands
6. **Persona switching** — single MCP process, runtime context switch
7. **Transport abstraction** — REST, LSP adapters
