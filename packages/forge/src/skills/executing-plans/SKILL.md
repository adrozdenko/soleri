---
name: executing-plans
description: Use when there is a written implementation plan to execute with review checkpoints between task batches.
---

# Executing Plans

Load plan, review critically, execute tasks in batches, report for review between batches.

**Announce at start:** "I'm using the executing-plans skill to implement this plan."

## The Process

### Step 1: Load and Review Plan

```
ernesto_core op:get_plan
ernesto_core op:plan_list_tasks
  params: { planId: "<id>" }
ernesto_core op:plan_stats
```

If no tracked plan exists, read from `docs/plans/`. Review critically — raise concerns before starting.

### Step 2: Start Execution Loop

```
ernesto_core op:loop_start
  params: { prompt: "<plan objective>", mode: "custom" }
```

### Step 3: Execute Batch (default: first 3 tasks)

For each task:
1. `op:update_task` — mark `in_progress`
2. Follow each step exactly
3. Run verifications as specified
4. `op:update_task` — mark `completed`
5. `op:loop_iterate` — track progress

### Step 4: Report

Show what was implemented, verification output, loop status. Say: "Ready for feedback."

### Step 5: Continue

Apply feedback, execute next batch, repeat until complete.

### Step 6: Complete Development

1. Run final verification (use verification-before-completion skill)
2. `ernesto_core op:loop_complete`
3. `ernesto_core op:plan_reconcile` — compare planned vs actual
4. `ernesto_core op:plan_complete_lifecycle` — extract knowledge, archive
5. `ernesto_core op:session_capture` — save session context

Capture mid-execution learnings with `op:capture_quick` as they happen — don't wait until the end.

## When to Stop

- Hit a blocker (missing dependency, unclear instruction, repeated test failures)
- Plan has critical gaps
- Don't understand an instruction

**Ask for clarification rather than guessing.**

## Common Mistakes

- Not reviewing the plan critically before starting
- Skipping verifications to save time
- Guessing through blockers instead of stopping to ask
- Forgetting to reconcile the plan after execution (drift data improves future plans)
- Starting implementation on main/master without explicit consent

## Quick Reference

| Op | When to Use |
|----|-------------|
| `get_plan` / `plan_list_tasks` / `plan_stats` | Load plan |
| `update_task` | Mark task status |
| `loop_start` / `loop_iterate` / `loop_complete` | Validation loop |
| `plan_reconcile` | Post-execution drift report |
| `plan_complete_lifecycle` | Extract knowledge, archive |
| `session_capture` | Save session context |
| `capture_quick` | Mid-execution learnings |

**Related skills:** writing-plans, verification-before-completion, test-driven-development
