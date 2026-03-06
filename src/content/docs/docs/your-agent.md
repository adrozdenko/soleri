---
title: Your Agent — Quick Reference
description: A concise reference for vault, brain, memory, playbooks, and orchestration — with links to detailed guides.
---

This page is your cheat sheet. For detailed explanations, see the linked deep dives.

## The Vault

Your agent's long-term knowledge store. SQLite database with full-text search. _[Details →](/docs/guides/under-the-hood/#the-vault)_

**Entry structure:**

| Field | Values |
|-------|--------|
| **Type** | `pattern`, `anti-pattern`, `rule`, `playbook`, `workflow`, `principle`, `reference` |
| **Domain** | `frontend`, `backend`, `security`, or your custom domains |
| **Severity** | `critical` (must follow), `warning` (should follow), `suggestion` (nice to have) |
| **Tags** | Free-form labels for discovery |

**Common operations:**

```
"Search for authentication patterns"
"Capture this pattern: always use error boundaries at route level"
"Show me vault stats"
```

## The Brain

Tracks which patterns actually work. Learns from usage, strengthens useful patterns, decays unused ones. _[Details →](/docs/guides/under-the-hood/#the-brain)_

**What it does:**
- Ranks search results by proven usefulness, not just keyword match
- Surfaces recommendations when you create plans
- Extracts patterns automatically from completed work sessions

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

## Playbooks

Multi-step procedures with validation criteria at each step. _[Details →](/docs/guides/code-review/#step-4-create-a-playbook)_

**Common operations:**

```
"List available playbooks"
"Run the API endpoint review playbook on this code"
"Create a playbook called 'Database Migration' with steps: ..."
```

## Orchestration

Plan → Execute → Complete lifecycle for complex tasks. Brain recommendations feed into plans, completed plans extract knowledge back to the vault. _[Details →](/docs/guides/planning/)_

**The compound loop:**

```
vault knowledge → brain recommendations → plans → work → knowledge extraction → vault
```

## Governance

Controls how knowledge enters the vault — quotas, proposal gates, duplicate detection. _[Details →](/docs/guides/customizing/#governance-policies)_

**Presets:** `strict` (all require approval), `moderate` (auto-approve suggestions), `permissive` (auto-approve all)

## Day-to-Day Tips

1. **Follow the workflow** — [Search → Plan → Work → Capture → Complete](/docs/guides/workflow/)
2. **Capture as you go** — the moment you learn something, capture it
3. **Search before building** — 5 seconds of search can save hours of rework
4. **Use domains** — keep knowledge organized so searches stay relevant
5. **Review brain recommendations** — they reflect what actually works in your project
