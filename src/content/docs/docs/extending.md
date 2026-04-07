---
title: Extending Your Agent
description: Add instructions, workflows, knowledge, and domain packs to your Soleri file-tree agent.
---

Soleri agents follow a two-layer model:

1. **Agent folder** — `agent.yaml`, `instructions/`, `workflows/`, `knowledge/`, `skills/`. Plain files you edit directly.
2. **Knowledge Engine** (`@soleri/core`) — vault, brain, planner, curator, loops, governance. Updated via engine upgrades.

Extensions are additive. Edit your agent folder freely — the engine handles persistence and learning.

## Adding instructions

Create a new `.md` file in `instructions/`. It's automatically included in CLAUDE.md on the next regeneration.

```
instructions/
  _engine.md          # Auto-generated engine rules (don't edit)
  domain.md           # Your domain-specific rules
  api-conventions.md  # ← Add this
```

Example `instructions/api-conventions.md`:

```markdown
# API Conventions

- All endpoints return JSON with `{ data, error, meta }` envelope
- Use plural nouns for resource URLs: `/users`, not `/user`
- Version via URL prefix: `/v1/users`
- Rate limit headers on every response
```

Run `soleri dev` — CLAUDE.md regenerates automatically when you save.

## Adding workflows

Create a new folder in `workflows/` with up to 3 files:

```
workflows/
  feature-dev/          # Existing
  migration/            # ← New workflow
    prompt.md           # Step-by-step instructions
    gates.yaml          # Checkpoints and acceptance criteria
    tools.yaml          # MCP tools this workflow uses
```

Example `workflows/migration/prompt.md`:

```markdown
# Database Migration

## When to Use

When creating or modifying database schemas.

## Steps

### 1. Plan

- Search vault for migration patterns: `op:search_intelligent`
- Create migration plan: `op:orchestrate_plan`

### 2. Write Migration

- Create reversible migration (up + down)
- Test on a copy of production data

### 3. Verify

- Run migration against test database
- Verify data integrity

### 4. Capture

- Capture any patterns learned: `op:capture_knowledge`
```

## Adding knowledge

Drop JSON bundles in `knowledge/`. They're seeded into the vault on engine startup.

```json
{
  "domain": "api-design",
  "version": "1.0.0",
  "entries": [
    {
      "type": "pattern",
      "title": "Pagination with cursor-based tokens",
      "description": "Use opaque cursor tokens instead of offset/limit for stable pagination across inserts.",
      "category": "api-design",
      "severity": "warning",
      "tags": ["pagination", "api", "performance"]
    }
  ]
}
```

## Adding domain packs

Domain packs are standalone community packages that add specialized ops and knowledge. Install via CLI or npm:

```bash
soleri pack add domain-design
# or: npm install @soleri/domain-design
```

Then add to `agent.yaml`:

```yaml
packs:
  - name: design
    package: '@soleri/domain-design'
  - name: security
    package: '@my-org/domain-security'
```

The engine loads them at startup and registers their tools automatically. Browse available packs with `soleri pack registry`. Create your own with `npm create soleri-pack <name>`.

## Adding skills

Create a folder in `skills/` with a `SKILL.md` file:

```
skills/
  my-workflow/
    SKILL.md
```

Skills follow the standard SKILL.md format with YAML frontmatter.

## What NOT to edit

| File                      | Why                                 |
| ------------------------- | ----------------------------------- |
| `CLAUDE.md`               | Auto-generated from folder contents |
| `instructions/_engine.md` | Auto-generated engine rules         |
| `AGENTS.md`               | Auto-generated for OpenCode/Codex   |

Keep all customization in `agent.yaml`, `instructions/`, `workflows/`, `knowledge/`, and `skills/`.

## Upgrading the engine

The engine is a separate MCP server. Upgrade it independently:

```bash
npm update @soleri/core -g   # Update engine globally
soleri dev                    # Restart with new engine
```

Your agent folder is untouched by engine upgrades.

## Extension commands

| Command                      | What it does                           |
| ---------------------------- | -------------------------------------- |
| `soleri install`             | Register agent's engine as MCP server  |
| `soleri dev`                 | Start engine + watch files for changes |
| `soleri doctor`              | Check system health and connectivity   |
| `soleri pack install <pack>` | Install a domain or knowledge pack     |
| `soleri add-domain <name>`   | Add a knowledge domain                 |

For full command documentation, see [CLI Reference](/docs/cli-reference/). For configuration details, see [Customizing Your Agent](/docs/guides/customizing/).

## Related

- [Creating Packs](/docs/guides/pack-authoring/) — build and publish your own extension packs
- [Skills Catalog](/docs/guides/skills-catalog/) — browse all available skills
- [Domain Packs](/docs/guides/domain-packs/) — specialized intelligence modules
