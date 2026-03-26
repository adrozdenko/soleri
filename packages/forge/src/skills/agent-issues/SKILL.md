---
name: agent-issues
description: >
  Use when creating GitHub issues, bugs, tasks, or milestones that will be
  worked on by AI coding agents. Triggers on: "create issue", "file bug",
  "gh issue", "add milestone", "create task", "report bug", "gh tasks",
  "create tasks", "create tickets", "file tickets", or when generating
  structured work items from conversation context.
---


# Agent-Optimized Issue Creation

Create GitHub issues that AI agents can parse, execute, and verify without ambiguity. Every issue is a self-contained work order — an agent reading it has everything needed to start, execute, and prove completion.

## Core Principle

**Human issues describe problems. Agent issues describe solutions as testable outcomes.**

An agent cannot act on "improve avatar handling." It can act on: "Add PNG upload to `POST /v1/avatar` in `apps/api/src/routes/avatar.ts`, return `{ avatarUrl }`, reject files > 2MB with 413."

## When to Use

- Creating any GitHub issue via `gh issue create`
- Filing bugs from conversation context or error logs
- Breaking plans into trackable work items
- Creating milestones with sub-issues
- Converting vault patterns or anti-patterns into actionable fixes

## Issue Template by Type

### Bug

```markdown
# Objective
<one sentence: what's broken and what "fixed" looks like>

## Type: bug
## Component: <package or module name>
## Priority: P0 | P1 | P2 | P3

## Context
- Impact: <who/what is affected>
- Related: <links to issues, PRs, vault entries>
- First seen: <date or commit>

## Steps to Reproduce
1. <exact command or action>
2. <exact command or action>
3. Observe: <what happens>

## Expected vs Actual
| | Behavior |
|--|----------|
| **Expected** | <correct behavior> |
| **Actual** | <broken behavior> |

## Error Output
```
<paste exact error, stack trace, or log output>
```

## Root Cause (if known)
- File: `path/to/file.ts` — `functionName()` or line reference
- Why: <brief technical explanation>

## Scope
| In | Out |
|----|-----|
| Fix the specific bug | Refactoring surrounding code |
| Add regression test | Performance optimization |

## Code Locations
- Bug site: `path/to/file.ts` — `symbolName`
- Test file: `path/to/file.test.ts`
- Related: `path/to/related.ts` — `relatedSymbol`

## Acceptance Criteria
- [ ] Bug no longer reproduces with steps above
- [ ] Regression test added that fails without fix, passes with fix
- [ ] No new lint/type errors
- [ ] Existing tests pass

## Verification
```bash
<exact test command>
<exact build/lint command>
```
```

### Feature

```markdown
# Objective
<one sentence: what capability is added and why>

## Type: feature
## Component: <package or module name>
## Priority: P0 | P1 | P2 | P3

## Context
- Why: <user need or business reason>
- Related: <links to issues, PRs, vault entries, specs>

## Scope
| In | Out |
|----|-----|
| <specific deliverable> | <what NOT to touch> |

## Constraints
- Backward compatibility: <requirements>
- Dependencies: <allowed/forbidden>
- Performance: <budgets if any>
- Security: <requirements if any>

## Code Locations
- Entry point: `path/to/file.ts` — `functionOrClass`
- Integration point: `path/to/other.ts` — `symbol`
- Test location: `path/to/test.ts`

## Proposed Approach (optional)
1. <step>
2. <step>

## Acceptance Criteria
- [ ] Given <precondition>, when <action>, then <result>
- [ ] Given <precondition>, when <action>, then <result>
- [ ] Tests added for new behavior
- [ ] Types exported if public API

## Verification
```bash
<exact test command>
<exact build command>
```

## Definition of Done
- [ ] Acceptance criteria satisfied
- [ ] `npm test` passes
- [ ] `npm run typecheck` passes
- [ ] Changes scoped to "In Scope" only
```

### Milestone

```markdown
# Milestone: <short title>

## Objective
<one sentence: what this milestone achieves>

## Timeline
- Target: <date>
- Depends on: <blocking milestones or external factors>

## Sub-Issues

| # | Type | Title | Priority | Depends On |
|---|------|-------|----------|------------|
| 1 | feature | <title> | P1 | — |
| 2 | feature | <title> | P1 | #1 |
| 3 | bug | <title> | P2 | — |

## Completion Criteria
- [ ] All sub-issues closed
- [ ] Integration test passes end-to-end
- [ ] <milestone-level verification>
```

## Field Guide

### Writing Good Objectives

| Bad | Good |
|-----|------|
| "Fix the login" | "Login returns 401 instead of session token when OAuth callback has valid code" |
| "Add dark mode" | "Add `prefers-color-scheme` media query support to all semantic color tokens" |
| "Improve performance" | "Reduce cold-start vault search from 800ms to <200ms by lazy-loading FTS index" |

### Writing Good Acceptance Criteria

Use Given/When/Then for behavioral criteria. Use plain checkboxes for structural criteria.

**Behavioral:**
- [ ] Given a user with valid OAuth code, when POST /auth/callback, then returns 200 with session token

**Structural:**
- [ ] Unit test covers happy path + error case
- [ ] No new `any` types introduced
- [ ] Public API documented in JSDoc

### Writing Good Code Locations

Always include:
1. **File path** — repo-root relative
2. **Anchor** — function name, class name, route, or config key
3. **Context** — what the agent should look at there

```
- Handler: `packages/core/src/auth/callback.ts` — `handleOAuthCallback()`
- Token logic: `packages/core/src/auth/session.ts` — `createSession()`
- Test: `packages/core/src/__tests__/auth.test.ts` — "OAuth callback" describe block
```

### Constraints That Prevent Agent Overreach

Be explicit about boundaries. Agents optimize globally unless told not to.

```
## Constraints
- Do NOT modify the public API surface of `@soleri/core`
- Do NOT add new npm dependencies
- Do NOT refactor surrounding code — fix only the bug
- Backward compatible: existing agent.yaml files must still work
```

## Workflow

1. **Gather context** — search vault, read error logs, check git blame
2. **Identify code locations** — grep codebase for relevant symbols
3. **Choose template** — bug, feature, or milestone
4. **Fill template** — every field. Skip none.
5. **Create issue** — `gh issue create --title "..." --body "..." --label "..."`

## Integration with Planning

When creating issues from a plan, the plan is the source of truth — GitHub issues are the projection. Each task becomes a lean issue pointing back to the plan.

### Plan-Sourced Task Template

```markdown
# Objective
<one sentence: what this task delivers>

## Plan: `<plan-id>` | Task <N> of <total>
## Parent: #<epic-issue-number>
## Complexity: Low | Medium | High
## Depends on: <task dependencies or "nothing">

## Code Locations
- `path/to/file.ts` — `symbolOrFunction`

## Acceptance Criteria
- [ ] <testable outcome>
- [ ] <testable outcome>
- [ ] Tests pass

## Verification
```bash
<exact command>
```
```

### Rules for Plan-Sourced Issues

1. **Plan ID is mandatory** — every task issue must include `## Plan: \`<plan-id>\`` so the full plan is one API call away
2. **Keep issues lean** — task description + code locations + acceptance criteria
3. **One issue per task** — don't bundle multiple plan tasks into one issue
4. **Parent/epic issue** — create a parent issue that lists all task issues
5. **Map complexity to priority** — High → P1, Medium → P2, Low → P3
6. **Include task number** — "Task 3 of 11" helps track progress

## Labels

Always apply at least:
- Type: `bug`, `feature`, `refactor`, `chore`
- Priority: `P0`, `P1`, `P2`, `P3` (if using priority labels)
- Component: package or module name (if using component labels)
