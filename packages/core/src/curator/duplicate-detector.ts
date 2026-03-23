/**
 * Duplicate Detector — pure-logic module for finding duplicate vault entries.
 *
 * Uses TF-IDF cosine similarity to score entry pairs.
 * Database access is NOT performed here — callers supply entry lists.
 */

import type { IntelligenceEntry } from '../intelligence/types.js';
import {
  tokenize,
  calculateTfIdf,
  cosineSimilarity,
  type SparseVector,
} from '../text/similarity.js';
import type { DuplicateCandidate, DuplicateDetectionResult } from './types.js';

// ─── Constants ──────────────────────────────────────────────────────

export const DEFAULT_DUPLICATE_THRESHOLD = 0.45;
export const MERGE_SUGGESTION_THRESHOLD = 0.65;

// ─── Vocabulary Builder ─────────────────────────────────────────────

export function buildVocabulary(entries: IntelligenceEntry[]): Map<string, number> {
  const docCount = entries.length;
  const termDocFreq = new Map<string, number>();
  for (const entry of entries) {
    const text = [entry.title, entry.description, entry.context ?? '', entry.tags.join(' ')].join(
      ' ',
    );
    const tokens = new Set(tokenize(text));
    for (const token of tokens) {
      termDocFreq.set(token, (termDocFreq.get(token) ?? 0) + 1);
    }
  }
  const vocabulary = new Map<string, number>();
  for (const [term, df] of termDocFreq) {
    const idf = Math.log((docCount + 1) / (df + 1)) + 1;
    vocabulary.set(term, idf);
  }
  return vocabulary;
}

// ─── Entry → Text ───────────────────────────────────────────────────

export function entryToText(entry: IntelligenceEntry): string {
  return [entry.title, entry.description, entry.context ?? '', entry.tags.join(' ')].join(' ');
}

// ─── Detect Duplicates ──────────────────────────────────────────────

export function detectDuplicates(
  entries: IntelligenceEntry[],
  entryId?: string,
  threshold?: number,
): DuplicateDetectionResult[] {
  const effectiveThreshold = threshold ?? DEFAULT_DUPLICATE_THRESHOLD;
  if (entries.length === 0) return [];

  const vocabulary = buildVocabulary(entries);

  // Build vectors for all entries
  const vectors = new Map<string, SparseVector>();
  for (const entry of entries) {
    vectors.set(entry.id, calculateTfIdf(tokenize(entryToText(entry)), vocabulary));
  }

  const targetEntries = entryId ? entries.filter((e) => e.id === entryId) : entries;

  const results: DuplicateDetectionResult[] = [];

  for (const entry of targetEntries) {
    const entryVec = vectors.get(entry.id)!;
    const matches: DuplicateCandidate[] = [];

    for (const other of entries) {
      if (other.id === entry.id) continue;
      // Skip cross-domain pairs — shared vocabulary across domains causes false positives
      if (entry.domain !== other.domain) continue;
      const otherVec = vectors.get(other.id)!;
      const similarity = cosineSimilarity(entryVec, otherVec);
      if (similarity >= effectiveThreshold) {
        matches.push({
          entryId: other.id,
          title: other.title,
          similarity,
          suggestMerge: similarity >= MERGE_SUGGESTION_THRESHOLD,
        });
      }
    }

    if (matches.length > 0) {
      matches.sort((a, b) => b.similarity - a.similarity);
      results.push({
        entryId: entry.id,
        matches,
        scannedCount: entries.length - 1,
      });
    }
  }

  return results;
}
