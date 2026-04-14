---
title: 'Tutorial: Your First Subagent Dispatch'
description: 'A hands-on walkthrough of dispatching parallel subagents, from decomposition to merge to cleanup.'
---

This tutorial walks through a real subagent dispatch: how the orchestrator decomposes work, routes tasks, dispatches workers, and merges results while keeping state clean.

## The scenario

You want to add a `CONTRIBUTING.md` file to three packages in your monorepo: `core`, `forge`, and `cli`. Each file is independent, in different directories with no overlap and no dependencies. That makes it a good fit for parallel dispatch.

## Step 1: Ask for the work

> **You:** "Add CONTRIBUTING.md files to the core, forge, and cli packages with setup instructions and guidelines."

The agent recognizes this as 3 independent tasks and activates the subagent-driven-development skill.

## Step 2: The agent researches and decides

Before dispatching anything, the agent reads your existing code, checks the vault for contribution guidelines patterns, and makes all design decisions:

- What content goes in each file
- Which conventions to reference (from your project config)
- File locations

You don't see this. It's the orchestrator doing its homework.

## Step 3: The agent shows the dispatch table

> **Agent:** I'm using the subagent-driven-development skill to dispatch isolated agents.
>
> Dispatching 3 tasks in parallel:
>
> | # | Task | Agent | Why |
> |---|------|-------|-----|
> | 1 | CONTRIBUTING.md for core | Worker | Single file, clear spec |
> | 2 | CONTRIBUTING.md for forge | Worker | Single file, clear spec |
> | 3 | CONTRIBUTING.md for cli | Worker | Single file, clear spec |

All three are Claude Code workers because they're single-file tasks with fully decided specs. No design decisions needed.

## Step 4: Workers execute in parallel

All three workers launch simultaneously, each in its own git worktree. They create their file and return. They don't:

- Create plans
- Make design decisions
- Modify other files
- Commit changes

## Step 5: The orchestrator reviews

The orchestrator reads the actual file changes from each worktree, not just the worker's self-report. It checks:

- Did the file get created?
- Does the content match the spec?
- Were any other files modified? (They shouldn't be.)

## Step 6: Merge and report

The orchestrator copies the files from each worktree into the main tree, then reports:

```
✓ 3/3 complete. 0 patterns captured (simple task).
  → Decisions: none — all specs were pre-defined.
```

## Step 7: Cleanup

The worktrees are automatically removed. Three layers of cleanup ensure nothing accumulates:

1. Each worktree is removed right after its task completes
2. A batch cleanup runs after all workers finish
3. The session-start hook catches anything that slipped through

You can verify with `git worktree list`. Only your main working directory should remain.

## What if something goes wrong?

A worker encounters ambiguity: it returns to the orchestrator with a question. The orchestrator either resolves it or asks you, then re-dispatches.

A worker modifies the wrong file: the orchestrator catches this during review and re-dispatches a fix subagent (max 2 retries).

A merge conflict: the orchestrator resolves it manually, re-runs tests, and captures the conflict as an anti-pattern for future planning.

A worker fails entirely: the orchestrator reports the failure and either retries or asks you how to proceed.

## When to use a Soleri agent instance instead

If one of those packages needed a complex CONTRIBUTING.md that required checking your vault for team conventions, making architectural decisions about the contribution workflow, or touching multiple related files, the orchestrator would route that task to a Soleri agent instance instead of a worker.

The instance would:
1. Activate with vault and brain access
2. Search for relevant patterns
3. Execute the task with full context
4. Run `orchestrate_complete` to capture knowledge

You don't need to specify this. The orchestrator routes automatically.

## Summary

| Step | What happens | Who does it |
|------|-------------|-------------|
| Research & decide | Read files, check vault, make decisions | Orchestrator |
| Route | Classify each task by complexity | Orchestrator |
| Dispatch | Launch workers/instances in parallel | Orchestrator |
| Execute | Create files, write code | Subagents |
| Review | Read actual changes, verify correctness | Orchestrator |
| Merge | Copy changes to main tree | Orchestrator |
| Report | Summarize results, capture knowledge | Orchestrator |
| Cleanup | Remove worktrees, prune branches | Automatic |

The orchestrator does the thinking. The subagents do the work. Nobody freelances.
