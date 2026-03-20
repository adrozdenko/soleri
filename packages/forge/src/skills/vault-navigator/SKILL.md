---
name: vault-navigator
description: Use when querying the knowledge base for existing solutions, patterns, best practices, or prior art before building something new.
---

# Vault Navigator — Knowledge Oracle

Navigate the vault intelligently. Picks the right search strategy based on what the user needs.

## Search Strategy Decision Tree

### "Have we seen this?" / "Best practice for X"

```
ernesto_core op:search_intelligent
  params: { query: "<question>" }
```

If results are weak, fall back to `op:search` with explicit filters (type, category, tags, severity).

### "Show me everything about X" (Exploration)

```
ernesto_core op:vault_tags
ernesto_core op:vault_domains
ernesto_core op:vault_recent
```

### "What's stale?" / "What needs updating?"

```
ernesto_core op:vault_age_report
```

### "What do other projects do?"

```
ernesto_core op:memory_cross_project_search
  params: { query: "<topic>", crossProject: true }
ernesto_core op:project_linked_projects
```

### "Has brain learned about X?"

```
ernesto_core op:brain_strengths
ernesto_core op:brain_global_patterns
  params: { domain: "<domain>" }
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

| Op | When to Use |
|----|-------------|
| `search_intelligent` | Default semantic search |
| `search` | Structured search with filters |
| `vault_tags` / `vault_domains` | Browse knowledge landscape |
| `vault_recent` | Recently modified entries |
| `vault_age_report` | Stale entries |
| `memory_cross_project_search` | Cross-project search |
| `brain_strengths` / `brain_global_patterns` | Proven patterns |
| `capture_quick` | Capture web findings |
