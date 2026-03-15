---
name: fix-and-learn
description: Use AFTER systematic-debugging completes to execute the fix and capture the learning in the vault. Invoke this skill when moving from diagnosis to repair for bugs, broken behavior, errors, regressions, or unexpected results. Chains with systematic-debugging — debugging finds root cause, this skill fixes and captures the anti-pattern.
---

# Fix & Learn — Debug, Repair, Capture

Fix bugs through a structured recovery workflow, then capture the root cause as a reusable anti-pattern. The learning step is what makes fixes compound across sessions.

## When to Use

Any time something is broken, behaving unexpectedly, or producing errors. This includes runtime bugs, visual regressions, type errors, and "it used to work" situations.

## The Search Order — MANDATORY

**Never jump to writing code.** Always follow this lookup order:

1. **Vault first** — has this been solved before?
2. **Web search** — is there a known solution or pattern?
3. **Plan the fix** — design the approach before touching code
4. **Implement** — only after steps 1-3

Skipping to implementation is the #1 cause of wasted time and recurring bugs.

## Orchestration Sequence

### Step 1: Classify and Route

Classify the intent to confirm this is a FIX and get routing context:

```
salvador_core op:route_intent
  params: { prompt: "<user's bug description>" }
```

### Step 2: Check Vault First

Search for this bug or similar issues:

```
salvador_core op:search_intelligent
  params: { query: "<error message or bug description>" }
```

Check memory for patterns across sessions:

```
salvador_core op:memory_search
  params: { query: "<bug description>" }
```

Check memory topics — are bugs clustering in a specific area?

```
salvador_core op:memory_topics
```

Check memory stats to understand the debugging landscape:

```
salvador_core op:memory_stats
```

If vault returns a match with high confidence — **use it**. Don't re-investigate what's already been solved.

### Step 3: Search the Web

If the vault has no answer, search for existing solutions before investigating from scratch:

- Known issues in the library/framework
- Stack Overflow answers for the exact error
- GitHub issues on relevant repos
- Official documentation for the API or feature involved

A 30-second web search can save hours of investigation.

### Step 4: Start Fix Loop

For complex bugs requiring multiple iterations, start a validation loop:

```
salvador_core op:loop_start
  params: { prompt: "Fix: <bug description>", mode: "custom" }
```

### Step 5: Diagnose and Fix

Only if Steps 2-3 didn't produce a solution, apply the systematic debugging approach (use systematic-debugging skill):

1. Reproduce the issue
2. Isolate the root cause
3. **Plan the fix before writing code** — even a one-line mental plan
4. Implement the fix
5. Verify the fix resolves the issue without regressions

Track each iteration:

```
salvador_core op:loop_iterate
```

### Step 6: Validate the Fix

Run the project's test suite to ensure the fix didn't introduce regressions. Use the verification-before-completion skill to confirm all checks pass.

Complete the loop when validated:

```
salvador_core op:loop_complete
```

### Step 7: Capture the Learning

This step is critical — it's what makes the agent smarter over time.

```
salvador_core op:capture_knowledge
  params: {
    title: "<bug title>",
    description: "<root cause, solution, what made it hard to find>",
    type: "anti-pattern",
    category: "<domain>",
    tags: ["<error-type>", "<component>"]
  }
```

For quick captures:

```
salvador_core op:capture_quick
  params: { title: "<bug>", description: "<root cause and fix>" }
```

### Step 8: Post-Capture Quality

Run duplicate detection to ensure we didn't create redundant entries:

```
salvador_core op:curator_detect_duplicates
```

### Step 9: Verify Health

```
salvador_core op:admin_health
```

## Exit Criteria

Fix is complete when: the bug is resolved, tests pass (Step 6), and the root cause is captured in vault (Step 7). A fix without a capture is an incomplete fix.

## Agent Tools Reference

| Op                          | When to Use                    |
| --------------------------- | ------------------------------ |
| `route_intent`              | Classify as FIX intent         |
| `search_intelligent`        | Check vault for known bugs     |
| `memory_search`             | Search across session memories |
| `memory_topics`             | See if bugs cluster in an area |
| `memory_stats`              | Understand debugging landscape |
| `loop_start`                | Begin iterative fix cycle      |
| `loop_iterate`              | Track each fix attempt         |
| `loop_complete`             | Finish fix cycle               |
| `capture_knowledge`         | Full anti-pattern capture      |
| `capture_quick`             | Fast capture                   |
| `curator_detect_duplicates` | Prevent redundant entries      |
| `admin_health`              | Verify system health           |
