/**
 * Transcript Ranker — re-ranks FTS candidates using 3 signals:
 *   1. BM25 (normalized) — weight 0.45
 *   2. Exact phrase match — weight 0.30
 *   3. Token overlap — weight 0.25
 *
 * Pure functions, no DB dependency, no I/O.
 * Zero external dependencies.
 */

import type { TranscriptSegment, TranscriptSearchHit } from './types.js';

// =============================================================================
// TYPES
// =============================================================================

export interface RankerCandidate {
  segment: TranscriptSegment;
  sessionTitle?: string;
  sessionStartedAt?: number;
  sessionEndedAt?: number;
  rank: number; // raw FTS rank (negative BM25 from SQLite)
}

export interface RankOptions {
  limit?: number; // default 10
  verbose?: boolean; // if true, attach neighbor context (caller handles this)
}

// =============================================================================
// CONSTANTS
// =============================================================================

const WEIGHT_BM25 = 0.45;
const WEIGHT_EXACT_PHRASE = 0.3;
const WEIGHT_TOKEN_OVERLAP = 0.25;

const DEFAULT_LIMIT = 10;
const DEFAULT_EXCERPT_LENGTH = 300;

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'was',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'and',
  'or',
  'but',
  'with',
  'that',
  'this',
  'it',
  'we',
  'i',
  'you',
  'they',
  'what',
  'how',
  'why',
  'when',
  'where',
  'did',
  'do',
  'does',
  'said',
  'say',
]);

// =============================================================================
// MAIN RANKER
// =============================================================================

/**
 * Re-rank FTS candidates using a weighted combination of 3 signals.
 *
 * 1. Normalizes BM25 ranks to 0-1 range (min-max normalization).
 * 2. Computes exactPhrase and tokenOverlap signals for each candidate.
 * 3. Combines signals with weights: 0.45 * bm25 + 0.30 * exactPhrase + 0.25 * tokenOverlap.
 * 4. Returns top `limit` results sorted by score descending.
 */
export function rankTranscriptCandidates(
  candidates: RankerCandidate[],
  query: string,
  options?: RankOptions,
): TranscriptSearchHit[] {
  if (candidates.length === 0) return [];

  const limit = options?.limit ?? DEFAULT_LIMIT;

  // Normalize BM25 ranks to 0-1 range.
  // SQLite FTS5 rank is negative — more negative = better match.
  const ranks = candidates.map((c) => c.rank);
  const minRank = Math.min(...ranks);
  const maxRank = Math.max(...ranks);
  const rankRange = maxRank - minRank;

  const scored = candidates.map((candidate) => {
    const { segment, sessionTitle, sessionStartedAt, sessionEndedAt, rank } = candidate;

    // Signal 1: normalized BM25 (0 = worst, 1 = best in this pool)
    const bm25Norm = rankRange > 0 ? (maxRank - rank) / rankRange : 0.5;

    // Signal 2: exact phrase match
    const exactPhrase = computeExactPhrase(segment.text, query);

    // Signal 3: token overlap
    const tokenOverlap = computeTokenOverlap(segment.text, query);

    // Weighted combination
    const score =
      WEIGHT_BM25 * bm25Norm +
      WEIGHT_EXACT_PHRASE * exactPhrase +
      WEIGHT_TOKEN_OVERLAP * tokenOverlap;

    return {
      id: segment.id,
      sessionId: segment.sessionId,
      title: sessionTitle,
      excerpt: generateExcerpt(segment.text, query),
      seqStart: segment.seqStart,
      seqEnd: segment.seqEnd,
      score,
      breakdown: {
        bm25: bm25Norm,
        exactPhrase,
        tokenOverlap,
      },
      startedAt: sessionStartedAt,
      endedAt: sessionEndedAt,
    } satisfies TranscriptSearchHit;
  });

  // Sort by score descending, then by BM25 as tiebreaker
  scored.sort((a, b) => {
    const diff = b.score - a.score;
    if (Math.abs(diff) > 1e-9) return diff;
    return b.breakdown.bm25 - a.breakdown.bm25;
  });

  return scored.slice(0, limit);
}

// =============================================================================
// SIGNAL: EXACT PHRASE (weight 0.30)
// =============================================================================

/**
 * Compute exact phrase match score.
 *
 * - Extracts quoted phrases ("..." or '...') and backticked tokens (`...`)
 * - If none found, checks if the entire query appears as a substring (0.5 if yes, 0 if no)
 * - Otherwise, returns fraction of matched phrases/tokens
 */
export function computeExactPhrase(text: string, query: string): number {
  const phrases: string[] = [];

  // Extract double-quoted phrases
  const doubleQuoted = query.match(/"([^"]+)"/g);
  if (doubleQuoted) {
    for (const match of doubleQuoted) {
      phrases.push(match.slice(1, -1));
    }
  }

  // Extract single-quoted phrases
  const singleQuoted = query.match(/'([^']+)'/g);
  if (singleQuoted) {
    for (const match of singleQuoted) {
      phrases.push(match.slice(1, -1));
    }
  }

  // Extract backticked tokens
  const backticked = query.match(/`([^`]+)`/g);
  if (backticked) {
    for (const match of backticked) {
      phrases.push(match.slice(1, -1));
    }
  }

  // No quoted phrases or backticked tokens — fall back to full query substring
  if (phrases.length === 0) {
    const normalizedQuery = query.trim();
    if (normalizedQuery === '') return 0;
    return text.toLowerCase().includes(normalizedQuery.toLowerCase()) ? 0.5 : 0;
  }

  // Count how many extracted phrases/tokens appear in the text
  const textLower = text.toLowerCase();
  let matched = 0;
  for (const phrase of phrases) {
    if (phrase.trim() === '') continue;
    if (textLower.includes(phrase.toLowerCase())) {
      matched++;
    }
  }

  return phrases.length > 0 ? matched / phrases.length : 0;
}

// =============================================================================
// SIGNAL: TOKEN OVERLAP (weight 0.25)
// =============================================================================

/** Check if a token looks like a "rare" code/path/command token (gets 2x weight). */
function isRareToken(token: string): boolean {
  // Contains underscore (snake_case identifiers)
  if (token.includes('_')) return true;
  // Contains dot (file extensions, qualified names)
  if (token.includes('.')) return true;
  // Contains slash (file paths)
  if (token.includes('/')) return true;
  // Contains hyphen (CLI commands, CSS classes)
  if (token.includes('-')) return true;
  // camelCase or PascalCase: has a lowercase letter followed by an uppercase letter
  if (/[a-z][A-Z]/.test(token)) return true;
  // Starts with uppercase (PascalCase type names)
  if (/^[A-Z][a-z]/.test(token)) return true;
  return false;
}

/**
 * Compute token overlap score with rare-token weighting.
 *
 * 1. Tokenize query into words (split on whitespace, lowercase)
 * 2. Filter out stop words
 * 3. Rare tokens (code identifiers, paths, commands) get 2x weight
 * 4. Return weighted matches / total weights
 */
export function computeTokenOverlap(text: string, query: string): number {
  const queryTokens = query
    .split(/\s+/)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t));

  if (queryTokens.length === 0) return 0;

  const textLower = text.toLowerCase();
  let totalWeight = 0;
  let matchedWeight = 0;

  for (const token of queryTokens) {
    const weight = isRareToken(token) ? 2 : 1;
    totalWeight += weight;
    if (textLower.includes(token)) {
      matchedWeight += weight;
    }
  }

  return totalWeight > 0 ? matchedWeight / totalWeight : 0;
}

// =============================================================================
// HELPER: EXCERPT GENERATION
// =============================================================================

/**
 * Generate a focused excerpt from text centered around the best query-term match.
 *
 * Finds the position in `text` that contains the most query terms and centers
 * a window of `maxLength` characters around it. Adds "..." at truncated boundaries.
 */
export function generateExcerpt(text: string, query: string, maxLength?: number): string {
  const max = maxLength ?? DEFAULT_EXCERPT_LENGTH;

  if (text.length <= max) return text;

  // Tokenize query for matching
  const tokens = query
    .split(/\s+/)
    .map((t) => t.toLowerCase().replace(/^["'`]+|["'`]+$/g, ''))
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t));

  if (tokens.length === 0) {
    // No meaningful tokens — return the start of the text
    return text.slice(0, max) + '...';
  }

  const textLower = text.toLowerCase();

  // Find the first occurrence of any query token — use the earliest one
  // that maximizes nearby token density
  let bestPos = 0;
  let bestScore = -1;

  // Scan through occurrences of each token and score nearby density
  const windowRadius = Math.floor(max / 2);
  for (const token of tokens) {
    let searchStart = 0;
    while (searchStart < textLower.length) {
      const idx = textLower.indexOf(token, searchStart);
      if (idx === -1) break;

      // Count how many other tokens appear within the excerpt window
      const winStart = Math.max(0, idx - windowRadius);
      const winEnd = Math.min(textLower.length, idx + windowRadius);
      const windowText = new Set(textLower.slice(winStart, winEnd));

      let score = 0;
      for (const t of tokens) {
        if (windowText.has(t)) score++;
      }

      if (score > bestScore) {
        bestScore = score;
        bestPos = idx;
      }

      searchStart = idx + 1;
      // Limit iterations for very large texts
      if (searchStart > textLower.length) break;
    }
  }

  // Center the excerpt around the best position
  let start = Math.max(0, bestPos - windowRadius);
  const end = Math.min(text.length, start + max);

  // Adjust start if end hit the boundary
  if (end - start < max) {
    start = Math.max(0, end - max);
  }

  let excerpt = text.slice(start, end);
  if (start > 0) excerpt = '...' + excerpt;
  if (end < text.length) excerpt = excerpt + '...';

  return excerpt;
}
