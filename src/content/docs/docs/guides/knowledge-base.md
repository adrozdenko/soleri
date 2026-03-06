---
title: 'Building a Knowledge Base'
description: 'Learn what to capture, how to organize it, and how to make your agent genuinely useful over time.'
---

Your agent is only as smart as what you teach it. This tutorial shows you how to build a knowledge base that actually helps — not a graveyard of notes nobody reads.

## Step 1: Capture a pattern

A pattern is something that works — a proven approach you want to repeat. When you solve a problem and think "I should remember this," that's a pattern.

> **You:** "Capture this pattern: always use optimistic updates for form submissions. Update the UI immediately, then reconcile with the server response. Users shouldn't wait for a round trip."
>
> **Agent:** _Captured: "Optimistic Updates for Forms" — severity: suggestion, domain: frontend._

Notice the agent auto-assigned a severity and domain. You can override these, but the defaults are usually good enough.

## Step 2: Capture an anti-pattern

Anti-patterns are just as valuable — they're mistakes you don't want to repeat. When you fix a bug caused by a bad approach, capture it:

> **You:** "Capture this anti-pattern: never store JWT tokens in localStorage. We had a XSS vulnerability because of this. Use httpOnly cookies instead."
>
> **Agent:** _Captured anti-pattern: "Never Store JWTs in localStorage" — severity: critical._

The agent marked this as critical because you said "vulnerability." Critical patterns always surface first in searches — they're impossible to miss.

## Step 3: Use severity to prioritize

Not everything is equally important. Severity controls what surfaces first:

- **Critical** — must follow. Breaking this causes real problems. _"All API responses must include rate limit headers."_
- **Warning** — should follow. Skipping this leads to tech debt. _"Prefer named exports over default exports."_
- **Suggestion** — nice to have. Improves quality but not a deal-breaker. _"Add loading skeletons instead of spinners."_

You can set severity explicitly:

> **You:** "Capture a critical pattern in the security domain: always validate redirect URLs against an allowlist to prevent open redirect attacks."
>
> **Agent:** _Captured: "Validate Redirect URLs" — critical, security domain._

When someone later searches for security patterns, this will be at the top.

## Step 4: Organize with domains

Domains are knowledge areas. Your agent starts with whatever domains you picked during setup, but you can add more anytime:

```bash
npx @soleri/cli add-domain infrastructure
```

Now when you capture something infrastructure-related, tag it to that domain:

> **You:** "Capture this pattern in the infrastructure domain: always set CPU and memory limits on Kubernetes pods. Without limits, one pod can starve the whole node."
>
> **Agent:** _Captured: "Always Set K8s Resource Limits" — infrastructure domain._

Domains keep things organized. When you search within a domain, you only get relevant results — not your frontend patterns mixed in with your infrastructure rules.

## Step 5: Search and discover

As your knowledge base grows, search becomes powerful. The agent ranks results by relevance, severity, and how often each pattern has been useful:

> **You:** "Search for security patterns"
>
> **Agent:** _Found 3 entries:_
>
> 1. **Validate Redirect URLs** (critical) — prevent open redirect attacks
> 2. **Never Store JWTs in localStorage** (critical) — use httpOnly cookies
> 3. **Sanitize user input before database queries** (critical) — prevent SQL injection

Critical entries always surface first. The more you use a pattern (reference it, search for it), the higher it ranks over time.

## Step 6: Check your progress

See how your knowledge base is growing:

> **You:** "Show me vault stats"
>
> **Agent:** You have **12 patterns** and **4 anti-patterns** across 3 domains: frontend, security, infrastructure. 16 entries total.

## How knowledge comes back to you

Capturing is only half the story. Here's what happens when you search — or when Claude Code searches on your behalf.

Your agent uses a multi-signal ranking system. When you search for "security patterns," the agent doesn't just do a keyword match. It combines:

- **Text relevance** — TF-IDF scoring against your query
- **Severity weight** — critical entries rank higher than suggestions
- **Domain match** — entries in the matching domain get a boost
- **Usage history** — patterns you've referenced before rank higher over time

This is why severity and domains matter — they're not just labels. They directly affect which results surface first when you or Claude Code search.

The agent also has a brain — an intelligence layer that tracks pattern usage across sessions. Every time a pattern is used in a plan or referenced in a review, its strength increases. A pattern with high strength gets recommended proactively when the agent creates plans for related work.

> **You:** "Search for patterns about database migrations"
>
> **Agent:** _Found 4 entries (ranked by relevance):_
>
> 1. **Always Set K8s Resource Limits** (critical, infrastructure) — score: 0.92
> 2. **Run Migrations in Transactions** (warning, infrastructure) — score: 0.87
> 3. **Test Rollback Before Deploy** (warning, infrastructure) — score: 0.71
> 4. **Use Descriptive Migration Names** (suggestion, infrastructure) — score: 0.45

The scores reflect combined signals — not just text match, but severity, domain relevance, and how often each pattern has proven useful.

## The habit that matters

The best time to capture knowledge is right when you learn it — when you fix a bug, make a decision, or discover a better approach. Don't save it for later. Later never comes.

One sentence is enough. You can always enrich it later. The important thing is that it's captured.

---

_Next: [Code Review with Your Agent](/docs/guides/code-review/) — turn your knowledge base into an active safety net that catches mistakes before they ship._
