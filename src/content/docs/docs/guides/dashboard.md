---
title: 'Success Story: The Platform Rebuild'
description: 'Follow a team as their Soleri agent goes from blank slate to indispensable teammate in 20 days.'
---

Sam is a senior developer starting a payment processing service for a financial platform. He's done this before — and every time, architecture decisions get buried in Slack threads and PR comments. By month three, nobody remembers _why_ the team picked that particular retry strategy.

This time he's using a Soleri agent.

```bash
npm create soleri platform-brain
```

He names it **platform-brain**, picks `backend` and `security` as domains, and connects it to Claude Code. Two minutes.

## Day 1 — First Decisions

Sam hasn't settled on the service architecture yet. He asks:

> **Sam:** "I'm building a payment processing service. What patterns should I consider for reliability?"
>
> **Agent:** _Found 3 relevant entries._ Here are proven approaches:
> **Idempotency keys** — every payment request must have a unique key. Prevents duplicate charges on retry.
> **Circuit breaker** — wrap external payment provider calls. Fall back gracefully when the provider is down.
> **Event sourcing** — store every state transition. Enables audit trail and replay for debugging.

The agent already knows reliability patterns from its starter knowledge — Sam didn't teach it anything.

He picks idempotency keys and circuit breaker, and captures the decisions:

> **Sam:** "Capture this: every payment endpoint must accept an idempotency key header. Duplicate requests return the original response, never process twice. This is critical for preventing double charges."
>
> **Agent:** _Captured: "Idempotency Key Requirement" — critical severity, backend domain._

He does the same for the circuit breaker strategy and error retry policy. Three foundational decisions, all captured in his agent's vault — not in a doc he'll forget about.

**Agent vault: 3 patterns.**

## Day 3 — Catching Mistakes

Sam writes a payment endpoint that catches database errors and returns a generic 500. He mentions it to his agent.

> **Sam:** "Just wrote the charge endpoint. Catches exceptions and returns 500 with an error message."
>
> **Agent:** _Found: "API Error Response Standard" (critical)._ Your convention requires `{ error, code, details }` format with specific error codes per failure type. Payment failures should distinguish between validation errors (400), provider errors (502), and internal errors (500).

He didn't ask for a review. The agent flagged it because the error format rule is marked `critical` — it always surfaces.

Later, he writes a retry loop without checking the idempotency key. The agent catches that too:

> **Sam:** "Added retry logic for failed charges. Retries up to 3 times with exponential backoff."
>
> **Agent:** _Found: "Idempotency Key Requirement" (critical)._ Retries without idempotency keys can cause duplicate charges. Each retry must include the same idempotency key from the original request.

Sam captures both fixes as rules. Then he formalizes his workflow:

> **Sam:** "Create a playbook: Payment Endpoint Review — check idempotency, error format, retry safety, and input validation."
>
> **Agent:** _Created playbook: "Payment Endpoint Review" — 4 steps with validation criteria._

**Agent vault: 8 patterns + 1 playbook.**

## Day 20 — The Compound Effect

Three weeks in. Sam's agent has 47 entries — every one earned through real work. He starts building a refund endpoint. Before he asks a question:

> **Agent:** _Relevant patterns for payment operations:_
> Always require idempotency keys. Error responses must use `{ error, code, details }` format. Wrap provider calls in circuit breaker.
> **3 anti-patterns to avoid:**
> Don't retry non-idempotent operations without a key (Day 3). Don't log full card numbers — mask all but last 4 (Day 8). Don't process refunds synchronously — use a queue for amounts over $100 (Day 12).

The agent warns him about mistakes he already made and fixed. He'll never make them twice.

Then Emma, a new backend developer, joins the team. Instead of a half-day onboarding walkthrough, she scaffolds her own agent and links it to Sam's project:

> **Emma:** "I need to build a subscription billing endpoint. What are the conventions?"
>
> **Agent:** _Cross-project search — 47 entries from linked payment service._
> Idempotency keys required on all mutation endpoints. Error format: `{ error, code, details }`. Circuit breaker on external calls. Never log sensitive payment data. Queue async operations over threshold amounts.

Emma got a personalized onboarding in 30 seconds — not a generic wiki page, but Sam's actual decisions, rules, and hard-won anti-patterns.

**Agent vault: 50+ patterns across 2 linked projects.**

## What Happened

| Milestone | Patterns | Value |
|-----------|----------|-------|
| **Day 1** | 3 | Architecture decisions — captured, not forgotten |
| **Day 3** | 8 | Agent catches missing idempotency and wrong error format before they ship |
| **Day 20** | 50+ | New team member onboards in seconds. Knowledge flows both ways. |

Each session makes the agent smarter. Each captured pattern prevents a future mistake. Each team member who links adds to the collective knowledge.

Sam's agent isn't a generic AI assistant anymore. It's his team's engineering brain — built from every decision, every fix, every "never do this again" moment.

The knowledge compounds.

---

_Ready to start? [Getting Started](/docs/getting-started/) — scaffold your agent in under 5 minutes._
