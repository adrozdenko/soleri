---
id: reference-architecture-capture-editor-ecosystem-mapping-for-soleri-hooks-plugin-s
title: Editor ecosystem mapping for Soleri hooks plugin system
category: architecture
severity: suggestion
tier: captured
tags:
  - forge
  - hooks
  - editor-ecosystem
  - cursor
  - windsurf
  - copilot
  - cline
  - aider
  - MCP
  - portability
knowledge_type: reference
created: 2026-03-03
related_pattern: principle-architecture-capture-editor-hooks-as-installable-plugins-not-creation-t
curator_version: 1
status: published
confidence: 1
source: unknown
---

# Editor ecosystem mapping for Soleri hooks plugin system

## Context

Captured during development session on 2026-03-03

## Reference

Mapping of AI coding editor ecosystems and their configuration capabilities for the `soleri hooks add <editor>` plugin system.

**Full hook support (event-driven lifecycle):**
- Claude Code — .claude/settings.json — PreToolUse, PostToolUse, Stop, SessionStart, UserPromptSubmit, PreCompact. Richest hook system, supports runtime enforcement.

**Rules files only (static instructions, no lifecycle hooks):**
- Cursor — .cursorrules
- Windsurf — .windsurfrules
- GitHub Copilot — .github/copilot-instructions.md
- Cline — .clinerules
- Aider — .aider.conf.yml + conventions files
- Continue — .continue/ directory

**Universal connector:** MCP transport works across all editors that support it (Claude Code, Cursor, Windsurf, Cline, Continue). The MCP connection is universal; hooks are the editor-specific glue on top.

**What `soleri hooks add` generates per editor:**
- claude-code → .claude/settings.json (full lifecycle hooks)
- cursor → .cursorrules (instructions only)
- windsurf → .windsurfrules (instructions only)
- copilot → .github/copilot-instructions.md (instructions only)

## Details

N/A

## Why

Soleri is editor-agnostic. Understanding what each editor supports determines how much enforcement the hooks plugin can provide. Claude Code gets full runtime hooks; others get static instruction files. MCP is the universal transport regardless of editor.
