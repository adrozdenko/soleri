---
name: soleri-vault-navigator
description: >
  Use when the user asks "search the vault", "find patterns for", "have we seen this
  before", "vault search", or "best practice for". Queries the knowledge base for
  existing solutions and prior art. For saving a new entry, use vault-capture instead.
---

# Vault Navigator — Knowledge Oracle

Navigate the vault intelligently. Picks the right search strategy based on what the user needs.

## Search Strategy Decision Tree

### "Have we seen this?" / "Best practice for X"

```
salvador_core op:search_intelligent
  params: { query: "<question>" }
```

If results are weak, fall back to `op:search` with explicit filters (type, category, tags, severity).

### "Show me everything about X" (Exploration)

```
salvador_core op:vault_tags
salvador_core op:vault_domains
salvador_core op:vault_recent
```

### "What's stale?" / "What needs updating?"

```
salvador_core op:vault_age_report
```

### "What do other projects do?"

```
salvador_core op:memory_cross_project_search
  params: { query: "<topic>", crossProject: true }
salvador_core op:project_linked_projects
```

### "Has brain learned about X?"

```
salvador_core op:brain_strengths
salvador_core op:brain_global_patterns
  params: { domain: "<domain>" }
```

### Session Memory Search

For queries about recent work or session-specific knowledge:

```
salvador_core op:memory_search
  params: { query: "<session-specific query>" }
```

### Broad exploration ("What do I know about X?")

Chain: `search_intelligent` -> `vault_tags` / `vault_domains` -> `memory_cross_project_search` -> `brain_strengths`. Label each finding with its source.

## Presenting Results

Always include: **Source** (vault/memory/brain), **Confidence** (score), **Relevance** (why it matches), **Next step** (how to apply).

## Fallback: Web Search

If all vault strategies return nothing, search the web. If web finds something useful, offer to capture: `op:capture_quick`.

## Common Mistakes

- Using only one search strategy instead of trying multiple
- Not labeling result sources (user can't judge confidence)
- Saying "nothing found" without trying web search fallback

## Quick Reference

| Op                                          | When to Use                    |
| ------------------------------------------- | ------------------------------ |
| `search_intelligent`                        | Default semantic search        |
| `search`                                    | Structured search with filters |
| `vault_tags` / `vault_domains`              | Browse knowledge landscape     |
| `vault_recent`                              | Recently modified entries      |
| `vault_age_report`                          | Stale entries                  |
| `memory_cross_project_search`               | Cross-project search           |
| `memory_search`                             | Session and recent work search |
| `brain_strengths` / `brain_global_patterns` | Proven patterns                |
| `capture_quick`                             | Capture web findings           |
