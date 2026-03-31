# User-Gated Reconciliation with Fix-Trail Learning

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Redesign plan reconciliation so it fires when the user is satisfied — not when the agent finishes — and capture the full fix trail as the primary learning signal.
**Architecture:** Extends existing orchestrate_complete with evidence wiring, adds fixIterations tracking to PlanTask, gates reconciliation on user confirmation, and feeds rework quality signals into brain feedback for strength scoring.
**Tech Stack:** TypeScript, @soleri/core (planner, orchestrate, brain, evidence-collector)

**Plan ID:** `plan-1774890664101-xmdvl1`
**Grade:** A+ (100/100)
**Epic:** #459
**Sub-issues:** #460, #461, #462, #463

## Execution Order

```
Wave 1 (parallel):
  T1 (#460): Track fix iterations per task
  T2 (#461): Wire evidence into orchestrate_complete

Wave 2:
  T3 (#462): User-gated reconciliation triggers (depends T2)

Wave 3:
  T4 (#463): Capture fix-trail quality signals (depends T1 + T2)
```

## Scope

| Included | Excluded |
|----------|----------|
| PlanTask.fixIterations tracking | UI/dashboard |
| Evidence wiring in orchestrate_complete | New CLI commands |
| User-gated trigger rules in shared-rules.ts | Changing evidence collector algorithm |
| Quality signal capture via brain.recordFeedback | Changing plan status FSM |
| Tests for all four sub-issues | NLP intent detection |

## Alternatives Rejected

1. **Auto-complete without user gate** — premature completion loses the fix trail delta, the primary learning signal
2. **Separate fix-trail data model** — vault capture + brain feedback already handles this; new schema is over-engineering
3. **Block completion on low accuracy** — evidence is best-effort (git may be unavailable); blocking breaks offline workflows

---

## T1: Track Fix Iterations Per Task (#460)

**Files:**
- Modify: `packages/core/src/planning/planner.ts` — updateTask()
- Modify: `packages/core/src/planning/planner-types.ts` — verify fixIterations on PlanTask
- Modify: `packages/core/src/planning/evidence-collector.ts` — populate fixIterations in GitTaskEvidence
- Test: `packages/core/src/planning/planner.test.ts`

**Steps:**

1. In `planner.ts` `updateTask()`: detect rework transitions (completed→in_progress, failed→in_progress, completed→pending). When detected, increment `task.fixIterations = (task.fixIterations ?? 0) + 1`.

2. In `planner-types.ts`: verify `fixIterations?: number` exists on PlanTask (codebase analysis confirms it does). Add JSDoc: `/** Number of rework cycles. 0 = clean first pass. Incremented when task reverts to in_progress after completion/failure. */`

3. In `evidence-collector.ts` `buildTaskEvidence()`: when building GitTaskEvidence, copy `fixIterations` from the plan task: `fixIterations: task.fixIterations ?? 0`.

4. Tests:
   - `it('increments fixIterations when task goes completed → in_progress')`
   - `it('increments fixIterations when task goes failed → in_progress')`
   - `it('does NOT increment fixIterations on forward transitions (pending → in_progress → completed)')`
   - `it('defaults fixIterations to 0 for new tasks')`

**Acceptance:** fixIterations increments on rework. Forward transitions don't increment. Evidence includes fixIterations. 4 new tests.

---

## T2: Wire Evidence into orchestrate_complete (#461)

**Files:**
- Modify: `packages/core/src/runtime/orchestrate-ops.ts` — orchestrate_complete handler (~line 833)
- Test: `e2e/curator-brain-governance.test.ts` or `packages/core/src/runtime/orchestrate-ops.test.ts`

**Steps:**

1. In `orchestrate_complete` handler: evidence collection already exists at lines 833-850. Verify:
   - It runs for ALL plan outcomes (not just 'completed')
   - `evidenceReport` is always included in the return value
   - `collectGitEvidence` failures are caught and don't block completion

2. Add warning when accuracy < 50%:
   ```typescript
   if (evidenceReport && evidenceReport.accuracy < 50) {
     console.error(`[soleri] Evidence accuracy ${evidenceReport.accuracy}% — significant drift from plan`);
   }
   ```

3. Verify brain feedback wiring (lines 899-906): low accuracy → 'dismissed', else 'accepted'.

4. Tests:
   - `it('orchestrate_complete returns evidenceReport for completed plans')`
   - `it('orchestrate_complete completes gracefully when git is unavailable')`

**Acceptance:** evidenceReport always in response. Low accuracy logs warning. Errors don't block. 2 new tests.

---

## T3: User-Gated Reconciliation Triggers (#462)

**Files:**
- Modify: `packages/forge/src/templates/shared-rules.ts` — task-routing section
- Modify: `packages/core/src/runtime/orchestrate-ops.ts` — add orchestrate_status op
- Test: `packages/core/src/runtime/orchestrate-ops.test.ts`

**Steps:**

1. In `shared-rules.ts`, add/update the "Reconciliation Triggers" subsection in the task-routing module:

   ```markdown
   ### Reconciliation Triggers

   `op:orchestrate_complete` is triggered by one of three conditions — all require user confirmation before running.

   | Trigger | Condition | Agent Action |
   |---------|-----------|--------------|
   | **Explicit** | User says "done", "ship it", "looks good", "wrap up" | Call `op:orchestrate_complete` immediately |
   | **Plan-complete** | All plan tasks reach terminal state (completed/skipped/failed) | Ask: "All tasks are complete. Want me to wrap up and capture what we learned, or is there more to fix?" |
   | **Idle** | Plan in `executing` state with no recent task work | Ask: "We've been idle on this plan. Ready to wrap up, or still working?" |

   **NEVER auto-complete without asking the user.** The agent detects readiness but the user decides when to finalize.

   Use `op:orchestrate_status` to check plan readiness — it includes a `readiness` field with `allTasksTerminal`, `terminalCount`, `totalCount`, and `idleSince` for the active plan.
   ```

2. In `orchestrate-ops.ts`: add `orchestrate_status` op:
   ```typescript
   {
     name: 'orchestrate_status',
     handler: async (params) => {
       const plan = planner.getActive() ?? planner.get(params.planId);
       if (!plan) return { status: 'no_active_plan' };
       const terminal = plan.tasks.filter(t => ['completed','skipped','failed'].includes(t.status));
       return {
         planId: plan.id,
         status: plan.status,
         readiness: {
           allTasksTerminal: terminal.length === plan.tasks.length,
           terminalCount: terminal.length,
           totalCount: plan.tasks.length,
           idleSince: plan.updatedAt,
         }
       };
     }
   }
   ```

3. Tests:
   - `it('orchestrate_status returns readiness with terminal counts')`
   - `it('orchestrate_status returns no_active_plan when no plan exists')`

**Acceptance:** shared-rules has three triggers. orchestrate_status exists. Agent never auto-completes. 2 new tests.

---

## T4: Capture Fix-Trail Quality Signals (#463)

**Files:**
- Modify: `packages/core/src/runtime/orchestrate-ops.ts` — analyzeQualitySignals() extension
- Test: `packages/core/src/runtime/orchestrate-ops.test.ts`

**Steps:**

1. In `orchestrate-ops.ts`, extend `analyzeQualitySignals()` (or the quality signal section in orchestrate_complete):

   ```typescript
   // After evidence collection, analyze fix-trail quality
   if (evidenceReport?.taskEvidence) {
     for (const te of evidenceReport.taskEvidence) {
       if (te.verdict === 'DONE' && (te.fixIterations ?? 0) === 0) {
         // Clean first try — positive signal
         brain.recordFeedback({
           query: te.taskTitle,
           entryId: planId,
           action: 'accepted',
           confidence: 0.9,
           source: 'evidence',
           reason: 'Clean first-try completion',
         });
       } else if ((te.fixIterations ?? 0) >= 2) {
         // High rework — anti-pattern signal
         brain.recordFeedback({
           query: te.taskTitle,
           entryId: planId,
           action: 'dismissed',
           confidence: 0.7,
           source: 'evidence',
           reason: `Needed ${te.fixIterations} fix iterations`,
           context: JSON.stringify({ taskId: te.taskId, reworkCount: te.fixIterations }),
         });
       }
     }
   }
   ```

2. Include fix-trail summary in knowledge extraction context:
   ```typescript
   const fixTrailSummary = evidenceReport?.taskEvidence
     ?.filter(te => (te.fixIterations ?? 0) > 0)
     ?.map(te => `${te.taskTitle}: ${te.fixIterations} fixes`)
     ?.join(', ');
   // Pass to extractKnowledge as additional context
   ```

3. Tests:
   - `it('records positive feedback for clean-first-try tasks')`
   - `it('records negative feedback for high-rework tasks (fixIterations >= 2)')`
   - `it('does not record feedback for tasks with 1 fix iteration')`

**Acceptance:** Clean tasks get positive feedback. High-rework tasks get negative. Fix-trail in knowledge extraction. 3 new tests.
