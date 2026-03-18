/**
 * Cognee sync operations — 4 ops for queue visibility and control.
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { CogneeSyncManager } from '../cognee/sync-manager.js';

const DRAIN_HINTS: Record<string, string> = {
  cognee_unavailable: 'Cognee health check failed. Check if the container is running.',
  auth_failed: 'Cognee authentication failed. Check credentials or restart the container.',
  queue_empty: 'No pending items in the sync queue.',
  partial_failure: 'Some items failed. Check errors array for details.',
};

/**
 * Create the cognee-sync operations.
 *
 * The sync manager is optional — when null, all ops return a graceful error.
 */
export function createCogneeSyncOps(syncManager: CogneeSyncManager | null): OpDefinition[] {
  return [
    // ─── Status ──────────────────────────────────────────────────
    {
      name: 'cognee_sync_status',
      description:
        'Get current cognee sync queue stats — pending, processing, completed, failed counts.',
      auth: 'read',
      schema: z.object({}),
      handler: async () => {
        if (!syncManager) {
          return { error: 'Sync manager not configured' };
        }
        return syncManager.getStats();
      },
    },

    // ─── Drain ───────────────────────────────────────────────────
    {
      name: 'cognee_sync_drain',
      description:
        'Process one batch of pending items in the cognee sync queue. Returns processed count, reason if 0, queue stats, and actionable hint.',
      auth: 'write',
      schema: z.object({
        forceCognify: z
          .boolean()
          .optional()
          .describe('Trigger cognify immediately after batch instead of debouncing'),
      }),
      handler: async (params: { forceCognify?: boolean }) => {
        if (!syncManager) {
          return { error: 'Sync manager not configured' };
        }
        const result = await syncManager.drain({ forceCognify: params.forceCognify });
        return {
          ...result,
          hint: result.reason ? DRAIN_HINTS[result.reason] : undefined,
          queue: syncManager.getStats(),
        };
      },
    },

    // ─── Drain All ──────────────────────────────────────────────
    {
      name: 'cognee_sync_drain_all',
      description:
        'Drain the entire sync queue in a loop until empty. Returns total processed, batches, duration, and final reason.',
      auth: 'write',
      schema: z.object({
        forceCognify: z
          .boolean()
          .optional()
          .describe('Trigger cognify after each batch instead of debouncing'),
      }),
      handler: async (params: { forceCognify?: boolean }) => {
        if (!syncManager) {
          return { error: 'Sync manager not configured' };
        }
        const result = await syncManager.drainAll({ forceCognify: params.forceCognify });
        return {
          ...result,
          hint: result.reason ? DRAIN_HINTS[result.reason] : undefined,
          queue: syncManager.getStats(),
        };
      },
    },

    // ─── Reconcile ───────────────────────────────────────────────
    {
      name: 'cognee_sync_reconcile',
      description:
        'Find vault entries with stale or missing cognee ingestion and enqueue them for sync.',
      auth: 'write',
      schema: z.object({}),
      handler: async () => {
        if (!syncManager) {
          return { error: 'Sync manager not configured' };
        }
        const enqueued = syncManager.reconcile();
        return { enqueued, stats: syncManager.getStats() };
      },
    },
  ];
}
