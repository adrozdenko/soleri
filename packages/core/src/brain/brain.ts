import type { Vault } from '../vault/vault.js';
import type { SearchResult } from '../vault/vault.js';
import type { IntelligenceEntry } from '../intelligence/types.js';
import type { CogneeClient } from '../cognee/client.js';

// ─── Types ───────────────────────────────────────────────────────────

export interface ScoringWeights {
  semantic: number;
  vector: number;
  severity: number;
  recency: number;
  tagOverlap: number;
  domainMatch: number;
}

export interface ScoreBreakdown {
  semantic: number;
  vector: number;
  severity: number;
  recency: number;
  tagOverlap: number;
  domainMatch: number;
  total: number;
}

export interface RankedResult {
  entry: IntelligenceEntry;
  score: number;
  breakdown: ScoreBreakdown;
}

export interface SearchOptions {
  domain?: string;
  type?: string;
  severity?: string;
  limit?: number;
  tags?: string[];
}

export interface CaptureResult {
  captured: boolean;
  id: string;
  autoTags: string[];
  duplicate?: { id: string; similarity: number };
  blocked?: boolean;
}

export interface BrainStats {
  vocabularySize: number;
  feedbackCount: number;
  weights: ScoringWeights;
}

export interface QueryContext {
  query: string;
  domain?: string;
  tags?: string[];
}

type SparseVector = Map<string, number>;

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

// ─── Text Processing (pure functions) ────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function calculateTf(tokens: string[]): SparseVector {
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

function calculateTfIdf(tokens: string[], vocabulary: Map<string, number>): SparseVector {
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

function cosineSimilarity(a: SparseVector, b: SparseVector): number {
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

function jaccardSimilarity(a: string[], b: string[]): number {
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

// ─── Severity scoring ──────────────────────────────────────────────

const SEVERITY_SCORES: Record<string, number> = {
  critical: 1.0,
  warning: 0.7,
  suggestion: 0.4,
};

// ─── Brain Class ─────────────────────────────────────────────────

const DEFAULT_WEIGHTS: ScoringWeights = {
  semantic: 0.4,
  vector: 0.0,
  severity: 0.15,
  recency: 0.15,
  tagOverlap: 0.15,
  domainMatch: 0.15,
};

const COGNEE_WEIGHTS: ScoringWeights = {
  semantic: 0.25,
  vector: 0.35,
  severity: 0.1,
  recency: 0.1,
  tagOverlap: 0.1,
  domainMatch: 0.1,
};

const WEIGHT_BOUND = 0.15;
const FEEDBACK_THRESHOLD = 30;
const DUPLICATE_BLOCK_THRESHOLD = 0.8;
const DUPLICATE_WARN_THRESHOLD = 0.6;
const RECENCY_HALF_LIFE_DAYS = 365;

export class Brain {
  private vault: Vault;
  private cognee: CogneeClient | undefined;
  private vocabulary: Map<string, number> = new Map();
  private weights: ScoringWeights = { ...DEFAULT_WEIGHTS };

  constructor(vault: Vault, cognee?: CogneeClient) {
    this.vault = vault;
    this.cognee = cognee;
    this.rebuildVocabulary();
    this.recomputeWeights();
  }

  async intelligentSearch(query: string, options?: SearchOptions): Promise<RankedResult[]> {
    const limit = options?.limit ?? 10;
    const rawResults = this.vault.search(query, {
      domain: options?.domain,
      type: options?.type,
      severity: options?.severity,
      limit: Math.max(limit * 3, 30),
    });

    // Cognee vector search (parallel, with timeout fallback)
    let cogneeScoreMap: Map<string, number> = new Map();
    const cogneeAvailable = this.cognee?.isAvailable ?? false;
    if (cogneeAvailable && this.cognee) {
      try {
        const cogneeResults = await this.cognee.search(query, { limit: Math.max(limit * 2, 20) });

        // Build title → entryId reverse index from FTS results for text-based matching.
        // Cognee assigns its own UUIDs to chunks and may strip embedded metadata during
        // chunking, so we need multiple strategies to cross-reference results.
        const titleToId = new Map<string, string>();
        for (const r of rawResults) {
          titleToId.set(r.entry.title.toLowerCase().trim(), r.entry.id);
        }

        const vaultIdPattern = /\[vault-id:([^\]]+)\]/;
        const unmatchedCogneeResults: Array<{ text: string; score: number }> = [];

        for (const cr of cogneeResults) {
          const text = cr.text ?? '';

          // Strategy 1: Extract vault ID from [vault-id:XXX] prefix (if Cognee preserved it)
          const vaultIdMatch = text.match(vaultIdPattern);
          if (vaultIdMatch) {
            const vaultId = vaultIdMatch[1];
            cogneeScoreMap.set(vaultId, Math.max(cogneeScoreMap.get(vaultId) ?? 0, cr.score));
            continue;
          }

          // Strategy 2: Match first line of chunk text against known entry titles.
          // serializeEntry() puts the title on the first line after the [vault-id:] prefix,
          // and Cognee's chunking typically preserves this as the chunk start.
          const firstLine = text.split('\n')[0]?.trim().toLowerCase() ?? '';
          const matchedId = firstLine ? titleToId.get(firstLine) : undefined;
          if (matchedId) {
            cogneeScoreMap.set(matchedId, Math.max(cogneeScoreMap.get(matchedId) ?? 0, cr.score));
            continue;
          }

          // Strategy 3: Check if any known title appears as a substring in the chunk.
          // Handles cases where the title isn't on the first line (mid-document chunks).
          const textLower = text.toLowerCase();
          let found = false;
          for (const [title, id] of titleToId) {
            if (title.length >= 8 && textLower.includes(title)) {
              cogneeScoreMap.set(id, Math.max(cogneeScoreMap.get(id) ?? 0, cr.score));
              found = true;
              break;
            }
          }
          if (!found && text.length > 0) {
            unmatchedCogneeResults.push({ text, score: cr.score });
          }
        }

        // Strategy 4: For Cognee-only semantic matches (not in FTS results),
        // use the first line as a vault FTS query to find the source entry.
        for (const unmatched of unmatchedCogneeResults) {
          const searchTerm = unmatched.text.split('\n')[0]?.trim();
          if (!searchTerm || searchTerm.length < 3) continue;
          const vaultHits = this.vault.search(searchTerm, { limit: 1 });
          if (vaultHits.length > 0) {
            const id = vaultHits[0].entry.id;
            cogneeScoreMap.set(id, Math.max(cogneeScoreMap.get(id) ?? 0, unmatched.score));
            // Also add to FTS results pool if not already present
            if (!rawResults.some((r) => r.entry.id === id)) {
              rawResults.push(vaultHits[0]);
            }
          }
        }
      } catch {
        // Cognee failed — fall back to FTS5 only
        cogneeScoreMap = new Map();
      }
    }

    if (rawResults.length === 0) return [];

    const queryTokens = tokenize(query);
    const queryTags = options?.tags ?? [];
    const queryDomain = options?.domain;
    const now = Math.floor(Date.now() / 1000);

    // Use cognee-aware weights only if at least one ranked candidate has a vector score
    const hasVectorCandidate = rawResults.some((r) => cogneeScoreMap.has(r.entry.id));
    const activeWeights = hasVectorCandidate ? this.getCogneeWeights() : this.weights;

    const ranked = rawResults.map((result) => {
      const entry = result.entry;
      const vectorScore = cogneeScoreMap.get(entry.id) ?? 0;
      const breakdown = this.scoreEntry(
        entry,
        queryTokens,
        queryTags,
        queryDomain,
        now,
        vectorScore,
        activeWeights,
      );
      return { entry, score: breakdown.total, breakdown };
    });

    ranked.sort((a, b) => b.score - a.score);
    return ranked.slice(0, limit);
  }

  enrichAndCapture(
    entry: Partial<IntelligenceEntry> & {
      id: string;
      type: IntelligenceEntry['type'];
      domain: string;
      title: string;
      severity: IntelligenceEntry['severity'];
      description: string;
    },
  ): CaptureResult {
    const autoTags = this.generateTags(entry.title, entry.description, entry.context);
    const mergedTags = Array.from(new Set([...(entry.tags ?? []), ...autoTags]));

    const duplicate = this.detectDuplicate(entry.title, entry.domain);

    if (duplicate && duplicate.similarity >= DUPLICATE_BLOCK_THRESHOLD) {
      return {
        captured: false,
        id: entry.id,
        autoTags,
        duplicate,
        blocked: true,
      };
    }

    const fullEntry: IntelligenceEntry = {
      id: entry.id,
      type: entry.type,
      domain: entry.domain,
      title: entry.title,
      severity: entry.severity,
      description: entry.description,
      context: entry.context,
      example: entry.example,
      counterExample: entry.counterExample,
      why: entry.why,
      tags: mergedTags,
      appliesTo: entry.appliesTo,
    };

    this.vault.add(fullEntry);
    this.updateVocabularyIncremental(fullEntry);

    // Fire-and-forget Cognee sync
    if (this.cognee?.isAvailable) {
      this.cognee.addEntries([fullEntry]).catch(() => {});
    }

    const result: CaptureResult = {
      captured: true,
      id: entry.id,
      autoTags,
    };

    if (duplicate && duplicate.similarity >= DUPLICATE_WARN_THRESHOLD) {
      result.duplicate = duplicate;
    }

    return result;
  }

  recordFeedback(query: string, entryId: string, action: 'accepted' | 'dismissed'): void {
    const db = this.vault.getDb();
    db.prepare('INSERT INTO brain_feedback (query, entry_id, action) VALUES (?, ?, ?)').run(
      query,
      entryId,
      action,
    );
    this.recomputeWeights();
  }

  async getRelevantPatterns(context: QueryContext): Promise<RankedResult[]> {
    return this.intelligentSearch(context.query, {
      domain: context.domain,
      tags: context.tags,
    });
  }

  async syncToCognee(): Promise<{ synced: number; cognified: boolean }> {
    if (!this.cognee?.isAvailable) return { synced: 0, cognified: false };

    const batchSize = 1000;
    let offset = 0;
    let totalSynced = 0;

    while (true) {
      const batch = this.vault.list({ limit: batchSize, offset });
      if (batch.length === 0) break;

      const { added } = await this.cognee.addEntries(batch);
      totalSynced += added;
      offset += batch.length;

      if (batch.length < batchSize) break;
    }

    if (totalSynced === 0) return { synced: 0, cognified: false };

    let cognified = false;
    const cognifyResult = await this.cognee.cognify();
    cognified = cognifyResult.status === 'ok';
    return { synced: totalSynced, cognified };
  }

  rebuildVocabulary(): void {
    const entries = this.vault.list({ limit: 100000 });
    const docCount = entries.length;
    if (docCount === 0) {
      this.vocabulary.clear();
      this.persistVocabulary();
      return;
    }

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

    this.vocabulary.clear();
    for (const [term, df] of termDocFreq) {
      const idf = Math.log((docCount + 1) / (df + 1)) + 1;
      this.vocabulary.set(term, idf);
    }

    this.persistVocabulary();
  }

  getStats(): BrainStats {
    const db = this.vault.getDb();
    const feedbackCount = (
      db.prepare('SELECT COUNT(*) as count FROM brain_feedback').get() as { count: number }
    ).count;
    return {
      vocabularySize: this.vocabulary.size,
      feedbackCount,
      weights: { ...this.weights },
    };
  }

  getVocabularySize(): number {
    return this.vocabulary.size;
  }

  // ─── Private methods ─────────────────────────────────────────────

  private scoreEntry(
    entry: IntelligenceEntry,
    queryTokens: string[],
    queryTags: string[],
    queryDomain: string | undefined,
    now: number,
    vectorScore: number = 0,
    activeWeights?: ScoringWeights,
  ): ScoreBreakdown {
    const w = activeWeights ?? this.weights;

    let semantic = 0;
    if (this.vocabulary.size > 0 && queryTokens.length > 0) {
      const entryText = [
        entry.title,
        entry.description,
        entry.context ?? '',
        entry.tags.join(' '),
      ].join(' ');
      const entryTokens = tokenize(entryText);
      const queryVec = calculateTfIdf(queryTokens, this.vocabulary);
      const entryVec = calculateTfIdf(entryTokens, this.vocabulary);
      semantic = cosineSimilarity(queryVec, entryVec);
    }

    const severity = SEVERITY_SCORES[entry.severity] ?? 0.4;

    const entryAge = now - (entry as unknown as { created_at?: number }).created_at!;
    const halfLifeSeconds = RECENCY_HALF_LIFE_DAYS * 86400;
    const recency = entryAge > 0 ? Math.exp((-Math.LN2 * entryAge) / halfLifeSeconds) : 1;

    const tagOverlap = queryTags.length > 0 ? jaccardSimilarity(queryTags, entry.tags) : 0;

    const domainMatch = queryDomain && entry.domain === queryDomain ? 1.0 : 0;

    const vector = vectorScore;

    const total =
      w.semantic * semantic +
      w.vector * vector +
      w.severity * severity +
      w.recency * recency +
      w.tagOverlap * tagOverlap +
      w.domainMatch * domainMatch;

    return { semantic, vector, severity, recency, tagOverlap, domainMatch, total };
  }

  private generateTags(title: string, description: string, context?: string): string[] {
    const text = [title, description, context ?? ''].join(' ');
    const tokens = tokenize(text);
    if (tokens.length === 0) return [];

    const tf = calculateTf(tokens);
    const scored: Array<[string, number]> = [];
    for (const [term, tfValue] of tf) {
      const idf = this.vocabulary.get(term) ?? 1;
      scored.push([term, tfValue * idf]);
    }

    scored.sort((a, b) => b[1] - a[1]);
    return scored.slice(0, 5).map(([term]) => term);
  }

  private detectDuplicate(
    title: string,
    domain: string,
  ): { id: string; similarity: number } | null {
    let candidates: SearchResult[];
    try {
      candidates = this.vault.search(title, { domain, limit: 50 });
    } catch {
      return null;
    }
    if (candidates.length === 0) return null;

    const titleTokens = tokenize(title);
    if (titleTokens.length === 0) return null;
    const titleVec = calculateTfIdf(titleTokens, this.vocabulary);
    if (titleVec.size === 0) {
      const titleTf = calculateTf(titleTokens);
      let bestMatch: { id: string; similarity: number } | null = null;
      for (const candidate of candidates) {
        const candidateTokens = tokenize(candidate.entry.title);
        const candidateTf = calculateTf(candidateTokens);
        const sim = cosineSimilarity(titleTf, candidateTf);
        if (!bestMatch || sim > bestMatch.similarity) {
          bestMatch = { id: candidate.entry.id, similarity: sim };
        }
      }
      return bestMatch;
    }

    let bestMatch: { id: string; similarity: number } | null = null;
    for (const candidate of candidates) {
      const candidateText = [candidate.entry.title, candidate.entry.description].join(' ');
      const candidateTokens = tokenize(candidateText);
      const candidateVec = calculateTfIdf(candidateTokens, this.vocabulary);
      const sim = cosineSimilarity(titleVec, candidateVec);
      if (!bestMatch || sim > bestMatch.similarity) {
        bestMatch = { id: candidate.entry.id, similarity: sim };
      }
    }
    return bestMatch;
  }

  private updateVocabularyIncremental(entry: IntelligenceEntry): void {
    const text = [entry.title, entry.description, entry.context ?? '', entry.tags.join(' ')].join(
      ' ',
    );
    const tokens = new Set(tokenize(text));
    const totalDocs = this.vault.stats().totalEntries;

    for (const token of tokens) {
      const currentDocCount = this.vocabulary.has(token)
        ? Math.round(totalDocs / Math.exp(this.vocabulary.get(token)! - 1)) + 1
        : 1;
      const newIdf = Math.log((totalDocs + 1) / (currentDocCount + 1)) + 1;
      this.vocabulary.set(token, newIdf);
    }

    this.persistVocabulary();
  }

  private persistVocabulary(): void {
    const db = this.vault.getDb();
    db.prepare('DELETE FROM brain_vocabulary').run();
    if (this.vocabulary.size === 0) return;
    const insert = db.prepare(
      'INSERT INTO brain_vocabulary (term, idf, doc_count) VALUES (?, ?, ?)',
    );
    const tx = db.transaction(() => {
      for (const [term, idf] of this.vocabulary) {
        insert.run(term, idf, 1);
      }
    });
    tx();
  }

  private getCogneeWeights(): ScoringWeights {
    return { ...COGNEE_WEIGHTS };
  }

  private recomputeWeights(): void {
    const db = this.vault.getDb();
    const feedbackCount = (
      db.prepare('SELECT COUNT(*) as count FROM brain_feedback').get() as { count: number }
    ).count;
    if (feedbackCount < FEEDBACK_THRESHOLD) {
      this.weights = { ...DEFAULT_WEIGHTS };
      return;
    }

    const accepted = (
      db
        .prepare("SELECT COUNT(*) as count FROM brain_feedback WHERE action = 'accepted'")
        .get() as { count: number }
    ).count;
    const acceptRate = feedbackCount > 0 ? accepted / feedbackCount : 0.5;

    const semanticDelta = (acceptRate - 0.5) * WEIGHT_BOUND * 2;

    const newWeights = { ...DEFAULT_WEIGHTS };
    newWeights.semantic = clamp(
      DEFAULT_WEIGHTS.semantic + semanticDelta,
      DEFAULT_WEIGHTS.semantic - WEIGHT_BOUND,
      DEFAULT_WEIGHTS.semantic + WEIGHT_BOUND,
    );

    // vector stays 0 in base weights (only active during hybrid search)
    newWeights.vector = 0;

    const remaining = 1.0 - newWeights.semantic - newWeights.vector;
    const otherSum =
      DEFAULT_WEIGHTS.severity +
      DEFAULT_WEIGHTS.recency +
      DEFAULT_WEIGHTS.tagOverlap +
      DEFAULT_WEIGHTS.domainMatch;
    const scale = remaining / otherSum;
    newWeights.severity = DEFAULT_WEIGHTS.severity * scale;
    newWeights.recency = DEFAULT_WEIGHTS.recency * scale;
    newWeights.tagOverlap = DEFAULT_WEIGHTS.tagOverlap * scale;
    newWeights.domainMatch = DEFAULT_WEIGHTS.domainMatch * scale;

    this.weights = newWeights;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
