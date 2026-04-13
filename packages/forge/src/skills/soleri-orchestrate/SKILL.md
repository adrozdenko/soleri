---
name: soleri-orchestrate
tier: default
description: 'Triggers: "implement X", "build Y", "fix Z", "add feature", or any work task needing planning + execution. Full orchestration loop: plan, execute, complete with vault context and brain recs.'
---

# Orchestrate — Full Work Loop

Run the full work loop with vault intelligence: plan the task, execute it step by step, and close with knowledge capture. Use this for any non-trivial task where missing context or skipping steps would cost time.

## When to Use

- User gives a concrete work task ("implement auth", "refactor the parser", "fix the flaky test")
- Task spans multiple files or has cross-cutting concerns
- You want vault patterns and brain recommendations surfaced automatically

## Orchestration

### Step 1: Plan

```
YOUR_AGENT_orchestrate op:orchestrate_plan
  params: {
    prompt: "<user task description>",
    context: { domain: "<inferred domain>" }
  }
```

Present the plan to the user. If grade < A-, ask for approval before proceeding.

### Step 2: Execute

Once approved, begin execution. For each task in the plan:

```
YOUR_AGENT_orchestrate op:orchestrate_execute
  params: {
    planId: "<planId from step 1>",
    taskId: "<current task id>",
    output: "<what you did>"
  }
```

Log progress after each task: show completed count / total and current task title.

### Step 3: Complete

After all tasks are done:

```
YOUR_AGENT_orchestrate op:orchestrate_complete
  params: {
    planId: "<planId>",
    summary: "<one-line outcome>",
    operatorSignals: {
      qualityNotes: "<any quality observations>",
      unexpectedComplexity: <true|false>
    }
  }
```

Report the completion summary and any knowledge captured.

## Exit Criteria

All plan tasks executed, `orchestrate_complete` called with outcome, knowledge persisted to vault.
