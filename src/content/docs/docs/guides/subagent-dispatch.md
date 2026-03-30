---
title: 'Subagent Dispatch'
description: 'How your agent fans out work to parallel subagents — the hybrid routing model, behavioral contract, and cleanup guarantees.'
---

When a task decomposes into independent pieces, your agent can dispatch subagents to work in parallel. This guide explains the model, the rules, and what you should expect.

## The model

Your agent operates as the **orchestrator**. It researches, plans, makes decisions, then dispatches **subagents** to execute specific tasks. Subagents don't make decisions — they follow specs.

Two types of subagents are available:

| Type | What it does | When it's used |
|------|-------------|---------------|
| **Claude Code worker** | Fast, stateless file editing. No vault, no planning, no knowledge capture. | Single-file changes, clear specs, mechanical tasks. |
| **Soleri agent instance** | Full agent with vault access, brain, and knowledge capture. | Complex tasks with design decisions, multi-file changes, new architecture. |

Your agent picks the right type automatically based on complexity. You don't need to specify — but you can override.

## How routing works

The orchestrator evaluates each task:

| Signal | Routes to |
|--------|----------|
| Single file, spec fully decided | Claude Code worker |
| Approach described in the plan | Claude Code worker |
| 3+ files with cross-cutting concerns | Soleri agent instance |
| Unresolved design decisions | Soleri agent instance |
| New dependencies or architecture | Soleri agent instance |

## The behavioral contract

These rules apply to every subagent dispatch:

1. **The orchestrator owns all decisions.** Subagents execute specs. If they encounter ambiguity, they return to the orchestrator — they don't guess.

2. **Subagents don't create plans.** Only the orchestrator creates plans. Subagents receive task prompts with scope, file boundaries, and acceptance criteria.

3. **Worktree cleanup is guaranteed.** Every subagent works in an isolated git worktree. Three layers of cleanup ensure nothing accumulates:
   - The dispatcher removes each worktree after the task completes
   - A batch cleanup runs after all subagents finish
   - A session-start hook prunes any orphaned worktrees

4. **The orchestrator reviews before merging.** Self-reports from subagents are verified by reading actual file changes.

5. **No scope creep.** Subagents stay within their assigned file boundaries. No "while I'm here" improvements.

## What you see

By default, the orchestrator reports results in minimal format:

```
✓ 3/3 complete. 2 patterns captured to vault.
  → Decisions: chose sliding window over token bucket for rate limiting
```

If you want more detail, ask:

> **You:** "Show me the detailed dispatch report."
>
> **Agent:**
>
> | # | Task | Agent | Status | Knowledge |
> |---|------|-------|--------|-----------|
> | 1 | Add rate limiter | Instance | Done | 1 pattern |
> | 2 | Fix README typo | Worker | Done | — |
> | 3 | Update test fixtures | Worker | Done | 1 pattern |

## Overrides

You can control the routing:

- **"Use full agent for everything"** — all subagents run as Soleri agent instances with full lifecycle
- **"Just use workers"** — all subagents run as Claude Code workers with no overhead
- **Default** — hybrid routing based on complexity

## When dispatch happens

Your agent dispatches when:

- A task has 2+ independent pieces touching different files
- A risky spike or prototype benefits from isolated worktrees
- A refactor spans unrelated modules

Your agent does **not** dispatch when:

- The change is a single file or trivial fix
- Tasks have sequential dependencies
- Multiple tasks modify the same file (guaranteed conflicts)

## Knowledge capture

Knowledge is captured regardless of agent type:

- **Soleri agent instances** capture their own patterns during execution
- **Claude Code workers** don't capture — the orchestrator reviews their work and captures anything worth keeping
- The orchestrator always runs `orchestrate_complete` at the end, which feeds the vault and brain

Nothing is lost. The code goes into git, the knowledge goes into the vault.
