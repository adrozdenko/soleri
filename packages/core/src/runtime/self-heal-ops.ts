/**
 * Self-heal operation — unified vault maintenance in a single op.
 *
 * Runs health audit, grooming, duplicate detection, contradiction detection,
 * link backfill, and optional consolidation. Returns before/after health scores
 * so the caller can see the impact.
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from './types.js';
import { OperationLogger } from '../vault/operation-log.js';

export function createSelfHealOps(runtime: AgentRuntime): OpDefinition[] {
  const { curator, linkManager, vault } = runtime;
  let opLogger: OperationLogger | null = null;
  try {
    opLogger = new OperationLogger(vault.getProvider());
  } catch {
    /* optional */
  }

  return [
    {
      name: 'vault_self_heal',
      description:
        'Unified vault self-heal — runs health audit, grooming, duplicate detection, contradiction detection, link backfill, and optional consolidation. Returns before/after health scores. Dry-run by default.',
      auth: 'write',
      schema: z.object({
        dryRun: z
          .boolean()
          .optional()
          .describe(
            'Default true. Set false to apply mutations (archive stale, remove duplicates).',
          ),
        staleDaysThreshold: z
          .number()
          .optional()
          .describe('Days before an entry is considered stale. Default 90.'),
        duplicateThreshold: z
          .number()
          .optional()
          .describe('Cosine similarity threshold for duplicate detection. Default 0.45.'),
        contradictionThreshold: z
          .number()
          .optional()
          .describe('Similarity threshold for contradiction detection. Default 0.4.'),
      }),
      handler: async (params) => {
        const dryRun = (params.dryRun as boolean | undefined) ?? true;
        const staleDaysThreshold = (params.staleDaysThreshold as number | undefined) ?? 90;
        const duplicateThreshold = (params.duplicateThreshold as number | undefined) ?? 0.45;
        const contradictionThreshold = (params.contradictionThreshold as number | undefined) ?? 0.4;

        const start = Date.now();

        // 1. BEFORE health score
        const healthBefore = curator.healthAudit();

        // 2. Grooming — tag normalization, staleness detection
        const grooming = curator.groomAll();

        // 3. Duplicate detection
        const duplicates = curator.detectDuplicates(undefined, duplicateThreshold);

        // 4. Contradiction detection
        const contradictions = curator.detectContradictions(contradictionThreshold);

        // 5. Link backfill (if linkManager available)
        let linksCreated = 0;
        try {
          if (linkManager) {
            const backfillResult = linkManager.backfillLinks({
              dryRun,
              threshold: 0.7,
            });
            linksCreated = backfillResult.linksCreated;
          }
        } catch {
          // Link module unavailable — degrade gracefully
        }

        // 6. Consolidation (only when NOT dry-run)
        if (!dryRun) {
          curator.consolidate({
            dryRun: false,
            staleDaysThreshold,
            duplicateThreshold,
            contradictionThreshold,
          });
        }

        // 7. AFTER health score
        const healthAfter = curator.healthAudit();

        const durationMs = Date.now() - start;

        const result = {
          dryRun,
          healthBefore: healthBefore.score,
          healthAfter: healthAfter.score,
          grooming,
          duplicates,
          contradictions,
          linksCreated,
          recommendations: healthAfter.recommendations,
          durationMs,
        };

        if (opLogger) {
          try {
            opLogger.log(
              'self_heal',
              'vault_self_heal',
              `Self-heal ${dryRun ? '(dry-run)' : '(live)'}: ${healthBefore.score} → ${healthAfter.score}`,
              linksCreated,
              {
                dryRun,
                healthBefore: healthBefore.score,
                healthAfter: healthAfter.score,
                duplicates: duplicates.length,
                contradictions: contradictions.length,
              },
            );
          } catch {
            /* best-effort */
          }
        }

        return result;
      },
    },
  ];
}
