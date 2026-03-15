---
name: health-check
description: Use when the user asks "check health", "vault health", "knowledge quality", "clean up vault", "groom knowledge", "maintenance", "housekeeping", "deduplicate", "find contradictions", or wants to run a maintenance cycle on the knowledge base to keep it healthy and accurate.
---

# Health Check — Knowledge Base Maintenance

Run a comprehensive maintenance cycle on the knowledge base. Finds stale entries, duplicates, contradictions, quality issues, and fixes them. Like a doctor's checkup for your knowledge.

## When to Use

- Weekly/monthly maintenance ritual
- "Is my vault healthy?"
- "Clean up my knowledge base"
- Before a retrospective (clean data = better insights)
- After a knowledge harvest (post-ingest quality check)

## The Magic: Comprehensive Quality Audit

### Step 1: System Health

```
salvador_core op:admin_health
```

```
salvador_core op:admin_diagnostic
```

Catches infrastructure issues — database corruption, stale caches, configuration problems.

### Step 2: Vault Metrics

```
salvador_core op:admin_vault_size
```

```
salvador_core op:admin_vault_analytics
```

```
salvador_core op:vault_domains
```

```
salvador_core op:vault_tags
```

Shows the big picture: how many entries, which domains, tag distribution.

### Step 3: Quality Audit

Run the curator's health audit — the most comprehensive quality check:

```
salvador_core op:curator_health_audit
```

This checks: tag normalization, description quality, severity distribution, domain coverage balance, and overall vault quality score.

### Step 4: Find Duplicates

```
salvador_core op:curator_detect_duplicates
```

Present duplicates for review. Offer to merge or remove them.

### Step 5: Find Contradictions

```
salvador_core op:curator_contradictions
```

Contradictions are entries that give conflicting advice. Present each pair for the user to resolve:

```
salvador_core op:curator_resolve_contradiction
  params: { contradictionId: "<id>" }
```

### Step 6: Find Stale Entries

```
salvador_core op:vault_age_report
```

Entries older than 30 days without updates are candidates for:

- Refresh (still relevant, needs updating)
- Archive (no longer relevant)
- Delete (incorrect or superseded)

### Step 7: Check Search Quality

```
salvador_core op:admin_search_insights
```

Shows what people search for but don't find — these are knowledge gaps that should be filled.

### Step 8: Memory Health

```
salvador_core op:memory_stats
```

```
salvador_core op:memory_deduplicate
```

Clean up duplicate memories.

### Step 9: Governance Queue

Check if any proposals are pending review:

```
salvador_core op:governance_proposals
  params: { action: "list" }
```

```
salvador_core op:governance_stats
```

Expire stale proposals:

```
salvador_core op:governance_expire
```

### Step 10: Fix Everything (Optional)

If the user approves, run the full cleanup:

**Groom all entries — normalize tags, fix metadata:**

```
salvador_core op:curator_groom_all
```

**Full consolidation — deduplicate, normalize, quality-score:**

```
salvador_core op:curator_consolidate
```

**Prune stale memory:**

```
salvador_core op:memory_prune
```

**Rebuild brain intelligence with clean data:**

```
salvador_core op:brain_build_intelligence
```

**Reset caches to pick up changes:**

```
salvador_core op:admin_reset_cache
```

## Presenting the Health Report

```
## Knowledge Health Report

### System
| Check | Status |
|-------|--------|
| Infrastructure | OK / Issues |
| Database | OK / Issues |
| Cache | OK / Issues |

### Vault Quality
| Metric | Value | Status |
|--------|-------|--------|
| Total entries | X | — |
| Quality score | X/100 | Good/Warning/Critical |
| Domains | X | — |
| Tags | X | — |

### Issues Found
| Issue | Count | Action |
|-------|-------|--------|
| Duplicates | X | Merge |
| Contradictions | X | Resolve |
| Stale entries (>30d) | X | Review |
| Search misses | X | Fill gaps |
| Pending proposals | X | Review |

### Recommended Actions
1. [Most impactful fix]
2. [Second most impactful]
3. [Third most impactful]
```

## The Magic

This feels like magic because knowledge bases normally decay silently — duplicates accumulate, entries go stale, contradictions creep in, gaps grow. This skill makes decay visible and fixable in one command. It's like having a librarian who does a weekly audit of every book on every shelf.

## Agent Tools Reference

| Op                              | When to Use                     |
| ------------------------------- | ------------------------------- |
| `admin_health`                  | System health check             |
| `admin_diagnostic`              | Comprehensive system diagnostic |
| `admin_vault_size`              | Vault storage metrics           |
| `admin_vault_analytics`         | Knowledge quality metrics       |
| `admin_search_insights`         | Search miss analysis            |
| `admin_reset_cache`             | Clear caches after cleanup      |
| `vault_domains` / `vault_tags`  | Knowledge landscape             |
| `vault_age_report`              | Stale entry detection           |
| `curator_health_audit`          | Quality score and audit         |
| `curator_detect_duplicates`     | Find duplicates                 |
| `curator_contradictions`        | Find conflicting entries        |
| `curator_resolve_contradiction` | Resolve conflicts               |
| `curator_groom_all`             | Batch tag normalization         |
| `curator_consolidate`           | Full cleanup pipeline           |
| `memory_stats`                  | Memory health                   |
| `memory_deduplicate`            | Remove duplicate memories       |
| `memory_prune`                  | Remove stale memories           |
| `governance_proposals`          | Pending review queue            |
| `governance_stats`              | Governance metrics              |
| `governance_expire`             | Expire stale proposals          |
| `brain_build_intelligence`      | Rebuild after cleanup           |
