---
name: soleri-subagent-driven-development
description: >
  Use when the user says "use subagents", "parallel agents", "fan out", "dispatch agents",
  "subagent driven", or when a task decomposes into 2+ independent units that benefit from
  isolated execution. Covers when to dispatch, worktree isolation, and merge strategy.
---

# Subagent-Driven Development

Decompose work into isolated units, dispatch subagents via the Agent tool, merge results back. You are the orchestrator — you make all decisions, subagents execute.

**Announce at start:** "I'm using the subagent-driven-development skill to dispatch isolated agents."

## The Orchestrator Contract

**You are the boss. Subagents are the crew.**

1. **All decisions stay with the orchestrator.** Research the task, consult the vault, decide the approach. Subagents receive exact specs — scope, file boundaries, acceptance criteria. They execute, they don't decide.
2. **Subagents MUST NOT create plans.** Only the orchestrator creates plans. Subagent prompts must explicitly state: "Do NOT create plans, do NOT call planning tools."
3. **If a subagent hits ambiguity, it returns — it doesn't guess.** The orchestrator resolves, then re-dispatches.
4. **The orchestrator reconciles all work.** After subagents return, the orchestrator reviews changes, merges, captures knowledge.

## Hybrid Agent Routing

Not all subagents are equal. Route by complexity:

| Signal                                | Agent Type                | Why                           |
| ------------------------------------- | ------------------------- | ----------------------------- |
| Single file, clear spec, no decisions | **Claude Code worker**    | Fast, low overhead            |
| Approach already in parent plan       | **Claude Code worker**    | Spec is decided               |
| 3+ files, cross-cutting concerns      | **Soleri agent instance** | Needs vault, brain, lifecycle |
| Unresolved design decisions           | **Soleri agent instance** | Needs judgment                |
| New dependencies or architecture      | **Soleri agent instance** | Needs full context            |

**User overrides:**

- "Use full agent for everything" → all Soleri agent instances
- "Just use workers" → all Claude Code workers
- Default: hybrid routing

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

### Step 1: Research & Decide (Orchestrator only)

Read all relevant files. Consult the vault for patterns. Make every design decision. Define the exact spec for each subagent task: files to touch, approach to use, acceptance criteria.

```
YOUR_AGENT_core op:memory_search
  params: { query: "subagent decomposition" }

YOUR_AGENT_core op:brain_recommend
  params: { query: "<task domain>" }
```

### Step 2: Decompose & Route

Break work into discrete units. For each, determine: files involved, dependencies on other units, conflict risk, complexity. Assign agent type per the routing table.

### Step 3: Dispatch

Present the dispatch table to the user:

```
## Dispatching N tasks in parallel

| # | Task | Agent | Why |
|---|------|-------|-----|
| 1 | Description | Worker / Instance | Routing reason |
```

Each subagent prompt must include:

- Task scope and file boundaries
- Acceptance criteria
- "Do NOT create plans. Do NOT make design decisions. Execute this spec exactly."
- For Soleri instances: "Activate, execute, run orchestrate_complete when done."

Launch all independent subagents in a **single message** so they run in parallel.
Use `isolation: "worktree"` for file-modifying tasks.

### Step 4: Review and Merge

For each returning subagent:

1. **Review** — read actual file changes (do not trust self-reports alone), verify tests pass, check scope compliance
2. **Merge** — `git merge` or `git cherry-pick` from the worktree branch, one at a time
3. **Test** — run the full suite after each merge; only proceed if green
4. **Conflicts** — resolve manually, re-run tests, capture as anti-pattern

### Step 5: Reconcile & Report

After all merges, report to the user:

**Minimal (default):**

```
N/N complete. M patterns captured to vault.
  -> Decisions: [any design decisions the orchestrator made]
```

**Detailed (on request):**

```
| # | Task | Agent | Status | Knowledge |
|---|------|-------|--------|-----------|
| 1 | Desc | Worker | Done | -- |
| 2 | Desc | Instance | Done | 2 patterns |
```

Capture learnings to vault. Run `orchestrate_complete` for the parent plan.

```
YOUR_AGENT_core op:capture_knowledge
  params: { title: "<learned pattern>", description: "<merge strategy or decomposition insight>", type: "pattern", tags: ["subagent", "parallel-execution"] }
```

## Worktree Cleanup Guarantee

Three layers — nothing accumulates:

1. **Per-task:** `finally` block in dispatcher removes worktree after each task
2. **Per-batch:** `cleanupAll()` runs after all subagents complete
3. **Per-session:** `SessionStart` hook prunes orphaned worktrees

## Anti-Patterns

| Anti-Pattern                                 | Why It Fails                                        |
| -------------------------------------------- | --------------------------------------------------- |
| Subagent creating its own plan               | Stale plans accumulate, lifecycle never completes   |
| Subagent making design decisions             | Inconsistent approaches, orchestrator loses control |
| Dispatching for a 5-line fix                 | Startup overhead exceeds the work                   |
| Parallel dispatch of dependent tasks         | Second agent works on stale assumptions             |
| Skipping worktree isolation for nearby files | Silent overwrites between agents                    |
| Trusting self-reports without reading code   | Agents miss edge cases or misunderstand scope       |
| Dispatching 10+ agents at once               | Review bottleneck shifts to the controller          |
| Not cleaning up worktrees after merge        | Disk bloat, stale branch accumulation               |

## Merge Strategy

| Situation                           | Strategy                                                 |
| ----------------------------------- | -------------------------------------------------------- |
| Completely separate directories     | Fast-forward merge, no conflicts expected                |
| Different files in the same package | Merge one by one, test after each                        |
| Unexpected conflict                 | Resolve manually, re-run tests, capture as anti-pattern  |
| Subagent result fails review        | Dispatch fix subagent into same worktree (max 2 retries) |

**Related skills:** parallel-execute, executing-plans, verification-before-completion
