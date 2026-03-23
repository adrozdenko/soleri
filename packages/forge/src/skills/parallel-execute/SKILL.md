---
name: parallel-execute
description: >
  Use when executing a plan where independent tasks can run concurrently. Triggers on "run in
  parallel", "parallelize", "fan out", "concurrent execution", "run simultaneously", "at the
  same time", "dispatch subagents", "batch execute", or when a plan has 3+ tasks with no
  dependency overlap. For sequential task-by-task execution, use executing-plans instead.
---

# Parallel Execute — Subagent-Driven Plan Execution

Execute plan tasks in parallel by dispatching independent tasks to separate subagents. The controller agent (you) never implements — you dispatch, review, and integrate.

**Announce at start:** "I'm using the parallel-execute skill to run independent tasks concurrently."

<HARD-GATE>
You MUST have an approved, split plan before using this skill. If no plan exists or it has no tasks, stop and use the writing-plans skill first.
</HARD-GATE>

## When to Use

- Plan has 3+ tasks
- At least 2 tasks have no dependency overlap (can run simultaneously)
- Tasks touch different files/modules (low merge conflict risk)

**Do NOT use when:**

- All tasks are sequential (each depends on the previous)
- Tasks modify the same files (high conflict risk)
- Plan has fewer than 3 tasks (use executing-plans instead)

## The Process

### Step 1: Load Plan and Build Dependency Graph

```
YOUR_AGENT_core op:get_plan
YOUR_AGENT_core op:plan_list_tasks params:{ planId: "<id>" }
```

Map out which tasks are independent by checking `dependsOn` for each task. Group tasks into **waves** — sets of tasks that can run in parallel:

- **Wave 1**: All tasks with no dependencies (or whose dependencies are already complete)
- **Wave 2**: Tasks whose dependencies are all in Wave 1
- **Wave N**: Tasks whose dependencies are all in prior waves

Present the wave plan to the user before starting:

```
## Execution Waves

| Wave | Tasks | Parallel? |
|------|-------|-----------|
| 1 | task-1, task-3, task-5 | Yes (3 subagents) |
| 2 | task-2 (depends on task-1) | Solo |
| 3 | task-4 (depends on task-2, task-3) | Solo |
```

### Step 2: Dispatch a Wave

For each task in the current wave:

1. Check readiness:

   ```
   YOUR_AGENT_core op:plan_dispatch params:{ planId: "<id>", taskId: "<taskId>" }
   ```

   Only dispatch tasks where `ready: true`.

2. Mark as in_progress:

   ```
   YOUR_AGENT_core op:update_task params:{ planId: "<id>", taskIndex: <n>, status: "in_progress" }
   ```

3. Gather vault context for the task:

   ```
   YOUR_AGENT_core op:search params:{ query: "<task topic>", mode: "scan" }
   ```

4. **Launch all ready tasks as parallel Agent calls in a single message.** Each subagent gets:

```
You are implementing a single task from a plan. Work autonomously.

## Task
- **ID**: {taskId}
- **Title**: {title}
- **Description**: {description}
- **Acceptance Criteria**: {criteria}

## Context
- **Plan Objective**: {planObjective}
- **Vault Patterns to Follow**: {relevantPatterns}
- **Files Likely Involved**: {fileHints}

## Rules
- Implement ONLY this task — do not touch files outside your scope
- Run tests after implementation
- If blocked, report the blocker and stop — do not guess
- Do not commit — the controller handles commits
- When done, report: files changed, tests passing, any concerns

## Self-Review Checklist
Before reporting completion, verify:
- [ ] All acceptance criteria met
- [ ] Tests pass
- [ ] No files modified outside task scope
- [ ] No console.log or debug code left behind
- [ ] No raw colors or hardcoded values (use semantic tokens)
```

Use the Agent tool with `isolation: "worktree"` when tasks touch nearby files to prevent conflicts.

### Step 3: Collect Results

As subagents complete, collect their results. For each completed task:

1. **Run spec review** — spawn a reviewer subagent:

   ```
   YOUR_AGENT_core op:plan_review_spec params:{ planId: "<id>", taskId: "<taskId>" }
   ```

   Use the returned prompt to launch a spec-review Agent that reads the ACTUAL code changes (not the implementer's self-report).

2. **Record spec review outcome:**

   ```
   YOUR_AGENT_core op:plan_review_outcome params:{
     planId: "<id>", taskId: "<taskId>",
     reviewType: "spec", reviewer: "spec-reviewer",
     outcome: "approved|rejected|needs_changes",
     comments: "<specific file:line references>"
   }
   ```

3. **If spec passes, run quality review:**

   ```
   YOUR_AGENT_core op:plan_review_quality params:{ planId: "<id>", taskId: "<taskId>" }
   ```

   Launch a quality-review Agent with the returned prompt.

4. **Record quality review outcome:**

   ```
   YOUR_AGENT_core op:plan_review_outcome params:{
     planId: "<id>", taskId: "<taskId>",
     reviewType: "quality", reviewer: "quality-reviewer",
     outcome: "approved|rejected|needs_changes",
     comments: "<severity-tagged feedback>"
   }
   ```

5. **Handle outcomes:**

| Spec | Quality           | Action                                                      |
| ---- | ----------------- | ----------------------------------------------------------- |
| Pass | Pass              | Mark task completed                                         |
| Fail | —                 | Dispatch fix subagent with failure feedback (max 2 retries) |
| Pass | Critical issues   | Dispatch targeted fix subagent (max 2 retries)              |
| Pass | Minor issues only | Mark completed, note issues for later                       |

6. **Mark completed:**
   ```
   YOUR_AGENT_core op:update_task params:{ planId: "<id>", taskIndex: <n>, status: "completed" }
   ```

### Step 4: Advance to Next Wave

After all tasks in a wave are complete (or failed after retries):

1. Report wave results to the user:

   ```
   ## Wave N Complete

   | Task | Status | Review | Notes |
   |------|--------|--------|-------|
   | task-1 | Completed | Spec: Pass, Quality: Pass | — |
   | task-3 | Completed | Spec: Pass, Quality: Minor issues | Noted for cleanup |
   | task-5 | Failed | Spec: Fail (2 retries exhausted) | Escalated |
   ```

2. **Wait for user acknowledgment** before proceeding to the next wave.

3. Check which tasks in the next wave are now ready (dependencies met).

4. Repeat from Step 2.

### Step 5: Final Integration Review

After all waves complete:

1. Spawn a final review subagent that checks cross-cutting concerns:
   - Consistency across all task implementations
   - Integration points between tasks
   - No conflicting patterns or duplicate code
   - Tests pass together (not just individually)

2. Report to user with full execution summary.

### Step 6: Complete Plan Lifecycle

Same as executing-plans — reconcile, capture knowledge, archive:

```
YOUR_AGENT_core op:plan_reconcile params:{
  planId: "<id>",
  actualOutcome: "<what happened>",
  driftItems: [{ type: "...", description: "...", impact: "...", rationale: "..." }]
}

YOUR_AGENT_core op:plan_complete_lifecycle params:{
  planId: "<id>",
  patterns: ["<patterns discovered>"],
  antiPatterns: ["<anti-patterns discovered>"]
}

YOUR_AGENT_core op:session_capture params:{
  summary: "<execution summary with parallel metrics>"
}
```

## Subagent Isolation Rules

| Situation                                    | Isolation                                 |
| -------------------------------------------- | ----------------------------------------- |
| Tasks touch completely different directories | No isolation needed                       |
| Tasks touch files in the same package        | Use `isolation: "worktree"`               |
| Tasks modify the same file                   | **Do NOT parallelize** — run sequentially |

When using worktree isolation, the controller must merge worktree changes back after review passes.

## Failure Handling

| Failure                      | Response                                        |
| ---------------------------- | ----------------------------------------------- |
| Subagent reports blocker     | Pause that task, continue others in the wave    |
| Spec review fails            | Dispatch fix subagent with feedback (retry 1/2) |
| Second retry fails           | Mark task as `failed`, escalate to user         |
| Merge conflict from worktree | Resolve manually, then re-run quality review    |
| All tasks in wave fail       | Stop execution, report to user                  |

## Capture Learnings

During execution, capture insights about parallelization:

```
YOUR_AGENT_core op:capture_quick params:{
  title: "<what you learned about parallel execution>",
  description: "<context: which tasks parallelized well, which conflicted>"
}
```

## When to Fall Back to Sequential

**Switch to executing-plans skill mid-execution when:**

- Subagents keep conflicting on shared files
- Merge resolution is taking longer than the parallelization saves
- User requests sequential execution

## Agent Tools Reference

| Op                        | When to Use                                 |
| ------------------------- | ------------------------------------------- |
| `get_plan`                | Load tracked plan                           |
| `plan_list_tasks`         | List all tasks with dependencies            |
| `plan_dispatch`           | Check task readiness (dependencies met?)    |
| `update_task`             | Mark tasks in_progress / completed / failed |
| `plan_review_spec`        | Generate spec compliance review prompt      |
| `plan_review_quality`     | Generate code quality review prompt         |
| `plan_review_outcome`     | Record review pass/fail result              |
| `plan_reconcile`          | Post-execution drift analysis               |
| `plan_complete_lifecycle` | Extract knowledge, archive                  |
| `session_capture`         | Save session context                        |
| `capture_quick`           | Capture mid-execution learnings             |
| `search`                  | Vault lookup for task context               |

## Integration

**Required skills:**

- writing-plans — Creates the plan this skill executes
- verification-before-completion — Verify work before claiming completion
- executing-plans — Fallback for sequential execution
