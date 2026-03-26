/**
 * Shared helper for recording brain feedback from plan decisions and context.
 *
 * Used by both plan_complete_lifecycle (planning-extra-ops.ts) and
 * orchestrate_complete (orchestrate-ops.ts) to close the brain learning loop.
 */

import type { Brain } from '../brain/brain.js';
import type { BrainIntelligence } from '../brain/intelligence.js';

/** Regex to extract vault entry IDs embedded in decision/context strings. */
const ENTRY_ID_REGEX = /\[entryId:([^\]]+)\]/g;

/**
 * Extract entry IDs from an array of decision or context strings,
 * record positive feedback for each, and optionally trigger auto-rebuild.
 *
 * @returns Number of feedback entries recorded.
 */
export function recordPlanFeedback(
  plan: { objective: string; decisions: (string | { decision: string })[] },
  brain: Brain,
  brainIntelligence?: BrainIntelligence,
): number {
  let feedbackRecorded = 0;
  const seen = new Set<string>();

  // Collect all strings to scan: decisions + any context strings
  const strings: string[] = [];

  for (const d of plan.decisions) {
    const str = typeof d === 'string' ? d : d.decision;
    strings.push(str);
  }

  for (const str of strings) {
    // Use matchAll to find all entryId markers in each string
    for (const match of str.matchAll(ENTRY_ID_REGEX)) {
      const entryId = match[1];
      // Skip duplicates within the same plan
      if (seen.has(entryId)) continue;
      seen.add(entryId);

      try {
        brain.recordFeedback(plan.objective, entryId, 'accepted');
        feedbackRecorded++;
      } catch {
        // Graceful degradation — skip if entry not found or already recorded
      }
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
