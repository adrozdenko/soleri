---
title: 'The Development Workflow'
description: 'The canonical way to work with your agent — a five-step rhythm that applies to any task, any domain.'
---

This is the workflow. Five steps, same every time. The domain changes — frontend, backend, UX, infrastructure — but the rhythm stays the same.

## The rhythm

```
Search → Plan → Work → Capture → Complete
```

That's it. Every task follows this loop. Some steps are quick (a search takes seconds), some you skip for trivial tasks (you don't plan a one-line fix). But this is the foundation.

## Step 1: Search first

Before you write a single line of code, ask the agent what it already knows.

> **You:** "What do we know about form validation?"
>
> **Agent:** _Found 4 entries:_
> 1. Always validate on both client and server (critical)
> 2. Use optimistic updates for form submissions (pattern)
> 3. Never trust client-side validation alone (anti-pattern)
> 4. Show errors inline next to the field, not at the top (suggestion)

This takes 5 seconds. It saves you from repeating a solved problem, violating a team convention, or making a mistake someone already documented.

**If the vault has something** — follow it. The pattern exists because someone learned it the hard way.

**If the vault has nothing** — that's fine. You're about to learn something new. Keep going, and capture what you learn at the end.

## Step 2: Plan the work

For anything beyond a quick fix, ask the agent to plan it. The plan pulls in brain recommendations — patterns that have worked before in similar tasks.

> **You:** "Plan: add email validation to the signup form with real-time feedback"
>
> **Agent:** _Plan created:_
> 1. Add validation schema for email field
> 2. Implement real-time validation on input change
> 3. Show inline error states
> 4. Add server-side validation as backup
>
> _Brain recommendation: "Always validate on both client and server" (strength: 0.9)_

The plan isn't bureaucracy — it's the agent telling you what it knows before you start. Review it, adjust it, approve it.

For a one-line bug fix or a quick question, skip this step. You don't need a plan for everything.

## Step 3: Do the work

Work normally. The agent is there when you need it — ask questions, check patterns, run reviews. You're in control.

During work, the agent is useful for:
- **Checking decisions** — "Does this approach match our patterns?"
- **Running reviews** — "Review this endpoint against our standards"
- **Running playbooks** — "Run the API endpoint review playbook on this code"

You don't have to use the agent for every line of code. Use it at decision points — when you're choosing an approach, when you're not sure about a convention, when you're done with a piece and want it checked.

## Step 4: Capture what you learned

This is the most important step. When you learn something during the work — a pattern that worked, a mistake to avoid, a decision with important rationale — capture it immediately.

> **You:** "Capture this: email validation regex should use the RFC 5322 standard, not a simple check. We had bounced emails from addresses our regex rejected."

One sentence is enough. You can always enrich it later. The critical thing is that it's captured while it's fresh — not in your head, not in a PR comment, but in the vault where it will surface next time someone touches email validation.

**What to capture:**
- A bug you fixed and the root cause
- A decision you made and why
- A pattern you found that worked well
- A mistake you won't repeat
- Something that surprised you

**What not to capture:**
- Things that are obvious from the code itself
- One-time configuration that won't recur
- Generic knowledge that isn't specific to your project

## Step 5: Complete

When the task is done, let the agent close the loop:

> **You:** "Complete the plan"
>
> **Agent:** _Plan complete. Accuracy: 95%. 1 pattern extracted from this session._

The agent reconciles what was planned vs what happened, records the session, and extracts any patterns it detected. This feeds the brain — next time someone plans similar work, the recommendations will be better.

For quick tasks without a plan, this step is just the capture from Step 4. The knowledge still enters the vault and feeds the compound loop.

## The compound effect

Here's why the rhythm matters. Each cycle through the loop makes the next one better:

- **Search** returns more relevant results because you've been capturing
- **Plans** include smarter recommendations because the brain tracks what works
- **Work** goes faster because you're not repeating solved problems
- **Captures** fill gaps that future searches will hit
- **Completions** strengthen patterns that keep proving useful

Session 1 feels like talking to a blank slate. Session 20 feels like working with someone who knows your codebase. Session 50 feels like having your best teammate available 24/7.

## Quick reference

| Task size | What to do |
|-----------|-----------|
| **One-line fix** | Search → Work → Capture if you learned something |
| **Small feature** | Search → Work → Capture |
| **Medium feature** | Search → Plan → Work → Capture → Complete |
| **Large feature** | Search → Plan → Work (with reviews) → Capture → Complete |

The workflow scales with the task. Don't overthink it — the important habits are **search first** and **capture when you learn**.

---

_This workflow is the foundation. As you get comfortable, explore [Planning](/docs/guides/planning/) for structured task management, [Code Review](/docs/guides/code-review/) for automated quality checks, and [Validation Loops](/docs/guides/loops/) for iterative convergence._
