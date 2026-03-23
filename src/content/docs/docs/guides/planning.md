---
title: 'Planning with Your Agent'
description: 'How your agent creates, tracks, and learns from structured plans — turning one-off tasks into repeatable workflows.'
---

Your agent isn't just a knowledge store — it can plan work, track execution, and learn from the results. This tutorial shows you how the planning system works and why it matters.

## How plans work

A plan is a structured way to approach a task. Instead of jumping straight into code, your agent breaks work into steps, checks what it already knows, and tracks what happens along the way.

Every plan moves through a lifecycle:

```
brainstorming → draft → approved → executing → reconciling → completed → archived
```

You don't need to know every state — the agent manages transitions. What matters is the flow: **think first, get approval, do the work, review what happened.**

## Step 1: Ask for a plan

When you have a non-trivial task, ask the agent to plan it:

> **You:** "Plan a migration from REST to GraphQL for our user endpoints."
>
> **Agent:** _Creating plan..._
>
> **Objective:** Migrate user endpoints from REST to GraphQL
> **Steps:**
>
> 1. Audit existing REST endpoints and their consumers
> 2. Define GraphQL schema for user types and queries
> 3. Implement resolvers backed by existing service layer
> 4. Add integration tests for GraphQL endpoints
> 5. Update client code to use GraphQL queries
>
> _Brain recommendations: "Always add both REST and GraphQL during migration — don't cut over all at once" (pattern strength: 0.8)_

Notice that last line. The agent checked its brain — the intelligence layer that tracks which patterns have worked before — and surfaced a relevant recommendation. This only happens if you've captured knowledge previously. If the brain has nothing relevant, the agent proceeds without recommendations.

## Step 2: Approve the plan

The agent won't start working until you approve:

> **You:** "Looks good, but add a step for deprecation notices on the old REST endpoints."
>
> **Agent:** _Updated plan — added step 6: "Add deprecation headers to REST responses." Plan is now in draft status. Approve to begin?_
>
> **You:** "Approved."
>
> **Agent:** _Plan approved. Starting execution._

This is the two-gate system: first the plan is approved, then each task gets worked on individually. The agent won't skip ahead or make assumptions about what you want.

## Step 3: Track execution

As the agent works through the plan, each task moves from pending to in-progress to completed:

> **You:** "What's the plan status?"
>
> **Agent:** _Plan: "REST to GraphQL Migration"_
> _Status: executing_
> _Tasks: 3/6 completed, 1 in progress, 2 pending_
>
> - ~~Audit existing REST endpoints~~ ✓
> - ~~Define GraphQL schema~~ ✓
> - ~~Implement resolvers~~ ✓
> - Add integration tests — in progress
> - Update client code — pending
> - Add deprecation headers — pending

Plans persist across sessions. If you close your AI editor and come back tomorrow, the agent knows exactly where you left off.

## Step 4: Reconciliation

When all tasks are done, the agent reconciles — it compares what was planned against what actually happened:

> **Agent:** _Plan complete. Reconciliation:_
> _Accuracy: 85%_
> _Drift: 1 task modified (changed integration tests to use snapshot testing instead of assertion-based), 1 task skipped (deprecation headers deferred to next sprint)_
>
> _2 patterns extracted from this session._

Reconciliation isn't about punishing drift — plans rarely survive contact with reality unchanged. It's about **learning from the difference**. The agent records what changed and why, so future plans for similar work are more accurate.

## The knowledge loop

Here's where planning connects to everything else. When a plan completes, the agent:

1. **Records the session** — what tools were used, what files were modified, how long it took
2. **Extracts patterns** — if something worked well, it becomes a pattern for future recommendations
3. **Updates brain strength** — patterns that keep working get higher strength scores, which means they surface earlier in future plans

This is the compound loop:

```
vault knowledge → brain recommendations → plans → work → knowledge extraction → vault
```

Every plan you run makes the next plan smarter. The brain doesn't just store information — it tracks which patterns actually lead to successful outcomes. A pattern that's been part of 5 successful plans gets recommended more confidently than one that's untested.

## Playbooks: repeatable plans

If you find yourself planning similar work repeatedly, turn it into a playbook:

> **You:** "Create a playbook called 'New API Endpoint' with these steps:
>
> 1. Define the route and request/response schema
> 2. Implement the handler with input validation
> 3. Add error handling for all failure cases
> 4. Write integration tests
> 5. Update API documentation"
>
> **Agent:** _Created playbook: "New API Endpoint" — 5 steps._

Next time you need a new endpoint:

> **You:** "Run the New API Endpoint playbook for a POST /teams endpoint."
>
> **Agent:** _Starting plan from playbook "New API Endpoint"..._

The playbook becomes the starting template. The agent still creates a full plan from it — with brain recommendations injected — so each execution benefits from everything you've learned since the playbook was created.

## When to plan vs. when to just do it

Not everything needs a plan. Quick captures, searches, and one-off questions should stay lightweight. Plans are valuable when:

- The task has **multiple steps** that depend on each other
- You want to **track progress** across sessions
- You want the agent to **learn from the outcome** for future work
- Multiple people might work on different parts

For a single-file bug fix, just fix it. For a feature that touches 6 files across 3 domains, plan it.

---

_Previous: [Code Review with Your Agent](/docs/guides/code-review/) — turn your knowledge base into an active safety net. Next: [Capabilities](/docs/capabilities/) for the full list of things your agent can do._
