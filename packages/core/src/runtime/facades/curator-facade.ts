/**
 * Curator facade — quality ops.
 * duplicate detection, contradictions, grooming, health audit.
 */

import { z } from 'zod';
import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';
import { createCuratorExtraOps } from '../curator-extra-ops.js';

export function createCuratorFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  const { curator } = runtime;

  return [
    // ─── Curator (inline from core-ops.ts) ──────────────────────
    {
      name: 'curator_status',
      description: 'Curator status — table row counts, last groomed timestamp.',
      auth: 'read',
      handler: async () => {
        return curator.getStatus();
      },
    },
    {
      name: 'curator_detect_duplicates',
      description: 'Detect duplicate entries using TF-IDF cosine similarity.',
      auth: 'read',
      schema: z.object({
        entryId: z.string().optional().describe('Check a specific entry. Omit to scan all.'),
        threshold: z.number().optional().describe('Similarity threshold (0-1). Default 0.45.'),
      }),
      handler: async (params) => {
        return curator.detectDuplicates(
          params.entryId as string | undefined,
          params.threshold as number | undefined,
        );
      },
    },
    {
      name: 'curator_dismiss_duplicate',
      description:
        'Dismiss a flagged duplicate pair — marks two entries as reviewed and intentionally distinct. They will no longer appear in curator_detect_duplicates results.',
      auth: 'write',
      schema: z.object({
        entryIdA: z.string().describe('First entry ID'),
        entryIdB: z.string().describe('Second entry ID'),
        reason: z.string().optional().describe('Why these are not duplicates'),
      }),
      handler: async (params) => {
        return curator.dismissDuplicate(
          params.entryIdA as string,
          params.entryIdB as string,
          params.reason as string | undefined,
        );
      },
    },
    {
      name: 'curator_contradictions',
      description: 'List or detect contradictions between patterns and anti-patterns.',
      auth: 'read',
      schema: z.object({
        status: z.enum(['open', 'resolved', 'dismissed']).optional().describe('Filter by status.'),
        detect: z.boolean().optional().describe('If true, run detection before listing.'),
      }),
      handler: async (params) => {
        if (params.detect) {
          curator.detectContradictions();
        }
        return curator.getContradictions(
          params.status as 'open' | 'resolved' | 'dismissed' | undefined,
        );
      },
    },
    {
      name: 'curator_resolve_contradiction',
      description: 'Resolve or dismiss a contradiction.',
      auth: 'write',
      schema: z.object({
        id: z.number().describe('Contradiction ID.'),
        resolution: z.enum(['resolved', 'dismissed']),
      }),
      handler: async (params) => {
        return curator.resolveContradiction(
          params.id as number,
          params.resolution as 'resolved' | 'dismissed',
        );
      },
    },
    {
      name: 'curator_groom',
      description: 'Groom a single entry — normalize tags, check staleness.',
      auth: 'write',
      schema: z.object({
        entryId: z.string().describe('Entry ID to groom.'),
      }),
      handler: async (params) => {
        return curator.groomEntry(params.entryId as string);
      },
    },
    {
      name: 'curator_groom_all',
      description: 'Groom all vault entries — normalize tags, detect staleness.',
      auth: 'write',
      handler: async () => {
        return curator.groomAll();
      },
    },
    {
      name: 'curator_consolidate',
      description:
        'Consolidate vault — find duplicates, stale entries, contradictions. Dry-run by default.',
      auth: 'write',
      schema: z.object({
        dryRun: z.boolean().optional().describe('Default true. Set false to apply mutations.'),
        staleDaysThreshold: z
          .number()
          .optional()
          .describe('Days before entry is stale. Default 90.'),
        duplicateThreshold: z
          .number()
          .optional()
          .describe('Cosine similarity threshold. Default 0.45.'),
        contradictionThreshold: z
          .number()
          .optional()
          .describe('Contradiction threshold. Default 0.4.'),
      }),
      handler: async (params) => {
        return curator.consolidate({
          dryRun: params.dryRun as boolean | undefined,
          staleDaysThreshold: params.staleDaysThreshold as number | undefined,
          duplicateThreshold: params.duplicateThreshold as number | undefined,
          contradictionThreshold: params.contradictionThreshold as number | undefined,
        });
      },
    },
    {
      name: 'curator_health_audit',
      description:
        'Audit vault health — score (0-100), coverage, freshness, quality, tag health, recommendations.',
      auth: 'read',
      handler: async () => {
        return curator.healthAudit();
      },
    },

    // ─── Satellite ops ───────────────────────────────────────────
    ...createCuratorExtraOps(runtime),
  ];
}
