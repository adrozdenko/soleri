---
name: vault-navigator
description: Use when the user asks "what does vault say", "search knowledge", "find pattern", "have we seen this before", "best practice for", "check vault", "vault search", "any patterns for", or wants to query the knowledge base for existing solutions or guidance.
---

# Vault Navigator — Knowledge Oracle

Navigate the vault intelligently. The vault has multiple search strategies — this skill picks the right one based on what the user needs.

## When to Use

Any time the user wants to find existing knowledge before building something new. Also when asking about best practices, previous solutions, or patterns.

## Search Strategy Decision Tree

### For "Have we seen this before?" / "Best practice for X"

Start with `salvador_core op:search_intelligent` — this is semantic search, the broadest and smartest query. Pass the user's question as the query.

```
salvador_core op:search_intelligent
  params: { query: "<user's question>" }
```

If results are weak (low scores or few matches), fall back to `salvador_core op:search` with explicit filters (type, category, tags, severity). This is structured search — narrower but more precise.

### For "Show me everything about X" (Exploration)

Use tag-based and domain-based browsing for broader exploration:

```
salvador_core op:vault_tags
```

Lists all tags in the vault — helps discover what topics are covered.

```
salvador_core op:vault_domains
```

Lists all domains — shows the knowledge landscape at a glance.

```
salvador_core op:vault_recent
```

Shows recently added or modified entries — what's fresh in the vault.

### For "What's stale?" / "What needs updating?"

Run an age report to find outdated knowledge:

```
salvador_core op:vault_age_report
```

Present entries that haven't been updated recently — these are candidates for review, refresh, or removal.

### For "What do other projects do?"

Call `salvador_core op:memory_cross_project_search` with `crossProject: true`. This searches across all linked projects, not just the current one.

```
salvador_core op:memory_cross_project_search
  params: { query: "<topic>", crossProject: true }
```

Check what projects are linked:

```
salvador_core op:project_linked_projects
```

### For "Has brain learned anything about X?"

Call `salvador_core op:brain_strengths` to see which patterns have proven strength. Then call `salvador_core op:brain_global_patterns` with a domain or tag filter to find cross-project patterns.

```
salvador_core op:brain_strengths
salvador_core op:brain_global_patterns
  params: { domain: "<domain>" }
```

### For "What do I know about X?" (broad exploration)

Chain multiple strategies for comprehensive results:

1. `search_intelligent` → semantic vault search
2. `vault_tags` / `vault_domains` → browse knowledge landscape
3. `memory_cross_project_search` → cross-project patterns
4. `brain_strengths` → proven patterns

Present all findings with source labels so the user knows where each insight came from.

## Presenting Results

Always include:

- **Source**: Which search found it (vault, memory, brain, tags, domains)
- **Confidence**: Score or strength rating
- **Relevance**: Why this result matches the query
- **Actionable next step**: How to apply this knowledge

## Fallback: Web Search

If all vault strategies return no results, search the web for the user's question before saying "nothing found." The web may have:

- Documentation, articles, or guides on the topic
- Community patterns and best practices
- Library-specific solutions

If web search finds something useful, offer to capture it to the vault:

```
salvador_core op:capture_quick
  params: {
    title: "<what was found>",
    description: "<summary from web search, source URL>"
  }
```

## Exit Criteria

Search is complete when at least one search strategy has been tried and results presented. If no results found across all strategies (vault + web), say so explicitly — that's valuable information too (it means this is genuinely new territory worth exploring and capturing).

## Agent Tools Reference

| Op                            | When to Use                                           |
| ----------------------------- | ----------------------------------------------------- |
| `search_intelligent`          | Default semantic search — broadest and smartest       |
| `search`                      | Structured search with filters (type, tags, category) |
| `vault_tags`                  | Browse all tags — discover knowledge landscape        |
| `vault_domains`               | Browse all domains — see what areas are covered       |
| `vault_recent`                | Recently modified entries — what's fresh              |
| `vault_age_report`            | Find stale entries needing refresh                    |
| `memory_cross_project_search` | Search across linked projects                         |
| `project_linked_projects`     | See what projects are connected                       |
| `brain_strengths`             | Proven patterns ranked by success                     |
| `brain_global_patterns`       | Cross-project patterns from global pool               |
| `capture_quick`               | Capture web findings to vault for next time           |
