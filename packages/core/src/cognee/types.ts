// ─── Cognee Integration Types ──────────────────────────────────────

export interface CogneeConfig {
  /** Base URL of the Cognee API (default: http://localhost:8000) */
  baseUrl: string;
  /** Dataset name for this agent's vault entries */
  dataset: string;
  /** Bearer token for Cognee API authentication (auto-acquired if not set) */
  apiToken?: string;
  /** Service account email for auto-login (default: soleri-agent@cognee.dev) */
  serviceEmail?: string;
  /** Service account password for auto-login */
  servicePassword?: string;
  /** Default request timeout in milliseconds (default: 30000) */
  timeoutMs: number;
  /** Search timeout in milliseconds — Ollama cold start can take 90s (default: 120000) */
  searchTimeoutMs: number;
  /** Health check timeout in milliseconds (default: 5000) */
  healthTimeoutMs: number;
  /** Health check cache TTL in milliseconds (default: 60000) */
  healthCacheTtlMs: number;
  /** Cognify debounce window in milliseconds (default: 30000) */
  cognifyDebounceMs: number;
}

export interface CogneeSearchResult {
  /** Vault entry ID (cross-reference key) */
  id: string;
  /** Relevance score (0–1). Position-based when Cognee omits scores. */
  score: number;
  /** Text content from Cognee */
  text: string;
  /** Cognee search type that produced this result */
  searchType: CogneeSearchType;
}

export type CogneeSearchType =
  | 'SUMMARIES'
  | 'CHUNKS'
  | 'RAG_COMPLETION'
  | 'TRIPLET_COMPLETION'
  | 'GRAPH_COMPLETION'
  | 'GRAPH_SUMMARY_COMPLETION'
  | 'NATURAL_LANGUAGE'
  | 'GRAPH_COMPLETION_COT'
  | 'FEELING_LUCKY'
  | 'CHUNKS_LEXICAL';

export interface CogneeStatus {
  available: boolean;
  url: string;
  latencyMs: number;
  error?: string;
}

export interface CogneeAddResult {
  added: number;
}

export interface CogneeCognifyResult {
  status: string;
}
