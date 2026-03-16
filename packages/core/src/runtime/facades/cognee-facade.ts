/**
 * Cognee facade — knowledge graph ops.
 * Cognee search, sync, export, graph stats.
 */

import { z } from 'zod';
import type { OpDefinition } from '../../facades/types.js';
import type { IntelligenceEntry } from '../../intelligence/types.js';
import type { AgentRuntime } from '../types.js';
import type { CogneeSearchType } from '../../cognee/types.js';
import { createCogneeSyncOps } from '../cognee-sync-ops.js';

export function createCogneeFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  // Only called when runtime.cognee is non-null (guarded in createSemanticFacades)
  const cognee = runtime.cognee!;
  const { vault, syncManager } = runtime;

  return [
    // ─── Cognee (inline from core-ops.ts) ───────────────────────
    {
      name: 'cognee_status',
      description:
        'Cognee vector search health — availability, URL, latency. Checks the Cognee API endpoint.',
      auth: 'read',
      handler: async () => {
        return cognee.healthCheck();
      },
    },
    {
      name: 'cognee_search',
      description:
        'Vector similarity search via Cognee. Complements TF-IDF vault search with semantic understanding.',
      auth: 'read',
      schema: z.object({
        query: z.string(),
        searchType: z
          .enum([
            'SUMMARIES',
            'CHUNKS',
            'RAG_COMPLETION',
            'TRIPLET_COMPLETION',
            'GRAPH_COMPLETION',
            'GRAPH_SUMMARY_COMPLETION',
            'NATURAL_LANGUAGE',
            'GRAPH_COMPLETION_COT',
            'FEELING_LUCKY',
            'CHUNKS_LEXICAL',
          ])
          .optional()
          .describe('Cognee search type. Default CHUNKS (pure vector similarity).'),
        limit: z.number().optional(),
      }),
      handler: async (params) => {
        return cognee.search(params.query as string, {
          searchType: params.searchType as CogneeSearchType | undefined,
          limit: (params.limit as number) ?? 10,
        });
      },
    },
    {
      name: 'cognee_add',
      description:
        'Ingest vault entries into Cognee for vector indexing. Auto-schedules cognify after ingest.',
      auth: 'write',
      schema: z.object({
        entryIds: z.array(z.string()).describe('Vault entry IDs to ingest into Cognee.'),
      }),
      handler: async (params) => {
        const ids = params.entryIds as string[];
        const entries = ids
          .map((id) => vault.get(id))
          .filter((e): e is IntelligenceEntry => e !== null && e !== undefined);
        if (entries.length === 0) return { added: 0, error: 'No matching vault entries found' };
        return cognee.addEntries(entries);
      },
    },
    {
      name: 'cognee_cognify',
      description:
        'Trigger Cognee knowledge graph processing on the vault dataset. Usually auto-scheduled after add.',
      auth: 'write',
      handler: async () => {
        return cognee.cognify();
      },
    },
    {
      name: 'cognee_config',
      description: 'Get current Cognee client configuration and cached health status.',
      auth: 'read',
      handler: async () => {
        return { config: cognee.getConfig(), cachedStatus: cognee.getStatus() };
      },
    },
    // ─── Cognee Graph ────────────────────────────────────────────
    {
      name: 'cognee_get_node',
      description: 'Get a specific Cognee graph node by UUID with all properties and connections.',
      auth: 'read',
      schema: z.object({
        nodeId: z.string().describe('UUID of the graph node'),
      }),
      handler: async (params) => {
        try {
          const results = await cognee.search(params.nodeId as string, {
            searchType: 'GRAPH_COMPLETION' as CogneeSearchType,
            limit: 1,
          });
          if (!results || (Array.isArray(results) && results.length === 0)) {
            return { found: false, nodeId: params.nodeId };
          }
          return {
            found: true,
            nodeId: params.nodeId,
            node: Array.isArray(results) ? results[0] : results,
          };
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },
    {
      name: 'cognee_graph_stats',
      description:
        'Cognee graph statistics — availability, endpoint, latency from last health check.',
      auth: 'read',
      handler: async () => {
        try {
          const status = cognee.getStatus();
          const health = await cognee.healthCheck();
          return {
            available: status?.available ?? false,
            url: status?.url ?? cognee.getConfig().baseUrl,
            latencyMs: status?.latencyMs ?? health.latencyMs ?? null,
            error: status?.error ?? health.error ?? null,
          };
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },
    {
      name: 'cognee_export_status',
      description: 'Check Cognee dataset and processing status — availability, pending operations.',
      auth: 'read',
      handler: async () => {
        try {
          const status = cognee.getStatus();
          const config = cognee.getConfig();
          return {
            available: status?.available ?? false,
            dataset: config.dataset ?? 'default',
            pendingCognify: false,
            url: status?.url ?? config.baseUrl,
          };
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },

    // ─── Satellite ops ───────────────────────────────────────────
    ...createCogneeSyncOps(syncManager),
  ];
}
