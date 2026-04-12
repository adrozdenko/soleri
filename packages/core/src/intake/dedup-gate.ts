// ─── Dedup Gate ───────────────────────────────────────────────────
// TF-IDF cosine similarity check against existing vault entries.
// Pure function: no side effects, no I/O beyond reading vault.

import {
  tokenize,
  calculateTfIdf,
  cosineSimilarity,
  type SparseVector,
} from '../text/similarity.js';
import type { Vault } from '../vault/vault.js';
import type { ClassifiedItem } from './types.js';

export const DEDUP_THRESHOLD = 0.85;

export interface DedupResult {
  item: ClassifiedItem;
  isDuplicate: boolean;
  bestMatchId?: string;
  similarity: number;
}

/**
 * Check new items against existing vault entries for duplicates using TF-IDF cosine similarity.
 *
 * Builds a shared IDF vocabulary from all texts (existing + new), computes TF-IDF vectors,
 * and marks items as duplicates when cosine similarity >= DEDUP_THRESHOLD.
 */
export function dedupItems(items: ClassifiedItem[], vault: Vault): DedupResult[] {
  const existing = vault.exportAll().entries;

  // Fast path: nothing in vault — everything is new
  if (existing.length === 0) {
    return items.map((item) => ({
      item,
      isDuplicate: false,
      similarity: 0,
    }));
  }

  // ── Build texts for vocabulary ──────────────────────────────────
  const existingTexts = existing.map((e) => `${e.title} ${e.description}`);
  const newTexts = items.map((i) => `${i.title} ${i.description}`);
  const allTexts = [...existingTexts, ...newTexts];
  const totalDocs = allTexts.length;

  // ── Count document frequency per term ───────────────────────────
  const docFreq = new Map<string, number>();
  for (const text of allTexts) {
    const terms = new Set(tokenize(text));
    for (const term of terms) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
  }

  // ── Build IDF vocabulary ────────────────────────────────────────
  const vocabulary = new Map<string, number>();
  for (const [term, df] of docFreq) {
    vocabulary.set(term, Math.log((totalDocs + 1) / (df + 1)) + 1);
  }

  // ── Compute TF-IDF vectors for existing entries ─────────────────
  const existingVectors: Array<{ id: string; vec: SparseVector }> = existing.map((entry, idx) => ({
    id: entry.id,
    vec: calculateTfIdf(tokenize(existingTexts[idx]), vocabulary),
  }));

  // ── Score each new item against all existing entries ────────────
  return items.map((item, idx) => {
    const itemVec = calculateTfIdf(tokenize(newTexts[idx]), vocabulary);

    let bestSimilarity = 0;
    let bestMatchId: string | undefined;

    for (const { id, vec } of existingVectors) {
      const sim = cosineSimilarity(itemVec, vec);
      if (sim > bestSimilarity) {
        bestSimilarity = sim;
        bestMatchId = id;
      }
    }

    const isDuplicate = bestSimilarity >= DEDUP_THRESHOLD;

    return {
      item,
      isDuplicate,
      bestMatchId,
      similarity: bestSimilarity,
    };
  });
}
