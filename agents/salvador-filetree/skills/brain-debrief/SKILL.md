---
name: brain-debrief
description: Use when the user asks "what have I learned", "brain stats", "pattern strengths", "cross-project insights", "intelligence report", "show me patterns", "what's working", "learning summary", or wants to explore accumulated knowledge and see what the brain has learned.
---

# Brain Debrief — Intelligence Report

Surface what the brain has learned across sessions and projects. This turns raw vault data into actionable intelligence.

## When to Use

When the user wants to understand what patterns have proven valuable, what anti-patterns keep recurring, how knowledge is distributed across projects, or wants a "state of intelligence" report.

## Orchestration by Query Type

### "What have I learned?" (General debrief)

1. Get the big picture:

   ```
   salvador_core op:brain_stats
   ```

   Total sessions, patterns captured, quality scores, coverage gaps.

2. Get patterns ranked by proven strength:

   ```
   salvador_core op:brain_strengths
   ```

   Focus on strength >= 70 and successRate >= 0.7.

3. Check memory landscape:

   ```
   salvador_core op:memory_topics
   ```

   Shows how knowledge clusters by topic.

4. Check for stale knowledge:

   ```
   salvador_core op:vault_age_report
   ```

   Find entries that haven't been updated recently — candidates for review.

5. Run a curator health audit:

   ```
   salvador_core op:curator_health_audit
   ```

   Vault quality score, tag normalization status, duplicate density.

6. Present: top 5 strongest patterns, top 3 recurring anti-patterns, stale entries needing refresh, and coverage gaps.

### "What's working across projects?" (Cross-project intelligence)

1. Get patterns promoted to the global pool:

   ```
   salvador_core op:brain_global_patterns
   ```

2. Get recommendations based on project similarity:

   ```
   salvador_core op:brain_recommend
     params: { projectName: "<current project>" }
   ```

3. Check linked projects:

   ```
   salvador_core op:project_linked_projects
   ```

4. Search across all projects for relevant patterns:

   ```
   salvador_core op:memory_cross_project_search
     params: { query: "<topic>", crossProject: true }
   ```

5. Present: patterns from other projects that would apply here, ranked by relevance.

### "Am I getting smarter?" (Learning velocity)

1. Recent stats:

   ```
   salvador_core op:brain_stats
     params: { since: "<7 days ago>" }
   ```

2. Longer period for comparison:

   ```
   salvador_core op:brain_stats
     params: { since: "<30 days ago>" }
   ```

3. Memory stats:

   ```
   salvador_core op:memory_stats
   ```

4. Vault analytics:

   ```
   salvador_core op:admin_vault_analytics
   ```

5. Search insights — what queries are people running, what's missing:

   ```
   salvador_core op:admin_search_insights
   ```

6. Present: new patterns captured, strength changes, domains growing vs stagnant, search miss analysis.

### "Build fresh intelligence" (Rebuild)

1. Run the full pipeline:

   ```
   salvador_core op:brain_build_intelligence
   ```

   Compute strengths, update global registry, refresh project profiles.

2. Consolidate vault (curator cleanup):

   ```
   salvador_core op:curator_consolidate
   ```

3. Show updated metrics:

   ```
   salvador_core op:brain_stats
   ```

4. Present: what changed after the rebuild.

### "Export what I know" (Portability)

Export brain intelligence:

```
salvador_core op:brain_export
```

Export memory:

```
salvador_core op:memory_export
```

Export vault as backup:

```
salvador_core op:vault_backup
```

These can be imported into another vault:

```
salvador_core op:brain_import
salvador_core op:memory_import
salvador_core op:vault_import
```

## Presenting Intelligence

Format as a report:

- **Strengths**: Top patterns with strength scores and domains
- **Risks**: Recurring anti-patterns that keep appearing
- **Gaps**: Domains with low coverage or stale knowledge
- **Stale**: Entries needing refresh (from age report)
- **Quality**: Curator health audit score
- **Recommendations**: What to focus on learning next
- **Search Misses**: What people are looking for but not finding

## Exit Criteria

Debrief is complete when the user's specific question has been answered with data from the brain. For general debriefs, present stats + strengths + gaps + stale entries at minimum.

## Agent Tools Reference

| Op                                | When to Use                                     |
| --------------------------------- | ----------------------------------------------- |
| `brain_stats`                     | Aggregate metrics — sessions, patterns, quality |
| `brain_strengths`                 | Patterns ranked by proven strength              |
| `brain_global_patterns`           | Cross-project promoted patterns                 |
| `brain_recommend`                 | Project-similarity recommendations              |
| `brain_build_intelligence`        | Rebuild full intelligence pipeline              |
| `brain_export` / `brain_import`   | Portable intelligence transfer                  |
| `memory_topics`                   | Knowledge clusters by topic                     |
| `memory_stats`                    | Memory statistics                               |
| `memory_export` / `memory_import` | Memory portability                              |
| `memory_cross_project_search`     | Search across linked projects                   |
| `vault_age_report`                | Find stale entries needing refresh              |
| `vault_backup` / `vault_import`   | Vault backup and restore                        |
| `curator_health_audit`            | Vault quality score and status                  |
| `curator_consolidate`             | Full vault cleanup pipeline                     |
| `admin_vault_analytics`           | Overall knowledge quality metrics               |
| `admin_search_insights`           | Search miss analysis — what's not found         |
| `project_linked_projects`         | See connected projects                          |
