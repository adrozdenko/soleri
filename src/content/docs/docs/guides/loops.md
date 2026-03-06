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
| **token-migration** | 95 | 20 | Replace hardcoded values with design tokens |
| **contrast-fix** | — | 15 | Fix color contrast to meet WCAG thresholds |
| **component-build** | 90 | 20 | Build a component that passes all quality checks |
| **plan-iteration** | 90 | 10 | Iterate on a plan until it reaches a target grade |
| **custom** | — | 20 | Any task with a validation step |

## Starting a loop

> **You:** "Start a component-build loop: build a notification banner with dismiss button, success/error/warning variants, and accessible focus management."
>
> **Agent:** _Loop started. Mode: component-build. Target: 90/100. Max iterations: 20._
>
> _Iteration 1: Built base component with variants. Validation score: 62. Issues: missing focus trap, touch targets too small on dismiss button._
>
> _Iteration 2: Added focus management and increased dismiss button size. Validation score: 78. Issues: warning variant contrast ratio 3.8:1, needs 4.5:1._
>
> _Iteration 3: Adjusted warning variant colors. Validation score: 94. All checks pass._
>
> _Loop completed in 3 iterations. Final score: 94._

You didn't have to intervene between iterations. The agent validated its own work, identified issues, fixed them, and validated again.

## Gate-based iteration

For tighter integration, loops can use gate-based iteration — the agent scans its own output for completion signals and decides whether to continue or stop:

- **Promise tags** — a specific text marker that signals "I'm done"
- **Heuristic detection** — the agent recognizes patterns in its output that indicate completion
- **Score thresholds** — numeric scores that must meet a minimum

This is how loops integrate with hooks. A Stop hook can check the loop status and decide whether to allow the agent to finish or force another iteration.

## Loop history

Every loop is recorded — you can review what happened:

> **You:** "Show me loop history"
>
> **Agent:** _3 loops completed:_
>
> 1. component-build — "notification banner" — 3 iterations, completed, score: 94
> 2. contrast-fix — "card component" — 2 iterations, completed
> 3. token-migration — "legacy colors" — 8 iterations, completed, score: 97

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

_Next: [Customizing Your Agent](/docs/guides/customizing/) — shape your agent's personality, domains, and behavior._
