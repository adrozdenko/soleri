/**
 * Embedding Ops — embed_status, embed_rebuild, embed_entry.
 *
 * Covers:
 * - Embedding statistics and health
 * - Batch rebuild of missing vectors
 * - Single-entry embedding
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from './types.js';
import { getEntriesWithoutVectors } from '../vault/vault-entries.js';

export function createEmbeddingOps(runtime: AgentRuntime): OpDefinition[] {
  const { vault, flags, embeddingProvider, embeddingPipeline } = runtime;

  return [
    {
      name: 'embed_status',
      description:
        'Get embedding subsystem status — provider info, vector counts, token usage. Returns { enabled: false } when embeddings are not configured.',
      auth: 'read' as const,
      handler: async () => {
        if (!embeddingProvider || !flags.isEnabled('embedding-enabled')) {
          return {
            enabled: false,
            reason: !flags.isEnabled('embedding-enabled')
              ? 'feature flag embedding-enabled is off'
              : 'no embedding config',
          };
        }

        const persistence = vault.getProvider();
        const model = embeddingProvider.model;
        const missingIds = getEntriesWithoutVectors(persistence, model);

        const embeddedRow = persistence.get<{ count: number }>(
          'SELECT COUNT(*) as count FROM entry_vectors WHERE model = ?',
          [model],
        );
        const totalEmbedded = embeddedRow?.count ?? 0;

        const tokensRow = persistence.get<{ total: number }>(
          `SELECT COALESCE(SUM(1), 0) as total FROM entry_vectors`,
          [],
        );

        return {
          enabled: true,
          provider: embeddingProvider.providerName,
          model: embeddingProvider.model,
          dimensions: embeddingProvider.dimensions,
          totalEmbedded,
          totalMissing: missingIds.length,
          // Token tracking is per-call in pipeline — we report what we can from the DB
          totalTokensUsed: tokensRow?.total ?? 0,
        };
      },
    },
    {
      name: 'embed_rebuild',
      description:
        'Trigger batch embedding of all vault entries missing vectors. Returns counts of embedded, skipped, failed entries and tokens used.',
      auth: 'write' as const,
      handler: async () => {
        if (!embeddingPipeline || !flags.isEnabled('embedding-enabled')) {
          return {
            enabled: false,
            reason: !flags.isEnabled('embedding-enabled')
              ? 'feature flag embedding-enabled is off'
              : 'no embedding pipeline configured',
          };
        }

        const result = await embeddingPipeline.batchEmbed();
        return {
          enabled: true,
          embedded: result.embedded,
          skipped: result.skipped,
          failed: result.failed,
          tokensUsed: result.tokensUsed,
        };
      },
    },
    {
      name: 'embed_entry',
      description:
        'Embed a single vault entry by ID. Returns { embedded: true } if a new vector was created, { embedded: false } if already up to date.',
      auth: 'write' as const,
      schema: z.object({
        entryId: z.string().describe('Vault entry ID to embed'),
      }),
      handler: async (params) => {
        if (!embeddingPipeline || !flags.isEnabled('embedding-enabled')) {
          return {
            enabled: false,
            reason: !flags.isEnabled('embedding-enabled')
              ? 'feature flag embedding-enabled is off'
              : 'no embedding pipeline configured',
          };
        }

        const entryId = params.entryId as string;
        const entry = vault.get(entryId);
        if (!entry) {
          return { embedded: false, error: `Entry "${entryId}" not found` };
        }

        const text = [entry.title, entry.description, entry.context].filter(Boolean).join('\n');
        const embedded = await embeddingPipeline.embedEntry(entryId, text);
        return { embedded };
      },
    },
  ];
}
