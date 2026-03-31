/**
 * Embedding pipeline — batch and incremental embedding of vault entries.
 */
import type { EmbeddingProvider } from './types.js';
import type { PersistenceProvider } from '../persistence/types.js';
import { storeVector, getVector, getEntriesWithoutVectors } from '../vault/vault-entries.js';

export interface BatchEmbedOptions {
  /** Number of entries per API call (default 100). */
  batchSize?: number;
  /** Called after each batch with (completed, total). */
  onProgress?: (completed: number, total: number) => void;
}

export interface BatchEmbedResult {
  embedded: number;
  skipped: number;
  failed: number;
  tokensUsed: number;
}

export class EmbeddingPipeline {
  constructor(
    private provider: EmbeddingProvider,
    private persistence: PersistenceProvider,
  ) {}

  /**
   * Batch embed all entries missing vectors for the current model.
   * Processes in chunks; skips entries that already have vectors.
   * On batch failure, logs and continues with the next batch.
   */
  async batchEmbed(options?: BatchEmbedOptions): Promise<BatchEmbedResult> {
    const batchSize = options?.batchSize ?? 100;
    const onProgress = options?.onProgress;

    const missingIds = getEntriesWithoutVectors(this.persistence, this.provider.model);
    if (missingIds.length === 0) {
      return { embedded: 0, skipped: 0, failed: 0, tokensUsed: 0 };
    }

    let embedded = 0;
    let failed = 0;
    let tokensUsed = 0;

    for (let i = 0; i < missingIds.length; i += batchSize) {
      const batchIds = missingIds.slice(i, i + batchSize);

      // Load entries for this batch
      const placeholders = batchIds.map(() => '?').join(',');
      const rows = this.persistence.all<{
        id: string;
        title: string;
        description: string;
        context: string;
      }>(
        `SELECT id, title, description, context FROM entries WHERE id IN (${placeholders})`,
        batchIds,
      );

      if (rows.length === 0) continue;

      const texts = rows.map((r) => this.getEmbeddableText(r));

      try {
        const result = await this.provider.embed(texts);
        for (let j = 0; j < rows.length; j++) {
          storeVector(
            this.persistence,
            rows[j].id,
            result.vectors[j],
            this.provider.model,
            this.provider.dimensions,
          );
          embedded++;
        }
        tokensUsed += result.tokensUsed;
      } catch (err) {
        // Log and continue — don't abort entire pipeline for one bad batch
        console.error(`[EmbeddingPipeline] batch failed (offset ${i}):`, err);
        failed += batchIds.length;
      }

      onProgress?.(embedded + failed, missingIds.length);
    }

    return {
      embedded,
      skipped: 0,
      failed,
      tokensUsed,
    };
  }

  /**
   * Embed a single entry and store its vector.
   * Returns true if embedded, false if skipped (vector already exists).
   */
  async embedEntry(entryId: string, text: string): Promise<boolean> {
    const existing = getVector(this.persistence, entryId);
    if (existing && existing.model === this.provider.model) return false;

    const result = await this.provider.embed([text]);
    storeVector(
      this.persistence,
      entryId,
      result.vectors[0],
      this.provider.model,
      this.provider.dimensions,
    );
    return true;
  }

  /** Build the text to embed for a vault entry. */
  private getEmbeddableText(entry: {
    title?: string;
    description?: string;
    context?: string;
  }): string {
    const parts: string[] = [];
    if (entry.title) parts.push(entry.title);
    if (entry.description) parts.push(entry.description);
    if (entry.context) parts.push(entry.context);
    return parts.join('\n');
  }
}
