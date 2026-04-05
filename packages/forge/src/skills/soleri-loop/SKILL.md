---
name: soleri-loop
tier: default
description: >
  Use when the user says "start a loop", "run until done", "iterate until X",
  "loop status", or "cancel loop". Manages iterative execution loops that
  repeat a task until a condition is met or a grade threshold is reached.
---

# Loop — Iterative Execution

Run a task in a loop until a condition is met — grade threshold, promise fulfilled, or explicit cancellation. Useful for plan refinement, quality iteration, and autonomous improvement cycles.

## When to Use

- Improving a plan until it reaches grade A
- Running validation until all tests pass
- Any task that needs to repeat with self-correction until done

## Orchestration

### Step 1: Start Loop

```
YOUR_AGENT_loop op:loop_start
  params: {
    prompt: "<task description>",
    mode: "<plan-iteration | custom>",
    maxIterations: <number, default 10>
  }
```

**Modes:**

- `plan-iteration` — repeats `create_plan` until grade >= A (target-based)
- `custom` — user-defined stop condition; loop continues until promise satisfied

Note the `loopId` from the response — needed for status and cancel.

### Step 2: Monitor

At each iteration, check status:

```
YOUR_AGENT_loop op:loop_status
  params: { loopId: "<loopId>" }
```

Report progress to user:

| Field              | Value                                |
| ------------------ | ------------------------------------ |
| **Iteration**      | {currentIteration} / {maxIterations} |
| **Status**         | {status}                             |
| **Last result**    | {lastResult}                         |
| **Stop condition** | {stopCondition}                      |

### Step 3: Cancel (if needed)

If the user wants to stop early:

```
YOUR_AGENT_loop op:loop_cancel
  params: { loopId: "<loopId>", reason: "<why stopping>" }
```

## Exit Criteria

Loop completes when: stop condition is met, max iterations reached, or user explicitly cancels. Report final outcome and iteration count.
