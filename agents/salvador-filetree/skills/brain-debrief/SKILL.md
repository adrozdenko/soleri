---
name: brain-debrief
description: >
  Use when the user wants to explore the brain's learned PATTERNS — "brain stats", "pattern
  strengths", "what patterns are strongest", "intelligence report", "show brain data". Focused
  on the brain module's accumulated pattern intelligence. For time-bound sprint or weekly
  reflection, use retrospective instead.
---

# Brain Debrief — Intelligence Report

Surface what the brain has learned across sessions and projects. Turns raw vault data into actionable intelligence.

## Orchestration by Query Type

### "What have I learned?" (General debrief)

1. `salvador_core op:brain_stats` — total sessions, patterns, quality scores
2. `salvador_core op:brain_strengths` — patterns ranked by strength (focus >= 70)
3. `salvador_core op:memory_topics` — knowledge clusters
4. `salvador_core op:vault_age_report` — stale entries needing refresh
5. `salvador_core op:curator_health_audit` — vault quality score

Present: top 5 patterns, top 3 anti-patterns, stale entries, coverage gaps.

### "What's working across projects?" (Cross-project)

1. `salvador_core op:brain_global_patterns` — promoted patterns
2. `salvador_core op:brain_recommend params: { projectName: "<project>" }` — similarity-based recommendations
3. `salvador_core op:project_linked_projects` — connected projects
4. `salvador_core op:memory_cross_project_search params: { query: "<topic>", crossProject: true }`

### "Am I getting smarter?" (Learning velocity)

Compare `brain_stats` for 7-day vs 30-day periods. Check `memory_stats`, `admin_vault_analytics`, `admin_search_insights`. Present: new patterns, strength changes, growing vs stagnant domains.

### "Build fresh intelligence" (Rebuild)

1. `salvador_core op:brain_build_intelligence` — full pipeline rebuild
2. `salvador_core op:curator_consolidate` — vault cleanup
3. Show updated `brain_stats`

### "Export what I know" (Portability)

Use `brain_export`, `memory_export`, `vault_backup`. Import with corresponding `_import` ops.

## Presenting Intelligence

Format as a report with: Strengths, Risks (recurring anti-patterns), Gaps, Stale entries, Quality score, Recommendations, Search Misses.

## Common Mistakes

- Presenting raw tool output instead of synthesized insights
- Skipping the stale entry check (vault_age_report)
- Not comparing periods when reporting learning velocity

## Quick Reference

| Op | When to Use |
|----|-------------|
| `brain_stats` | Aggregate metrics |
| `brain_strengths` | Proven patterns ranked |
| `brain_global_patterns` | Cross-project patterns |
| `brain_recommend` | Project-similarity recommendations |
| `brain_build_intelligence` | Rebuild intelligence pipeline |
| `memory_topics` / `memory_stats` | Knowledge clusters and health |
| `vault_age_report` | Stale entries |
| `curator_health_audit` | Vault quality score |
| `admin_vault_analytics` | Knowledge quality metrics |
| `admin_search_insights` | Search miss analysis |
