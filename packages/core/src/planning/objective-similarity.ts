/**
 * Objective similarity — bigram-based Dice coefficient for plan deduplication.
 * Zero dependencies. Used by Planner.create() to detect near-duplicate plans.
 */

/**
 * Normalize text for comparison: lowercase, collapse whitespace, strip punctuation.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract character bigrams from a string.
 */
function bigrams(text: string): Set<string> {
  const result = new Set<string>();
  const normalized = normalize(text);
  for (let i = 0; i < normalized.length - 1; i++) {
    result.add(normalized.slice(i, i + 2));
  }
  return result;
}

/**
 * Compute Dice coefficient between two strings (0..1).
 * Returns 1.0 for identical strings, 0.0 for completely different.
 */
export function diceCoefficient(a: string, b: string): number {
  const normA = normalize(a);
  const normB = normalize(b);
  if (normA === normB) return 1.0;
  if (normA.length < 2 || normB.length < 2) return 0.0;

  const bigramsA = bigrams(a);
  const bigramsB = bigrams(b);

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }

  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

/**
 * Find the best-matching active plan by objective similarity.
 * Returns the match and its score, or null if no match meets the threshold.
 */
export function findSimilarPlan<T extends { objective: string; status: string }>(
  plans: T[],
  objective: string,
  threshold = 0.8,
): { plan: T; score: number } | null {
  const terminalStatuses = new Set(['completed', 'archived']);
  let best: { plan: T; score: number } | null = null;

  for (const plan of plans) {
    if (terminalStatuses.has(plan.status)) continue;
    const score = diceCoefficient(plan.objective, objective);
    if (score > threshold && (!best || score > best.score)) {
      best = { plan, score };
    }
  }

  return best;
}
