import type { Vault } from '../vault/vault.js';
import type { SearchResult } from '../vault/vault.js';
import type { IntelligenceEntry } from '../intelligence/types.js';
import {
  tokenize,
  calculateTf,
  calculateTfIdf,
  cosineSimilarity,
  jaccardSimilarity,
} from '../text/similarity.js';

// ─── Types ───────────────────────────────────────────────────────────

export interface ScoringWeights {
  semantic: number;
  severity: number;
  recency: number;
  tagOverlap: number;
  domainMatch: number;
}

export interface ScoreBreakdown {
  semantic: number;
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

// ─── Severity scoring ──────────────────────────────────────────────

const SEVERITY_SCORES: Record<string, number> = {
  critical: 1.0,
  warning: 0.7,
  suggestion: 0.4,
};

// ─── Brain Class ─────────────────────────────────────────────────

const DEFAULT_WEIGHTS: ScoringWeights = {
  semantic: 0.4,
  severity: 0.15,
  recency: 0.15,
  tagOverlap: 0.15,
  domainMatch: 0.15,
};

const WEIGHT_BOUND = 0.15;
const FEEDBACK_THRESHOLD = 30;
const DUPLICATE_BLOCK_THRESHOLD = 0.8;
const DUPLICATE_WARN_THRESHOLD = 0.6;
const RECENCY_HALF_LIFE_DAYS = 365;

export class Brain {
  private vault: Vault;
  private vocabulary: Map<string, number> = new Map();
  private weights: ScoringWeights = { ...DEFAULT_WEIGHTS };

  constructor(vault: Vault) {
    this.vault = vault;
    this.rebuildVocabulary();
    this.recomputeWeights();
  }

  intelligentSearch(query: string, options?: SearchOptions): RankedResult[] {
    const limit = options?.limit ?? 10;
    const rawResults = this.vault.search(query, {
      domain: options?.domain,
      type: options?.type,
      severity: options?.severity,
      limit: Math.max(limit * 3, 30),
    });

    if (rawResults.length === 0) return [];

    const queryTokens = tokenize(query);
    const queryTags = options?.tags ?? [];
    const queryDomain = options?.domain;
    const now = Math.floor(Date.now() / 1000);

    const ranked = rawResults.map((result) => {
      const entry = result.entry;
      const breakdown = this.scoreEntry(entry, queryTokens, queryTags, queryDomain, now);
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

  getRelevantPatterns(context: QueryContext): RankedResult[] {
    return this.intelligentSearch(context.query, {
      domain: context.domain,
      tags: context.tags,
    });
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
  ): ScoreBreakdown {
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

    const total =
      this.weights.semantic * semantic +
      this.weights.severity * severity +
      this.weights.recency * recency +
      this.weights.tagOverlap * tagOverlap +
      this.weights.domainMatch * domainMatch;

    return { semantic, severity, recency, tagOverlap, domainMatch, total };
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

    const remaining = 1.0 - newWeights.semantic;
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
