---
title: Your Agent — Quick Reference
description: A concise reference for vault, brain, memory, playbooks, orchestration, and the Knowledge Engine — with links to detailed guides.
---

Your agent is a **folder** (`agent.yaml` + `instructions/` + `workflows/` + `knowledge/`). The **Knowledge Engine** (`@soleri/core`) provides all the persistent infrastructure below. Edit your agent's files — the engine handles the rest.

This page is your cheat sheet. For detailed explanations, see the linked deep dives.

## The Vault

Your agent's long-term knowledge store. SQLite database with full-text search, branching, sharing, and multi-tier connections. _[Details →](/docs/guides/under-the-hood/#the-vault)_

**Entry structure:**

| Field        | Values                                                                              |
| ------------ | ----------------------------------------------------------------------------------- |
| **Type**     | `pattern`, `anti-pattern`, `rule`, `playbook`, `workflow`, `principle`, `reference` |
| **Domain**   | `frontend`, `backend`, `security`, or your custom domains                           |
| **Severity** | `critical` (must follow), `warning` (should follow), `suggestion` (nice to have)    |
| **Tags**     | Free-form labels for discovery                                                      |

**Common operations:**

```
"Search for authentication patterns"
"Capture this pattern: always use error boundaries at route level"
"Show me vault stats"
```

**Advanced features:** vault branching (experiment without affecting main vault), Obsidian sync, knowledge pack import/export, team review workflows, multi-tier vault connections. _[66 ops →](/docs/capabilities/#vault)_

## The Brain

Tracks which patterns actually work. Learns from usage, strengthens useful patterns, decays unused ones. _[Details →](/docs/guides/under-the-hood/#the-brain)_

**What it does:**

- Ranks search results by proven usefulness, not just keyword match
- Surfaces recommendations when you create plans
- Extracts patterns automatically from completed work sessions
- Runs a full lifecycle: extract → promote → archive

**Common operations:**

```
"What does the brain recommend for this task?"
"Show me pattern strengths"
"Rebuild brain intelligence"
```

## Memory & Cross-Project

Knowledge persists across sessions in local files. Link projects to share knowledge across codebases. _[Details →](/docs/guides/cross-project-knowledge/)_

**Common operations:**

```
"Link this project to ../api-server as related"
"Search across all projects for deployment patterns"
"Promote this pattern to global"
```

## Planning

Multi-step task planning with grading, verification, evidence, and drift detection. _[Details →](/docs/guides/planning/)_

**The lifecycle:** create → grade → approve → split → execute → reconcile → complete

**Common operations:**

```
"Create a plan for migrating the auth system"
"Grade this plan"
"Submit evidence for task completion"
"Reconcile the plan against what happened"
```

_[32 ops →](/docs/capabilities/#plan)_

## Playbooks

Multi-step procedures with validation criteria at each step. _[Details →](/docs/guides/code-review/#step-4-create-a-playbook)_

**Common operations:**

```
"List available playbooks"
"Run the API endpoint review playbook on this code"
"Create a playbook called 'Database Migration' with steps: ..."
"Find a playbook that matches this context"
```

_[8 ops →](/docs/capabilities/#playbooks)_

## Orchestration

Plan → Execute → Complete lifecycle for complex tasks. Brain recommendations feed into plans, completed plans extract knowledge back to the vault. _[Details →](/docs/guides/planning/)_

**The compound loop:**

```
vault knowledge → brain recommendations → plans → work → knowledge extraction → vault
```

## Governance

Controls how knowledge enters the vault — quotas, proposal gates, duplicate detection. _[Details →](/docs/guides/customizing/#governance-policies)_

**Presets:** `strict` (all require approval), `moderate` (auto-approve suggestions), `permissive` (auto-approve all)

## Curator

Automated vault quality management — deduplication, contradiction detection, health audits, tag normalization, LLM enrichment. _[Details →](/docs/guides/under-the-hood/#the-curator)_

**Common operations:**

```
"Run a health audit"
"Detect duplicates in the vault"
"Check for contradictions"
"Groom all vault entries"
```

_[13 ops →](/docs/capabilities/#curator)_

## Chat

Session management, authentication, voice, browser isolation, and message queue for chat transports (Telegram, web). _[41 ops →](/docs/capabilities/#chat)_

**Subsystems:** sessions, auth, MCP bridge, task cancellation, self-update, file handling, notifications, voice (Whisper + TTS), message queue, per-chat browser isolation.

## Agency

Proactive mode — your agent watches file changes and surfaces relevant vault patterns without being asked. _[8 ops →](/docs/capabilities/#agency)_

```
"Enable agency mode"
"Scan this file for warnings"
"Show pending warnings"
```

## Context

Entity extraction, knowledge retrieval, and context analysis. Analyzes prompts to extract files, functions, domains, and technologies. _[3 ops →](/docs/capabilities/#context)_

## Transports

Four ways to connect: **stdio** (your AI editor), **HTTP/SSE** (web), **WebSocket** (real-time), **LSP** (editors). _[Guide →](/docs/guides/transports/)_

## All 13 Facades

| Facade                                         | Ops | Primary purpose                               |
| ---------------------------------------------- | --- | --------------------------------------------- |
| [Vault](/docs/capabilities/#vault)             | 66  | Knowledge storage, search, branching, sharing |
| [Admin](/docs/capabilities/#admin)             | 56  | Health, telemetry, plugins, packs, accounts   |
| [Chat](/docs/capabilities/#chat)               | 41  | Chat transport integration                    |
| [Plan](/docs/capabilities/#plan)               | 32  | Planning, grading, verification               |
| [Orchestrate](/docs/capabilities/#orchestrate) | 26  | Lifecycle, projects, playbooks                |
| [Brain](/docs/capabilities/#brain)             | 30  | Learning, strength, recommendations, radar    |
| [Memory](/docs/capabilities/#memory)           | 15  | Cross-session, cross-project                  |
| [Curator](/docs/capabilities/#curator)         | 13  | Vault quality management                      |
| [Control](/docs/capabilities/#control)         | 13  | Identity, governance                          |
| [Archive](/docs/capabilities/#archive)         | 12  | Vault archival, lifecycle, maintenance         |
| [Operator](/docs/capabilities/#operator)       | 10  | Profile learning, signals, adaptation          |
| [Loop](/docs/capabilities/#loop)               | 9   | Iterative validation                          |
| [Links](/docs/capabilities/#links)             | 9   | Entry linking, graph traversal                 |
| [Agency](/docs/capabilities/#agency)           | 15  | Proactive file watching, intelligence          |
| [Sync](/docs/capabilities/#sync)               | 8   | Git, Obsidian, pack sync                       |
| [Intake](/docs/capabilities/#intake)           | 7   | Content ingestion (URLs, text, books)          |
| [Tier](/docs/capabilities/#tier)               | 7   | Multi-vault connections                        |
| [Branching](/docs/capabilities/#branching)     | 5   | Vault branching, merge                         |
| [Review](/docs/capabilities/#review)           | 5   | Knowledge review workflow                      |
| [Context](/docs/capabilities/#context)         | 3   | Entity extraction, analysis                   |

**Total: 350+ operations** plus 5 per domain.

## Day-to-Day Tips

1. **Follow the workflow** — [Search → Plan → Work → Capture → Complete](/docs/guides/workflow/)
2. **Capture as you go** — the moment you learn something, capture it
3. **Search before building** — 5 seconds of search can save hours of rework
4. **Use domains** — keep knowledge organized so searches stay relevant
5. **Review brain recommendations** — they reflect what actually works in your project

Your data stays on your machine — [Security & Privacy](/docs/guides/security/). For term definitions, see the [Glossary](/docs/glossary/). If something isn't working, check [Troubleshooting](/docs/troubleshooting/).
