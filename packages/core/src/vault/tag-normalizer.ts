/**
 * Tag Normalizer — canonical tag taxonomy enforcement.
 *
 * Maps raw tags to nearest canonical via Levenshtein edit-distance.
 * Strips noise words (version strings, single generic words).
 * Respects metadata tag prefixes (e.g. 'source:').
 *
 * Three modes:
 *   - 'enforce': must match within edit-distance 3, else drop (return null)
 *   - 'suggest': map to nearest canonical within edit-distance 2 (passthrough if no match)
 *   - 'off':     no normalization — return tag as-is
 */

// ─── Noise filter ────────────────────────────────────────────────────────────

/**
 * Version-string pattern: v1.2, v10, v1.2.3, etc.
 */
const VERSION_PATTERN = /^v\d+(\.\d+)*/i;

/**
 * Generic single words that add no signal.
 */
const NOISE_WORDS = new Set([
  'one',
  'via',
  'new',
  'full',
  'actual',
  'raw',
  'the',
  'and',
  'for',
  'with',
  'this',
  'that',
  'from',
  'into',
]);

function isNoisy(tag: string): boolean {
  if (VERSION_PATTERN.test(tag)) return true;
  if (NOISE_WORDS.has(tag.toLowerCase())) return true;
  return false;
}

// ─── Levenshtein edit distance ───────────────────────────────────────────────

/**
 * Compute Levenshtein edit distance between two strings.
 * O(m*n) time, O(n) space using two-row DP.
 */
export function computeEditDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = Array.from<number>({ length: b.length + 1 });

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1, // insertion
        prev[j] + 1, // deletion
        prev[j - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[b.length];
}

// ─── Metadata tag check ──────────────────────────────────────────────────────

/**
 * Returns true if the tag starts with any of the given prefixes.
 * Metadata tags (e.g. 'source:article') are exempt from canonical normalization.
 */
export function isMetadataTag(tag: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => tag.startsWith(prefix));
}

// ─── Single tag normalization ────────────────────────────────────────────────

/**
 * Normalize a single tag against a canonical list.
 *
 * @param tag       - Raw tag to normalize
 * @param canonical - Canonical tag list to map against
 * @param mode      - Constraint mode: 'enforce' | 'suggest' | 'off'
 * @returns Normalized tag string, or null if the tag should be dropped.
 */
export function normalizeTag(
  tag: string,
  canonical: string[],
  mode: 'enforce' | 'suggest' | 'off',
): string | null {
  if (mode === 'off') return tag;

  const lower = tag.toLowerCase().trim();

  // Always drop noise words
  if (isNoisy(lower)) return null;

  // Derive lowercase canonical for matching; preserve original casing for return
  const canonicalLower = canonical.map((x) => x.toLowerCase());

  // Exact match in canonical list — return canonical form (original casing)
  const exactIdx = canonicalLower.indexOf(lower);
  if (exactIdx !== -1) return canonical[exactIdx];

  if (canonical.length === 0) {
    // No canonical list configured — pass through in suggest, drop in enforce
    return mode === 'enforce' ? null : lower;
  }

  // Find nearest canonical by edit distance
  let bestMatch: string | null = null;
  let bestDist = Infinity;

  for (let i = 0; i < canonicalLower.length; i++) {
    const dist = computeEditDistance(lower, canonicalLower[i]);
    if (dist < bestDist) {
      bestDist = dist;
      bestMatch = canonical[i];
    }
  }

  const threshold = mode === 'enforce' ? 3 : 2;

  if (bestDist <= threshold && bestMatch !== null) {
    return bestMatch;
  }

  // No close match found
  if (mode === 'enforce') {
    return null; // drop the tag
  }

  // 'suggest' mode — keep original tag unchanged (passthrough)
  return lower;
}

// ─── Batch tag normalization ─────────────────────────────────────────────────

/**
 * Normalize a batch of tags against a canonical list.
 * Filters out nulls (dropped tags). Deduplicates the result.
 *
 * @param tags              - Raw tags
 * @param canonical         - Canonical tag list
 * @param mode              - Constraint mode
 * @param metadataPrefixes  - Tags with these prefixes bypass normalization
 */
export function normalizeTags(
  tags: string[],
  canonical: string[],
  mode: 'enforce' | 'suggest' | 'off',
  metadataPrefixes: string[] = ['source:'],
): string[] {
  if (mode === 'off') return tags;

  const seen = new Set<string>();
  const result: string[] = [];

  for (const tag of tags) {
    // Metadata tags bypass canonical normalization but are still kept
    if (isMetadataTag(tag, metadataPrefixes)) {
      if (!seen.has(tag)) {
        seen.add(tag);
        result.push(tag);
      }
      continue;
    }

    const normalized = normalizeTag(tag, canonical, mode);
    if (normalized !== null && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }

  return result;
}
