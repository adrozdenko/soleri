# Engine Profiles

Engine profiles control which modules load when your agent starts. This reduces startup overhead and MCP tool clutter for agents that don't need every capability.

## Quick Start

Add `profile` to your `agent.yaml`:

```yaml
engine:
  profile: minimal
```

## Available Profiles

### minimal

**Modules:** vault, admin, control, orchestrate

Best for: CI bots, single-purpose automation, lightweight knowledge agents.

Your agent gets:
- Knowledge vault (search, capture, CRUD)
- Admin health and config
- Identity and intent routing
- Project registration and orchestration basics

### standard

**Modules:** vault, plan, brain, memory, admin, curator, loop, orchestrate, control, context, archive

Best for: Most development agents, knowledge workers, project assistants.

Adds to minimal:
- Planning lifecycle (create, approve, execute, reconcile)
- Brain learning loop (pattern recognition, recommendations)
- Session memory (cross-project, persistent)
- Quality curation (dedup, contradictions)
- Validation loops
- Context analysis
- Knowledge archival

### full (default)

**Modules:** All 22 modules

Best for: Full-featured agents with every capability. This is the default — existing agents are unaffected.

Adds to standard:
- Agency (proactive intelligence, file watching)
- Chat (session management for chat interfaces)
- Operator (personality learning)
- Sync (git, Obsidian)
- Review (knowledge review workflow)
- Intake (book/URL/text ingestion)
- Links (Zettelkasten linking)
- Branching (vault branching)
- Embedding (embedding management)
- Tier (multi-vault connections)
- Dream (memory consolidation)

## Granular Override

Override the profile with an explicit module list:

```yaml
engine:
  modules:
    - vault
    - brain
    - plan
    - admin
    - control
```

When `modules` is set, `profile` is ignored. Unknown module names are warned and skipped.

## Profile Containment

Profiles are nested: minimal ⊂ standard ⊂ full.

Every module in minimal is also in standard. Every module in standard is also in full.

## Core Ops

The `{agentId}_core` tool (health, identity, activate) is **always registered** regardless of profile. Profiles only affect the 22 engine modules.

## Migration

No migration needed. The default profile is `full`, which loads all modules — identical to pre-profile behavior. Add `profile: minimal` or `profile: standard` to opt in to lighter configurations.
