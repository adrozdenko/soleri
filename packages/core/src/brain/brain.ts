import type { Vault } from '../vault/vault.js';
import type { SearchResult } from '../vault/vault.js';
import type { VaultManager } from '../vault/vault-manager.js';
import type { IntelligenceEntry } from '../intelligence/types.js';
import { computeContentHash } from '../vault/content-hash.js';
import { normalizeTags as normalizeTagsCanonical } from '../vault/tag-normalizer.js';
import {
  tokenize,
  calculateTf,
  calculateTfIdf,
  cosineSimilarity,
  jaccardSimilarity,
} from '../text/similarity.js';
import type { EmbeddingProvider } from '../embeddings/types.js';
import type { LinkManager } from '../vault/linking.js';
import type {
  ScoringWeights,
  ScoreBreakdown,
  RankedResult,
  ScanResult,
  SearchOptions,
  CaptureResult,
  BrainStats,
  QueryContext,
  FeedbackInput,
  FeedbackEntry,
  FeedbackStats,
} from './types.js';

// ─── Severity scoring ──────────────────────────────────────────────

const SEVERITY_SCORES: Record<string, number> = {
  critical: 1.0,
  warning: 0.7,
  suggestion: 0.4,
};

// ─── Vector cosine similarity (dense float arrays) ────────────────

function vectorCosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

// ─── Brain Class ─────────────────────────────────────────────────

const DEFAULT_WEIGHTS: ScoringWeights = {
  semantic: 0.35,
  vector: 0.0,
  severity: 0.1,
  temporalDecay: 0.1,
  tagOverlap: 0.1,
  domainMatch: 0.1,
  graphProximity: 0.15,
};

/** Weights used when an embedding provider is active — vector gets 0.15, semantic drops to 0.20. */
const DEFAULT_WEIGHTS_HYBRID: ScoringWeights = {
  semantic: 0.2,
  vector: 0.15,
  severity: 0.1,
  temporalDecay: 0.1,
  tagOverlap: 0.1,
  domainMatch: 0.1,
  graphProximity: 0.15,
};

const WEIGHT_BOUND = 0.15;
const FEEDBACK_THRESHOLD = 30;
const DUPLICATE_BLOCK_THRESHOLD = 0.8;
const DUPLICATE_WARN_THRESHOLD = 0.6;
const RECENCY_HALF_LIFE_DAYS = 365;

/** Canonical tag taxonomy config, injected from AgentRuntimeConfig. */
export interface CanonicalTagConfig {
  canonicalTags: string[];
  tagConstraintMode: 'enforce' | 'suggest' | 'off';
  metadataTagPrefixes: string[];
}

export class Brain {
  private vault: Vault;
  private vaultManager: VaultManager | undefined;
  private embeddingProvider: EmbeddingProvider | undefined;
  private linkManager: LinkManager | undefined;
  private vocabulary: Map<string, number> = new Map();
  private weights: ScoringWeights = { ...DEFAULT_WEIGHTS };
  private canonicalTagConfig: CanonicalTagConfig | undefined;

  constructor(
    vault: Vault,
    vaultManager?: VaultManager,
    embeddingProvider?: EmbeddingProvider,
    linkManager?: LinkManager,
  ) {
    this.vault = vault;
    this.vaultManager = vaultManager;
    this.embeddingProvider = embeddingProvider;
    this.linkManager = linkManager;
    this.loadVocabularyFromDb();
    this.recomputeWeights();
  }

  /** Configure canonical tag taxonomy. Called by createAgentRuntime when config provides canonicalTags. */
  setCanonicalTagConfig(cfg: CanonicalTagConfig): void {
    this.canonicalTagConfig = cfg;
  }

  /** Set or replace the embedding provider at runtime. */
  setEmbeddingProvider(provider: EmbeddingProvider | undefined): void {
    this.embeddingProvider = provider;
    this.recomputeWeights();
  }

  async intelligentSearch(query: string, options?: SearchOptions): Promise<RankedResult[]> {
    const limit = options?.limit ?? 10;
    const fetchLimit = Math.max(limit * 3, 30);

    // Use VaultManager when available to search across all connected sources
    // (agent tier + shared vault + dynamically connected external vaults).
    // Falls back to single vault search when no manager is present.
    let rawResults: SearchResult[];
    if (this.vaultManager) {
      rawResults = this.vaultManager.search(query, fetchLimit);
      // Apply domain/type/severity filters that VaultManager.search() doesn't support
      if (options?.domain || options?.type || options?.severity) {
        rawResults = rawResults.filter((r) => {
          if (options.domain && r.entry.domain !== options.domain) return false;
          if (options.type && r.entry.type !== options.type) return false;
          if (options.severity && r.entry.severity !== options.severity) return false;
          return true;
        });
      }
    } else {
      rawResults = this.vault.search(query, {
        domain: options?.domain,
        type: options?.type,
        severity: options?.severity,
        limit: fetchLimit,
      });
    }

    if (rawResults.length === 0 && !this.embeddingProvider) return [];

    const queryTokens = tokenize(query);
    const queryTags = options?.tags ?? [];
    const queryDomain = options?.domain;
    const now = Math.floor(Date.now() / 1000);

    // Compute queryVec once for all entries (was previously recomputed per entry in scoreEntry)
    const queryVec =
      this.vocabulary.size > 0 && queryTokens.length > 0
        ? calculateTfIdf(queryTokens, this.vocabulary)
        : null;

    // ── Vector recall: embed query and merge cosineSearch candidates ──
    let queryEmbedding: number[] | null = null;
    const vectorSimilarityMap = new Map<string, number>();

    if (this.embeddingProvider) {
      try {
        const embResult = await this.embeddingProvider.embed([query]);
        if (embResult.vectors.length > 0 && embResult.vectors[0].length > 0) {
          queryEmbedding = embResult.vectors[0];
          const vectorHits = this.vault.cosineSearch(queryEmbedding, fetchLimit);

          // Build similarity lookup and merge vector-only candidates into rawResults
          const ftsIds = new Set(rawResults.map((r) => r.entry.id));
          for (const hit of vectorHits) {
            vectorSimilarityMap.set(hit.entryId, hit.similarity);
            if (!ftsIds.has(hit.entryId)) {
              // Vector-only candidate — fetch full entry and add to pool
              const entry = this.vault.get(hit.entryId);
              if (entry) {
                rawResults.push({ entry, score: hit.similarity });
              }
            }
          }
        }
      } catch {
        // Embedding failed — graceful degradation, continue with FTS-only
      }
    }

    if (rawResults.length === 0) return [];

    const seedCount = rawResults.length;

    // ── Pass 1: Score all entries without graph proximity ──
    const ranked = rawResults.map((result) => {
      const entry = result.entry;
      const vectorSim = vectorSimilarityMap.get(entry.id) ?? null;
      const breakdown = this.scoreEntry(
        entry,
        queryTokens,
        queryTags,
        queryDomain,
        now,
        queryVec,
        queryEmbedding,
        vectorSim,
      );
      return { entry, score: breakdown.total, breakdown };
    });

    ranked.sort((a, b) => b.score - a.score);

    // ── Pass 2: Graph proximity boost ──
    // Traverse links of top results, boost neighbors already in the result set,
    // and pull in graph-discovered entries that weren't in the FTS seed.
    // Only boost from results with meaningful semantic relevance — if the top result
    // has no semantic overlap with the query, its graph neighbors are noise.
    if (this.linkManager && ranked.length > 0) {
      const topN = Math.min(5, ranked.length);
      const topIds = ranked
        .slice(0, topN)
        .filter((r) => r.breakdown.semantic > 0)
        .map((r) => r.entry.id);

      // Build proximity map: entryId → best proximity score
      // Formula: 1 / (distance + 1) — direct neighbors 0.5, depth-2 neighbors 0.33
      // We compute actual BFS distance by doing depth-1 first, then depth-2.
      const proximityMap = new Map<string, number>();
      for (const topId of topIds) {
        // Depth-1 neighbors (direct links)
        const directNeighbors = this.linkManager.traverse(topId, 1);
        const directIds = new Set(directNeighbors.map((n) => n.id));
        for (const neighbor of directNeighbors) {
          const score = 1 / (1 + 1); // distance 1 → 0.5
          const existing = proximityMap.get(neighbor.id) ?? 0;
          if (score > existing) proximityMap.set(neighbor.id, score);
        }

        // Depth-2 neighbors (two hops away)
        const allNeighbors = this.linkManager.traverse(topId, 2);
        for (const neighbor of allNeighbors) {
          if (directIds.has(neighbor.id)) continue; // already scored at depth 1
          const score = 1 / (2 + 1); // distance 2 → 0.33
          const existing = proximityMap.get(neighbor.id) ?? 0;
          if (score > existing) proximityMap.set(neighbor.id, score);
        }
      }

      // Re-score entries that got a proximity boost
      const rankedIds = new Set(ranked.map((r) => r.entry.id));
      for (const r of ranked) {
        const prox = proximityMap.get(r.entry.id);
        if (prox && prox > 0) {
          const vectorSim = vectorSimilarityMap.get(r.entry.id) ?? null;
          r.breakdown = this.scoreEntry(
            r.entry,
            queryTokens,
            queryTags,
            queryDomain,
            now,
            queryVec,
            queryEmbedding,
            vectorSim,
            prox,
          );
          r.score = r.breakdown.total;
        }
      }

      // Pull in graph-discovered entries not in the original result set
      for (const [neighborId, prox] of proximityMap) {
        if (rankedIds.has(neighborId)) continue;
        const entry = this.vault.get(neighborId);
        if (!entry) continue;
        const vectorSim = vectorSimilarityMap.get(neighborId) ?? null;
        const breakdown = this.scoreEntry(
          entry,
          queryTokens,
          queryTags,
          queryDomain,
          now,
          queryVec,
          queryEmbedding,
          vectorSim,
          prox,
        );
        ranked.push({ entry, score: breakdown.total, breakdown });
      }

      ranked.sort((a, b) => b.score - a.score);
    }

    // Small corpus guard: when the FTS seed is small (< 50 entries), TF-IDF scoring
    // becomes too aggressive and filters out relevant results. If filtering to `limit`
    // would discard more than half the seed, return all seed results sorted by score.
    if (seedCount < 50 && limit < seedCount && ranked.length > limit) {
      const wouldKeep = limit;
      if (wouldKeep < seedCount / 2) {
        return ranked.slice(0, seedCount);
      }
    }

    return ranked.slice(0, limit);
  }

  /**
   * Two-pass retrieval — Pass 1: Scan.
   * Returns lightweight results (title, score, snippet) without full entry bodies.
   * Use `loadEntries()` for Pass 2 to fetch full content for selected entries.
   */
  async scanSearch(query: string, options?: Omit<SearchOptions, 'mode'>): Promise<ScanResult[]> {
    const fullResults = await this.intelligentSearch(query, { ...options, mode: 'full' });
    return fullResults.map((r) => ({
      id: r.entry.id,
      title: r.entry.title,
      score: r.score,
      type: r.entry.type,
      domain: r.entry.domain,
      severity: r.entry.severity,
      tags: r.entry.tags,
      snippet: r.entry.description.slice(0, 120) + (r.entry.description.length > 120 ? '...' : ''),
      tokenEstimate: this.estimateTokens(r.entry),
    }));
  }

  /**
   * Two-pass retrieval — Pass 2: Load.
   * Returns full entries for specific IDs (from a previous scan).
   * Uses a single WHERE id IN (...) query instead of per-ID lookups.
   */
  loadEntries(ids: string[]): IntelligenceEntry[] {
    if (ids.length === 0) return [];
    return this.vault.loadEntries(ids);
  }

  /** Rough token estimate for an entry (chars / 4). */
  private estimateTokens(entry: IntelligenceEntry): number {
    let chars = entry.title.length + entry.description.length;
    if (entry.context) chars += entry.context.length;
    if (entry.example) chars += entry.example.length;
    if (entry.counterExample) chars += entry.counterExample.length;
    if (entry.why) chars += entry.why.length;
    return Math.ceil(chars / 4);
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
    let mergedTags = Array.from(new Set([...(entry.tags ?? []), ...autoTags]));

    // Apply canonical tag normalization if configured
    if (this.canonicalTagConfig && this.canonicalTagConfig.tagConstraintMode !== 'off') {
      mergedTags = normalizeTagsCanonical(
        mergedTags,
        this.canonicalTagConfig.canonicalTags,
        this.canonicalTagConfig.tagConstraintMode,
        this.canonicalTagConfig.metadataTagPrefixes,
      );
    }

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
      tier: entry.tier,
    };

    // Content-hash dedup: check after enrichment so tags match the stored hash
    const contentHash = computeContentHash(fullEntry);
    const existingByHash = this.vault.findByContentHash(contentHash);
    if (existingByHash && existingByHash !== entry.id) {
      return {
        captured: false,
        id: entry.id,
        autoTags,
        duplicate: { id: existingByHash, similarity: 1.0 },
        blocked: true,
      };
    }

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

  recordFeedback(query: string, entryId: string, action: 'accepted' | 'dismissed'): void;
  recordFeedback(input: FeedbackInput): FeedbackEntry;
  recordFeedback(
    queryOrInput: string | FeedbackInput,
    entryId?: string,
    action?: 'accepted' | 'dismissed',
  ): void | FeedbackEntry {
    const db = this.vault.getDb();

    // Normalize to FeedbackInput
    const input: FeedbackInput =
      typeof queryOrInput === 'string'
        ? { query: queryOrInput, entryId: entryId!, action: action! }
        : queryOrInput;

    db.prepare(
      `INSERT INTO brain_feedback (query, entry_id, action, source, confidence, duration, context, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.query,
      input.entryId,
      input.action,
      input.source ?? 'search',
      input.confidence ?? 0.6,
      input.duration ?? null,
      input.context ?? '{}',
      input.reason ?? null,
    );
    this.recomputeWeights();

    // Return FeedbackEntry only for the object overload
    if (typeof queryOrInput !== 'string') {
      const row = db
        .prepare(
          'SELECT * FROM brain_feedback WHERE query = ? AND entry_id = ? ORDER BY id DESC LIMIT 1',
        )
        .get(input.query, input.entryId) as {
        id: number;
        query: string;
        entry_id: string;
        action: string;
        source: string;
        confidence: number;
        duration: number | null;
        context: string;
        reason: string | null;
        created_at: number;
      };
      return {
        id: row.id,
        query: row.query,
        entryId: row.entry_id,
        action: row.action as FeedbackEntry['action'],
        source: row.source as FeedbackEntry['source'],
        confidence: row.confidence,
        duration: row.duration,
        context: row.context,
        reason: row.reason,
        createdAt: row.created_at,
      };
    }
  }

  getFeedbackStats(): FeedbackStats {
    const db = this.vault.getDb();

    const total = (
      db.prepare('SELECT COUNT(*) as count FROM brain_feedback').get() as { count: number }
    ).count;

    const byAction: Record<string, number> = {};
    const actionRows = db
      .prepare('SELECT action, COUNT(*) as count FROM brain_feedback GROUP BY action')
      .all() as Array<{ action: string; count: number }>;
    for (const row of actionRows) {
      byAction[row.action] = row.count;
    }

    const bySource: Record<string, number> = {};
    const sourceRows = db
      .prepare('SELECT source, COUNT(*) as count FROM brain_feedback GROUP BY source')
      .all() as Array<{ source: string; count: number }>;
    for (const row of sourceRows) {
      bySource[row.source] = row.count;
    }

    const accepted = byAction['accepted'] ?? 0;
    const acceptanceRate = total > 0 ? accepted / total : 0;

    const avgConf =
      (
        db.prepare('SELECT AVG(confidence) as avg FROM brain_feedback').get() as {
          avg: number | null;
        }
      ).avg ?? 0;

    return {
      total,
      byAction,
      bySource,
      acceptanceRate,
      averageConfidence: avgConf,
    };
  }

  async getRelevantPatterns(context: QueryContext): Promise<RankedResult[]> {
    return this.intelligentSearch(context.query, {
      domain: context.domain,
      tags: context.tags,
    });
  }

  rebuildVocabulary(): void {
    const BATCH_SIZE = 100;
    const termDocFreq = new Map<string, number>();
    let docCount = 0;

    // Helper to process a batch of entries into the term-doc-frequency map
    const processBatch = (entries: IntelligenceEntry[]): void => {
      for (const entry of entries) {
        const text = [
          entry.title,
          entry.description,
          entry.context ?? '',
          entry.tags.join(' '),
        ].join(' ');
        const tokens = new Set(tokenize(text));
        for (const token of tokens) {
          termDocFreq.set(token, (termDocFreq.get(token) ?? 0) + 1);
        }
      }
      docCount += entries.length;
    };

    // Helper to iterate a single vault in batches
    const iterateVault = (vault: Vault, seen: Set<string> | null): void => {
      let offset = 0;
      while (true) {
        const batch = vault.list({ limit: BATCH_SIZE, offset });
        if (batch.length === 0) break;
        if (seen) {
          const unique = batch.filter((e) => {
            if (seen.has(e.id)) return false;
            seen.add(e.id);
            return true;
          });
          processBatch(unique);
        } else {
          processBatch(batch);
        }
        if (batch.length < BATCH_SIZE) break;
        offset += BATCH_SIZE;
      }
    };

    // Collect entries from all connected sources when VaultManager is available
    if (this.vaultManager) {
      const seen = new Set<string>();
      // Gather entries from all tier vaults and connected sources via manager
      for (const tierInfo of this.vaultManager.listTiers()) {
        if (!tierInfo.connected) continue;
        try {
          const tierVault = this.vaultManager.getTier(tierInfo.tier);
          iterateVault(tierVault, seen);
        } catch {
          /* tier not connected */
        }
      }
      for (const { name } of this.vaultManager.listConnected()) {
        const cv = this.vaultManager.getConnected(name);
        if (!cv) continue;
        try {
          iterateVault(cv.vault, seen);
        } catch {
          /* source not accessible */
        }
      }
    } else {
      iterateVault(this.vault, null);
    }

    if (docCount === 0) {
      this.vocabulary.clear();
      this.persistVocabularyFull();
      return;
    }

    this.vocabulary.clear();
    for (const [term, df] of termDocFreq) {
      const idf = Math.log((docCount + 1) / (df + 1)) + 1;
      this.vocabulary.set(term, idf);
    }

    this.persistVocabularyFull();
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

  async getDecayReport(
    query: string,
    limit: number = 10,
  ): Promise<
    Array<{
      id: string;
      title: string;
      decayScore: number;
      validUntil: number | null;
      status: 'active' | 'expiring' | 'expired';
    }>
  > {
    const results = await this.intelligentSearch(query, { limit });
    const now = Math.floor(Date.now() / 1000);
    return results.map((r) => {
      const validUntil = r.entry.validUntil ?? null;
      let status: 'active' | 'expiring' | 'expired' = 'active';
      if (validUntil) {
        if (validUntil <= now) status = 'expired';
        else {
          const validFrom = r.entry.validFrom ?? now;
          const totalWindow = validUntil - validFrom;
          const remaining = validUntil - now;
          if (remaining <= totalWindow * 0.25) status = 'expiring';
        }
      }
      return {
        id: r.entry.id,
        title: r.entry.title,
        decayScore: r.breakdown.temporalDecay,
        validUntil,
        status,
      };
    });
  }

  // ─── Private methods ─────────────────────────────────────────────

  private scoreEntry(
    entry: IntelligenceEntry,
    queryTokens: string[],
    queryTags: string[],
    queryDomain: string | undefined,
    now: number,
    queryVec: Map<string, number> | null = null,
    queryEmbedding: number[] | null = null,
    precomputedVectorSim: number | null = null,
    graphProximity: number = 0,
  ): ScoreBreakdown {
    const w = this.weights;

    let semantic = 0;
    if (queryVec && queryVec.size > 0) {
      const entryText = [
        entry.title,
        entry.description,
        entry.context ?? '',
        entry.tags.join(' '),
      ].join(' ');
      const entryTokens = tokenize(entryText);
      const entryVec = calculateTfIdf(entryTokens, this.vocabulary);
      semantic = cosineSimilarity(queryVec, entryVec);
    }

    const severity = SEVERITY_SCORES[entry.severity] ?? 0.4;

    const temporalDecay = computeTemporalDecay(entry, now);

    const tagOverlap = queryTags.length > 0 ? jaccardSimilarity(queryTags, entry.tags) : 0;

    const domainMatch = queryDomain && entry.domain === queryDomain ? 1.0 : 0;

    // Use precomputed cosine similarity from the vector recall phase when available.
    // If we have a query embedding but no precomputed similarity (entry wasn't in
    // cosineSearch results), try to compute it from the entry's stored vector.
    let vector = 0;
    if (precomputedVectorSim !== null) {
      vector = precomputedVectorSim;
    } else if (queryEmbedding) {
      try {
        const stored = this.vault.getVector(entry.id);
        if (stored) {
          vector = vectorCosineSimilarity(queryEmbedding, stored.vector);
        }
      } catch {
        // No stored vector — vector stays 0
      }
    }

    const total =
      w.semantic * semantic +
      w.vector * vector +
      w.severity * severity +
      w.temporalDecay * temporalDecay +
      w.tagOverlap * tagOverlap +
      w.domainMatch * domainMatch +
      w.graphProximity * graphProximity;

    return {
      semantic,
      vector,
      severity,
      temporalDecay,
      tagOverlap,
      domainMatch,
      graphProximity,
      total,
    };
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

    const changedTerms = new Map<string, number>();
    for (const token of tokens) {
      const currentDocCount = this.vocabulary.has(token)
        ? Math.round(totalDocs / Math.exp(this.vocabulary.get(token)! - 1)) + 1
        : 1;
      const newIdf = Math.log((totalDocs + 1) / (currentDocCount + 1)) + 1;
      this.vocabulary.set(token, newIdf);
      changedTerms.set(token, newIdf);
    }

    this.persistVocabularyPartial(changedTerms);
  }

  private persistVocabularyPartial(terms: Map<string, number>): void {
    if (terms.size === 0) return;
    const db = this.vault.getDb();
    const upsert = db.prepare(
      'INSERT OR REPLACE INTO brain_vocabulary (term, idf, doc_count, updated_at) VALUES (?, ?, 1, unixepoch())',
    );
    const tx = db.transaction(() => {
      for (const [term, idf] of terms) {
        upsert.run(term, idf);
      }
    });
    tx();
  }

  /**
   * Fast startup path: load vocabulary from the brain_vocabulary table.
   * If the table is empty (first boot or after corruption), trigger a full rebuild.
   */
  private loadVocabularyFromDb(): void {
    const db = this.vault.getDb();
    const rows = db.prepare('SELECT term, idf FROM brain_vocabulary').all() as Array<{
      term: string;
      idf: number;
    }>;

    if (rows.length === 0) {
      this.rebuildVocabulary();
      return;
    }

    this.vocabulary.clear();
    for (const row of rows) {
      this.vocabulary.set(row.term, row.idf);
    }
  }

  /**
   * Full persist: DELETE all rows then re-INSERT. Used by rebuildVocabulary() which
   * replaces the entire vocabulary and needs to remove stale terms.
   */
  private persistVocabularyFull(): void {
    const db = this.vault.getDb();
    if (this.vocabulary.size === 0) {
      db.prepare('DELETE FROM brain_vocabulary').run();
      return;
    }
    const upsert = db.prepare(
      'INSERT OR REPLACE INTO brain_vocabulary (term, idf, doc_count, updated_at) VALUES (?, ?, 1, unixepoch())',
    );
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM brain_vocabulary').run();
      for (const [term, idf] of this.vocabulary) {
        upsert.run(term, idf);
      }
    });
    tx();
  }

  private recomputeWeights(): void {
    const db = this.vault.getDb();
    // Exclude 'failed' from weight computation — system errors don't indicate relevance
    const feedbackCount = (
      db.prepare("SELECT COUNT(*) as count FROM brain_feedback WHERE action != 'failed'").get() as {
        count: number;
      }
    ).count;
    if (feedbackCount < FEEDBACK_THRESHOLD) {
      this.weights = this.embeddingProvider
        ? { ...DEFAULT_WEIGHTS_HYBRID }
        : { ...DEFAULT_WEIGHTS };
      return;
    }

    const accepted = (
      db
        .prepare("SELECT COUNT(*) as count FROM brain_feedback WHERE action = 'accepted'")
        .get() as { count: number }
    ).count;
    // 'modified' counts as 0.5 positive — user adjusted but didn't dismiss
    const modified = (
      db
        .prepare("SELECT COUNT(*) as count FROM brain_feedback WHERE action = 'modified'")
        .get() as { count: number }
    ).count;
    const acceptRate = feedbackCount > 0 ? (accepted + modified * 0.5) / feedbackCount : 0.5;

    const semanticDelta = (acceptRate - 0.5) * WEIGHT_BOUND * 2;

    const newWeights = { ...DEFAULT_WEIGHTS };
    newWeights.semantic = clamp(
      DEFAULT_WEIGHTS.semantic + semanticDelta,
      DEFAULT_WEIGHTS.semantic - WEIGHT_BOUND,
      DEFAULT_WEIGHTS.semantic + WEIGHT_BOUND,
    );

    // When no embedding provider is configured, vector weight stays 0.
    // When provider IS available, vector participates in weight adaptation.
    if (!this.embeddingProvider) {
      newWeights.vector = 0;
    } else {
      // With embeddings active, give vector a meaningful default weight
      // by redistributing from semantic (the closest signal).
      newWeights.vector = DEFAULT_WEIGHTS_HYBRID.vector;
      newWeights.semantic = clamp(
        newWeights.semantic - DEFAULT_WEIGHTS_HYBRID.vector,
        DEFAULT_WEIGHTS.semantic - WEIGHT_BOUND,
        DEFAULT_WEIGHTS.semantic + WEIGHT_BOUND,
      );
    }

    const remaining = 1.0 - newWeights.semantic - newWeights.vector;
    const otherSum =
      DEFAULT_WEIGHTS.severity +
      DEFAULT_WEIGHTS.temporalDecay +
      DEFAULT_WEIGHTS.tagOverlap +
      DEFAULT_WEIGHTS.domainMatch +
      DEFAULT_WEIGHTS.graphProximity;
    const scale = remaining / otherSum;
    newWeights.severity = DEFAULT_WEIGHTS.severity * scale;
    newWeights.temporalDecay = DEFAULT_WEIGHTS.temporalDecay * scale;
    newWeights.tagOverlap = DEFAULT_WEIGHTS.tagOverlap * scale;
    newWeights.domainMatch = DEFAULT_WEIGHTS.domainMatch * scale;
    newWeights.graphProximity = DEFAULT_WEIGHTS.graphProximity * scale;

    this.weights = newWeights;
  }
}

function computeTemporalDecay(entry: IntelligenceEntry, now: number): number {
  const entryRecord = entry as unknown as {
    created_at?: number;
    updated_at?: number;
    valid_until?: number;
    valid_from?: number;
  };
  const validUntil = entry.validUntil ?? entryRecord.valid_until;

  if (!validUntil) {
    // No expiry — use existing age-based exponential decay
    const updatedAt = entryRecord.updated_at ?? entryRecord.created_at ?? now;
    const ageSeconds = now - updatedAt;
    const halfLifeSeconds = RECENCY_HALF_LIFE_DAYS * 86400;
    return ageSeconds > 0 ? Math.exp((-Math.LN2 * ageSeconds) / halfLifeSeconds) : 1;
  }

  // With valid_until: linear ramp-down in last 25% of validity window
  const validFrom = entry.validFrom ?? entryRecord.valid_from ?? entryRecord.created_at ?? now;
  const totalWindow = validUntil - validFrom;
  const remaining = validUntil - now;
  if (remaining <= 0) return 0; // expired
  if (totalWindow <= 0) return 1; // edge case: bad data
  const decayZone = totalWindow * 0.25;
  if (remaining > decayZone) return 1.0; // fully valid
  return remaining / decayZone; // linear decay in last quarter
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
