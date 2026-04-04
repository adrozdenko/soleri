/**
 * Context Engine — entity extraction, knowledge retrieval, and confidence scoring.
 *
 * Orchestrates three signals to enrich intent classification:
 * 1. Entity extraction (regex-based, domain-agnostic)
 * 2. Knowledge retrieval (vault FTS + brain recommendations)
 * 3. Confidence scoring (combines entity + knowledge signals)
 *
 * If vault is empty, keyword confidence from IntentRouter is unchanged.
 */

import type { Vault } from '../vault/vault.js';
import type { Brain } from '../brain/brain.js';
import type { BrainIntelligence } from '../brain/intelligence.js';
import type {
  EntityType,
  ExtractedEntity,
  EntityExtractionResult,
  KnowledgeItem,
  KnowledgeRetrievalResult,
  ContextAnalysis,
  ConfidenceLevel,
  ContextEngineConfig,
} from './types.js';

// ─── Entity Patterns ────────────────────────────────────────────────

const ENTITY_PATTERNS: Array<{ type: EntityType; pattern: RegExp; confidence: number }> = [
  // File paths: src/foo/bar.ts, ./config.json, foo.tsx
  { type: 'file', pattern: /(?:\.\/|src\/|packages\/)?[\w\-./]+\.\w{1,6}/g, confidence: 0.8 },
  // Function/method names: functionName(), ClassName.method()
  { type: 'function', pattern: /\b[a-z]\w*(?:\.\w+)*\(\)/g, confidence: 0.7 },
  // Domains: accessibility, performance, security, etc.
  {
    type: 'domain',
    pattern:
      /\b(?:accessibility|a11y|performance|security|architecture|testing|design|ux|devops|data|analytics|auth|api)\b/gi,
    confidence: 0.9,
  },
  // Actions: create, fix, build, deploy, etc.
  {
    type: 'action',
    pattern:
      /\b(?:create|build|fix|debug|deploy|test|validate|review|improve|refactor|optimize|migrate|add|remove|update)\b/gi,
    confidence: 0.8,
  },
  // Technologies: React, TypeScript, Node.js, etc.
  {
    type: 'technology',
    pattern:
      /\b(?:react|vue|svelte|angular|typescript|javascript|node\.?js|python|rust|go|docker|kubernetes|postgres|sqlite|redis|tailwind|css|html|graphql|rest|grpc|vitest|jest|mocha|playwright|cypress)\b/gi,
    confidence: 0.85,
  },
  // Patterns: kebab-case compound terms that look like patterns
  { type: 'pattern', pattern: /\b[a-z]+-[a-z]+(?:-[a-z]+)*\b/g, confidence: 0.5 },
];

// Words to ignore when extracting patterns
const STOP_PATTERNS = new Set([
  'e-mail',
  'real-time',
  'built-in',
  'up-to-date',
  'well-known',
  'open-source',
  'third-party',
  'cross-platform',
  'end-to-end',
  'out-of-the-box',
]);

// ─── Scoring Constants (tunable) ────────────────────────────────────

/** Confidence thresholds for discrete levels. */
const HIGH_CONFIDENCE = 0.75;
const MEDIUM_CONFIDENCE = 0.45;

/** Weights for knowledge item multi-signal scoring. */
const KNOWLEDGE_WEIGHTS = {
  /** Base FTS/vector score weight. */
  baseScore: 0.4,
  /** Title keyword overlap weight. */
  titleMatch: 0.25,
  /** Tag overlap weight. */
  tagOverlap: 0.2,
  /** Intent/domain alignment weight. */
  intentBoost: 0.15,
};

/** Weights for confidence computation. */
const CONFIDENCE_WEIGHTS = {
  entitySignalPerEntity: 0.08,
  entitySignalMax: 0.4,
  actionSignal: 0.2,
  knowledgeSignalMultiplier: 0.3,
  sourceDiversityPerExtra: 0.05,
  sourceDiversityMax: 0.1,
};

// ─── Class ──────────────────────────────────────────────────────────

export class ContextEngine {
  private vault: Vault;
  private brain: Brain;
  private brainIntelligence: BrainIntelligence;
  private config: Required<ContextEngineConfig>;

  constructor(
    vault: Vault,
    brain: Brain,
    brainIntelligence: BrainIntelligence,
    config?: ContextEngineConfig,
  ) {
    this.vault = vault;
    this.brain = brain;
    this.brainIntelligence = brainIntelligence;
    this.config = {
      vaultSearchLimit: config?.vaultSearchLimit ?? 10,
      cogneeSearchLimit: config?.cogneeSearchLimit ?? 10,
      brainRecommendLimit: config?.brainRecommendLimit ?? 5,
      minScoreThreshold: config?.minScoreThreshold ?? 0.1,
    };
  }

  // ─── Entity Extraction ──────────────────────────────────────────

  extractEntities(prompt: string): EntityExtractionResult {
    const seen = new Set<string>();
    const entities: ExtractedEntity[] = [];

    for (const { type, pattern, confidence } of ENTITY_PATTERNS) {
      // Reset lastIndex for global regex
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(prompt)) !== null) {
        const value = match[0].toLowerCase();
        const key = `${type}:${value}`;
        if (seen.has(key)) continue;
        if (type === 'pattern' && STOP_PATTERNS.has(value)) continue;
        seen.add(key);
        entities.push({
          type,
          value,
          confidence,
          start: match.index,
          end: match.index + match[0].length,
        });
      }
    }

    // Group by type
    const byType: Partial<Record<EntityType, ExtractedEntity[]>> = {};
    for (const e of entities) {
      (byType[e.type] ??= []).push(e);
    }

    return { entities, byType };
  }

  // ─── Knowledge Retrieval ────────────────────────────────────────

  async retrieveKnowledge(prompt: string, domain?: string): Promise<KnowledgeRetrievalResult> {
    const items: KnowledgeItem[] = [];
    let vaultHits = 0;
    let brainHits = 0;

    // 1. Vault FTS search
    try {
      const vaultResults = this.vault.search(prompt, {
        domain,
        limit: this.config.vaultSearchLimit,
      });
      // Normalize FTS5 -rank scores to 0-1 range, then apply multi-signal scoring
      const maxScore = vaultResults.length > 0 ? Math.max(...vaultResults.map((r) => r.score)) : 1;
      const promptTokens = new Set(
        prompt
          .toLowerCase()
          .split(/\s+/)
          .filter((t) => t.length >= 3),
      );
      for (const r of vaultResults) {
        const baseScore = maxScore > 0 ? r.score / maxScore : 0.5;
        const enrichedScore = scoreKnowledgeItem(
          baseScore,
          r.entry.title,
          r.entry.tags,
          promptTokens,
          domain,
          r.entry.domain,
        );
        items.push({
          id: r.entry.id,
          title: r.entry.title,
          score: enrichedScore,
          source: 'vault',
          domain: r.entry.domain,
          tags: r.entry.tags,
        });
        vaultHits++;
      }
    } catch {
      // Vault search failed — continue with other sources
    }

    // 2. Brain recommendations
    try {
      const recommendations = this.brainIntelligence.recommend({
        domain,
        task: prompt,
        limit: this.config.brainRecommendLimit,
      });
      for (const r of recommendations) {
        items.push({
          id: r.pattern,
          title: r.pattern,
          score: r.strength / 100,
          source: 'brain',
          domain: r.domain,
        });
        brainHits++;
      }
    } catch {
      // Brain empty — continue without
    }

    // Sort by score descending, filter by threshold
    items.sort((a, b) => b.score - a.score);
    const filtered = items.filter((i) => i.score >= this.config.minScoreThreshold);

    return { items: filtered, vaultHits, cogneeHits: 0, brainHits };
  }

  // ─── Context Analysis ───────────────────────────────────────────

  async analyze(prompt: string, domain?: string): Promise<ContextAnalysis> {
    const start = performance.now();

    // Extract entities
    const entities = this.extractEntities(prompt);

    // Retrieve knowledge
    const knowledge = await this.retrieveKnowledge(prompt, domain);

    // Compute confidence from multiple signals
    const confidence = this.computeConfidence(entities, knowledge);
    const confidenceLevel = this.toConfidenceLevel(confidence);

    // Detect domains from entities + knowledge
    const detectedDomains = this.detectDomains(entities, knowledge);

    const processingTimeMs = Math.round(performance.now() - start);

    return {
      prompt,
      entities,
      knowledge,
      confidence,
      confidenceLevel,
      detectedDomains,
      processingTimeMs,
    };
  }

  // ─── Private Helpers ────────────────────────────────────────────

  private computeConfidence(
    entities: EntityExtractionResult,
    knowledge: KnowledgeRetrievalResult,
  ): number {
    let score = 0;

    // Entity signal: more entities = clearer prompt
    const entityCount = entities.entities.length;
    score += Math.min(
      CONFIDENCE_WEIGHTS.entitySignalMax,
      entityCount * CONFIDENCE_WEIGHTS.entitySignalPerEntity,
    );

    // Action signal: explicit actions boost confidence
    const actions = entities.byType.action ?? [];
    if (actions.length > 0) score += CONFIDENCE_WEIGHTS.actionSignal;

    // Knowledge signal: relevant knowledge found
    if (knowledge.items.length > 0) {
      score += knowledge.items[0].score * CONFIDENCE_WEIGHTS.knowledgeSignalMultiplier;
    }

    // Source diversity bonus: multiple sources = more confident
    const sources = new Set(knowledge.items.map((i) => i.source));
    const diversityBonus = Math.min(
      CONFIDENCE_WEIGHTS.sourceDiversityMax,
      Math.max(0, sources.size - 1) * CONFIDENCE_WEIGHTS.sourceDiversityPerExtra,
    );
    score += diversityBonus;

    return Math.min(1, score);
  }

  private toConfidenceLevel(confidence: number): ConfidenceLevel {
    if (confidence >= HIGH_CONFIDENCE) return 'high';
    if (confidence >= MEDIUM_CONFIDENCE) return 'medium';
    return 'low';
  }

  private detectDomains(
    entities: EntityExtractionResult,
    knowledge: KnowledgeRetrievalResult,
  ): string[] {
    const domains = new Set<string>();

    // From entity extraction
    for (const e of entities.byType.domain ?? []) {
      domains.add(e.value);
    }

    // From knowledge results
    for (const item of knowledge.items) {
      if (item.domain) domains.add(item.domain);
    }

    return [...domains];
  }
}

// ─── Multi-Signal Knowledge Scoring ─────────────────────────────────

/**
 * Score a knowledge item using multiple signals:
 * - baseScore: FTS5 rank or vector similarity (0-1)
 * - titleMatch: keyword overlap between prompt and entry title
 * - tagOverlap: how many prompt tokens appear in entry tags
 * - intentBoost: domain alignment between query domain and entry domain
 */
function scoreKnowledgeItem(
  baseScore: number,
  title: string,
  tags: string[],
  promptTokens: Set<string>,
  queryDomain: string | undefined,
  entryDomain: string | undefined,
): number {
  // Title match: fraction of prompt tokens found in title
  const titleTokens = new Set(
    title
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 3),
  );
  let titleOverlap = 0;
  for (const t of promptTokens) {
    if (titleTokens.has(t)) titleOverlap++;
  }
  const titleMatch = promptTokens.size > 0 ? titleOverlap / promptTokens.size : 0;

  // Tag overlap: fraction of tags that match prompt tokens
  const lowerTags = tags.map((t) => t.toLowerCase());
  let tagHits = 0;
  for (const tag of lowerTags) {
    if (promptTokens.has(tag)) tagHits++;
  }
  const tagOverlap = lowerTags.length > 0 ? tagHits / lowerTags.length : 0;

  // Intent boost: 1.0 if domains match, 0.0 otherwise
  const intentBoost = queryDomain && entryDomain && queryDomain === entryDomain ? 1.0 : 0.0;

  return Math.min(
    1.0,
    baseScore * KNOWLEDGE_WEIGHTS.baseScore +
      titleMatch * KNOWLEDGE_WEIGHTS.titleMatch +
      tagOverlap * KNOWLEDGE_WEIGHTS.tagOverlap +
      intentBoost * KNOWLEDGE_WEIGHTS.intentBoost,
  );
}
