/**
 * Voyage AI Embedding Provider — generates dense vector embeddings via the
 * Voyage AI embeddings API. Supports key pool rotation and batch chunking.
 */

import type { EmbeddingProvider, EmbeddingResult, EmbeddingConfig } from './types.js';
import type { KeyPool } from '../llm/key-pool.js';
import { LLMError } from '../llm/types.js';
import { retry } from '../llm/utils.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_MODEL = 'voyage-3.5';
const DEFAULT_DIMENSIONS = 1024;
const DEFAULT_BATCH_SIZE = 128;
const DEFAULT_BASE_URL = 'https://api.voyageai.com';
const REQUEST_TIMEOUT_MS = 60_000;

// =============================================================================
// RESPONSE TYPES
// =============================================================================

interface VoyageEmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
  usage: { total_tokens: number };
  model: string;
}

// =============================================================================
// PROVIDER
// =============================================================================

/**
 * Embedding provider that calls the Voyage AI `/v1/embeddings` endpoint.
 *
 * Supports optional {@link KeyPool} for key rotation — on 429 responses the
 * pool is rotated so the next call uses a fresh key. If no pool is provided,
 * falls back to `config.apiKey`.
 *
 * The `inputType` parameter is Voyage-specific and controls how the API
 * optimizes embeddings: use `'document'` when embedding vault entries for
 * storage (default), and `'query'` when embedding search queries.
 */
export class VoyageEmbeddingProvider implements EmbeddingProvider {
  readonly providerName = 'voyage';
  readonly model: string;
  readonly dimensions: number;

  private readonly apiUrl: string;
  private readonly batchSize: number;
  private readonly apiKey?: string;
  private readonly keyPool?: KeyPool;
  private readonly inputType: 'document' | 'query';

  constructor(config: EmbeddingConfig, keyPool?: KeyPool) {
    this.model = config.model || DEFAULT_MODEL;
    this.dimensions = DEFAULT_DIMENSIONS;
    this.batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE;
    this.apiKey = config.apiKey;
    this.keyPool = keyPool;
    this.inputType = config.inputType ?? 'document';

    const baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.apiUrl = `${baseUrl}/v1/embeddings`;

    if (!this.keyPool?.hasKeys && !this.apiKey) {
      throw new LLMError(
        'Voyage embedding provider requires an API key — provide config.apiKey or a KeyPool with keys',
        { retryable: false },
      );
    }
  }

  /**
   * Embed one or more texts, returning one vector per input text.
   * Automatically chunks requests that exceed {@link batchSize}.
   */
  async embed(
    texts: string[],
    opts?: { inputType?: 'document' | 'query' },
  ): Promise<EmbeddingResult> {
    if (texts.length === 0) {
      return { vectors: [], tokensUsed: 0, model: this.model };
    }

    const resolvedInputType = opts?.inputType ?? this.inputType;

    // Single batch — no chunking needed
    if (texts.length <= this.batchSize) {
      return this.callApi(texts, resolvedInputType);
    }

    // Chunk into batches and concatenate results
    const allVectors: number[][] = [];
    let totalTokens = 0;

    for (let offset = 0; offset < texts.length; offset += this.batchSize) {
      const chunk = texts.slice(offset, offset + this.batchSize);
      // oxlint-disable-next-line eslint(no-await-in-loop)
      const result = await this.callApi(chunk, resolvedInputType);
      allVectors.push(...result.vectors);
      totalTokens += result.tokensUsed;
    }

    return { vectors: allVectors, tokensUsed: totalTokens, model: this.model };
  }

  // ===========================================================================
  // INTERNALS
  // ===========================================================================

  private resolveApiKey(): string {
    if (this.keyPool?.hasKeys) {
      return this.keyPool.getActiveKey().expose();
    }
    if (this.apiKey) {
      return this.apiKey;
    }
    throw new LLMError('No API key available for Voyage embeddings', { retryable: false });
  }

  private async callApi(
    texts: string[],
    inputType: 'document' | 'query',
  ): Promise<EmbeddingResult> {
    const doRequest = async (): Promise<EmbeddingResult> => {
      const apiKey = this.resolveApiKey();

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: texts,
          input_type: inputType,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        // Rotate key on rate limit
        if (response.status === 429 && this.keyPool && this.keyPool.poolSize > 1) {
          this.keyPool.rotateOnError();
        }

        const errorBody = await response.text();
        throw new LLMError(`Voyage Embeddings API error: ${response.status} - ${errorBody}`, {
          retryable: response.status === 429 || response.status >= 500,
          statusCode: response.status,
        });
      }

      const data = (await response.json()) as VoyageEmbeddingResponse;

      // Sort by index defensively
      const sorted = [...data.data].sort((a, b) => a.index - b.index);
      const vectors = sorted.map((d) => d.embedding);

      return {
        vectors,
        tokensUsed: data.usage?.total_tokens ?? 0,
        model: this.model,
      };
    };

    return retry(doRequest, { maxAttempts: 3 });
  }
}
