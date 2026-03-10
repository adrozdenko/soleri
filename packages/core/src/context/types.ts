/**
 * Context Engine types — entity extraction, knowledge retrieval, confidence scoring.
 */

// ─── Entity Extraction ─────────────────────────────────────────────

export type EntityType = 'file' | 'function' | 'domain' | 'action' | 'pattern' | 'technology';

export interface ExtractedEntity {
  type: EntityType;
  value: string;
  confidence: number;
}

export interface EntityExtractionResult {
  entities: ExtractedEntity[];
  byType: Partial<Record<EntityType, ExtractedEntity[]>>;
}

// ─── Knowledge Retrieval ────────────────────────────────────────────

export interface KnowledgeItem {
  id: string;
  title: string;
  score: number;
  source: 'vault' | 'cognee' | 'brain';
  domain?: string;
}

export interface KnowledgeRetrievalResult {
  items: KnowledgeItem[];
  vaultHits: number;
  cogneeHits: number;
  brainHits: number;
}

// ─── Context Analysis ───────────────────────────────────────────────

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ContextAnalysis {
  /** Original prompt that was analyzed */
  prompt: string;
  /** Extracted entities from the prompt */
  entities: EntityExtractionResult;
  /** Retrieved knowledge relevant to the prompt */
  knowledge: KnowledgeRetrievalResult;
  /** Enhanced confidence based on entity + knowledge signals */
  confidence: number;
  /** Discrete confidence level */
  confidenceLevel: ConfidenceLevel;
  /** Domains detected from entities + knowledge */
  detectedDomains: string[];
  /** Processing time in milliseconds */
  processingTimeMs: number;
}

// ─── Configuration ──────────────────────────────────────────────────

export interface ContextEngineConfig {
  /** Max vault search results to retrieve. Default: 10. */
  vaultSearchLimit?: number;
  /** Max Cognee search results to retrieve. Default: 10. */
  cogneeSearchLimit?: number;
  /** Max brain recommendations to include. Default: 5. */
  brainRecommendLimit?: number;
  /** Minimum score threshold for knowledge items. Default: 0.1. */
  minScoreThreshold?: number;
}
