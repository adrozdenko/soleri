/**
 * Task verification — evidence checking, deliverable validation, and plan-level verification.
 * Extracted from planner.ts. All functions are pure (no persistence side-effects).
 */

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { PlanTask, TaskDeliverable, TaskEvidence, ReviewEvidence } from './planner-types.js';

// ─── Evidence ────────────────────────────────────────────────────

/**
 * Create a new evidence entry for a task acceptance criterion.
 * Returns the updated evidence array (does not mutate the original).
 */
export function createEvidence(
  existingEvidence: TaskEvidence[],
  evidence: { criterion: string; content: string; type: TaskEvidence['type'] },
): TaskEvidence[] {
  return [
    ...existingEvidence,
    {
      criterion: evidence.criterion,
      content: evidence.content,
      type: evidence.type,
      submittedAt: Date.now(),
    },
  ];
}

// ─── Task Verification ───────────────────────────────────────────

export interface TaskVerificationResult {
  verified: boolean;
  missingCriteria: string[];
  reviewStatus: 'approved' | 'rejected' | 'needs_changes' | 'no_reviews';
}

/**
 * Verify a task — check that evidence exists for all acceptance criteria
 * and any reviews have passed.
 * Pure function: returns verification result without mutating state.
 */
export function verifyTaskLogic(
  task: PlanTask,
  reviews: ReadonlyArray<ReviewEvidence>,
): TaskVerificationResult {
  const criteria = task.acceptanceCriteria ?? [];
  const evidencedCriteria = new Set((task.evidence ?? []).map((e) => e.criterion));
  const missingCriteria = criteria.filter((c) => !evidencedCriteria.has(c));

  const taskReviews = reviews.filter((r) => r.taskId === task.id);
  let reviewStatus: TaskVerificationResult['reviewStatus'] = 'no_reviews';
  if (taskReviews.length > 0) {
    const latest = taskReviews[taskReviews.length - 1];
    reviewStatus = latest.outcome;
  }

  const verified =
    task.status === 'completed' &&
    missingCriteria.length === 0 &&
    (reviewStatus === 'approved' || reviewStatus === 'no_reviews');

  return { verified, missingCriteria, reviewStatus };
}

// ─── Plan Verification ───────────────────────────────────────────

export interface PlanVerificationResult {
  valid: boolean;
  planId: string;
  issues: Array<{ taskId: string; issue: string }>;
  summary: {
    total: number;
    completed: number;
    skipped: number;
    failed: number;
    pending: number;
    inProgress: number;
    verified: number;
  };
}

/**
 * Verify an entire plan — check all tasks are in a final state,
 * all verification-required tasks have evidence, no tasks stuck in_progress.
 * Pure function: returns a validation report without mutating state.
 */
export function verifyPlanLogic(
  planId: string,
  tasks: ReadonlyArray<PlanTask>,
): PlanVerificationResult {
  const issues: Array<{ taskId: string; issue: string }> = [];
  let verified = 0;
  let completed = 0;
  let skipped = 0;
  let failed = 0;
  let pending = 0;
  let inProgress = 0;

  for (const task of tasks) {
    switch (task.status) {
      case 'completed':
        completed++;
        break;
      case 'skipped':
        skipped++;
        break;
      case 'failed':
        failed++;
        break;
      case 'pending':
        pending++;
        break;
      case 'in_progress':
        inProgress++;
        break;
    }

    if (task.verified) verified++;

    if (task.status === 'in_progress') {
      issues.push({ taskId: task.id, issue: 'Task stuck in in_progress state' });
    }
    if (task.status === 'pending') {
      issues.push({ taskId: task.id, issue: 'Task still pending — not started' });
    }

    if (
      task.status === 'completed' &&
      task.acceptanceCriteria &&
      task.acceptanceCriteria.length > 0
    ) {
      const evidencedCriteria = new Set((task.evidence ?? []).map((e) => e.criterion));
      const missing = task.acceptanceCriteria.filter((c) => !evidencedCriteria.has(c));
      if (missing.length > 0) {
        issues.push({
          taskId: task.id,
          issue: `Missing evidence for ${missing.length} criteria: ${missing.join(', ')}`,
        });
      }
    }
  }

  const valid = issues.length === 0 && pending === 0 && inProgress === 0;

  return {
    valid,
    planId,
    issues,
    summary: {
      total: tasks.length,
      completed,
      skipped,
      failed,
      pending,
      inProgress,
      verified,
    },
  };
}

// ─── Deliverable Verification ────────────────────────────────────

export interface DeliverableVerificationResult {
  verified: boolean;
  deliverables: TaskDeliverable[];
  staleCount: number;
}

/**
 * Verify all deliverables for a task.
 * - file: checks existsSync + SHA-256 hash match
 * - vault_entry: checks vault.get(path) non-null
 * - url: skips (just records, no fetch)
 *
 * Returns a new array of deliverables with stale/verifiedAt updated.
 * Does NOT mutate the originals — caller applies the result.
 */
export function verifyDeliverablesLogic(
  deliverables: ReadonlyArray<TaskDeliverable>,
  vault?: { get(id: string): unknown | null },
): DeliverableVerificationResult {
  const now = Date.now();
  let staleCount = 0;
  const result: TaskDeliverable[] = deliverables.map((d) => ({ ...d }));

  for (const d of result) {
    d.stale = false;

    if (d.type === 'file') {
      if (!existsSync(d.path)) {
        d.stale = true;
        staleCount++;
      } else if (d.hash) {
        try {
          const content = readFileSync(d.path);
          const currentHash = createHash('sha256').update(content).digest('hex');
          if (currentHash !== d.hash) {
            d.stale = true;
            staleCount++;
          }
        } catch {
          d.stale = true;
          staleCount++;
        }
      }
      d.verifiedAt = now;
    } else if (d.type === 'vault_entry') {
      if (vault) {
        const entry = vault.get(d.path);
        if (!entry) {
          d.stale = true;
          staleCount++;
        }
      }
      d.verifiedAt = now;
    }
    // url: skip — just record
  }

  return { verified: staleCount === 0, deliverables: result, staleCount };
}

// ─── Deliverable Submission ──────────────────────────────────────

/**
 * Create a new deliverable entry. Auto-computes SHA-256 hash for file deliverables.
 * Pure function — does not mutate task or persist.
 */
export function createDeliverable(deliverable: {
  type: TaskDeliverable['type'];
  path: string;
  hash?: string;
}): TaskDeliverable {
  const entry: TaskDeliverable = {
    type: deliverable.type,
    path: deliverable.path,
  };

  if (deliverable.type === 'file' && !deliverable.hash) {
    try {
      if (existsSync(deliverable.path)) {
        const content = readFileSync(deliverable.path);
        entry.hash = createHash('sha256').update(content).digest('hex');
      }
    } catch {
      // Graceful degradation — skip hash if file can't be read
    }
  } else if (deliverable.hash) {
    entry.hash = deliverable.hash;
  }

  return entry;
}

// ─── Review Prompt Generation ────────────────────────────────────

/**
 * Generate a spec compliance review prompt for a task.
 * Pure function — no persistence side-effects.
 */
export function buildSpecReviewPrompt(
  task: Pick<PlanTask, 'title' | 'description' | 'acceptanceCriteria'>,
  planObjective: string,
): string {
  const criteria = task.acceptanceCriteria?.length
    ? `\n\nAcceptance Criteria:\n${task.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
    : '';
  return [
    `# Spec Compliance Review`, ``, `## Task: ${task.title}`,
    `**Description:** ${task.description}`,
    `**Plan Objective:** ${planObjective}${criteria}`, ``,
    `## Review Checklist`,
    `1. Does the implementation match the task description?`,
    `2. Are all acceptance criteria satisfied?`,
    `3. Does it align with the plan's overall objective?`,
    `4. Are there any spec deviations?`, ``,
    `Provide: outcome (approved/rejected/needs_changes) and detailed comments.`,
  ].join('\n');
}

/**
 * Generate a code quality review prompt for a task.
 * Pure function — no persistence side-effects.
 */
export function buildQualityReviewPrompt(
  task: Pick<PlanTask, 'title' | 'description'>,
): string {
  return [
    `# Code Quality Review`, ``, `## Task: ${task.title}`,
    `**Description:** ${task.description}`, ``,
    `## Quality Checklist`,
    `1. **Correctness** — Does it work as intended?`,
    `2. **Security** — No injection, XSS, or OWASP top 10 vulnerabilities?`,
    `3. **Performance** — No unnecessary allocations, N+1 queries, or blocking calls?`,
    `4. **Maintainability** — Clear naming, appropriate abstractions, documented intent?`,
    `5. **Testing** — Adequate test coverage for the changes?`,
    `6. **Error Handling** — Graceful degradation, no swallowed errors?`,
    `7. **Conventions** — Follows project coding standards?`, ``,
    `Provide: outcome (approved/rejected/needs_changes) and detailed comments.`,
  ].join('\n');
}
