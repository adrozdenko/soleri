/**
 * Extra curator operations — 4 ops that extend the 8 base curator ops in core-ops.ts.
 *
 * Groups: entry history (2), queue stats (1), metadata enrichment (1).
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from './types.js';

export function createCuratorExtraOps(runtime: AgentRuntime): OpDefinition[] {
  const { curator } = runtime;

  return [
    // ─── Entry History ──────────────────────────────────────────────
    {
      name: 'curator_entry_history',
      description: 'Get version history (snapshots) for a vault entry.',
      auth: 'read',
      schema: z.object({
        entryId: z.string().describe('Entry ID to get history for.'),
      }),
      handler: async (params) => {
        const history = curator.getVersionHistory(params.entryId as string);
        return { entryId: params.entryId, history, count: history.length };
      },
    },
    {
      name: 'curator_record_snapshot',
      description: 'Manually record a snapshot of an entry\'s current state.',
      auth: 'write',
      schema: z.object({
        entryId: z.string().describe('Entry ID to snapshot.'),
        changedBy: z.string().optional().describe('Who made the change. Default "system".'),
        changeReason: z.string().optional().describe('Why the snapshot was recorded.'),
      }),
      handler: async (params) => {
        return curator.recordSnapshot(
          params.entryId as string,
          params.changedBy as string | undefined,
          params.changeReason as string | undefined,
        );
      },
    },

    // ─── Queue Stats ────────────────────────────────────────────────
    {
      name: 'curator_queue_stats',
      description:
        'Grooming queue statistics — total, groomed, ungroomed, stale (30+ days), fresh (7 days), average days since groom.',
      auth: 'read',
      handler: async () => {
        return curator.getQueueStats();
      },
    },

    // ─── Metadata Enrichment ────────────────────────────────────────
    {
      name: 'curator_enrich',
      description:
        'Rule-based metadata enrichment — auto-capitalize title, normalize tags, infer severity/type from keywords, trim description.',
      auth: 'write',
      schema: z.object({
        entryId: z.string().describe('Entry ID to enrich.'),
      }),
      handler: async (params) => {
        return curator.enrichMetadata(params.entryId as string);
      },
    },
  ];
}
