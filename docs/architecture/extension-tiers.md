# Extension Tiers

Soleri has two extension tiers. Use the simplest one that fits your need.

## Tier 1: Domain Packs (npm packages)

**For:** Published, reusable domain intelligence distributed via npm.

**Format:** npm package exporting a `DomainPack` object.

**What they provide:**
- Custom ops with algorithmic logic (e.g., WCAG contrast checking)
- Standalone facades (one pack can register multiple MCP tools)
- Tiered knowledge (canonical/curated/captured)
- CLAUDE.md behavioral rules
- Skills
- Capability declarations

**Runtime access:** `PackRuntime` (vault, projects, session checks). Full `AgentRuntime` available as deprecated fallback.

**Examples:** `@soleri/domain-design`, `@soleri/domain-component`, `@soleri/domain-code-review`

**When to use:**
- You're building domain intelligence that multiple agents will consume
- You need custom algorithmic ops (not just knowledge)
- You want to publish to npm

```yaml
# In agent.yaml
packs:
  - name: design
    package: '@soleri/domain-design'
```

## Tier 2: Local Packs (project directories)

**For:** Project-specific knowledge, skills, hooks, and facades installed from local directories.

**Format:** Directory with `soleri-pack.json` manifest.

**What they provide:**
- Vault intelligence bundles (JSON)
- Facades (via optional `index.js`)
- Skills (Markdown)
- Hooks (Markdown)
- Capability declarations

**Runtime access:** `PackRuntime` via `PluginContext.packRuntime`.

**When to use:**
- You're bundling project-specific knowledge
- You want to install skills and hooks together
- You don't need to publish to npm

```bash
soleri pack install ./my-local-pack
```

**Directory structure:**
```
my-pack/
  soleri-pack.json       # manifest (required)
  index.js               # facade builder (optional)
  vault/                 # intelligence JSON bundles (optional)
  skills/                # skill .md files (optional)
  hooks/                 # hook .md files (optional)
```

## Deprecated: Plugins

The `soleri-plugin.json` format is deprecated. It's a subset of local packs (facades + intelligence entries only, no vault/skills/hooks). Use `soleri-pack.json` instead.

The plugin registry is still used internally by the pack installer for facade registration, but new extensions should use the pack system directly.

## Comparison

| Concern | Domain Pack | Local Pack | Plugin (deprecated) |
|---------|------------|------------|---------------------|
| Distribution | npm | Local directory | Local directory |
| Manifest | `DomainPack` export | `soleri-pack.json` | `soleri-plugin.json` |
| Custom ops | Yes | Yes (via `index.js`) | Yes (via `index.js`) |
| Vault seeding | Yes (via `knowledge`) | Yes (via `vault/`) | No |
| Skills | Yes | Yes | No |
| Hooks | No | Yes | No |
| Capabilities | Yes | Yes | No |
| Runtime access | `PackRuntime` | `PackRuntime` | `PackRuntime` |

## Runtime Access: PackRuntime

All extensions receive `PackRuntime` — a narrowed interface that exposes only what packs need:

| Module | Purpose |
|--------|---------|
| `vault` | Knowledge search and capture |
| `getProject(id)` | Token resolution for registered projects |
| `listProjects()` | Enumerate registered projects |
| `createCheck()` | Session checks for tool chaining |
| `validateCheck()` | Validate a session check |
| `validateAndConsume()` | Validate and consume a single-use check |

Extensions do NOT have access to: brain, planner, curator, governance, LLM client, key pools, auth policy, or other internal modules.
