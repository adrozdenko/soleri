---
name: verification-before-completion
description: >
  Use as an internal quality gate before claiming any task is done — run tests, check output,
  verify behavior. This is a mid-workflow checkpoint, not a shipping gate. For actual deployment
  and release workflows, use deliver-and-ship instead.
---

# Verification Before Completion

**Core principle:** Evidence before claims, always.

## The Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

If you haven't run the verification command in this message, you cannot claim it passes.

## The Gate Function

```
1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, check exit code, count failures
4. VERIFY: Does output confirm the claim?
   - NO → State actual status with evidence
   - YES → State claim WITH evidence
5. AGENT CHECK: Run system diagnostics
6. ONLY THEN: Make the claim
```

## Agent System Checks

After passing verification commands:

- `YOUR_AGENT_core op:admin_health` — catches vault corruption, stale caches
- `YOUR_AGENT_core op:admin_diagnostic` — module status, database integrity, config validity
- `YOUR_AGENT_core op:admin_vault_analytics` — knowledge quality metrics

If any check reports problems, address before claiming completion.

## Common Failures

| Claim            | Requires                | Not Sufficient                |
| ---------------- | ----------------------- | ----------------------------- |
| Tests pass       | Test output: 0 failures | Previous run, "should pass"   |
| Build succeeds   | Build command: exit 0   | Linter passing                |
| Bug fixed        | Original symptom passes | "Code changed, assumed fixed" |
| Requirements met | Line-by-line checklist  | Tests passing alone           |

## Red Flags — STOP

- Using "should", "probably", "seems to"
- Expressing satisfaction before verification
- About to commit/push/PR without verification
- Relying on partial verification

| Excuse                    | Reality                    |
| ------------------------- | -------------------------- |
| "Should work now"         | RUN the verification       |
| "I'm confident"           | Confidence is not evidence |
| "Just this once"          | No exceptions              |
| "Partial check is enough" | Partial proves nothing     |

## After Verification

Capture session summary: `YOUR_AGENT_core op:session_capture params: { summary: "<what was accomplished>" }`

## Common Mistakes

- Claiming "tests pass" based on a previous run
- Trusting agent success reports without independent verification
- Running linter but not build (linter does not check compilation)
- Skipping the red-green cycle for regression tests

## Quick Reference

| Op                      | When to Use                         |
| ----------------------- | ----------------------------------- |
| `admin_health`          | Quick system health check           |
| `admin_diagnostic`      | Comprehensive diagnostic            |
| `admin_vault_analytics` | Knowledge quality metrics           |
| `session_capture`       | Persist verified completion context |
