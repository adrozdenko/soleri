---
name: executing-plans
description: Use when you have a written implementation plan to execute in a separate session with review checkpoints
---

<!-- Adapted from superpowers (MIT License) -->

# Executing Plans

## Overview

Load plan, review critically, execute tasks in batches, report for review between batches.

**Core principle:** Batch execution with checkpoints for architect review.

**Announce at start:** "I'm using the executing-plans skill to implement this plan."

## The Process

### Step 1: Load and Review Plan

First, load the tracked plan from the agent:

```
salvador_core op:get_plan
```

List all tasks to understand scope:

```
salvador_core op:plan_list_tasks
  params: { planId: "<id>" }
```

Check plan stats for an overview:

```
salvador_core op:plan_stats
```

If no tracked plan exists, read the plan file from `docs/plans/`.

Review critically — identify any questions or concerns about the plan.

- If concerns: Raise them with your human partner before starting
- If no concerns: Create TodoWrite and proceed

### Step 2: Start Execution Loop

For iterative tasks, start a validation loop:

```
salvador_core op:loop_start
  params: { prompt: "<plan objective>", mode: "custom" }
```

The loop tracks iterations and validates progress automatically.

### Step 3: Execute Batch

**Default: First 3 tasks**

For each task:

1. Mark as in_progress:
   ```
   salvador_core op:update_task
     params: { planId: "<id>", taskIndex: <n>, status: "in_progress" }
   ```
2. Follow each step exactly (plan has bite-sized steps)
3. Run verifications as specified
4. Mark as completed:
   ```
   salvador_core op:update_task
     params: { planId: "<id>", taskIndex: <n>, status: "completed" }
   ```

After each task, iterate the loop:

```
salvador_core op:loop_iterate
```

### Step 4: Report

When batch complete:

- Show what was implemented
- Show verification output
- Check loop status:
  ```
  salvador_core op:loop_status
  ```
- Say: "Ready for feedback."

### Step 5: Continue

Based on feedback:

- Apply changes if needed
- Execute next batch
- Repeat until complete

### Step 6: Complete Development

After all tasks complete and verified:

1. Run final verification (use verification-before-completion skill)

2. Complete the validation loop:

   ```
   salvador_core op:loop_complete
   ```

3. Reconcile plan — compare what was planned vs what actually happened:

   ```
   salvador_core op:plan_reconcile
     params: {
       planId: "<id>",
       actualSteps: "<description of what was actually done>",
       driftNotes: "<what differed from the plan>"
     }
   ```

4. Complete plan lifecycle — extract knowledge and archive:

   ```
   salvador_core op:plan_complete_lifecycle
     params: { planId: "<id>" }
   ```

5. Archive the plan for historical reference:

   ```
   salvador_core op:plan_archive
     params: { planId: "<id>" }
   ```

6. Capture a session summary:
   ```
   salvador_core op:session_capture
     params: { summary: "<what was built, key decisions, files modified>" }
   ```

## Capture Learnings During Execution

If you discover something worth remembering during execution (a gotcha, a better approach, an anti-pattern):

```
salvador_core op:capture_quick
  params: {
    title: "<what you learned>",
    description: "<context, why it matters, when it applies>"
  }
```

Don't wait until the end — capture insights as they happen.

## When to Stop and Ask for Help

**STOP executing immediately when:**

- Hit a blocker mid-batch (missing dependency, test fails, instruction unclear)
- Plan has critical gaps preventing starting
- You don't understand an instruction
- Verification fails repeatedly

**Ask for clarification rather than guessing.**

## When to Revisit Earlier Steps

**Return to Review (Step 1) when:**

- Partner updates the plan based on your feedback
- Fundamental approach needs rethinking

**Don't force through blockers** - stop and ask.

## Remember

- Review plan critically first
- Follow plan steps exactly
- Don't skip verifications
- Between batches: just report and wait
- Stop when blocked, don't guess
- Capture learnings as you go, not just at the end
- Always reconcile the plan after execution — drift data makes future plans better
- Never start implementation on main/master branch without explicit user consent

## Agent Tools Reference

| Op                        | When to Use                                   |
| ------------------------- | --------------------------------------------- |
| `get_plan`                | Load tracked plan                             |
| `plan_list_tasks`         | List all tasks in the plan                    |
| `plan_stats`              | Plan overview and metrics                     |
| `update_task`             | Mark tasks in_progress / completed            |
| `loop_start`              | Begin validation loop for iterative execution |
| `loop_iterate`            | Track each iteration                          |
| `loop_status`             | Check loop progress                           |
| `loop_complete`           | Finish validation loop                        |
| `plan_reconcile`          | Compare planned vs actual (post-execution)    |
| `plan_complete_lifecycle` | Extract knowledge from execution              |
| `plan_archive`            | Archive plan for history                      |
| `session_capture`         | Save session context                          |
| `capture_quick`           | Capture mid-execution learnings               |

## Integration

**Required workflow skills:**

- writing-plans — Creates the plan this skill executes
- verification-before-completion — Verify work before claiming completion
- test-driven-development — Follow TDD for each implementation step
