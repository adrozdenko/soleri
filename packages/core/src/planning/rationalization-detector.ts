/**
 * Rationalization detector — identifies completion claims that rationalize
 * away unmet acceptance criteria instead of genuinely completing them.
 *
 * Used by orchestrate_complete to gate auto-completion.
 */

// ─── Types ──────────────────────────────────────────────────────

export interface RationalizationItem {
  /** The acceptance criterion being rationalized away. */
  criterion: string;
  /** The phrase in the completion claim that triggered detection. */
  phrase: string;
  /** The pattern name that matched. */
  pattern: string;
  /** Actionable suggestion for the user. */
  suggestion: string;
}

export interface RationalizationReport {
  /** Whether any rationalizations were detected. */
  detected: boolean;
  /** Individual rationalization items found. */
  items: RationalizationItem[];
}

// ─── Patterns ───────────────────────────────────────────────────

interface RationalizationPattern {
  name: string;
  regex: RegExp;
  suggestion: string;
}

const PATTERNS: RationalizationPattern[] = [
  {
    name: 'out-of-scope',
    regex: /out\s+of\s+scope/i,
    suggestion: 'If it was in the acceptance criteria, it is in scope. Remove from criteria or complete it.',
  },
  {
    name: 'follow-up-ticket',
    regex: /follow[- ]?up\s+(ticket|issue|pr|task)/i,
    suggestion: 'Deferring to a follow-up means the criterion is unmet. Complete it now or revise the plan.',
  },
  {
    name: 'pre-existing-issue',
    regex: /pre[- ]?existing\s+(issue|bug|problem)/i,
    suggestion: 'Pre-existing or not, the criterion expects it resolved. Fix it or remove the criterion.',
  },
  {
    name: 'over-engineering',
    regex: /over[- ]?engineering/i,
    suggestion: 'Meeting acceptance criteria is not over-engineering. Implement what was agreed upon.',
  },
  {
    name: 'separate-pr',
    regex: /separate\s+(pr|task|ticket|issue)/i,
    suggestion: 'Splitting into a separate PR defers the work. Complete the criterion or update the plan.',
  },
  {
    name: 'too-complex',
    regex: /too\s+complex\s+for\s+this\s+(task|pr|ticket|issue|scope)/i,
    suggestion: 'Complexity was known at planning time. Revisit the plan or complete the criterion.',
  },
];

// ─── Detector ───────────────────────────────────────────────────

/**
 * Scan a completion claim against acceptance criteria for rationalization
 * language — phrases that excuse unmet criteria rather than completing them.
 *
 * @param acceptanceCriteria - The plan/task acceptance criteria
 * @param completionClaim - The completion summary to scan
 * @returns A report with detected rationalization items
 */
export function detectRationalizations(
  acceptanceCriteria: string[],
  completionClaim: string,
): RationalizationReport {
  if (!acceptanceCriteria.length || !completionClaim.trim()) {
    return { detected: false, items: [] };
  }

  const items: RationalizationItem[] = [];

  for (const pattern of PATTERNS) {
    const match = pattern.regex.exec(completionClaim);
    if (!match) continue;

    // Find which criterion is being rationalized (nearest mention)
    const criterion = findRelatedCriterion(
      acceptanceCriteria,
      completionClaim,
      match.index,
    );

    items.push({
      criterion,
      phrase: match[0],
      pattern: pattern.name,
      suggestion: pattern.suggestion,
    });
  }

  return { detected: items.length > 0, items };
}

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Find the acceptance criterion most related to the rationalization phrase
 * by checking which criterion text appears closest to the match position.
 */
function findRelatedCriterion(
  criteria: string[],
  claim: string,
  matchIndex: number,
): string {
  const claimLower = claim.toLowerCase();
  let bestCriterion = criteria[0];
  let bestDistance = Infinity;

  for (const c of criteria) {
    const idx = claimLower.indexOf(c.toLowerCase());
    if (idx !== -1) {
      const dist = Math.abs(idx - matchIndex);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestCriterion = c;
      }
    }
  }

  return bestCriterion;
}
