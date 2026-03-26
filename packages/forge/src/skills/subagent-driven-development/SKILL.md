---
name: subagent-driven-development
description: >
  Use when the user says "use subagents", "parallel agents", "fan out", "dispatch agents",
  "subagent driven", or when a task decomposes into 2+ independent units that benefit from
  isolated execution. Covers when to dispatch, worktree isolation, and merge strategy.
---

# Subagent-Driven Development

Decompose work into isolated units, dispatch subagents via the Agent tool, merge results back. You are the controller — you never implement, you orchestrate.

**Announce at start:** "I'm using the subagent-driven-development skill to dispatch isolated agents."

## When to Dispatch

| Signal                                        | Dispatch?                                |
| --------------------------------------------- | ---------------------------------------- |
| 2+ independent tasks touching different files | Yes — no conflict risk, parallel speedup |
| Risky/experimental work (spike, prototype)    | Yes — isolate blast radius in a worktree |
| Large refactor across unrelated modules       | Yes — each module is a clean unit        |
| Single-file change or trivial fix             | **No** — overhead exceeds benefit        |
| Tasks with sequential dependencies            | **No** — cannot parallelize              |
| Tasks modifying the same file                 | **No** — guaranteed merge conflicts      |

## The Process

### Step 1: Decompose

Break work into discrete units. For each, determine: files involved, dependencies on other units, conflict risk. Only units with no file overlap and no inter-dependency qualify for dispatch.

### Step 2: Dispatch with Worktree Isolation

```
Agent(prompt: "<task prompt>", isolation: "worktree")
```

Each subagent prompt must include: (1) task scope, (2) file boundaries, (3) acceptance criteria, (4) rules — no commits, no out-of-scope changes, run tests before reporting.

Launch all independent subagents in a **single message** so they run in parallel.

### Step 3: Review and Merge

For each returning subagent:

1. **Review** — read actual file changes (do not trust self-reports alone), verify tests pass, check scope compliance
2. **Merge** — `git merge` or `git cherry-pick` from the worktree branch, one at a time
3. **Test** — run the full suite after each merge; only proceed if green
4. **Conflicts** — resolve manually, re-run tests, capture as anti-pattern for future planning

After all merges, capture learnings:

```
YOUR_AGENT_core op:capture_quick params:{
  title: "subagent dispatch outcome",
  description: "<which tasks parallelized well, which conflicted>"
}
```

## Anti-Patterns

| Anti-Pattern                                 | Why It Fails                                  |
| -------------------------------------------- | --------------------------------------------- |
| Dispatching for a 5-line fix                 | Startup overhead exceeds the work             |
| Parallel dispatch of dependent tasks         | Second agent works on stale assumptions       |
| Skipping worktree isolation for nearby files | Silent overwrites between agents              |
| Trusting self-reports without reading code   | Agents miss edge cases or misunderstand scope |
| Dispatching 10+ agents at once               | Review bottleneck shifts to the controller    |

## Merge Strategy

| Situation                           | Strategy                                                 |
| ----------------------------------- | -------------------------------------------------------- |
| Completely separate directories     | Fast-forward merge, no conflicts expected                |
| Different files in the same package | Merge one by one, test after each                        |
| Unexpected conflict                 | Resolve manually, re-run tests, capture as anti-pattern  |
| Subagent result fails review        | Dispatch fix subagent into same worktree (max 2 retries) |

**Related skills:** parallel-execute, executing-plans, verification-before-completion
