---
name: context-resume
description: Use when starting a new session, returning to work after a break, or needing to reconstruct working context from memory, plans, and sessions.
---

# Context Resume — Pick Up Where You Left Off

Reconstruct full working context in seconds. Chains memory, plans, sessions, and brain to rebuild exactly where you left off — even across session boundaries and context compactions.

## Steps

### 1. Load Active Plans

```
ernesto_core op:plan_stats
ernesto_core op:get_plan
ernesto_core op:plan_list_tasks
  params: { planId: "<id>" }
```

Present: plan objective, task status (completed/in-progress/pending), what's next.

### 2. Search Recent Memory

```
ernesto_core op:memory_search
  params: { query: "session summary" }
ernesto_core op:memory_list
ernesto_core op:vault_recent
```

### 3. Check Active Loops

```
ernesto_core op:loop_is_active
ernesto_core op:loop_status
```

### 4. Brain Snapshot

```
ernesto_core op:brain_strengths
```

### 5. System Health

```
ernesto_core op:admin_health
```

## Presenting the Resume

```
## Where You Left Off

**Active Plans:**
- [Plan name] — X/Y tasks complete, next: [task]

**Last Session:**
- [Summary — what was done, key decisions]

**Recent Captures:**
- [New patterns/anti-patterns added]

**Active Loops:**
- [Any in-progress validation loops]

**Brain Says:**
- [Top relevant patterns]

**Health:** [OK / Issues]

## Recommended Next Step
[Based on active plans and last session context]
```

## Common Mistakes

- Not checking for active loops (missing mid-flight TDD or debug cycles)
- Skipping the health check (stale caches can cause confusing behavior)
- Not loading recent vault captures (missing context from last session)

## Quick Reference

| Op | When to Use |
|----|-------------|
| `plan_stats` / `get_plan` / `plan_list_tasks` | Active plans |
| `memory_search` / `memory_list` | Session summaries |
| `vault_recent` | Recently captured knowledge |
| `loop_is_active` / `loop_status` | In-flight loops |
| `brain_strengths` | Relevant proven patterns |
| `admin_health` | System health check |
