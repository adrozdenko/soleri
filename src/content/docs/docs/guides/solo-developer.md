---
title: 'Patterns for Solo Developers'
description: 'How to use Soleri as a second brain that remembers your decisions, patterns, and mistakes between sessions.'
---

You don't have a team to remind you why you chose Postgres over SQLite, or why that one API endpoint uses a different auth flow. It's just you. And every time you open a new AI session, you start from scratch, re-explaining the same context, the same conventions, the same decisions you already made three weeks ago.

The actual cost of working solo isn't the lack of teammates. It's the context loss between sessions.

## Why this matters for solo devs

Teams have code reviews, Slack threads, and that one person who remembers everything. Solo devs have... their memory. And memory is unreliable, especially across multiple projects over months.

On a team, Soleri is about shared knowledge. For you, it's simpler: stop repeating yourself to your AI assistant. Every pattern you capture, every decision you record, is context you never have to explain again.

Session 1: "We use Zod for all runtime validation because TypeScript types don't exist at runtime."

Session 47: Your agent already knows this. It checks the vault, finds the pattern, and applies it without asking. That's the difference.

## The daily workflow

Your day with Soleri looks like this:

Start your session. Context-resume picks up where you left off. The agent knows what you were working on, what decisions you made recently, and what patterns matter for your current task.

> **You:** "Where did I leave off?"
>
> **Agent:** _Last session you were refactoring the auth middleware. You captured a pattern about token refresh handling and had 2 tasks remaining on the plan._

Work normally. The vault guides the agent in the background. When you ask it to build something, it checks for relevant patterns first. When you're about to make a decision it has context on, it surfaces what it knows.

Capture what you learn. When you solve something tricky, hit a surprising bug, or make a decision with real tradeoffs, save it.

> **You:** "Save this to vault: retry logic must use exponential backoff with jitter. Fixed retries caused a thundering herd against our rate-limited API."

End your session. The agent captures a session summary automatically. Tomorrow, you pick up right where you stopped.

Work and capture. That's the loop.

## Building your knowledge base

Don't sit down and write 50 patterns on day one. You'll burn out and half of them won't be useful.

Instead, build it as you go. The best time to capture knowledge is the moment you learn it:

- Just debugged something for 45 minutes? Capture the root cause and the fix.
- Made a technology choice? Write down why. "Chose SQLite over Postgres because this is a single-user desktop app and I don't want to manage a server" takes 10 seconds and saves a future re-evaluation.
- Found a gotcha in a library? Perfect anti-pattern. "Day.js `.format()` silently returns Invalid Date instead of throwing. Always call `.isValid()` first."

### What to capture vs. what to skip

**Capture these:**

- Architecture decisions and their rationale
- Bug root causes that weren't obvious
- Library gotchas and workarounds
- Patterns you want to be consistent about
- Things you looked up twice

**Skip these:**

- One-time setup steps (they're in your README or install script)
- Things obvious from reading the code
- Generic programming knowledge ("use try/catch for error handling")
- Configuration values that live in config files already

20 high-signal entries beat 200 noisy ones.

## The 5 habits that pay off

The difference between "I have Soleri installed" and "Soleri actually makes me faster."

### 1. Capture anti-patterns when you hit bugs

When something breaks and it takes you a while to figure out why, that's vault-worthy. Not the fix itself (that's in the code), but the _why_.

> **You:** "Save this to vault: never use `JSON.parse` on user input without a try/catch wrapper. The payment webhook sends malformed JSON about 1 in 1000 requests and it crashes the whole handler."

Next time you're writing a webhook handler, the agent already knows to wrap the parse.

### 2. Save architecture decisions

Solo devs make dozens of architecture decisions with no one to discuss them with. Six months later, you'll stare at your own code and wonder why you did it that way.

> **You:** "Save this to vault: we use a single SQLite database per workspace instead of one shared database. Reason: simpler backup/restore, no multi-tenant query bugs, and workspaces are fully independent."

This isn't just for the agent. It's a record of your thinking that survives context switches and long breaks from a project.

### 3. Use planning for anything touching 3+ files

Solo devs tend to skip planning because there's nobody to present the plan to. But plans aren't about communication, they're about catching bad ideas before you've written 200 lines of code.

> **You:** "Plan: migrate from REST to tRPC for the dashboard API"
>
> **Agent:** _Plan created. Brain recommendation: "Always migrate one endpoint at a time, keep both running in parallel" (from your last migration)._

The plan pulls in patterns from your vault. If you've done something similar before, it tells you what worked. If you haven't, it gives you a structured approach to think through before diving in.

For a quick bug fix or a single-file change, skip the plan. Just do the work.

### 4. Search the vault before starting new features

Before you start building, take 5 seconds to ask what already exists.

> **You:** "Search vault for authentication patterns"
>
> **Agent:** _Found 3 entries:_
> 1. Use httpOnly cookies for session tokens, never localStorage (critical)
> 2. Token refresh should happen 5 minutes before expiry, not on 401 (pattern)
> 3. Previous attempt at JWT-based auth was abandoned because refresh token rotation was too complex for our use case (decision)

That third entry just saved you from going down a path you already tried and rejected. Without the vault, you might have spent a day rediscovering why you abandoned it.

### 5. Monthly vault grooming

Every few weeks, spend 10 minutes with the curator:

> **You:** "Curator status"
>
> **Agent:** _Vault health: 85%. 3 entries haven't been referenced in 60 days. 1 potential duplicate detected. 2 entries have low confidence scores._

Review what's stale. Merge duplicates. Remove things that turned out to be wrong. A clean vault returns better search results. Think of it like weeding a garden: 10 minutes a month keeps it useful.

## Recommended setup

Here's what matters for solo work. Skip the team-oriented features (governance policies, strict approval gates, multi-contributor workflows) until you actually need them.

### Essential skills

These are the ones you'll use every day:

- **vault-capture** and **vault-navigator** for saving and searching patterns
- **context-resume** for picking up where you left off
- **curator** for vault maintenance

### Hook packs worth installing

```bash
npx @soleri/cli hooks add-pack terse-auto    # Shorter responses, saves tokens
npx @soleri/cli hooks add-pack oxlint        # Catch lint issues on every edit
```

Terse mode cuts the fluff from agent responses without losing technical accuracy. When you're the only one reading the output, you don't need verbose explanations for things you already understand.

### What to skip (for now)

- **Governance policies** are for controlling knowledge capture in teams. Start with the default (`moderate`) and don't think about it until your vault hits 200+ entries.
- **Subagent dispatch** adds complexity. Stick with single-agent workflows until you have tasks that genuinely benefit from parallelism.
- **Knowledge review workflows** matter when multiple people contribute to the vault. When it's just you, your capture is your review.

## Cross-project knowledge

If you work on multiple projects, this is where things get interesting. Patterns from one project are often useful in another.

Link your projects:

> **You:** "Link this project to ../my-api as related"

Now when you search for patterns, the agent can pull from both projects. That error handling pattern you captured in your API project? It shows up when you're building error handling in your frontend project too.

The agent weights results by relevance, so cross-project patterns don't drown out project-specific ones. They show up when they're genuinely useful.

You can also search across projects explicitly:

> **You:** "Search across all projects for deployment patterns"
>
> **Agent:** _Found entries from 3 projects: deployment rollback strategy (api-server), zero-downtime migration steps (dashboard), health check endpoint pattern (shared)._

Over time, you build a personal knowledge base that spans everything you work on. Patterns that keep proving useful across projects get higher strength scores and surface faster.

## When to skip ceremony

Soleri has plans, loops, orchestration, reconciliation. You don't need all of it for everything.

**Just do it** when:

- It's a single-file change
- You already know exactly what to do
- It's a quick bug fix with an obvious cause
- You're exploring or prototyping

**Use a plan** when:

- You'd normally write a todo list or sketch something out
- The change touches 3+ files
- You're not sure about the approach
- You've done something similar before and want to pull in past learnings

**Use the full workflow** (search, plan, work, capture, complete) when:

- It's a feature that'll take more than an hour
- You're making architecture decisions
- You want the agent to track what worked and what didn't

The goal is to make your work better, not to add process for its own sake. Speed is your advantage. Don't trade it for ceremony you don't need yet.

---

_Next: [The Development Workflow](/docs/guides/workflow/) for the full five-step rhythm, or [Building a Knowledge Base](/docs/guides/knowledge-base/) for what to capture and how to organize it._
