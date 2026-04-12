// ─── Embedding Types ─────────────────────────────────────────────

/** Result of an embedding call — vectors plus metadata. */
export interface EmbeddingResult {
  /** One vector per input text, each vector is number[] of length = dimensions. */
  vectors: number[][];
  /** Total tokens consumed by this call. */
  tokensUsed: number;
  /** Model that produced these embeddings. */
  model: string;
}

/** Provider-agnostic interface for generating dense vector embeddings. */
export interface EmbeddingProvider {
  /** Provider name (e.g. 'openai', 'ollama'). */
  readonly providerName: string;
  /** Model identifier (e.g. 'text-embedding-3-small'). */
  readonly model: string;
  /** Vector dimensions produced by this model. */
  readonly dimensions: number;
  /** Embed one or more texts, returning one vector per text. */
  embed(texts: string[], opts?: { inputType?: 'document' | 'query' }): Promise<EmbeddingResult>;
}

/** Configuration for initializing an embedding provider. */
export interface EmbeddingConfig {
  /** Which provider to use: 'openai' | 'ollama' | string. */
  provider: string;
  /** Model to use for embeddings. */
  model: string;
  /** Optional API key override (otherwise uses KeyPool). */
  apiKey?: string;
  /** Optional base URL override (for self-hosted or proxy). */
  baseUrl?: string;
  /** Max texts per batch API call (provider-specific default if omitted). */
  batchSize?: number;
  /** Input type hint for providers that support it (e.g. Voyage AI). */
  inputType?: 'document' | 'query';
}

/** A persisted embedding vector tied to a vault entry. */
export interface StoredVector {
  /** Vault entry ID this vector belongs to. */
  entryId: string;
  /** The embedding vector. */
  vector: number[];
  /** Model that produced this vector. */
  model: string;
  /** Number of dimensions in the vector. */
  dimensions: number;
  /** Unix timestamp (ms) when this vector was created. */
  createdAt: number;
}

/** Aggregate statistics for the embedding subsystem. */
export interface EmbeddingStats {
  /** Active provider name. */
  provider: string;
  /** Active model name. */
  model: string;
  /** Vector dimensions for the active model. */
  dimensions: number;
  /** Number of entries with embeddings. */
  totalEmbedded: number;
  /** Number of entries missing embeddings. */
  totalMissing: number;
  /** Cumulative tokens consumed across all embedding calls. */
  totalTokensUsed: number;
}
