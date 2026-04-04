---
name: soleri-test-driven-development
tier: default
description: >
  Use when the user says "TDD", "write tests first", "red green refactor",
  or "test driven". Write failing tests before implementation code for any
  feature or bugfix.
---

# Test-Driven Development (TDD)

**Core principle:** If you didn't watch the test fail, you don't know if it tests the right thing.

## Before You Start — Search First

### Check Vault for Testing Patterns

```
YOUR_AGENT_core op:search_intelligent
  params: { query: "<domain> testing patterns" }
```

```
YOUR_AGENT_core op:search_intelligent
  params: { query: "<what you're about to test>" }
YOUR_AGENT_core op:brain_strengths
```

If vault has testing guidance for this domain, follow it.

## Start a TDD Loop

```
YOUR_AGENT_core op:loop_start
  params: { prompt: "TDD: <feature>", mode: "custom" }
```

## The Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Write code before the test? Delete it. Start over. No exceptions.

## Red-Green-Refactor

### RED — Write Failing Test

One behavior, clear name, real code (no mocks unless unavoidable). Run test, confirm it **fails** for the expected reason (feature missing, not typos). Track: `op:loop_iterate`.

### GREEN — Minimal Code

Simplest code to pass the test. Don't add features beyond the test. Run test, confirm it **passes** and other tests still pass. Track: `op:loop_iterate`.

### REFACTOR — Clean Up

After green only: remove duplication, improve names, extract helpers. Keep tests green. Don't add behavior.

### Repeat

Next failing test for next behavior.

## Verification Checklist

- [ ] Every new function has a test
- [ ] Watched each test fail before implementing
- [ ] Failed for expected reason (not typo)
- [ ] Wrote minimal code to pass
- [ ] All tests pass, output pristine
- [ ] Mocks only where unavoidable
- [ ] Edge cases and errors covered

## After TDD

```
YOUR_AGENT_core op:loop_complete
YOUR_AGENT_core op:capture_quick
  params: { title: "<testing pattern>", description: "<what you learned>" }
```

## Common Mistakes

- Writing implementation before tests ("I'll test after")
- Keeping pre-test code as "reference" (delete means delete)
- Test passes immediately (testing existing behavior, not new)
- Multiple behaviors in one test ("and" in name means split it)

| Problem                | Solution                           |
| ---------------------- | ---------------------------------- |
| Don't know how to test | Write wished-for API first         |
| Must mock everything   | Code too coupled — use DI          |
| Test setup huge        | Extract helpers or simplify design |

## Quick Reference

| Op                                              | When to Use                  |
| ----------------------------------------------- | ---------------------------- |
| `search_intelligent`                            | Find testing patterns        |
| `brain_strengths`                               | Proven testing approaches    |
| `loop_start` / `loop_iterate` / `loop_complete` | TDD cycle tracking           |
| `capture_quick`                                 | Capture new testing patterns |
