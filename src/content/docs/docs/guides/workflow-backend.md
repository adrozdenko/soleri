---
title: 'Backend Workflow'
description: 'Search → Plan → Work → Capture → Complete for APIs, databases, services, and infrastructure.'
---

The [development workflow](/docs/guides/workflow/) applied to backend work: APIs, database operations, service architecture, and infrastructure.

## Search: what conventions exist?

Before writing an endpoint or modifying a service, check what the team has established:

> **You:** "What do we know about API error handling?"
>
> **Agent:** _Found 4 entries:_
>
> 1. All errors must return { error, code, details } format (critical)
> 2. Always include rate limit headers in responses (critical)
> 3. Use structured logging — no console.log in production (pattern)
> 4. Wrap database operations in transactions for multi-step mutations (pattern)
>
> **You:** "Any anti-patterns for authentication?"
>
> **Agent:** _Found 2 entries:_
>
> 1. Never store JWTs in localStorage — use httpOnly cookies (critical)
> 2. Don't roll your own password hashing — use bcrypt or argon2 (critical)

These are the rules your team agreed on. A quick search prevents you from shipping something that'll fail code review.

## Plan: structure the backend task

> **You:** "Plan: add a POST /teams endpoint with invite flow — create team, assign owner, send invite emails to members"
>
> **Agent:** _Plan created:_
>
> 1. Define request/response schema with validation
> 2. Implement handler — create team, assign owner role
> 3. Add invite logic — generate tokens, queue emails
> 4. Add error handling for all failure cases
> 5. Write integration tests — happy path, validation errors, duplicate teams
> 6. Update API documentation
>
> _Brain recommendation: "All API errors must return { error, code, details } format" (strength: 0.95)_
> _Brain recommendation: "Wrap database operations in transactions for multi-step mutations" (strength: 0.88)_

The brain surfaced the transaction pattern because this task involves creating a team and assigning a role, a multi-step mutation that needs atomicity.

## Work: build with guardrails

During implementation, check your decisions:

> **You:** "Does this error response match our conventions?
> `res.status(400).json({ message: 'Invalid email' })`"
>
> **Agent:** _No — your convention requires `{ error: string, code: number, details?: object }`. Should be:_
> `res.status(400).json({ error: 'Invalid email', code: 400, details: { field: 'email' } })`
>
> **You:** "Review this endpoint for security issues"
>
> **Agent:** _2 issues found:_
>
> 1. No rate limiting on invite endpoint — potential abuse vector
> 2. Invite token has no expiration — should expire in 48 hours

## Capture: save what you learned

During the build, you discovered things:

> **You:** "Capture this pattern: when sending invite emails, always queue them asynchronously. Don't block the API response waiting for email delivery — return 202 Accepted and process the queue in background."
>
> **You:** "Capture this anti-pattern: don't use string concatenation for SQL queries, even in internal tools. Always use parameterized queries. We found a SQL injection in an admin script that 'only internal people use.'"

## Complete: close the loop

> **You:** "Complete the plan"
>
> **Agent:** _Plan complete. Accuracy: 100%. 2 patterns extracted._

Next time someone builds an endpoint with email sending, the search step will surface the async queue pattern. Next time someone writes a database query, the SQL injection anti-pattern will be right there.

## Backend patterns worth capturing early

| Area             | What to capture                                            |
| ---------------- | ---------------------------------------------------------- |
| API conventions  | Error format, status codes, pagination, versioning         |
| Database         | Transaction rules, migration strategy, indexing guidelines |
| Authentication   | Token strategy, session handling, permission model         |
| Error handling   | Retry policies, circuit breaker rules, fallback behavior   |
| Performance      | Query limits, caching strategy, N+1 prevention             |
| Security         | Input validation, rate limiting, secret management         |

---

_See also: [Frontend Workflow](/docs/guides/workflow-frontend/) and [UX Workflow](/docs/guides/workflow-ux/) for domain-specific variants._
