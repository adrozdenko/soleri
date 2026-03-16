---
name: context-resume
description: Use when starting a new session, returning to work, or when the user asks "what was I working on", "where did I leave off", "catch me up", "morning standup", "resume", "what's the status". Reconstructs full working context from memory, plans, and sessions.
---

# Context Resume — Pick Up Where You Left Off

Reconstruct your full working context in seconds. Chains memory, plans, sessions, and brain to rebuild exactly where you left off — even across session boundaries and context compactions.

## When to Use

- Starting a new Claude Code session
- Returning after a break
- "What was I working on?"
- "Morning standup"
- After context compaction (session_capture fires automatically, this reads it back)

## The Magic: Full Context Reconstruction

### Step 1: Load Active Plans

Check for plans in progress — these are your active work streams:

```
salvador_core op:plan_stats
```

For each active plan, load its details and task status:

```
salvador_core op:get_plan
salvador_core op:plan_list_tasks
  params: { planId: "<id>" }
```

Present:

- Plan objective and current status
- Which tasks are completed, in progress, or pending
- What's next to do

### Step 2: Search Recent Memory

Load the latest session summaries — these capture what happened before:

```
salvador_core op:memory_search
  params: { query: "session summary" }
```

```
salvador_core op:memory_list
```

Also check recent vault captures — what knowledge was added recently?

```
salvador_core op:vault_recent
```

### Step 3: Check Active Loops

See if there's a validation loop in progress:

```
salvador_core op:loop_is_active
```

If active:

```
salvador_core op:loop_status
```

This tells you if an iterative workflow (TDD, debugging, migration) was mid-flight.

### Step 4: Brain Snapshot

Get the latest brain insights relevant to current work:

```
salvador_core op:brain_strengths
```

### Step 5: System Health

Quick health check to make sure everything is working:

```
salvador_core op:admin_health
```

## Presenting the Resume

Format as a concise standup:

```
## Where You Left Off

**Active Plans:**
- [Plan name] — X/Y tasks complete, next: [task description]

**Last Session:**
- [Summary from memory — what was done, key decisions]

**Recent Captures:**
- [New patterns/anti-patterns added to vault]

**Active Loops:**
- [Any in-progress validation loops]

**Brain Says:**
- [Top relevant patterns for current work]

**Health:** [OK / Issues found]

## Recommended Next Step
[Based on active plans and last session context]
```

## The Magic

This feels like magic because the user just says "catch me up" and the agent:

1. Knows what plans are active and where they stand
2. Remembers what happened last session (even across context compactions)
3. Shows what knowledge was recently captured
4. Detects in-flight loops
5. Recommends what to work on next

No other tool does this — the agent has genuine persistent memory.

## Agent Tools Reference

| Op                | When to Use                 |
| ----------------- | --------------------------- |
| `plan_stats`      | Find active plans           |
| `get_plan`        | Load plan details           |
| `plan_list_tasks` | See task status within plan |
| `memory_search`   | Find session summaries      |
| `memory_list`     | Browse recent memories      |
| `vault_recent`    | Recently captured knowledge |
| `loop_is_active`  | Check for in-flight loops   |
| `loop_status`     | Get loop details            |
| `brain_strengths` | Relevant proven patterns    |
| `admin_health`    | System health check         |
