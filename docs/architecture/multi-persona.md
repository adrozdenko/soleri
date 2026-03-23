# Multi-Persona Sessions — Design Document

> Status: Draft — not yet implemented

## Problem

Real work is cross-domain. A full-stack developer needs design intelligence for UI, architecture intelligence for backend, and security intelligence for auth — all in one session. Today, each agent runs as a separate MCP server with isolated state.

## Current State

- Each agent = one MCP server = one vault + brain + planner
- Switching agents requires restarting the MCP connection
- No shared knowledge between agents in the same session
- `soleri install` registers one agent per host config

## Design Constraints

1. **Vault isolation by default** — agents should not read each other's captured knowledge without consent
2. **Context preservation** — switching agents mid-session should not lose conversation context
3. **Cross-agent knowledge sharing** — opt-in, not automatic
4. **No performance regression** — multi-persona should not slow down single-persona usage

## Proposed Approach: Shared Engine, Multiple Personas

Instead of running multiple MCP servers, run one engine that loads multiple personas:

```yaml
# agent.yaml
personas:
  - id: salvador
    domains: [design, accessibility, component-patterns]
    packs: ['@soleri/domain-design']
  - id: gaudi
    domains: [architecture, api-design, database]
    packs: ['@soleri/domain-architecture']
  - id: sentinel
    domains: [security, auth, compliance]
    packs: ['@soleri/domain-security']
```

### How It Works

1. **Single engine, shared vault** — all personas read/write the same vault (tagged by domain)
2. **Persona switching via op** — `control op:switch_persona params:{ persona: "gaudi" }` changes active identity, intent routing, and domain filters
3. **Domain-scoped search** — when Salvador is active, vault search prioritizes design/accessibility entries
4. **Shared brain** — learning from all personas feeds the same brain (cross-domain patterns are valuable)
5. **Isolated planner** — each persona has its own plan namespace

### What Changes

| Component        | Change                                                               |
| ---------------- | -------------------------------------------------------------------- |
| Identity manager | Support multiple loaded personas, one active                         |
| Intent router    | Route based on active persona's domains                              |
| Vault search     | Add persona-aware domain boosting                                    |
| Brain            | Shared — no change                                                   |
| Planner          | Namespace plans by persona ID                                        |
| MCP tools        | All tools available always — persona affects behavior, not tool list |

## Open Questions

- Should personas have separate `PackRuntime` scopes?
- How to handle conflicting domain pack ops (two packs claim same op name)?
- Should the session briefing show cross-persona context?
- How to represent persona switching in CLAUDE.md?

## Alternative: Multi-Server with Shared Vault

Instead of one engine, keep separate MCP servers but connect them to a shared vault via `vaultManager.connect()`. This is already supported — agents can link vaults with priority-based cascading search.

**Pros:** No engine changes, works today
**Cons:** No mid-session switching, separate processes, no shared brain

## Recommendation

Start with the shared vault approach (works today). Multi-persona in a single engine is a v2 feature that requires identity manager and intent router changes.
