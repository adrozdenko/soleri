/**
 * Context Engine — entity extraction, knowledge retrieval, and confidence scoring.
 *
 * Orchestrates three signals to enrich intent classification:
 * 1. Entity extraction (regex-based, domain-agnostic)
 * 2. Knowledge retrieval (vault FTS + Cognee vector + brain recommendations)
 * 3. Confidence scoring (combines entity + knowledge signals)
 *
 * Graceful degradation: if Cognee is unavailable, vault-only.
 * If vault is empty, keyword confidence from IntentRouter is unchanged.
 */

import type { Vault } from '../vault/vault.js';
import type { Brain } from '../brain/brain.js';
import type { BrainIntelligence } from '../brain/intelligence.js';
import type { CogneeClient } from '../cognee/client.js';
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
      /\b(?:react|vue|svelte|angular|typescript|javascript|node\.?js|python|rust|go|docker|kubernetes|postgres|sqlite|redis|tailwind|css|html|graphql|rest|grpc)\b/gi,
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

// ─── Confidence Thresholds ──────────────────────────────────────────

const HIGH_CONFIDENCE = 0.75;
const MEDIUM_CONFIDENCE = 0.45;

// ─── Class ──────────────────────────────────────────────────────────

export class ContextEngine {
  private vault: Vault;
  private brain: Brain;
  private brainIntelligence: BrainIntelligence;
  private cognee: CogneeClient | null;
  private config: Required<ContextEngineConfig>;

  constructor(
    vault: Vault,
    brain: Brain,
    brainIntelligence: BrainIntelligence,
    cognee: CogneeClient | null,
    config?: ContextEngineConfig,
  ) {
    this.vault = vault;
    this.brain = brain;
    this.brainIntelligence = brainIntelligence;
    this.cognee = cognee;
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
        entities.push({ type, value, confidence });
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
    let cogneeHits = 0;
    let brainHits = 0;

    // 1. Vault FTS search
    try {
      const vaultResults = this.vault.search(prompt, {
        domain,
        limit: this.config.vaultSearchLimit,
      });
      // Normalize FTS5 -rank scores to 0-1 range
      const maxScore = vaultResults.length > 0 ? Math.max(...vaultResults.map((r) => r.score)) : 1;
      for (const r of vaultResults) {
        items.push({
          id: r.entry.id,
          title: r.entry.title,
          score: maxScore > 0 ? r.score / maxScore : 0.5,
          source: 'vault',
          domain: r.entry.domain,
        });
        vaultHits++;
      }
    } catch {
      // Vault search failed — continue with other sources
    }

    // 2. Cognee vector search (async, graceful degradation)
    if (this.cognee) {
      try {
        const cogneeResults = await this.cognee.search(prompt, {
          limit: this.config.cogneeSearchLimit,
        });
        for (const r of cogneeResults) {
          // Avoid duplicates from vault
          if (items.some((i) => i.id === r.id)) continue;
          items.push({
            id: r.id,
            title: r.text.slice(0, 100),
            score: r.score,
            source: 'cognee',
          });
          cogneeHits++;
        }
      } catch {
        // Cognee unavailable — continue without
      }
    }

    // 3. Brain recommendations
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

    return { items: filtered, vaultHits, cogneeHits, brainHits };
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

    // Entity signal (0-0.4): more entities = clearer prompt
    const entityCount = entities.entities.length;
    const entitySignal = Math.min(0.4, entityCount * 0.08);
    score += entitySignal;

    // Action signal (0-0.2): explicit actions boost confidence
    const actions = entities.byType.action ?? [];
    if (actions.length > 0) score += 0.2;

    // Knowledge signal (0-0.3): relevant knowledge found
    if (knowledge.items.length > 0) {
      const topScore = knowledge.items[0].score;
      score += topScore * 0.3;
    }

    // Source diversity bonus (0-0.1): multiple sources = more confident
    const sources = new Set(knowledge.items.map((i) => i.source));
    if (sources.size >= 2) score += 0.05;
    if (sources.size >= 3) score += 0.05;

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
