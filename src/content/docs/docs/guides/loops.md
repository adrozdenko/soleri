---
title: 'Validation Loops'
description: 'How your agent iterates toward a quality target — checking, fixing, and converging automatically.'
---

Some tasks aren't done when the code is written — they're done when the code passes validation. Loops let your agent iterate automatically: try something, check the result, fix what's wrong, check again, until it converges on a target.

## What a loop does

A loop repeats a cycle: **do → validate → fix → validate** until either:
- The validation score reaches a target (convergence)
- The maximum number of iterations is reached (safety limit)
- You cancel it

Each iteration records whether it passed, what the score was, and what changed. The agent uses this history to avoid repeating the same fix twice.

## Built-in loop modes

Your agent ships with specialized modes for common tasks:

| Mode | Target score | Max iterations | Use case |
|------|-------------|----------------|----------|
| **component-build** | 90 | 20 | Build something that passes all quality checks |
| **plan-iteration** | 90 | 10 | Iterate on a plan until it reaches a target grade |
| **custom** | — | 20 | Any task with a validation step you define |

## Starting a loop

> **You:** "Start a component-build loop: build a user settings page with form validation, error states, and loading indicators."
>
> **Agent:** _Loop started. Mode: component-build. Target: 90/100. Max iterations: 20._
>
> _Iteration 1: Built base form with fields. Validation score: 58. Issues: no input validation, no error states, no loading indicator._
>
> _Iteration 2: Added validation and error messages. Validation score: 76. Issues: missing loading state on submit, no success confirmation._
>
> _Iteration 3: Added loading spinner and success toast. Validation score: 92. All checks pass._
>
> _Loop completed in 3 iterations. Final score: 92._

You didn't have to intervene between iterations. The agent validated its own work, identified issues, fixed them, and validated again.

## Gate-based iteration

For tighter integration, loops can use gate-based iteration — the agent uses specific signals to decide whether to continue or stop:

### Score thresholds

Built-in modes (`component-build`, `plan-iteration`) use numeric scores. The agent runs a validation check each iteration and compares the score to the target. If the score meets or exceeds the target, the loop completes.

### Promise tags

Custom loops use promise tags — a text marker in the agent's output that signals convergence. When the agent determines its work meets the criteria you defined, it emits a completion marker. The loop system detects this and stops iterating.

For example, in a custom loop to refactor a module, the agent validates its own output each iteration. When all checks pass, it signals completion. If the signal isn't present, the loop continues to the next iteration.

### Heuristic detection

The agent also recognizes patterns in its own output that indicate completion — like "all tests passing" or "no remaining issues found." This acts as a fallback when explicit signals aren't present.

### Integration with hooks

Hooks can participate in loop iteration. A Stop hook checks the current loop status and can force another iteration if the output doesn't meet quality standards. This is how hooks and loops work together — hooks define what "good enough" means, and the loop keeps iterating until the hook allows it to stop. See [Customizing Your Agent](/docs/guides/customizing/#hooks) for hook configuration.

## Loop history

Every loop is recorded — you can review what happened:

> **You:** "Show me loop history"
>
> **Agent:** _3 loops completed:_
>
> 1. component-build — "user settings page" — 3 iterations, completed, score: 92
> 2. plan-iteration — "API migration plan" — 4 iterations, completed, score: 95
> 3. custom — "refactor auth module" — 6 iterations, completed

Loop history feeds into the brain. The brain learns which types of tasks typically need more iterations, which validation issues recur, and what fixes tend to work.

## When to use loops vs. manual iteration

**Use a loop when:**
- The task has a clear validation step (does this pass? what's the score?)
- You want the agent to fix its own mistakes without your input
- The task is repetitive — migrations, audits, batch fixes

**Do it manually when:**
- The validation is subjective (does this look good?)
- You want to review each change before the next iteration
- The task is exploratory with no clear "done" criteria

## Custom loops

For tasks that don't fit the built-in modes, use custom loops with your own validation:

> **You:** "Start a custom loop: refactor the auth module to use the repository pattern. Validate by checking that all database calls go through the repository, not directly through the ORM."
>
> **Agent:** _Loop started. Mode: custom. Max iterations: 20._

Custom loops work the same way — iterate, validate, fix — but you define what "valid" means.

---

_Next: [Customizing Your Agent](/docs/guides/customizing/) — shape your agent's personality, domains, and behavior. For term definitions, see the [Glossary](/docs/glossary/)._
