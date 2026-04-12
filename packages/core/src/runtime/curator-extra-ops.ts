/**
 * Extra curator operations — 8 ops that extend the 8 base curator ops in core-ops.ts.
 *
 * Groups: entry history (2), queue stats (1), metadata enrichment (1), hybrid detection (1),
 *         pipeline status (1), schedule start (1), schedule stop (1).
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from './types.js';

export function createCuratorExtraOps(runtime: AgentRuntime): OpDefinition[] {
  const { curator, jobQueue, pipelineRunner, shutdownRegistry } = runtime;
  let consolidationInterval: ReturnType<typeof setInterval> | null = null;

  // Register cleanup for any consolidation interval started during this session
  shutdownRegistry.register('curatorConsolidation', () => {
    if (consolidationInterval) {
      clearInterval(consolidationInterval);
      consolidationInterval = null;
    }
    pipelineRunner.stop();
  });

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
      description: "Manually record a snapshot of an entry's current state.",
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

    // ─── Hybrid Contradiction Detection (#36) ────────────────────────
    {
      name: 'curator_hybrid_contradictions',
      description: 'Detect contradictions using TF-IDF similarity.',
      auth: 'read',
      schema: z.object({
        threshold: z.number().optional().describe('Similarity threshold (default 0.4)'),
      }),
      handler: async (params) => {
        return curator.detectContradictionsHybrid(params.threshold as number | undefined);
      },
    },

    // ─── Pipeline & Scheduling (#210) ────────────────────────────────
    {
      name: 'curator_pipeline_status',
      description:
        'Get job queue and pipeline runner status — pending/running/completed/failed counts, runner state, tick count.',
      auth: 'read',
      handler: async () => {
        return {
          queue: jobQueue.getStats(),
          runner: pipelineRunner.getStatus(),
        };
      },
    },
    {
      name: 'curator_enqueue_pipeline',
      description:
        'Enqueue a processing pipeline for a vault entry — tag-normalize → dedup-check → auto-link. ' +
        'Jobs execute in DAG order via the background pipeline runner.',
      auth: 'write',
      schema: z.object({
        entryId: z.string().describe('Vault entry ID to process'),
      }),
      handler: async (params) => {
        const entryId = params.entryId as string;
        const pipelineId = `pipe-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const step1 = jobQueue.enqueue('tag-normalize', { entryId, pipelineId });
        const step2 = jobQueue.enqueue('dedup-check', { entryId, pipelineId, dependsOn: [step1] });
        const step3 = jobQueue.enqueue('auto-link', { entryId, pipelineId, dependsOn: [step2] });
        return { pipelineId, jobs: [step1, step2, step3] };
      },
    },
    {
      name: 'curator_schedule_start',
      description:
        'Start periodic consolidation — runs curator.consolidate() at the specified interval. ' +
        'Also starts the pipeline runner for background job processing.',
      auth: 'write',
      schema: z.object({
        intervalMinutes: z
          .number()
          .optional()
          .default(60)
          .describe('Consolidation interval in minutes (default: 60)'),
      }),
      handler: async (params) => {
        const intervalMs = (params.intervalMinutes as number) * 60 * 1000;

        // Start pipeline runner
        pipelineRunner.start();

        // Start consolidation scheduler
        if (consolidationInterval) clearInterval(consolidationInterval);
        consolidationInterval = setInterval(() => {
          try {
            curator.consolidate();
          } catch {
            /* best-effort */
          }
        }, intervalMs);

        return {
          started: true,
          pipelineRunner: pipelineRunner.getStatus(),
          consolidationIntervalMs: intervalMs,
        };
      },
    },
    {
      name: 'curator_schedule_stop',
      description: 'Stop periodic consolidation and pipeline runner.',
      auth: 'write',
      handler: async () => {
        pipelineRunner.stop();
        if (consolidationInterval) {
          clearInterval(consolidationInterval);
          consolidationInterval = null;
        }
        return { stopped: true };
      },
    },
  ];
}
