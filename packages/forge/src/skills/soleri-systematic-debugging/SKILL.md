---
name: soleri-systematic-debugging
description: >
  Use as the FIRST response when something is broken — "bug", "failing test", "not working",
  "debug this", "error", "crash", "unexpected behavior", "weird issue". Diagnoses root cause
  before proposing fixes. After root cause is found, hand off to fix-and-learn for repair and
  knowledge capture.
---

# Systematic Debugging

**Core principle:** ALWAYS find root cause before attempting fixes. Symptom fixes are failure.

## Phase 0: Search Before Investigating

**BEFORE touching any code:**

```
YOUR_AGENT_core op:search_intelligent
  params: { query: "<bug or error message>" }
YOUR_AGENT_core op:brain_strengths
YOUR_AGENT_core op:memory_search
  params: { query: "<error or symptom>" }
```

If vault has a match — apply it directly. Then search web: exact error message, GitHub issues, Stack Overflow, official docs.

Only if vault and web produce no answer, proceed to Phase 1.

## Start a Debug Loop

```
YOUR_AGENT_core op:loop_start
  params: { prompt: "Debug: <bug>", mode: "custom" }
```

## The Four Phases

### Phase 1: Root Cause Investigation

1. Read error messages carefully
2. Reproduce consistently
3. Check recent changes
4. Gather evidence at component boundaries
5. Trace data flow backward through call stack

Track each step with `op:loop_iterate`.

### Phase 2: Pattern Analysis

Find working examples, compare against references (read completely), identify differences, understand dependencies. Use `op:search_intelligent` for comparison.

### Phase 3: Hypothesis and Testing

Form single hypothesis, test minimally (one variable at a time), verify before continuing. If unsure — ask for help.

### Phase 4: Implementation

1. Create failing test (use test-driven-development skill)
2. Implement single fix (root cause only)
3. Verify fix
4. If < 3 attempts failed, return to Phase 1. If >= 3, STOP — question architecture with human partner.

## Phase 5: Capture the Learning

```
YOUR_AGENT_core op:loop_complete
YOUR_AGENT_core op:capture_knowledge
  params: {
    title: "<bug>",
    description: "<root cause, solution, what made it hard to find>",
    type: "anti-pattern",
    category: "<domain>",
    tags: ["<relevant>"]
  }
YOUR_AGENT_core op:session_capture
```

## Red Flags — STOP and Return to Phase 1

- "Quick fix for now" / "Just try changing X"
- Proposing solutions before tracing data flow
- "One more fix attempt" after 2+ failures
- Each fix reveals a new problem elsewhere

## Common Mistakes

- Skipping vault search ("I know this one") — 30 seconds saves hours
- Making multiple changes at once (can't isolate what worked)
- Skipping the capture step (same bug will recur)

## Quick Reference

| Phase             | Key Activities                 | Tools                                                    |
| ----------------- | ------------------------------ | -------------------------------------------------------- |
| 0. Search         | Vault, web, memory             | `search_intelligent`, `brain_strengths`, `memory_search` |
| 1. Root Cause     | Read errors, reproduce, trace  | `loop_iterate`                                           |
| 2. Pattern        | Find working examples, compare | `search_intelligent`                                     |
| 3. Hypothesis     | Form theory, test minimally    | `loop_iterate`                                           |
| 4. Implementation | Test, fix, verify              | `loop_iterate`                                           |
| 5. Capture        | Persist root cause             | `capture_knowledge`, `loop_complete`                     |

**Related skills:** test-driven-development, verification-before-completion, fix-and-learn
