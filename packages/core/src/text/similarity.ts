// ─── Shared Text Processing & Similarity Utilities ──────────────────
// Pure functions used by Brain (ranked search) and Curator (dedup, contradictions).

export type SparseVector = Map<string, number>;

// ─── Stopwords ─────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'as',
  'is',
  'was',
  'are',
  'were',
  'been',
  'be',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'can',
  'need',
  'must',
  'it',
  'its',
  'this',
  'that',
  'these',
  'those',
  'i',
  'you',
  'he',
  'she',
  'we',
  'they',
  'me',
  'him',
  'her',
  'us',
  'them',
  'my',
  'your',
  'his',
  'our',
  'their',
  'what',
  'which',
  'who',
  'whom',
  'when',
  'where',
  'why',
  'how',
  'all',
  'each',
  'every',
  'both',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'not',
  'only',
  'same',
  'so',
  'than',
  'too',
  'very',
  'just',
  'because',
  'if',
  'then',
  'else',
  'about',
  'up',
  'out',
  'into',
]);

// ─── Text Processing ───────────────────────────────────────────────

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

export function calculateTf(tokens: string[]): SparseVector {
  const tf: SparseVector = new Map();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) ?? 0) + 1);
  }
  const len = tokens.length || 1;
  for (const [term, count] of tf) {
    tf.set(term, count / len);
  }
  return tf;
}

export function calculateTfIdf(tokens: string[], vocabulary: Map<string, number>): SparseVector {
  const tf = calculateTf(tokens);
  const tfidf: SparseVector = new Map();
  for (const [term, tfValue] of tf) {
    const idf = vocabulary.get(term) ?? 0;
    if (idf > 0) {
      tfidf.set(term, tfValue * idf);
    }
  }
  return tfidf;
}

export function cosineSimilarity(a: SparseVector, b: SparseVector): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const [term, valA] of a) {
    normA += valA * valA;
    const valB = b.get(term);
    if (valB !== undefined) {
      dot += valA * valB;
    }
  }
  for (const [, valB] of b) {
    normB += valB * valB;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}
