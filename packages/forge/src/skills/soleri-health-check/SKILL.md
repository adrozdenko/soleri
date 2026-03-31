---
name: soleri-health-check
description: >
  Use when the user says "system health", "agent health", "run diagnostics",
  "system status", or "check health". Read-only health assessment of the
  knowledge base — scoring, reporting, finding issues.
---

# Health Check — Knowledge Base Maintenance

Comprehensive maintenance cycle on the knowledge base. Finds stale entries, duplicates, contradictions, and quality issues.

## Steps

### 1. System Health

```
YOUR_AGENT_core op:admin_health
YOUR_AGENT_core op:admin_diagnostic
```

### 2. Vault Metrics

```
YOUR_AGENT_core op:admin_vault_size
YOUR_AGENT_core op:admin_vault_analytics
YOUR_AGENT_core op:vault_domains
YOUR_AGENT_core op:vault_tags
```

### 3. Quality Audit

```
YOUR_AGENT_core op:curator_health_audit
```

### 4. Find Duplicates

```
YOUR_AGENT_core op:curator_detect_duplicates
```

### 5. Find Contradictions

```
YOUR_AGENT_core op:curator_contradictions
YOUR_AGENT_core op:curator_resolve_contradiction
  params: { contradictionId: "<id>" }
```

### 6. Find Stale Entries

```
YOUR_AGENT_core op:vault_age_report
```

Entries >30 days without updates: refresh, archive, or delete.

### 7. Check Search Quality

```
YOUR_AGENT_core op:admin_search_insights
```

### 8. Memory Health

```
YOUR_AGENT_core op:memory_stats
YOUR_AGENT_core op:memory_deduplicate
```

### 9. Governance Queue

```
YOUR_AGENT_core op:governance_proposals params: { action: "list" }
YOUR_AGENT_core op:governance_expire
```

### 10. Fix Everything (Optional, with user approval)

- `op:curator_groom_all` — normalize tags, fix metadata
- `op:curator_consolidate` — deduplicate, normalize, quality-score
- `op:memory_prune` — remove stale memories
- `op:brain_build_intelligence` — rebuild with clean data
- `op:admin_reset_cache` — clear caches

## Presenting the Report

```
## Knowledge Health Report

### System
| Check | Status |
|-------|--------|
| Infrastructure | OK / Issues |

### Vault Quality
| Metric | Value | Status |
|--------|-------|--------|
| Total entries | X | — |
| Quality score | X/100 | Good/Warning/Critical |

### Issues Found
| Issue | Count | Action |
|-------|-------|--------|
| Duplicates | X | Merge |
| Contradictions | X | Resolve |
| Stale entries (>30d) | X | Review |
| Search misses | X | Fill gaps |

### Recommended Actions
1. [Most impactful fix]
2. [Second most impactful]
```

## Common Mistakes

- Running cleanup without presenting findings to user first
- Skipping search insights (missing knowledge gaps)
- Not rebuilding brain intelligence after major cleanup

## Quick Reference

| Op                                           | When to Use           |
| -------------------------------------------- | --------------------- |
| `admin_health` / `admin_diagnostic`          | System health         |
| `admin_vault_analytics` / `admin_vault_size` | Vault metrics         |
| `curator_health_audit`                       | Quality score         |
| `curator_detect_duplicates`                  | Find duplicates       |
| `curator_contradictions`                     | Find conflicts        |
| `vault_age_report`                           | Stale entries         |
| `admin_search_insights`                      | Search miss analysis  |
| `curator_consolidate`                        | Full cleanup pipeline |
| `brain_build_intelligence`                   | Rebuild after cleanup |
