---
id: principle-open-source-opensource-vision
title: Open Source Release — Vision & Tagline
category: open-source
severity: critical
tags:
  - open-source
  - strategy
  - vision
  - release-plan
knowledge_type: principle
status: archived
created: 2026-02-24
updated: 2026-02-24
curator_version: 2
confidence: 1
source: unknown
---

# Open Source Release — Vision & Tagline

## Context

Tagline: "An open-source framework for building AI assistants that learn, remember, and grow with you." The engine needs its own name separate from Salvador. Salvador, Gaudi, Sentinel, Atlas, Architect, Testic are all personas built on the same engine.

## Principle

Salvador evolves from a design system orchestrator into a general-purpose AI assistant framework. The engine is domain-agnostic — vault, brain, planning, memory, session capture, intent routing, persona system — none of it is design-specific. Salvador becomes the flagship persona, not the product itself.

## Core Design Principles

1. **Transport-agnostic** — Engine core has zero protocol dependencies. MCP is the first transport adapter, not the only one. Core logic works independently so the engine can serve Claude Code, VS Code, Cursor, REST APIs, or any future platform without rewriting.

2. **Team-ready from day one** — Architecture supports shared vaults, multi-user access, and collaborative knowledge even if v1 ships single-user. No design decisions that prevent team features later.

3. **Cross-domain by default** — Personas share a project-level knowledge layer. Switching from Salvador to Gaudi mid-session preserves context. Knowledge captured in one persona is accessible to others via shared vault search.

4. **Community-driven growth** — Open contribution model with clear tiers: engine code, domain modules, persona templates, and knowledge entries each have defined review processes.

5. **Never-empty start** — No user faces a blank vault. Starter packs, project scanning, and guided learning ensure value from minute one.

## Example

User installs engine → runs forge to create persona → persona uses engine core (vault, brain, planning, memory) → persona-specific domains (design, security, architecture) are plugins → knowledge packs are the commercial product. Engine runs as single MCP server. Works today on Claude Code, tomorrow on any platform via new transport adapter.

## Why

The underlying architecture (vault + brain + planning + personas + memory) is already domain-agnostic. Multiple personas prove this. Open-sourcing the engine while commercializing knowledge packs is the proven open-core model. The five design principles ensure the project doesn't paint itself into corners on platform lock-in, team support, or community growth.
