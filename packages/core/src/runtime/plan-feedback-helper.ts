/**
 * Shared helper for recording brain feedback from plan decisions and context.
 *
 * Used by both plan_complete_lifecycle (planning-extra-ops.ts) and
 * orchestrate_complete (orchestrate-ops.ts) to close the brain learning loop.
 *
 * Feedback is outcome-conditional: entries referenced by a plan that failed
 * or needed rework receive negative actions ('failed'/'modified') instead of
 * a blanket 'accepted' — otherwise pattern strengths never see a negative
 * signal and the accept rate inflates toward 100%.
 */

import type { Brain } from '../brain/brain.js';
import type { BrainIntelligence } from '../brain/intelligence.js';
import type { FeedbackType } from '../brain/types.js';

/** Regex to extract vault entry IDs embedded in decision/context strings. */
const ENTRY_ID_REGEX = /\[entryId:([^\]]+)\]/g;

/** Tasks with this many or more fix iterations mark referenced entries as 'modified'. Mirrors quality-signals REWORK_THRESHOLD. */
const REWORK_THRESHOLD = 2;
/** Reconciliation accuracy below this marks referenced entries as 'failed'. */
const FAILURE_ACCURACY_THRESHOLD = 50;

/** Confidence per resolved action — negatives are plan-level attribution, so weaker than clean accepts. */
const CONFIDENCE_BY_ACTION: Record<string, number> = {
  accepted: 0.9,
  modified: 0.6,
  failed: 0.7,
};

/**
 * Execution outcome context used to grade the feedback action.
 * All fields optional — absent context falls back to 'accepted'.
 */
export interface PlanOutcomeContext {
  /** Plan outcome as reported by the completing op (e.g. 'completed', 'failed'). */
  outcome?: string;
  /** Reconciliation or evidence accuracy, 0-100. */
  accuracy?: number;
  /** Plan tasks — only fixIterations is consulted. */
  tasks?: { fixIterations?: number }[];
}

/**
 * Extract unique vault entry IDs from decision or context strings.
 */
export function extractEntryIds(decisions: (string | { decision: string })[]): string[] {
  const seen = new Set<string>();

  for (const d of decisions) {
    const str = typeof d === 'string' ? d : d.decision;
    for (const match of str.matchAll(ENTRY_ID_REGEX)) {
      seen.add(match[1]);
    }
  }

  return [...seen];
}

/**
 * Grade the feedback action from execution outcome:
 * - failed outcome or accuracy below threshold → 'failed'
 * - any task with rework at/over threshold → 'modified'
 * - otherwise → 'accepted'
 */
function resolveAction(ctx?: PlanOutcomeContext): { action: FeedbackType; reason: string } {
  if (ctx?.outcome === 'failed') {
    return { action: 'failed', reason: 'Plan outcome was failed' };
  }
  if (ctx?.accuracy !== undefined && ctx.accuracy < FAILURE_ACCURACY_THRESHOLD) {
    return {
      action: 'failed',
      reason: `Plan accuracy ${ctx.accuracy} below threshold ${FAILURE_ACCURACY_THRESHOLD}`,
    };
  }

  const reworked =
    ctx?.tasks?.filter((t) => (t.fixIterations ?? 0) >= REWORK_THRESHOLD).length ?? 0;
  if (reworked > 0) {
    return {
      action: 'modified',
      reason: `${reworked} task(s) needed ${REWORK_THRESHOLD}+ fix iterations — guidance partially worked`,
    };
  }

  return { action: 'accepted', reason: 'Plan completed clean' };
}

/**
 * Extract entry IDs from plan decisions, record outcome-conditional feedback
 * for each, and optionally trigger auto-rebuild.
 *
 * @returns Number of feedback entries recorded.
 */
export function recordPlanFeedback(
  plan: { objective: string; decisions: (string | { decision: string })[] },
  brain: Brain,
  brainIntelligence?: BrainIntelligence,
  outcomeCtx?: PlanOutcomeContext,
): number {
  const entryIds = extractEntryIds(plan.decisions);
  const { action, reason } = resolveAction(outcomeCtx);
  let feedbackRecorded = 0;

  for (const entryId of entryIds) {
    try {
      brain.recordFeedback({
        query: plan.objective,
        entryId,
        action,
        source: 'evidence-quality',
        confidence: CONFIDENCE_BY_ACTION[action],
        reason,
      });
      feedbackRecorded++;
    } catch {
      // Graceful degradation — skip if entry not found or already recorded
    }
  }

  // Trigger auto-rebuild check after recording feedback
  if (feedbackRecorded > 0 && brainIntelligence) {
    try {
      brainIntelligence.maybeAutoBuildOnFeedback();
    } catch {
      // Auto-rebuild is best-effort
    }
  }

  return feedbackRecorded;
}
