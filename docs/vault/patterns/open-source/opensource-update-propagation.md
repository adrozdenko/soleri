---
id: pattern-open-source-opensource-update-propagation
title: Open Source Release — Update Propagation Model
category: open-source
severity: critical
tags:
  - open-source
  - updates
  - propagation
  - forge
  - npm
  - versioning
  - migration
knowledge_type: pattern
status: active
created: 2026-02-24
updated: 2026-02-24
curator_version: 3
confidence: 1
source: unknown
---

# Open Source Release — Update Propagation Model

## Context

What CAN be auto-updated: engine code, domain modules, persona templates, CLAUDE.md injection. What is NEVER auto-updated: vault knowledge (user-owned), custom ops (user-created), persona.yaml overrides (merged via three-way merge, conflicts prompt user). Template merging uses three-way merge like git: base template (original) + user current + new template = computed diff applied to user's file.

## Pattern

Four update channels:

1. **Engine improvements** → npm update, all agents benefit immediately.
2. **Domain module updates** → npm update, all agents using that domain benefit.
3. **Persona template changes** (new intent rules, facade entries, CLAUDE.md sections) → forge template version bump, users run `soleri update`, forge patches all registered agents.
4. **Knowledge updates** → added to knowledge packs, users sync/download. Community packs update via npm. Premium packs update via `soleri packs sync`.

Each channel is independent.

## Version Compatibility Contract

Every vault entry carries a format version header:

```yaml
---
format_version: 1
id: my-pattern
title: ...
```

Engine maintains a migration chain:

```
engine/migrations/
├── v1-to-v2.ts    # e.g., rename severity → priority
├── v2-to-v3.ts    # e.g., add confidence field
└── migrate.ts     # runs chain automatically
```

On startup, engine checks vault format version. If behind, runs migrations automatically. User sees: "Migrating vault from format v1 → v2... done (400 entries updated)."

Domain modules declare engine compatibility:

```json
{ "engines": { "soleri": ">=1.0.0 <3.0.0" } }
```

Engine refuses to load incompatible domains with a clear error.

Vault backends declare format compatibility — prevents a git-shared team vault from being corrupted by a member running a newer engine version before the team upgrades.

## Doctor Command

```bash
soleri doctor

Engine:    v2.1.0 ✓
Vault:     format v2 (current) ✓
Backends:
  local      active ✓
  git        connected (team/design-vault) ✓
Domains:
  design     v1.3.0 (compatible with engine v2.x) ✓
  security   v0.9.0 (requires engine <2.0) ✗ ← UPDATE NEEDED
Forge:     v1.4.0 ✓
Personas:
  salvador   template v1.3 (current) ✓
  gaudi      template v1.1 (outdated, v1.3 available) ⚠
Packs:
  starter/design     v1.0.0 (current) ✓
  community/react    v0.3.0 (update available: v0.4.0) ⚠
```

One command shows full system health: engine, vault format, backend connections, domain compatibility, forge version, persona template status, knowledge pack versions.

## Example

```
You add confidence scores to brain → push engine npm package → all agents get it on npm update → no forge update needed

Engine v2.0 renames vault field → migration v1-to-v2.ts runs automatically → 400 entries updated → no data loss

Team member on engine v2.0 connects to team vault still on format v1 → engine warns: "Team vault format v1, your engine expects v2. Run 'soleri vault migrate' or coordinate with team." → prevents silent corruption

Domain v1.3 requires engine >=1.5 → user on engine 1.2 → engine refuses to load with clear message → user runs npm update
```

## Why

Users never regenerate agents. Updates flow through the right channel based on what changed. Forge registry + template versioning handles persona-level propagation. Vault format versioning with automatic migrations prevents data loss on breaking changes. Backend-aware version checks prevent team vault corruption. Doctor command gives instant visibility into entire system health.
