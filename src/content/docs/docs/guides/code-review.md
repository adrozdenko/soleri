---
title: 'Code Review with Your Agent'
description: 'Turn your knowledge base into an active safety net that catches mistakes before they ship.'
---

You've been capturing patterns and anti-patterns. Now put them to work. In this tutorial, your agent reviews code using your own rules — not generic linting, but the specific standards your team agreed on.

## Step 1: Set up some rules

If you followed the previous tutorials, you already have patterns in your vault. If not, let's capture a few quick ones:

> **You:** "Capture these patterns:
>
> 1. Critical: all API errors must return { error, code, details } format
> 2. Critical: never catch exceptions without logging them
> 3. Warning: prefer early returns over deeply nested if-else blocks"
>
> **Agent:** _Captured 3 patterns._

These are now your standards. Your agent will reference them whenever they're relevant.

## Step 2: Ask for a review

You just wrote a new endpoint. Ask your agent to look at it:

> **You:** "Review this handler:
> `app.post('/users', (req, res) => { try { const user = createUser(req.body); res.json(user); } catch (e) { res.status(500).json({ message: 'Something went wrong' }); } })`"
>
> **Agent:** _Found 2 issues based on your captured patterns:_
>
> 1. **Error format mismatch** — response uses `{ message }` but your rule requires `{ error, code, details }`.
> 2. **Silent exception** — the catch block doesn't log the error. Your rule: never catch exceptions without logging them.

The agent didn't use generic rules — it used yours. The ones you captured because they matter to your project.

## Step 3: Fix and learn

Fix the issues and capture what you learned:

> **You:** "Capture this: when handling database errors in API routes, always distinguish between validation errors (400) and internal errors (500). Include the failed field in details for validation errors so the frontend can highlight it."
>
> **Agent:** _Captured: "Database Error Handling in API Routes"_

Next time someone on your team writes an endpoint with database operations, the agent has the answer — with specific guidance on error categorization.

## Step 4: Create a playbook

You keep checking the same things for every endpoint. Turn that into a playbook — a repeatable checklist your agent can run:

> **You:** "Create a playbook called API Endpoint Review with these steps:
>
> 1. Check error responses match { error, code, details } format (validate: consistent shape)
> 2. Verify all exceptions are logged before returning (validate: no silent catches)
> 3. Check input validation happens before business logic (validate: early validation)
> 4. Verify response status codes are appropriate (validate: not everything is 200 or 500)"
>
> **Agent:** _Created playbook: "API Endpoint Review" — 4 steps with validation criteria._

A playbook is different from individual patterns — it's a step-by-step procedure with specific things to check at each step.

## Step 5: Run the playbook

Next time you build an endpoint, run it:

> **You:** "Run the API Endpoint Review playbook on this handler:
> `app.get('/teams/:id', async (req, res) => { const team = await db.teams.find(req.params.id); if (!team) return res.status(404).json({ error: 'Not found', code: 404 }); res.json(team); })`"
>
> **Agent:** _Running API Endpoint Review..._
> Step 1: Error format — 404 response matches convention. **Pass.**
> Step 2: Exception logging — no try/catch around database call. **Fail.** Database errors will crash the process.
> Step 3: Input validation — no validation on `req.params.id`. **Fail.** Should validate it's a valid ID format.
> Step 4: Status codes — 404 and 200 used correctly. **Pass.**
> Result: 2 passed, 2 failed.

Your agent just ran a code review using your team's exact standards. Not generic rules from the internet — your rules, built from your experience.

## How reviews use your knowledge

When you ask the agent to review code, here's what actually happens:

1. **your AI editor calls the agent's search tool** with your code context as the query
2. **The agent searches your vault** — patterns, anti-patterns, and rules that match the code you're reviewing
3. **Results come back ranked** — critical issues first, then warnings, then suggestions
4. **your AI editor applies those results** to your specific code, pointing out violations

The agent doesn't have opinions of its own. It checks your code against your rules — the ones you captured because they matter to your project. This is why building a good knowledge base makes reviews better over time. More patterns in the vault means more things the agent can catch.

Playbooks take this further. When you run a playbook, each step triggers its own search against the vault. Step 1 might pull up error handling patterns, step 2 pulls up logging patterns, and so on. The playbook is the structure; the vault provides the intelligence.

## What you've built

You now have:

- **Rules** — your team's standards, captured as patterns and anti-patterns
- **Reviews** — your agent checks code against those rules, automatically
- **Playbooks** — repeatable checklists for consistent quality

Every pattern you capture makes reviews smarter. Every playbook you create saves time on the next review. The agent gets better because you're teaching it what matters to your project.

---

_Next: [Planning with Your Agent](/docs/guides/planning/) — learn how your agent creates structured plans, tracks execution, and learns from outcomes._
