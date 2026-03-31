---
name: soleri-retrospective
description: >
  Use when the user says "sprint retro", "weekly summary", "what went well",
  "end of sprint", or "monthly report". Time-bound reflection on recent work
  that reviews sessions and extracts actionable improvements.
---

# Retrospective — Learning Report From Real Data

Generate a data-driven retrospective from session data, vault captures, plan outcomes, and brain intelligence.

## Steps

### 1. Gather Data

```
salvador_core op:brain_stats
salvador_core op:brain_stats params: { since: "<start of period>" }
salvador_core op:brain_strengths
salvador_core op:vault_recent
salvador_core op:memory_topics
salvador_core op:memory_stats
salvador_core op:plan_stats
salvador_core op:admin_search_insights
salvador_core op:admin_vault_analytics
```

### 2. Analyze Patterns

```
salvador_core op:vault_age_report
salvador_core op:curator_detect_duplicates
salvador_core op:curator_contradictions
salvador_core op:curator_health_audit
```

### 3. Present the Retrospective

```
## Retrospective: [Period]

### By the Numbers
| Metric | This Period | Previous | Trend |
|--------|-----------|----------|-------|
| Patterns captured | X | Y | up/down |
| Plans completed | X | Y | up/down |
| Brain strength (avg) | X | Y | up/down |
| Search misses | X | Y | up/down |

### What Went Well
[High brain strength patterns, completed plans, growing domains]

### What Didn't Go Well
[Recurring anti-patterns, failed plans, knowledge gaps]

### Vault Health
Quality: X/100 | Duplicates: N | Contradictions: N | Stale: N

### Recommendations
1. [Data-driven action item]
2. [Data-driven action item]
```

### 4. Capture the Retrospective

```
salvador_core op:capture_knowledge
  params: {
    title: "Retrospective — [period]",
    description: "<key findings and action items>",
    type: "workflow",
    category: "meta",
    tags: ["retrospective"]
  }
```

### 5. Clean Up (Optional)

If quality issues found: `op:curator_consolidate` then `op:brain_build_intelligence`.

## Common Mistakes

- Presenting AI opinions instead of actual vault/brain metrics
- Not comparing periods (missing trends)
- Skipping the capture step (retrospective insights are lost)

## Quick Reference

| Op                                | When to Use           |
| --------------------------------- | --------------------- |
| `brain_stats` / `brain_strengths` | Metrics and patterns  |
| `vault_recent`                    | Recent captures       |
| `memory_topics` / `memory_stats`  | Knowledge clusters    |
| `plan_stats`                      | Plan completion       |
| `admin_search_insights`           | Search misses         |
| `curator_health_audit`            | Vault quality         |
| `capture_knowledge`               | Persist retrospective |
