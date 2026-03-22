---
name: context-resume
description: >
  Use when the user says "where did I leave off", "what was I working on", "catch me up",
  "resume", "continue where we stopped", or is starting a new session and needs to reconstruct
  working context from memory, plans, and sessions.
---

# Context Resume — Pick Up Where You Left Off

Reconstruct full working context in seconds. Chains memory, plans, sessions, and brain to rebuild exactly where you left off — even across session boundaries and context compactions.

## Steps

### 1. Load Active Plans

```
salvador_core op:plan_stats
salvador_core op:get_plan
salvador_core op:plan_list_tasks
  params: { planId: "<id>" }
```

Present: plan objective, task status (completed/in-progress/pending), what's next.

### 2. Search Recent Memory

```
salvador_core op:memory_search
  params: { query: "session summary" }
salvador_core op:memory_list
salvador_core op:vault_recent
```

### 3. Check Active Loops

```
salvador_core op:loop_is_active
salvador_core op:loop_status
```

### 4. Brain Snapshot

```
salvador_core op:brain_strengths
```

### 5. System Health

```
salvador_core op:admin_health
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
