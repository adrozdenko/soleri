/**
 * Engine rules: planning — included when agent uses planning.
 * Part of the modular shared-rules system.
 */
export function getRulesPlanning(): string {
  return `
<!-- soleri:planning -->
## Planning

- For complex tasks, use \`op:create_plan\` before writing code. Simple tasks can execute directly — but always run \`op:orchestrate_complete\`.
- Two-gate approval: Gate 1 (\`op:approve_plan\`), Gate 2 (\`op:plan_split\`). Never skip either.
- Wait for explicit "yes" / "approve" before proceeding past each gate.
- After execution: \`op:plan_reconcile\` (drift report) then \`op:plan_complete_lifecycle\` (knowledge capture, archive).
- Never let a plan stay in \`executing\` or \`reconciling\` state without reminding the user.
- On session start: check for plans in \`executing\`/\`reconciling\` state and remind.
- Exceptions: read-only operations, user says "just do it", single-line fixes.

### Task Auto-Assessment

When picking up a work task (including GH issues decomposed from a parent plan), autonomously assess complexity — do NOT ask the user whether to create a plan.

| Signal | Classification | Action |
|--------|---------------|--------|
| Single file, clear acceptance criteria | **Simple** | Execute directly |
| Approach already described in parent plan | **Simple** | Execute directly |
| Touches 3+ files or has cross-cutting concerns | **Complex** | Create scoped plan |
| Unresolved design decisions not in parent plan | **Complex** | Create scoped plan |
| New dependencies or architectural choices needed | **Complex** | Create scoped plan |

**Simple task flow:** Vault search (quick) → execute → \`op:orchestrate_complete\` (captures knowledge).

**Complex task flow:** Vault search → create lightweight scoped plan → two-gate approval → execute → reconcile → complete.

**Key rule:** Knowledge gets captured either way via \`op:orchestrate_complete\`. Planning ceremony is for *decision-making*, not record-keeping.

**Anti-pattern:** Creating a full graded plan for trivial tasks (add a CSS class, rename a variable, single-line fix).

### Grade Gate

**MANDATORY**: Plans must grade **A or higher** before approval. The engine enforces this programmatically.

- \`op:approve_plan\` will **reject** any plan with a latest grade below A (score < 90).
- If rejected, iterate on the plan (\`op:create_plan\`) to address the gaps, then re-grade (\`op:plan_grade\`) before approving.
- The threshold is configurable per-agent via \`engine.minGradeForApproval\` in \`agent.yaml\` (default: \`A\`).
- Plans with no grade check are allowed through for backward compatibility.

### Lifecycle States

| State | Expires | Next Action |
|-------|---------|-------------|
| \`draft\` | 30 min | \`op:create_plan\` (iterate) |
| \`approved\` | 30 min | \`op:plan_split\` |
| \`executing\` | Never | \`op:plan_reconcile\` |
| \`reconciling\` | Never | \`op:plan_complete_lifecycle\` |
| \`completed\` | — | Done |

### Plan Presentation

Every plan summary MUST include this format:

\`\`\`
## Plan: [Short Title]

| Field | Value |
|-------|-------|
| **Plan ID** | {planId} |
| **Check ID** | {checkId} |
| **Grade** | {grade} ({score}/100) |
| **Status** | {status} |
| **Lifecycle** | {lifecycleStatus} |

**Objective:** [One sentence]

**Scope:**
| Included | Excluded |
|----------|----------|
| item 1   | item 1   |

**Approach:**
| Step | Task |
|------|------|
| 1 | Description |
\`\`\`

Without visible IDs, users cannot resume, reference, or approve plans.

### Drift Report

\`\`\`
| Field | Value |
|-------|-------|
| **Accuracy** | {accuracyScore}/100 |
| **Drift Items** | {count} |

| Type | Description | Impact | Rationale |
|------|-------------|--------|-----------|
| skipped | ... | medium | ... |
\`\`\`
<!-- /soleri:planning -->

<!-- soleri:task-routing -->
## Work Task Routing

On every work task, assess complexity then route:

### Auto-Assessment

Evaluate these signals before deciding the execution path:

| Signal | Simple (< 40) | Complex (≥ 40) |
|--------|---------------|----------------|
| Files touched | 1-2 | 3+ |
| Cross-cutting concerns | No | Yes |
| New dependencies | None | Yes |
| Design decisions | Already decided | Unresolved |
| Approach described | In parent plan/issue | Not yet |

### Routing

- **Simple tasks** → execute directly → \`op:orchestrate_complete\` (always)
- **Complex tasks** → \`op:orchestrate_plan\` → approve → execute → \`op:orchestrate_complete\` (always)

### The Non-Negotiable Rule

\`op:orchestrate_complete\` runs for EVERY task — simple or complex. But it is **user-gated**: never auto-complete without confirmation.

This captures:
- Knowledge to vault (patterns learned, decisions made)
- Session summary (what was done, files changed)
- Brain feedback (what worked, what didn't)

Without completion, the knowledge trail is lost. The code is in git, but the WHY disappears.

### Reconciliation Triggers

\`op:orchestrate_complete\` is triggered by one of three conditions — all require user confirmation before running.

| Trigger | Condition | Agent Action |
|---------|-----------|--------------|
| **Explicit** | User says "done", "ship it", "looks good", "wrap up" | Call \`op:orchestrate_complete\` immediately |
| **Plan-complete** | All plan tasks reach terminal state (completed/skipped/failed) | Ask: "All tasks are complete. Want me to wrap up and capture what we learned, or is there more to fix?" |
| **Idle** | Plan in \`executing\` state with no recent task work | Ask: "We've been idle on this plan. Ready to wrap up, or still working?" |

**NEVER auto-complete without asking the user.** The agent detects readiness but the user decides when to finalize.

Use \`op:orchestrate_status\` to check plan readiness — it includes a \`readiness\` field with \`allTasksTerminal\`, \`terminalCount\`, \`totalCount\`, and \`idleSince\` for the active plan.

### Exceptions (skip assessment, execute directly)

- Read-only operations (search, status, health check)
- User explicitly says "just do it"
- Single-line fixes (typo, rename, one-liner)
- Questions and explanations
<!-- /soleri:task-routing -->

<!-- soleri:validation-loop -->
## Iterative Validation Loop

- When a user gives a **work task**, start a loop: \`op:loop_start params:{ prompt: "<task>", mode: "custom" }\`
- Do NOT start loops for: questions, explanations, status checks, git operations, exploration, simple one-line fixes.

| Mode | Op | Target | Max Iter |
|------|-----|--------|----------|
| \`plan-iteration\` | \`op:create_plan\` | grade >= A | 10 |
| \`custom\` | user-defined | promise-based | 20 |
<!-- /soleri:validation-loop -->

<!-- soleri:verification-protocol -->
## Verification Protocol

**MANDATORY** when modifying existing code: prove before you fix.

### The Rule

1. **Find** — identify the issue in existing code
2. **Prove** — reproduce the issue (test case, error log, stack trace)
3. **Fix** — only after the issue is proven reproducible

### Anti-patterns

- Fixing code "just in case" or for aesthetics without a proven issue
- Claiming a bug exists without reproduction evidence
- Refactoring working code under the guise of a bug fix
- **Dismissing test failures as "flaky" or "pre-existing" without reading the test code and the handler it exercises.** A test that fails consistently is broken, not flaky. Investigate the root cause before classifying.

### Scope

- Applies ONLY to tasks that modify existing code
- Does NOT apply to new code, new files, or greenfield features
- Advisory only — flags warnings, never blocks execution
<!-- /soleri:verification-protocol -->
`.trim();
}
