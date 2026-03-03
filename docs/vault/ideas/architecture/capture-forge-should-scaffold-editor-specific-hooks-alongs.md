---
id: idea-architecture-capture-forge-should-scaffold-editor-specific-hooks-alongs
title: Forge should scaffold editor-specific hooks alongside agent templates
category: architecture
severity: suggestion
tier: captured
tags:
  - forge
  - scaffolding
  - hooks
  - claude-code
  - agent-creation
  - developer-experience
knowledge_type: idea
status: proposed
created: 2026-03-03
curator_version: 1
confidence: 1
source: unknown
---

# Forge should scaffold editor-specific hooks alongside agent templates

## Context

Captured during development session on 2026-03-03

## Idea

When `soleri create my-agent` scaffolds a new agent, it should include editor-specific hooks (e.g. .claude/settings.json for Claude Code) alongside vault, brain, memory, and persona templates. This makes agents immediately functional in their target editor without manual hook setup. For Claude Code, this means vault-capture enforcement, session capture, loop gates, and routing hooks ship with the agent.

## Motivation

soleri create my-agent → generates:

- vault.ts, brain.ts, personas/ (existing)
- hooks/claude-code/settings.json (NEW — vault-capture, session capture, routing)
- hooks/cursor/ (future)
- hooks/vscode/ (future)

## Why

Currently hooks live in personal ~/.claude/settings.json and aren't portable. If Soleri is agent-agnostic and editor-agnostic, the forge should generate the right hook configuration per editor so agents work out of the box. Users shouldn't have to manually configure hooks after creating an agent.
