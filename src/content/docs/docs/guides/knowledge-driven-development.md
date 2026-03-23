---
title: 'The Knowledge-Driven Approach'
description: 'Why developing with a learning agent changes everything — and how to get the most out of it.'
---

Most AI coding assistants are stateless. You explain your architecture, your conventions, your past decisions — every single session. They forget everything the moment you close the tab.

Soleri agents don't forget. They learn.

## The problem with stateless AI

You've been here before:

- "Our API errors must return { error, code, details }" — for the third time this week
- "We always wrap external calls in a circuit breaker..." — copy-pasting from a doc nobody maintains
- A new team member makes the same mistake you fixed last month, because the fix lives in your head

Knowledge lives in people's heads, scattered docs, and Slack threads that nobody searches. When someone leaves, their knowledge leaves with them.

## The shift

With a Soleri agent, knowledge has a permanent home. When you discover something — a pattern that works, a mistake to avoid, a decision and its rationale — you capture it once. The agent stores it, ranks it, and surfaces it when it's relevant.

This changes your workflow in three ways:

**1. You stop repeating yourself.** Capture a pattern once. The agent knows it forever. Next time your AI editor encounters a related question, it calls the agent's search tool and gets your answer — with context, severity, and examples.

**2. Plans get smarter over time.** The first time you plan a database migration, the agent has nothing to suggest. The tenth time, it has patterns from nine previous migrations — what worked, what didn't, what you always forget. Brain recommendations inject this experience directly into new plans.

**3. Knowledge compounds.** Each session makes the next one better. Patterns that keep proving useful get higher strength scores. Anti-patterns that keep catching bugs surface faster. After a few weeks, your agent knows your project better than any document could.

## The compound loop

Here's the engine that makes it work:

```
┌─────────────────────────────────────────────┐
│                                             │
│   capture → vault → brain → plans → work   │
│      ↑                              │      │
│      └──── knowledge extraction ────┘      │
│                                             │
└─────────────────────────────────────────────┘
```

1. **You capture knowledge** — patterns, anti-patterns, decisions
2. **The vault stores it** — searchable, ranked, organized by domain
3. **The brain tracks what works** — pattern strength increases with successful use
4. **Plans use brain recommendations** — "last 3 times you did this, here's what worked"
5. **Work completes, knowledge is extracted** — what was learned feeds back into the vault

Every cycle through this loop makes the next cycle better. That's the compound effect.

## When this pays off

The knowledge-driven approach isn't equally valuable for every situation:

**High value:**

- Teams with conventions, standards, and institutional knowledge
- Projects that last months or years
- Repeated workflows — migrations, component creation, deployments
- Onboarding new team members to an existing codebase

**Lower value:**

- One-off scripts you'll never touch again
- Solo weekend projects with no conventions to remember
- Purely algorithmic work where the code speaks for itself

You don't need a massive knowledge base to start seeing benefits. Even 10 well-chosen patterns — your team's most important conventions — make a noticeable difference in how useful your agent becomes.

## How to build the habit

The best time to capture knowledge is the moment you learn it:

- **Just fixed a bug?** Capture the anti-pattern that caused it.
- **Made an architecture decision?** Capture the rationale before you forget why.
- **Reviewed a PR and caught a recurring issue?** That's a pattern waiting to be saved.
- **Spent an hour debugging something?** The solution is worth 30 seconds of capture.

One sentence is enough. You can always enrich it later. The important thing is that it's captured — not in your head, not in a Slack message, but in the vault where it will surface exactly when someone needs it.

## What this is not

Your agent is not a replacement for documentation, code comments, or team communication. It's a complementary layer — a searchable, ranked knowledge store that your AI editor consults during your work.

The agent doesn't proactively interrupt you. It doesn't enforce rules. It surfaces knowledge when asked, and it improves its recommendations based on what actually proves useful. You stay in control.

See the [Success Story](/docs/guides/dashboard/) for a concrete example of this compound effect in action — a team going from blank slate to 50+ patterns in 20 days.

---

_Next: [Under the Hood](/docs/guides/under-the-hood/) — understand exactly how the vault, brain, and memory work together._
