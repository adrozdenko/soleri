---
title: agent.yaml Reference
description: Complete field-by-field reference for the agent.yaml configuration file.
---

The `agent.yaml` file defines your agent's identity, personality, engine settings, and workspace layout. It's the single source of truth for what your agent is and how it behaves.

## Identity (required)

Every agent needs these four fields:

```yaml
id: forge                          # kebab-case, used for directories and tool prefixes
name: Forge                        # display name (1-50 chars)
role: Software Development Assistant  # one-line role (1-100 chars)
description: >                     # longer description (10-500 chars)
  A knowledge-driven development assistant that captures
  architecture decisions and code review patterns.
```

### `domains`

Knowledge domains the agent specializes in. Used to seed workspaces and routing.

```yaml
domains:
  - architecture
  - code-review
  - testing
```

- **Type:** array of strings (1-20 items)
- **Default:** empty — discovered from usage over time

### `principles`

Core principles that guide agent behavior. Embedded in CLAUDE.md.

```yaml
principles:
  - Read before you write
  - Tests prove behavior
  - Small PRs ship faster
```

- **Type:** array of strings (1-10 items)
- **Default:** empty — discovered from usage over time

## Personality

### `tone`

Communication style.

- **Values:** `precise` | `mentor` | `pragmatic`
- **Default:** `pragmatic`

### `greeting`

Custom activation greeting (10-300 chars). Auto-generated if omitted.

```yaml
greeting: Forge online. Show me the code.
```

### `persona`

Composable persona configuration. Accepts arbitrary key-value pairs for character customization.

```yaml
persona:
  voice: technical-but-approachable
  humor-style: dry
```

- **Default:** Italian Craftsperson persona (ships with scaffold)

## Engine

Controls the knowledge engine runtime.

```yaml
engine:
  learning: true       # enable brain learning loop (default: true)
  profile: full        # module profile: minimal | standard | full (default: full)
```

### `engine.profile`

| Profile | Modules | Best for |
| ------- | ------- | -------- |
| `minimal` | vault, admin, control, orchestrate | CI bots, single-purpose automation |
| `standard` | + plan, brain, memory, curator, loop, context, archive | Most development agents |
| `full` | All 22 modules | Full-featured agents (default) |

### `engine.modules`

Override the profile with an explicit module list. When set, `profile` is ignored.

```yaml
engine:
  modules:
    - vault
    - brain
    - plan
    - admin
    - control
```

### `engine.vault`

Path to the vault SQLite database. Defaults to `~/.{agent-id}/vault.db`.

```yaml
engine:
  vault: ~/.forge/vault.db
```

### `engine.features`

Engine rule modules included in CLAUDE.md. Core rules always included. Omit to include all.

- **Values:** `vault` | `planning` | `brain` | `advanced`

### `engine.compactionPolicy`

Session compaction thresholds:

```yaml
engine:
  compactionPolicy:
    maxRuns: 200            # max tool calls before rotation
    maxInputTokens: 2000000 # max cumulative input tokens
    maxAge: 72h             # max wall-clock age (e.g. 72h, 30m, 7d)
```

## Client Setup

```yaml
setup:
  target: claude           # claude | codex | opencode | both | all
  model: claude-code-sonnet-4
```

- **target default:** `claude`
- **model default:** `claude-code-sonnet-4`

## Skills

Controls which skills are scaffolded with the agent.

```yaml
skillsFilter: essential    # essential | all | [array of skill names]
```

- **`essential`** (default) — 7 core skills: agent-guide, agent-persona, vault-navigator, vault-capture, systematic-debugging, writing-plans, context-resume
- **`all`** — all available skills
- **array** — only the named skills

## Workspaces

Scoped context areas within the agent. Auto-seeded from domains if omitted.

```yaml
workspaces:
  - id: planning
    name: Planning
    description: Architecture decisions and technical specs
  - id: src
    name: Source Code
    description: Source code
```

Each workspace entry has:

| Field | Required | Description |
| ----- | -------- | ----------- |
| `id` | yes | Unique workspace identifier (kebab-case) |
| `name` | yes | Human-readable name |
| `description` | yes | What this workspace is for |
| `contextFile` | no | Context file name (default: `CONTEXT.md`) |

## Routing

Task pattern to workspace routing. Auto-seeded from domains if omitted.

```yaml
routing:
  - pattern: design component
    workspace: design
    skills:
      - soleri-vault-navigator
  - pattern: review code
    workspace: review
    context:
      - STYLE_GUIDE.md
```

| Field | Required | Description |
| ----- | -------- | ----------- |
| `pattern` | yes | Task pattern that triggers this route |
| `workspace` | yes | Target workspace id |
| `context` | no | Extra context files to load |
| `skills` | no | Skills to auto-activate |

## Domain Packs

Install npm domain packs for specialized capabilities.

```yaml
packs:
  - name: design
    package: '@soleri/domain-design'
    version: '^1.0.0'
  - name: code-review
    package: '@soleri/domain-code-review'
```

| Field | Required | Description |
| ----- | -------- | ----------- |
| `name` | yes | Domain name |
| `package` | yes | npm package name |
| `version` | no | Semver constraint (default: latest) |

## Vault Connections

Link external vaults for shared knowledge.

```yaml
vaults:
  - name: team-knowledge
    path: ~/.team/vault.db
    priority: 0.8
```

| Field | Required | Default | Description |
| ----- | -------- | ------- | ----------- |
| `name` | yes | — | Display name |
| `path` | yes | — | Path to vault database |
| `priority` | no | 0.5 | Search ranking weight (0-1) |

## Git

Optional git initialization for the agent directory.

```yaml
git:
  init: true
  remote:
    type: gh              # gh (GitHub CLI) | manual
    visibility: private   # public | private (gh only)
    # url: https://...    # required for manual type
```

## Complete example

```yaml
id: forge
name: Forge
role: Software Development Assistant
description: >
  A knowledge-driven development assistant that captures architecture
  decisions, code review patterns, and testing strategies to vault.

domains:
  - architecture
  - code-review
  - testing
  - devops
principles:
  - Read before you write
  - Tests prove behavior
  - Small PRs ship faster
tone: precise
greeting: Forge online. Show me the code.

engine:
  learning: true

setup:
  target: claude
  model: claude-code-sonnet-4

workspaces:
  - id: planning
    name: Planning
    description: Architecture decisions, RFCs, and technical specs
  - id: src
    name: Source Code
    description: Source code
  - id: docs
    name: Documentation
    description: Technical documentation and runbooks

packs:
  - name: design
    package: '@soleri/domain-design'
    version: '^1.0.0'
```
