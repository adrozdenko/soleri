---
name: yolo-mode
description: >
  Use when the user says "yolo", "autonomous", "skip approvals", "full auto", "hands off",
  or asks to execute without approval gates. Activates autonomous execution mode where the
  agent skips plan approval gates but preserves all safety invariants.
---

# YOLO Mode

Autonomous execution without approval gates. Plans execute immediately — no Gate 1, no Gate 2, no confirmation prompts.

**Announce at start:** "I'm activating YOLO mode — autonomous execution with safety invariants intact."

## Activation Flow

### Step 1: Verify Safety Hook Pack

```
YOUR_AGENT_core op:admin_health
```

Check that the YOLO Safety Hook Pack is installed. This pack intercepts destructive commands (force push, reset --hard, drop table, rm -rf).

**HARD-GATE: Refuse to activate YOLO mode if the safety hook pack is not installed.** Tell the user: "YOLO mode requires the safety hook pack. Run `soleri hooks add-pack yolo-safety` first."

### Step 2: Morph to YOLO Mode

```
YOUR_AGENT_core op:morph
  params: { mode: "YOLO-MODE" }
```

### Step 3: Confirm to User

State clearly: "YOLO mode active. Approval gates are off. Safety invariants remain enforced. Say 'exit YOLO' to return to normal mode."

## What Gets Skipped

- Plan approval Gate 1 (`op:approve_plan`)
- Plan approval Gate 2 (`op:plan_split` confirmation)
- User confirmation prompts between steps
- "Ready for feedback?" checkpoints

## What Is NEVER Skipped

- **`op:orchestrate_complete`** — knowledge capture runs on every task, always
- **Vault search before decisions** — check vault for patterns/anti-patterns before acting
- **YOLO Safety Hook Pack** — intercepts destructive commands (force push, drop table, rm -rf, reset --hard)
- **Test execution** — tests still run; failures still block completion
- **`op:plan_reconcile`** — drift reports still generated after execution

## Exit Conditions

YOLO mode deactivates when any of these occur:

- User says "exit YOLO", "stop YOLO", or "normal mode"
- Session ends
- Explicit deactivation: `op:morph params: { mode: "DEFAULT" }`
- Safety hook intercepts a destructive command (auto-exits, requires re-activation)

## Anti-Patterns

- Activating YOLO on an unfamiliar codebase — you need vault context first
- Skipping tests in YOLO — tests are safety, not ceremony
- Using YOLO for architectural decisions that need human judgment
- Staying in YOLO after a safety hook triggers — re-evaluate before re-activating
- Running YOLO without reviewing what the safety hook pack actually covers

## Quick Reference

| Op                    | When to Use                          |
| --------------------- | ------------------------------------ |
| `admin_health`        | Verify safety hook pack is installed |
| `morph`               | Activate/deactivate YOLO mode        |
| `orchestrate_complete`| After every task (never skip)        |
| `search_intelligent`  | Before every decision (never skip)   |
| `plan_reconcile`      | After execution (never skip)         |

**Related skills:** executing-plans, writing-plans
