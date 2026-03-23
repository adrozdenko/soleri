# Soleri File-Tree Agent Format Specification

**Version:** 1.0.0
**Date:** 2026-03-16
**Status:** Phase 1 — Approved

## Overview

A Soleri agent is a **folder** containing YAML, Markdown, and JSON files. There is no TypeScript, no `package.json`, no build step. Claude Code (or any MCP-capable LLM client) reads the folder contents natively and connects to the Soleri Knowledge Engine via MCP.

## Folder Structure

```
my-agent/
├── agent.yaml                  # REQUIRED — identity + engine config
├── .mcp.json                   # REQUIRED — points to soleri knowledge engine
├── .gitignore                  # AUTO — ignores CLAUDE.md, AGENTS.md
│
├── CLAUDE.md                   # AUTO-GENERATED — never edit manually
├── AGENTS.md                   # AUTO-GENERATED — for Codex/OpenCode
│
├── instructions/               # Behavioral rules (composed into CLAUDE.md)
│   ├── _engine.md              # AUTO-GENERATED — engine rules (do not edit)
│   └── *.md                    # User-authored instruction files
│
├── workflows/                  # Playbooks as folders
│   ├── {workflow-name}/
│   │   ├── prompt.md           # Workflow instructions
│   │   ├── gates.yaml          # Checkpoints + acceptance criteria
│   │   └── tools.yaml          # MCP tools this workflow uses
│   └── ...
│
├── knowledge/                  # Bundled intelligence (seed data)
│   └── *.json                  # Domain knowledge bundles
│
├── skills/                     # Agent skills (SKILL.md files)
│   └── {skill-name}/
│       └── SKILL.md
│
├── hooks/                      # Claude Code hooks
│   └── *.md                    # Hook definitions
│
└── data/                       # Project-specific context (user files)
    └── ...
```

## File Specifications

### agent.yaml (REQUIRED)

The single source of truth for agent identity and configuration.

```yaml
# ─── Identity ──────────────────────────────
id: my-agent # kebab-case, unique identifier
name: My Agent # display name (max 50 chars)
role: Expert in X # one-line role (max 100 chars)
description: > # what this agent does (10-500 chars)
  Detailed description of the agent's purpose
  and capabilities.

# ─── Personality ───────────────────────────
domains: # knowledge domains (1-20)
  - design
  - accessibility
principles: # core principles (1-10)
  - Vault is the single source of truth
  - Accessible by default
tone: precise # precise | mentor | pragmatic
greeting: > # optional — auto-generated if omitted
  Custom greeting message.

# ─── Engine Configuration ──────────────────
engine:
  vault: ~/.my-agent/vault.db # vault SQLite path (default: ~/.{id}/vault.db)
  learning: true # enable brain/learning loop (default: true)
  cognee: false # enable vector search (default: false)

# ─── Vault Connections ─────────────────────
vaults: # optional — link to external vaults
  - name: shared-knowledge
    path: ~/.soleri/vault.db
    priority: 0.6 # search weight 0-1 (default: 0.5)

# ─── Client Setup ─────────────────────────
setup:
  target: opencode # claude | codex | opencode | both | all
  model: claude-code-sonnet-4 # primary model for the client

# ─── Domain Packs ──────────────────────────
packs: # optional — npm domain packs
  - name: design
    package: '@soleri/domain-design'
  - name: code-review
    package: '@soleri/domain-code-review'
```

### .mcp.json (REQUIRED)

Points the LLM client to the Soleri Knowledge Engine server.

```json
{
  "mcpServers": {
    "soleri-engine": {
      "command": "npx",
      "args": ["@soleri/engine", "--agent", "./agent.yaml"]
    }
  }
}
```

The engine reads `agent.yaml` at startup to:

- Connect to the specified vault
- Load domain packs
- Configure learning/cognee
- Register domain-specific tools

### .gitignore

```
# Auto-generated — do not commit
CLAUDE.md
AGENTS.md
instructions/_engine.md
```

### instructions/ Directory

Markdown files that compose into CLAUDE.md. Each file is a self-contained section of behavioral rules.

**Composition order:**

1. `_engine.md` — auto-generated engine rules (vault-first, planning, output formatting, etc.)
2. All other `*.md` files — sorted alphabetically by filename

**Naming convention:** Use descriptive kebab-case filenames.

**Example files:**

`instructions/planning.md`:

```markdown
# Planning Rules

- Always create a plan before writing code
- Use two-gate approval: plan first, then tasks
- Wait for explicit approval before proceeding
```

`instructions/domain-design.md`:

```markdown
# Design System Rules

- NO raw colors: #hex, rgb(), hsl(), bg-blue-500
- YES semantic tokens: bg-surface, text-primary, border-default
- Priority: semantic > contextual > primitive
```

### workflows/ Directory

Each workflow is a folder with up to 3 files:

**prompt.md** — Step-by-step workflow instructions. Free-form markdown that the model reads and follows.

```markdown
# Feature Development

## When to Use

When building a new feature, adding functionality, or creating components.

## Steps

### 1. Understand

- Search vault for existing patterns
- Read relevant code
- Clarify requirements with user

### 2. Plan

- Create structured plan via op:orchestrate_plan
- Wait for user approval

### 3. Build

- Implement with vault-informed decisions
- Follow existing patterns

### 4. Verify

- Run tests
- Check accessibility
- Validate tokens

### 5. Ship

- Capture knowledge to vault
- Complete orchestration lifecycle
```

**gates.yaml** — Checkpoints with acceptance criteria.

```yaml
gates:
  - phase: brainstorming
    requirement: User has approved the approach
    check: user-approval

  - phase: pre-execution
    requirement: Plan created and approved
    check: plan-approved

  - phase: post-task
    requirement: All tests pass
    check: tests-pass

  - phase: completion
    requirement: Knowledge captured to vault
    check: knowledge-captured
```

**tools.yaml** — MCP tools this workflow uses (for documentation and validation).

```yaml
tools:
  - soleri_vault op:search_intelligent
  - soleri_plan op:create_plan
  - soleri_plan op:approve_plan
  - soleri_brain op:recommend
```

### knowledge/ Directory

JSON intelligence bundles. These are seed data loaded into the vault on first run.

Format: Soleri IntelligenceBundle (same as current `@soleri/domain-*` packs).

```json
{
  "domain": "design",
  "version": "1.0.0",
  "entries": [
    {
      "type": "pattern",
      "title": "Semantic tokens over raw colors",
      "description": "Always use semantic tokens...",
      "category": "design",
      "severity": "critical",
      "tags": ["tokens", "color"]
    }
  ]
}
```

### skills/ Directory

Standard Claude Code SKILL.md files. Each skill lives in its own subfolder.

```
skills/
  orchestrate/
    SKILL.md
  vault-navigator/
    SKILL.md
```

### hooks/ Directory

Standard Claude Code hook files (markdown with YAML frontmatter).

## CLAUDE.md Auto-Generation

CLAUDE.md is **never manually edited**. It is composed from:

### Composition Algorithm

```
1. Read agent.yaml → extract identity, domains, principles, tone
2. Read instructions/_engine.md → engine rules (auto-generated from latest engine version)
3. Read instructions/*.md (excluding _engine.md) → sorted alphabetically
4. Query engine for registered tools → build facade table
5. Read workflows/ → build workflow index
6. Compose sections in order:
   a. Agent identity block (from agent.yaml)
   b. Activation commands
   c. Session start protocol
   d. Essential tools table (from engine registration)
   e. Engine rules (from _engine.md)
   f. User instructions (from instructions/*.md)
   g. Available workflows (from workflows/)
   h. Available skills (from skills/)
```

### Agent Identity Block Format

```markdown
# {name} Mode

## {name}

**Role:** {role}
**Domains:** {domains joined}
**Tone:** {tone}

{description}

**Principles:**
{principles as bullet list}

## Activation

**Activate:** "Hello, {name}!" → `{id}_core op:activate params:{ projectPath: "." }`
**Deactivate:** "Goodbye, {name}!" → `{id}_core op:activate params:{ deactivate: true }`

## Session Start

On every new session: `{id}_core op:session_start params:{ projectPath: "." }`

## Essential Tools

| Facade       | Key Ops                                        |
| ------------ | ---------------------------------------------- |
| `{id}_core`  | `health`, `identity`, `register`, `activate`   |
| `{id}_vault` | `search_intelligent`, `capture_knowledge`, ... |
| `{id}_brain` | `recommend`, `strengths`, `feedback`, ...      |
| ...          | ...                                            |
```

### Regeneration Triggers

`soleri dev` watches these files and regenerates CLAUDE.md on change:

- `agent.yaml`
- `instructions/*.md`
- `workflows/*/prompt.md`
- `skills/*/SKILL.md`

## Relationship to Knowledge Engine

The agent folder is the **shell**. The Soleri Knowledge Engine is the **brain**.

```
┌─────────────────────────────┐
│  Agent Folder (file tree)   │
│  ├── agent.yaml             │
│  ├── instructions/          │──── Claude Code reads these natively
│  ├── workflows/             │
│  └── knowledge/             │
└──────────┬──────────────────┘
           │ .mcp.json
           ▼
┌─────────────────────────────┐
│  Soleri Knowledge Engine    │
│  (single MCP server)        │
│  ├── soleri_vault           │
│  ├── soleri_brain           │──── Persistent state, learning,
│  ├── soleri_curator         │     cross-project intelligence
│  ├── soleri_plan         │
│  ├── soleri_memory          │
│  └── soleri_admin           │
└─────────────────────────────┘
```

The engine reads `agent.yaml` on startup to configure itself:

- Which vault to connect
- Which domain packs to load
- Whether to enable cognee/learning
- Agent ID for tool naming prefix
