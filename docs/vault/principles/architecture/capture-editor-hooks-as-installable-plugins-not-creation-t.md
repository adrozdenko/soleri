---
id: principle-architecture-capture-editor-hooks-as-installable-plugins-not-creation-t
title: Editor hooks as installable plugins, not creation-time choice
category: architecture
severity: suggestion
tier: captured
tags:
  - forge
  - hooks
  - plugins
  - modularity
  - editor-agnostic
  - CLI
knowledge_type: principle
created: 2026-03-03
related_pattern: idea-architecture-capture-forge-should-scaffold-editor-specific-hooks-alongs
curator_version: 1
status: published
confidence: 1
source: unknown
---

# Editor hooks as installable plugins, not creation-time choice

## Context

Captured during development session on 2026-03-03

## Principle

Editor-specific hooks (Claude Code, Cursor, VS Code) should be managed as installable plugins via `soleri hooks add <editor>` and `soleri hooks remove <editor>`, not baked in during `soleri create`. This keeps the forge modular — users can add/switch/stack editors anytime without recreating the agent. The create wizard may optionally suggest hooks, but they're always manageable independently after creation.

## Example

# Add editor hooks to existing agent
soleri hooks add claude-code    # installs .claude/settings.json with vault-capture, session capture, routing
soleri hooks add cursor          # future
soleri hooks remove claude-code  # clean removal
soleri hooks list                # show installed hook sets

## Why

Soleri's engine is modular and editor-agnostic. Locking editor choice at agent creation time contradicts that philosophy. Users may switch editors, use multiple editors, or add editor support later. A plugin model (`soleri hooks add claude-code`) matches the existing pattern of composable knowledge packs and domain modules.
