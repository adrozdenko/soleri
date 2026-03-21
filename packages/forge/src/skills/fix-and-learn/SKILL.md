---
name: fix-and-learn
description: Use when fixing bugs, broken behavior, errors, regressions, or unexpected results and wanting to capture the learning for future sessions.
---

# Fix & Learn — Debug, Repair, Capture

Fix bugs through a structured recovery workflow, then capture the root cause as a reusable anti-pattern. The learning step makes fixes compound across sessions.

## The Search Order — MANDATORY

**Never jump to writing code.** Always follow this lookup order:

1. **Vault first** — has this been solved before?
2. **Web search** — is there a known solution?
3. **Plan the fix** — design approach before touching code
4. **Implement** — only after steps 1-3

## Orchestration Sequence

### Step 1: Classify and Route

```
YOUR_AGENT_core op:route_intent
  params: { prompt: "<bug description>" }
```

### Step 2: Check Vault First

```
YOUR_AGENT_core op:search_intelligent
  params: { query: "<error message or bug description>" }
YOUR_AGENT_core op:memory_search
  params: { query: "<bug description>" }
```

If vault returns a high-confidence match — use it. Don't re-investigate solved problems.

### Step 3: Search the Web

If vault has no answer, search for known issues, Stack Overflow answers, GitHub issues, official docs.

### Step 4: Start Fix Loop

```
YOUR_AGENT_core op:loop_start
  params: { prompt: "Fix: <bug description>", mode: "custom" }
```

### Step 5: Diagnose and Fix

If Steps 2-3 didn't produce a solution, use systematic-debugging skill:

1. Reproduce the issue
2. Isolate root cause
3. Plan the fix before writing code
4. Implement the fix
5. Verify — no regressions

### Step 6: Validate

Run test suite. Use verification-before-completion skill. Complete loop: `YOUR_AGENT_core op:loop_complete`.

### Step 7: Capture the Learning

```
YOUR_AGENT_core op:capture_knowledge
  params: {
    title: "<bug title>",
    description: "<root cause, solution, what made it hard to find>",
    type: "anti-pattern",
    category: "<domain>",
    tags: ["<error-type>", "<component>"]
  }
```

Run `YOUR_AGENT_core op:curator_detect_duplicates` to avoid redundant entries.

## Exit Criteria

Bug resolved, tests pass, root cause captured in vault. A fix without a capture is incomplete.

## Common Mistakes

- Jumping to code before searching vault/web
- Skipping the capture step after fixing
- Not running the full test suite to check regressions

## Quick Reference

| Op | When to Use |
|----|-------------|
| `route_intent` | Classify as FIX intent |
| `search_intelligent` | Check vault for known bugs |
| `memory_search` | Search session memories |
| `loop_start` / `loop_iterate` / `loop_complete` | Iterative fix cycle |
| `capture_knowledge` / `capture_quick` | Persist anti-pattern |
| `curator_detect_duplicates` | Prevent redundant entries |
