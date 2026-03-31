---
name: soleri-knowledge-harvest
description: >
  Use to EXTRACT multiple patterns from a source — code, docs, PRs, articles. Triggers on
  "learn from this", "harvest knowledge", "ingest this document", "extract patterns from".
  The agent reads the source and identifies what to capture. For saving a single known item,
  use vault-capture instead.
---

# Knowledge Harvest — Extract Patterns From Anything

Point at code, docs, PRs, architecture decisions, or postmortems — the agent extracts every pattern, anti-pattern, decision, and principle, then captures them to the vault.

## Steps

### 1. Understand the Source

Read target content and classify: `YOUR_AGENT_core op:route_intent params: { prompt: "Extract knowledge from: <source>" }`

### 2. Check What's Already Known

```
YOUR_AGENT_core op:search_intelligent
  params: { query: "<topic of source material>" }
YOUR_AGENT_core op:vault_tags
YOUR_AGENT_core op:vault_domains
```

Focus extraction on gaps — skip what vault already covers.

### 3. Extract and Classify

| Type             | What to Look For                     |
| ---------------- | ------------------------------------ |
| **pattern**      | Repeatable approaches that work      |
| **anti-pattern** | Known mistakes to avoid              |
| **decision**     | Architectural choices with rationale |
| **principle**    | Guiding rules or heuristics          |
| **workflow**     | Step-by-step procedures              |

For each: determine category, severity, and tags.

### 4. Batch Capture

```
YOUR_AGENT_core op:capture_knowledge
  params: {
    title: "<clear, searchable name>",
    description: "<what it is, when to apply, why it matters>",
    type: "<pattern|anti-pattern|decision|principle|workflow>",
    category: "<domain>",
    tags: ["<tag1>", "<tag2>"],
    example: "<code snippet or quote>",
    why: "<reasoning>"
  }
```

Present each capture as you go: `Captured: api-auth-jwt (pattern, critical)`

### 5. Post-Harvest Quality

- `op:curator_detect_duplicates` — find duplicates created during harvest
- `op:curator_groom_all` — normalize tags, fix metadata
- `op:curator_contradictions` — check for conflicts

### 6. Verify and Report

```
## Harvest Complete

Source: [name]
Extracted: X entries (Y patterns, Z anti-patterns, W decisions)
Duplicates: N (merged/skipped)
Contradictions: N (flagged)
Vault health: OK
```

Optionally promote universal patterns: `op:memory_promote_to_global`.

## Common Mistakes

- Not checking vault before extracting (creates duplicates)
- Capturing too-granular entries instead of atomic, searchable ones
- Skipping post-harvest quality checks (duplicates and contradictions accumulate)

## Quick Reference

| Op                             | When to Use              |
| ------------------------------ | ------------------------ |
| `search_intelligent`           | Check existing knowledge |
| `vault_tags` / `vault_domains` | See what's covered       |
| `capture_knowledge`            | Capture each item        |
| `curator_detect_duplicates`    | Post-harvest dedup       |
| `curator_groom_all`            | Normalize entries        |
| `curator_contradictions`       | Find conflicts           |
| `memory_promote_to_global`     | Share cross-project      |
| `admin_vault_analytics`        | Knowledge quality        |
