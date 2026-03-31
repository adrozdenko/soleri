---
name: soleri-verification-before-completion
description: >
  Use as an internal quality gate before claiming any task is done — "verify this works",
  "check output", "quality gate", or "run tests before done". This is a mid-workflow
  checkpoint. For actual deployment, use deliver-and-ship instead.
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

## Check Loop Status

If this task is part of a tracked loop:

```
salvador_core op:loop_status
```

Report loop iteration status before claiming completion.

## Agent System Checks

After passing verification commands:

- `salvador_core op:admin_health` — catches vault corruption, stale caches
- `salvador_core op:admin_diagnostic` — module status, database integrity, config validity
- `salvador_core op:admin_vault_analytics` — knowledge quality metrics

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

Capture session summary: `salvador_core op:session_capture params: { summary: "<what was accomplished>" }`

## Common Mistakes

- Claiming "tests pass" based on a previous run
- Trusting agent success reports without independent verification
- Running linter but not build (linter does not check compilation)
- Skipping the red-green cycle for regression tests

## Rationalization Prevention

Do NOT rationalize away failures. If a check fails, it fails. Period.

- **HARD-GATE: All verification commands must pass (exit 0, 0 failures) before claiming task complete.**
- **HARD-GATE: Agent system checks (`admin_health`, `admin_diagnostic`) must report no problems before completion.**
- Do not say "tests probably pass" -- run them and read the output.
- Do not say "this is a minor issue" to skip a failing check.
- Do not say "it worked last time" -- stale results are not evidence.
- Do not downgrade a failure to a warning to avoid blocking completion.
- If a check fails and you cannot fix it, report the failure honestly. Never hide it.

## Quick Reference

| Op                      | When to Use                         |
| ----------------------- | ----------------------------------- |
| `loop_status`           | Check loop iteration status         |
| `admin_health`          | Quick system health check           |
| `admin_diagnostic`      | Comprehensive diagnostic            |
| `admin_vault_analytics` | Knowledge quality metrics           |
| `session_capture`       | Persist verified completion context |
