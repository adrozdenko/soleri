/**
 * Compaction Evaluator — checks session state against a compaction policy
 * and determines whether the session should be rotated.
 */

import type { CompactionPolicy, CompactionResult, SessionState } from './compaction-policy.js';

// =============================================================================
// DURATION PARSER
// =============================================================================

const DURATION_RE = /^(\d+)(ms|s|m|h|d)$/;

const MULTIPLIERS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * Parse a simple duration string (e.g. '72h', '30m', '7d') into milliseconds.
 * Returns `undefined` for invalid input.
 */
export function parseDuration(duration: string): number | undefined {
  const match = DURATION_RE.exec(duration.trim());
  if (!match) return undefined;
  const [, value, unit] = match;
  return Number(value) * MULTIPLIERS[unit];
}

// =============================================================================
// EVALUATOR
// =============================================================================

/**
 * Evaluate whether a session should be compacted based on policy thresholds.
 *
 * Returns the first triggered threshold as the reason. Checks in order:
 * 1. maxRuns
 * 2. maxInputTokens
 * 3. maxAge
 */
export function shouldCompact(
  session: SessionState,
  policy: CompactionPolicy,
  now: Date = new Date(),
): CompactionResult {
  const noCompact: CompactionResult = { compact: false, reason: '', handoff: '' };

  // Check maxRuns
  if (policy.maxRuns !== undefined && session.runCount >= policy.maxRuns) {
    return {
      compact: true,
      reason: `Run count (${session.runCount}) reached threshold (${policy.maxRuns})`,
      handoff: '',
    };
  }

  // Check maxInputTokens
  if (policy.maxInputTokens !== undefined && session.inputTokens >= policy.maxInputTokens) {
    return {
      compact: true,
      reason: `Input tokens (${session.inputTokens}) reached threshold (${policy.maxInputTokens})`,
      handoff: '',
    };
  }

  // Check maxAge
  if (policy.maxAge !== undefined) {
    const maxMs = parseDuration(policy.maxAge);
    if (maxMs !== undefined) {
      const startedAt = new Date(session.startedAt).getTime();
      const elapsed = now.getTime() - startedAt;
      if (elapsed >= maxMs) {
        return {
          compact: true,
          reason: `Session age (${Math.round(elapsed / 60_000)}m) reached threshold (${policy.maxAge})`,
          handoff: '',
        };
      }
    }
  }

  return noCompact;
}
