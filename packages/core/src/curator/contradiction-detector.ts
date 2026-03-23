/**
 * Contradiction Detector — pure-logic module for finding contradictions
 * between pattern and anti-pattern vault entries.
 *
 * Uses TF-IDF cosine similarity with optional FTS5 pre-filtering.
 * Database persistence of detected contradictions is handled by the caller (Curator facade).
 */

import type { IntelligenceEntry } from '../intelligence/types.js';
import { tokenize, calculateTfIdf, cosineSimilarity } from '../text/similarity.js';
import { buildVocabulary, entryToText } from './duplicate-detector.js';

// ─── Constants ──────────────────────────────────────────────────────

export const DEFAULT_CONTRADICTION_THRESHOLD = 0.4;

// ─── Types ──────────────────────────────────────────────────────────

export interface ContradictionCandidate {
  patternId: string;
  antipatternId: string;
  similarity: number;
}

export interface SearchFn {
  (title: string): IntelligenceEntry[];
}

// ─── Detect Contradictions ──────────────────────────────────────────

/**
 * Find pattern/anti-pattern pairs with high textual similarity.
 *
 * @param entries - All vault entries
 * @param threshold - Minimum cosine similarity to flag as contradiction
 * @param searchFn - Optional FTS5-backed candidate retrieval (falls back to all patterns)
 * @returns Array of contradiction candidates (not yet persisted)
 */
export function findContradictions(
  entries: IntelligenceEntry[],
  threshold?: number,
  searchFn?: SearchFn,
): ContradictionCandidate[] {
  const effectiveThreshold = threshold ?? DEFAULT_CONTRADICTION_THRESHOLD;
  const antipatterns = entries.filter((e) => e.type === 'anti-pattern');
  const patterns = entries.filter((e) => e.type === 'pattern');

  if (antipatterns.length === 0 || patterns.length === 0) return [];

  const vocabulary = buildVocabulary(entries);
  const detected: ContradictionCandidate[] = [];

  for (const ap of antipatterns) {
    // Stage 1: FTS5 candidate retrieval (fall back to all patterns if FTS returns empty)
    let candidates: IntelligenceEntry[];
    if (searchFn) {
      try {
        const searchResults = searchFn(ap.title);
        candidates = searchResults.length > 0 ? searchResults : patterns;
      } catch {
        candidates = patterns;
      }
    } else {
      candidates = patterns;
    }

    // Stage 2: TF-IDF cosine similarity
    const apText = entryToText(ap);
    const apVec = calculateTfIdf(tokenize(apText), vocabulary);

    for (const pattern of candidates) {
      const pText = entryToText(pattern);
      const pVec = calculateTfIdf(tokenize(pText), vocabulary);
      const similarity = cosineSimilarity(apVec, pVec);

      if (similarity >= effectiveThreshold) {
        detected.push({
          patternId: pattern.id,
          antipatternId: ap.id,
          similarity,
        });
      }
    }
  }

  return detected;
}
