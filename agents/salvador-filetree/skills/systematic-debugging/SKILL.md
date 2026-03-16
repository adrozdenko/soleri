---
name: systematic-debugging
description: Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes
---

<!-- Adapted from superpowers (MIT License) -->

# Systematic Debugging

## Overview

Random fixes waste time and create new bugs. Quick patches mask underlying issues.

**Core principle:** ALWAYS find root cause before attempting fixes. Symptom fixes are failure.

**Violating the letter of this process is violating the spirit of debugging.**

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you haven't completed Phase 1, you cannot propose fixes.

## When to Use

Use for ANY technical issue:

- Test failures
- Bugs in production
- Unexpected behavior
- Performance problems
- Build failures
- Integration issues

**Use this ESPECIALLY when:**

- Under time pressure (emergencies make guessing tempting)
- "Just one quick fix" seems obvious
- You've already tried multiple fixes
- Previous fix didn't work
- You don't fully understand the issue

## Phase 0: Search Before Investigating

**BEFORE touching any code**, search for existing solutions. Follow this order:

### Vault First

```
salvador_core op:search_intelligent
  params: { query: "<description of the bug or error message>" }
```

If the vault has a matching anti-pattern or previous fix, it likely contains the root cause and solution — apply it directly. This can save hours of investigation.

Also check brain strengths for relevant debugging patterns:

```
salvador_core op:brain_strengths
```

Check memory for similar bugs across sessions:

```
salvador_core op:memory_search
  params: { query: "<error or symptom>" }
```

### Web Search Second

If the vault has nothing, search the web before investigating from scratch:

- **Paste the exact error message** — someone likely hit this before
- **Check GitHub issues** on relevant libraries
- **Check Stack Overflow** for the error + framework/library combination
- **Check official docs** — is this a known limitation or misconfiguration?

A 30-second search that finds "this is a known issue in v3.2, upgrade to v3.3" saves hours of root cause investigation.

### Then Investigate

Only if vault and web search produce no answer, proceed to Phase 1.

## Start a Debug Loop

For complex bugs, start a validation loop to track investigation iterations:

```
salvador_core op:loop_start
  params: { prompt: "Debug: <bug description>", mode: "custom" }
```

## The Four Phases

You MUST complete each phase before proceeding to the next.

### Phase 1: Root Cause Investigation

**BEFORE attempting ANY fix:**

1. Read Error Messages Carefully
2. Reproduce Consistently
3. Check Recent Changes
4. Gather Evidence in Multi-Component Systems (add diagnostic instrumentation at each component boundary)
5. Trace Data Flow backward through call stack

Track each investigation step:

```
salvador_core op:loop_iterate
```

### Phase 2: Pattern Analysis

1. Find Working Examples
2. Compare Against References (read completely, don't skim)
3. Identify Differences
4. Understand Dependencies

Search vault for working patterns to compare against:

```
salvador_core op:search_intelligent
  params: { query: "<working feature similar to broken one>" }
```

### Phase 3: Hypothesis and Testing

1. Form Single Hypothesis ("I think X is the root cause because Y")
2. Test Minimally (one variable at a time)
3. Verify Before Continuing
4. When You Don't Know — say so, ask for help

### Phase 4: Implementation

1. Create Failing Test Case (use test-driven-development skill)
2. Implement Single Fix (root cause only, one change at a time)
3. Verify Fix
4. If Fix Doesn't Work: count attempts. If < 3, return to Phase 1. If >= 3, STOP and question architecture.
5. If 3+ Fixes Failed: Question Architecture — discuss with human partner before attempting more fixes.

## Phase 5: Capture the Learning

Complete the debug loop:

```
salvador_core op:loop_complete
```

**MANDATORY after every resolved bug.** A fix without a capture is an incomplete fix.

```
salvador_core op:capture_knowledge
  params: {
    title: "<short bug description>",
    description: "<root cause, solution, and what made it hard to find>",
    type: "anti-pattern",
    category: "<relevant domain>",
    tags: ["<relevant>", "<tags>"]
  }
```

For quick captures when the fix is straightforward:

```
salvador_core op:capture_quick
  params: {
    title: "<bug description>",
    description: "<root cause and fix>"
  }
```

Capture a session summary:

```
salvador_core op:session_capture
  params: { summary: "<bug, root cause, fix, files modified>" }
```

This is what makes the agent smarter over time. Next time someone hits a similar bug, Phase 0 vault search will surface your solution immediately.

## Red Flags - STOP and Follow Process

- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "Add multiple changes, run tests"
- "Skip the test, I'll manually verify"
- "It's probably X, let me fix that"
- "I don't fully understand but this might work"
- Proposing solutions before tracing data flow
- "One more fix attempt" (when already tried 2+)
- Each fix reveals new problem in different place

**ALL of these mean: STOP. Return to Phase 1.**

## Common Rationalizations

| Excuse                                       | Reality                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| "Issue is simple, don't need process"        | Simple issues have root causes too.                                     |
| "Emergency, no time for process"             | Systematic is FASTER than guess-and-check thrashing.                    |
| "Just try this first, then investigate"      | First fix sets the pattern. Do it right from the start.                 |
| "I'll write test after confirming fix works" | Untested fixes don't stick. Test first proves it.                       |
| "Multiple fixes at once saves time"          | Can't isolate what worked. Causes new bugs.                             |
| "Reference too long, I'll adapt the pattern" | Partial understanding guarantees bugs. Read it completely.              |
| "I see the problem, let me fix it"           | Seeing symptoms ≠ understanding root cause.                             |
| "One more fix attempt" (after 2+ failures)   | 3+ failures = architectural problem. Question pattern, don't fix again. |
| "Skip the vault, I know this one"            | The vault may know it better. 30 seconds to check saves hours.          |

## Quick Reference

| Phase                 | Key Activities                   | Agent Tools                                              |
| --------------------- | -------------------------------- | -------------------------------------------------------- |
| **0. Search First**   | Vault search, web search, memory | `search_intelligent`, `brain_strengths`, `memory_search` |
| **1. Root Cause**     | Read errors, reproduce, trace    | `loop_iterate`                                           |
| **2. Pattern**        | Find working examples, compare   | `search_intelligent`                                     |
| **3. Hypothesis**     | Form theory, test minimally      | `loop_iterate`                                           |
| **4. Implementation** | Create test, fix, verify         | `loop_iterate`                                           |
| **5. Capture**        | Persist root cause, close loop   | `capture_knowledge`, `loop_complete`, `session_capture`  |

## Agent Tools Reference

| Op                   | When to Use                              |
| -------------------- | ---------------------------------------- |
| `search_intelligent` | Search vault for known bugs and patterns |
| `brain_strengths`    | Check proven debugging patterns          |
| `memory_search`      | Search across session memories           |
| `loop_start`         | Begin iterative debug cycle              |
| `loop_iterate`       | Track each investigation/fix attempt     |
| `loop_complete`      | Finish debug cycle                       |
| `capture_knowledge`  | Full anti-pattern capture                |
| `capture_quick`      | Fast capture for simple fixes            |
| `session_capture`    | Persist session context                  |

**Related skills:**

- test-driven-development
- verification-before-completion
- fix-and-learn (combines debugging + capture in one workflow)
