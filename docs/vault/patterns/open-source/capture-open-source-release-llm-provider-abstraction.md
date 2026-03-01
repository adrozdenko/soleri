---
id: pattern-open-source-capture-open-source-release-llm-provider-abstraction
title: Open Source Release — LLM Provider Abstraction
category: open-source
severity: critical
tags:
  - open-source
  - architecture
  - llm
  - provider-abstraction
  - model-agnostic
  - ollama
  - openai
  - anthropic
knowledge_type: pattern
created: 2026-02-24
curator_version: 1
status: published
confidence: 1
source: unknown
---

# Open Source Release — LLM Provider Abstraction

## Context

Salvador currently uses OpenAI keys for vault intelligence, brain, capture enrichment, and Telegram bot. Soleri needs to abstract this so users can choose their LLM provider or run with no LLM at all.

## Pattern

Soleri has two layers of LLM usage: (1) client-side model via transport protocol (model-agnostic — Soleri doesn't care what model the IDE uses), and (2) server-side LLM calls for internal engine features (vault intelligence, brain learning, capture enrichment, semantic search, Telegram bot). The server-side layer needs a pluggable LLM provider abstraction so Soleri is not locked to OpenAI. Providers: OpenAI, Anthropic, Ollama (local/offline), and a 'none' adapter that works without any API keys using basic keyword search and manual capture only. Salvador's existing add_account system with provider switching is the seed of this abstraction — formalize it as a proper interface. Critical principle: Soleri must work at a basic level with ZERO API keys. Intelligence features (enrichment, semantic search, auto-classification) are unlocked by providing an API key, but are not required.

## Example

```typescript
core/llm/interface.ts — LLMProvider interface with methods: enrich(), embed(), classify(), summarize(). Adapters: openai.ts, anthropic.ts, ollama.ts (local models, fully offline), none.ts (no LLM — keyword search only, no enrichment). Configured via soleri config or persona.yaml. The 'none' adapter ensures Soleri works without any API keys at a basic functional level.
```

## Why

Without LLM provider abstraction, Soleri is secretly locked to OpenAI despite being transport-agnostic. Users who prefer Anthropic, want local models (privacy), or want zero external dependencies would be blocked. The 'none' adapter is critical for adoption — requiring API keys on first run is a cold start killer.


