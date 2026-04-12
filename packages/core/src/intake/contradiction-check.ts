// ─── Contradiction Check ──────────────────────────────────────────
// Lightweight ingest-time check for contradictions between new items
// and existing vault entries. Uses TF-IDF cosine similarity.
//
// Patterns contradict anti-patterns and vice versa.
// Does NOT block storage — informational only.

import { tokenize, calculateTfIdf, cosineSimilarity } from '../text/similarity.js';
import type { Vault } from '../vault/vault.js';
import type { ClassifiedItem, ContradictionFlag } from './types.js';

const CONTRADICTION_THRESHOLD = 0.4;

/**
 * Check if new classified items contradict existing vault entries.
 *
 * A contradiction is when a new pattern is highly similar to an existing
 * anti-pattern (or vice versa). This catches conflicts at ingest time
 * rather than waiting for the curator to find them later.
 */
export function checkContradictions(items: ClassifiedItem[], vault: Vault): ContradictionFlag[] {
  const existing = vault.exportAll().entries;

  // Fast path: empty vault or no items
  if (existing.length === 0 || items.length === 0) return [];

  // We only care about pattern vs anti-pattern contradictions
  const patterns = existing.filter((e) => e.type === 'pattern' || e.type === 'rule');
  const antiPatterns = existing.filter((e) => e.type === 'anti-pattern');

  // If vault has neither patterns nor anti-patterns, no contradictions possible
  if (patterns.length === 0 && antiPatterns.length === 0) return [];

  // Filter new items to only check those that could contradict
  const newPatterns = items.filter((i) => i.type === 'pattern');
  const newAntiPatterns = items.filter((i) => i.type === 'anti-pattern');

  // Nothing to cross-check
  if (newPatterns.length === 0 && newAntiPatterns.length === 0) return [];

  // Build shared vocabulary
  const allTexts = [
    ...existing.map((e) => `${e.title} ${e.description}`),
    ...items.map((i) => `${i.title} ${i.description}`),
  ];
  const totalDocs = allTexts.length;

  const docFreq = new Map<string, number>();
  for (const text of allTexts) {
    const terms = new Set(tokenize(text));
    for (const term of terms) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
  }

  const vocabulary = new Map<string, number>();
  for (const [term, df] of docFreq) {
    vocabulary.set(term, Math.log((totalDocs + 1) / (df + 1)) + 1);
  }

  const flags: ContradictionFlag[] = [];

  // Check new patterns against existing anti-patterns
  for (const newItem of newPatterns) {
    const newVec = calculateTfIdf(tokenize(`${newItem.title} ${newItem.description}`), vocabulary);

    for (const ap of antiPatterns) {
      const apVec = calculateTfIdf(tokenize(`${ap.title} ${ap.description}`), vocabulary);
      const sim = cosineSimilarity(newVec, apVec);

      if (sim >= CONTRADICTION_THRESHOLD) {
        flags.push({
          newItemTitle: newItem.title,
          newItemType: newItem.type,
          existingEntryId: ap.id,
          existingEntryTitle: ap.title,
          existingEntryType: ap.type,
          similarity: sim,
        });
      }
    }
  }

  // Check new anti-patterns against existing patterns
  for (const newItem of newAntiPatterns) {
    const newVec = calculateTfIdf(tokenize(`${newItem.title} ${newItem.description}`), vocabulary);

    for (const p of patterns) {
      const pVec = calculateTfIdf(tokenize(`${p.title} ${p.description}`), vocabulary);
      const sim = cosineSimilarity(newVec, pVec);

      if (sim >= CONTRADICTION_THRESHOLD) {
        flags.push({
          newItemTitle: newItem.title,
          newItemType: newItem.type,
          existingEntryId: p.id,
          existingEntryTitle: p.title,
          existingEntryType: p.type,
          similarity: sim,
        });
      }
    }
  }

  return flags;
}
