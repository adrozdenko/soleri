---
name: retrospective
description: Use when the user asks "what did I learn this week", "sprint retro", "retrospective", "learning report", "what went well", "what could improve", "weekly summary", "monthly report", or wants to reflect on recent work and extract actionable insights from accumulated data.
---

# Retrospective — Learning Report From Real Data

Generate a retrospective from actual session data, vault captures, plan outcomes, and brain intelligence. Not opinions — data-driven reflection on what happened, what worked, what didn't, and what to do differently.

## When to Use

- End of sprint / week / month
- "What did I learn this week?"
- "Sprint retrospective"
- "What went well? What didn't?"
- After completing a major feature or milestone

## The Magic: Data-Driven Reflection

### Step 1: Gather the Data

**Brain stats — the big picture:**

```
salvador_core op:brain_stats
```

**Recent brain stats — compare velocity:**

```
salvador_core op:brain_stats
  params: { since: "<start of period>" }
```

**Pattern strengths — what's proven:**

```
salvador_core op:brain_strengths
```

**Recent vault captures — what was learned:**

```
salvador_core op:vault_recent
```

**Memory topics — where knowledge clusters:**

```
salvador_core op:memory_topics
```

**Memory stats — volume and health:**

```
salvador_core op:memory_stats
```

**Plan stats — execution track record:**

```
salvador_core op:plan_stats
```

**Loop history — iterative workflow outcomes:**

```
salvador_core op:loop_history
```

**Search insights — what people looked for but didn't find:**

```
salvador_core op:admin_search_insights
```

**Vault analytics — knowledge quality:**

```
salvador_core op:admin_vault_analytics
```

### Step 2: Analyze Patterns

**Stale knowledge needing refresh:**

```
salvador_core op:vault_age_report
```

**Duplicates that crept in:**

```
salvador_core op:curator_detect_duplicates
```

**Contradictions in the knowledge base:**

```
salvador_core op:curator_contradictions
```

**Curator health audit — overall quality:**

```
salvador_core op:curator_health_audit
```

### Step 3: Present the Retrospective

```
## Retrospective: [Period]

### By the Numbers
| Metric | This Period | Previous | Trend |
|--------|-----------|----------|-------|
| Patterns captured | X | Y | ↑/↓ |
| Anti-patterns logged | X | Y | ↑/↓ |
| Plans completed | X | Y | ↑/↓ |
| Brain strength (avg) | X | Y | ↑/↓ |
| Vault entries total | X | — | — |
| Search misses | X | Y | ↑/↓ |

### What Went Well
[Patterns with high brain strength, completed plans, growing domains]

### What Didn't Go Well
[Recurring anti-patterns, failed plans, search misses = knowledge gaps]

### Strongest Patterns
[Top 5 patterns by brain strength — these are your superpowers]

### Recurring Anti-Patterns
[Top 3 anti-patterns that keep appearing — these need systemic fixes]

### Knowledge Gaps
[Domains with low coverage, frequent search misses, stale entries]

### Vault Health
- Quality score: X/100
- Duplicates found: N
- Contradictions found: N
- Stale entries (>30 days): N

### Recommendations
1. [Action item based on data]
2. [Action item based on data]
3. [Action item based on data]
```

### Step 4: Capture the Retrospective

Save the retrospective itself as knowledge:

```
salvador_core op:capture_knowledge
  params: {
    title: "Retrospective — [period]",
    description: "<key findings and action items>",
    type: "workflow",
    category: "meta",
    tags: ["retrospective", "<period>"]
  }
```

### Step 5: Clean Up (Optional)

If the retrospective revealed quality issues, offer to fix them:

**Consolidate vault (deduplicate, normalize, groom):**

```
salvador_core op:curator_consolidate
```

**Rebuild brain intelligence with fresh data:**

```
salvador_core op:brain_build_intelligence
```

## The Magic

This feels like magic because the user says "sprint retro" and gets a data-driven report they didn't have to compile. It's not AI making up observations — it's actual metrics from their vault, brain, plans, and memory. The recommendations come from real gaps, not generic advice.

## Agent Tools Reference

| Op                          | When to Use                 |
| --------------------------- | --------------------------- |
| `brain_stats`               | Big picture metrics         |
| `brain_strengths`           | Proven patterns             |
| `vault_recent`              | What was captured recently  |
| `memory_topics`             | Knowledge clusters          |
| `memory_stats`              | Memory volume and health    |
| `plan_stats`                | Plan completion rates       |
| `loop_history`              | Iterative workflow outcomes |
| `admin_search_insights`     | Search miss analysis        |
| `admin_vault_analytics`     | Knowledge quality metrics   |
| `vault_age_report`          | Stale entries               |
| `curator_detect_duplicates` | Duplicate detection         |
| `curator_contradictions`    | Knowledge conflicts         |
| `curator_health_audit`      | Overall vault quality       |
| `capture_knowledge`         | Persist the retrospective   |
| `curator_consolidate`       | Post-retro cleanup          |
| `brain_build_intelligence`  | Rebuild intelligence        |
