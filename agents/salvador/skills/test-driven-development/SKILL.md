---
name: test-driven-development
description: Use when implementing any feature or bugfix, before writing implementation code
---

<!-- Adapted from superpowers (MIT License) -->

# Test-Driven Development (TDD)

## Overview

Write the test first. Watch it fail. Write minimal code to pass.

**Core principle:** If you didn't watch the test fail, you don't know if it tests the right thing.

**Violating the letter of the rules is violating the spirit of the rules.**

## When to Use

**Always:**

- New features
- Bug fixes
- Refactoring
- Behavior changes

**Exceptions (ask your human partner):**

- Throwaway prototypes
- Generated code
- Configuration files

Thinking "skip TDD just this once"? Stop. That's rationalization.

## Before You Start — Search First, Code Second

**Never start writing tests blind.** Follow this lookup order:

### 1. Vault First

Check for existing testing patterns in the knowledge base:

```
salvador_core op:search_intelligent
  params: { query: "<what you're about to test>" }
```

Look for:

- **Testing patterns** for similar features (how were they tested before?)
- **Anti-patterns** — common testing mistakes in this domain
- **Proven approaches** from brain strengths:

```
salvador_core op:brain_strengths
```

If the vault has testing guidance for this domain, follow it. Don't reinvent test strategies that have already been validated.

### 2. Web Search

If the vault has no relevant patterns, search the web for established testing approaches:

- Library-specific testing patterns (e.g., how to test React hooks, Express middleware)
- Best practices for the specific type of test (integration, e2e, unit)
- Known gotchas in the testing framework being used

### 3. Then Write the Test

Only after consulting vault and web, proceed to write the failing test. You'll write better tests when informed by existing knowledge.

## Start a TDD Loop

For multi-test TDD cycles, start a validation loop to track iterations:

```
salvador_core op:loop_start
  params: { prompt: "TDD: <feature being implemented>", mode: "custom" }
```

## The Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Write code before the test? Delete it. Start over.

**No exceptions:**

- Don't keep it as "reference"
- Don't "adapt" it while writing tests
- Don't look at it
- Delete means delete

Implement fresh from tests. Period.

## Red-Green-Refactor

### RED - Write Failing Test

Write one minimal test showing what should happen.

Good: clear name, tests real behavior, one thing
Bad: vague name, tests mock not code

**Requirements:**

- One behavior
- Clear name
- Real code (no mocks unless unavoidable)

### Verify RED - Watch It Fail

**MANDATORY. Never skip.**

Run: `npm test path/to/test.test.ts`

Confirm:

- Test fails (not errors)
- Failure message is expected
- Fails because feature missing (not typos)

**Test passes?** You're testing existing behavior. Fix test.
**Test errors?** Fix error, re-run until it fails correctly.

Track the iteration:

```
salvador_core op:loop_iterate
```

### GREEN - Minimal Code

Write simplest code to pass the test. Don't add features, refactor other code, or "improve" beyond the test.

### Verify GREEN - Watch It Pass

**MANDATORY.**

Run: `npm test path/to/test.test.ts`

Confirm:

- Test passes
- Other tests still pass
- Output pristine (no errors, warnings)

**Test fails?** Fix code, not test.
**Other tests fail?** Fix now.

Track the iteration:

```
salvador_core op:loop_iterate
```

### REFACTOR - Clean Up

After green only:

- Remove duplication
- Improve names
- Extract helpers

Keep tests green. Don't add behavior.

### Repeat

Next failing test for next feature.

## Good Tests

| Quality          | Good                                | Bad                                                 |
| ---------------- | ----------------------------------- | --------------------------------------------------- |
| **Minimal**      | One thing. "and" in name? Split it. | `test('validates email and domain and whitespace')` |
| **Clear**        | Name describes behavior             | `test('test1')`                                     |
| **Shows intent** | Demonstrates desired API            | Obscures what code should do                        |

## Why Order Matters

Tests written after code pass immediately — proving nothing. Test-first forces you to watch the test fail, proving it actually tests something.

## Common Rationalizations

| Excuse                                 | Reality                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------- |
| "Too simple to test"                   | Simple code breaks. Test takes 30 seconds.                              |
| "I'll test after"                      | Tests passing immediately prove nothing.                                |
| "Tests after achieve same goals"       | Tests-after = "what does this do?" Tests-first = "what should this do?" |
| "Already manually tested"              | Ad-hoc ≠ systematic. No record, can't re-run.                           |
| "Deleting X hours is wasteful"         | Sunk cost fallacy. Keeping unverified code is technical debt.           |
| "Keep as reference, write tests first" | You'll adapt it. That's testing after. Delete means delete.             |
| "Need to explore first"                | Fine. Throw away exploration, start with TDD.                           |
| "Test hard = design unclear"           | Listen to test. Hard to test = hard to use.                             |
| "TDD will slow me down"                | TDD faster than debugging. Pragmatic = test-first.                      |
| "Manual test faster"                   | Manual doesn't prove edge cases. You'll re-test every change.           |
| "Existing code has no tests"           | You're improving it. Add tests for existing code.                       |

## Red Flags - STOP and Start Over

- Code before test
- Test after implementation
- Test passes immediately
- Can't explain why test failed
- Tests added "later"
- Rationalizing "just this once"
- "I already manually tested it"
- "Tests after achieve the same purpose"
- "It's about spirit not ritual"
- "Keep as reference" or "adapt existing code"
- "Already spent X hours, deleting is wasteful"
- "TDD is dogmatic, I'm being pragmatic"
- "This is different because..."

**All of these mean: Delete code. Start over with TDD.**

## Verification Checklist

Before marking work complete:

- [ ] Every new function/method has a test
- [ ] Watched each test fail before implementing
- [ ] Each test failed for expected reason (feature missing, not typo)
- [ ] Wrote minimal code to pass each test
- [ ] All tests pass
- [ ] Output pristine (no errors, warnings)
- [ ] Tests use real code (mocks only if unavoidable)
- [ ] Edge cases and errors covered

Can't check all boxes? You skipped TDD. Start over.

## After TDD — Capture and Complete

Complete the loop:

```
salvador_core op:loop_complete
```

If you discovered a new testing pattern, edge case, or anti-pattern during the TDD cycle, capture it:

```
salvador_core op:capture_quick
  params: {
    title: "<testing pattern or anti-pattern>",
    description: "<what you learned, when it applies, why it matters>"
  }
```

This compounds across sessions — next time someone works on similar code, the vault will surface your testing insight.

## When Stuck

| Problem                | Solution                                                             |
| ---------------------- | -------------------------------------------------------------------- |
| Don't know how to test | Write wished-for API. Write assertion first. Ask your human partner. |
| Test too complicated   | Design too complicated. Simplify interface.                          |
| Must mock everything   | Code too coupled. Use dependency injection.                          |
| Test setup huge        | Extract helpers. Still complex? Simplify design.                     |

## Final Rule

```
Production code → test exists and failed first
Otherwise → not TDD
```

No exceptions without your human partner's permission.

## Agent Tools Reference

| Op                   | When to Use                           |
| -------------------- | ------------------------------------- |
| `search_intelligent` | Find testing patterns before starting |
| `brain_strengths`    | Check proven testing approaches       |
| `loop_start`         | Begin TDD validation loop             |
| `loop_iterate`       | Track each red-green cycle            |
| `loop_complete`      | Finish TDD loop                       |
| `capture_quick`      | Capture new testing patterns          |
