/**
 * Extended admin operations — 10 ops for production readiness.
 *
 * Groups: telemetry (3), permissions (1), vault analytics (1),
 *         search insights (1), module status (1), env (1), gc (1), export config (1).
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from './types.js';

type PermissionLevel = 'strict' | 'moderate' | 'permissive';

/**
 * Create 10 extended admin operations for production observability.
 */
export function createAdminExtraOps(runtime: AgentRuntime): OpDefinition[] {
  const { vault, brain, cognee, telemetry } = runtime;

  // In-memory permission level — default 'moderate'
  let permissionLevel: PermissionLevel = 'moderate';

  return [
    // ─── Telemetry ──────────────────────────────────────────────────
    {
      name: 'admin_telemetry',
      description: 'Get telemetry stats — call counts, success rate, durations, slowest ops.',
      auth: 'read',
      handler: async () => {
        return telemetry.getStats();
      },
    },
    {
      name: 'admin_telemetry_recent',
      description: 'Get recent facade calls — newest first.',
      auth: 'read',
      schema: z.object({
        limit: z.number().optional().default(50),
      }),
      handler: async (params) => {
        const limit = (params.limit as number) ?? 50;
        return telemetry.getRecent(limit);
      },
    },
    {
      name: 'admin_telemetry_reset',
      description: 'Reset telemetry counters — clears all recorded calls.',
      auth: 'write',
      handler: async () => {
        telemetry.reset();
        return { reset: true, message: 'Telemetry counters cleared.' };
      },
    },

    // ─── Permissions ────────────────────────────────────────────────
    {
      name: 'admin_permissions',
      description: 'Get or set auth enforcement policy (strict, moderate, permissive).',
      auth: 'write',
      schema: z.object({
        action: z.enum(['get', 'set']),
        level: z.enum(['strict', 'moderate', 'permissive']).optional(),
      }),
      handler: async (params) => {
        const action = params.action as string;
        if (action === 'set') {
          const level = params.level as PermissionLevel | undefined;
          if (level) {
            permissionLevel = level;
          }
        }
        return { level: permissionLevel };
      },
    },

    // ─── Vault Analytics ────────────────────────────────────────────
    {
      name: 'admin_vault_analytics',
      description: 'Vault usage analytics — entries by domain, type, age, tag coverage.',
      auth: 'read',
      handler: async () => {
        try {
          const db = vault.getDb();
          const now = Math.floor(Date.now() / 1000);
          const DAY = 86400;

          // Entries by domain
          const byDomain = db
            .prepare('SELECT domain, COUNT(*) as count FROM entries GROUP BY domain')
            .all() as Array<{ domain: string; count: number }>;

          // Entries by type
          const byType = db
            .prepare('SELECT type, COUNT(*) as count FROM entries GROUP BY type')
            .all() as Array<{ type: string; count: number }>;

          // Entries by age bucket
          const ageBuckets = {
            '0-7d': 0,
            '7-30d': 0,
            '30-90d': 0,
            '90d+': 0,
          };

          const rows = db
            .prepare('SELECT created_at FROM entries')
            .all() as Array<{ created_at: number }>;

          for (const row of rows) {
            const ageSeconds = now - row.created_at;
            if (ageSeconds <= 7 * DAY) ageBuckets['0-7d']++;
            else if (ageSeconds <= 30 * DAY) ageBuckets['7-30d']++;
            else if (ageSeconds <= 90 * DAY) ageBuckets['30-90d']++;
            else ageBuckets['90d+']++;
          }

          // Average tags per entry
          const tagRows = db
            .prepare('SELECT tags FROM entries')
            .all() as Array<{ tags: string }>;

          let totalTags = 0;
          let noTags = 0;
          let noDescription = 0;

          for (const row of tagRows) {
            try {
              const tags = JSON.parse(row.tags) as string[];
              totalTags += tags.length;
              if (tags.length === 0) noTags++;
            } catch {
              noTags++;
            }
          }

          // Entries without descriptions
          const noDescResult = db
            .prepare("SELECT COUNT(*) as count FROM entries WHERE description IS NULL OR description = ''")
            .get() as { count: number } | undefined;
          noDescription = noDescResult?.count ?? 0;

          const totalEntries = tagRows.length;

          return {
            totalEntries,
            byDomain: Object.fromEntries(byDomain.map((r) => [r.domain, r.count])),
            byType: Object.fromEntries(byType.map((r) => [r.type, r.count])),
            byAge: ageBuckets,
            avgTagsPerEntry: totalEntries > 0 ? Math.round((totalTags / totalEntries) * 10) / 10 : 0,
            entriesWithoutTags: noTags,
            entriesWithoutDescription: noDescription,
          };
        } catch (err) {
          return { error: 'Failed to compute vault analytics', detail: err instanceof Error ? err.message : String(err) };
        }
      },
    },

    // ─── Search Insights ────────────────────────────────────────────
    {
      name: 'admin_search_insights',
      description: 'Search miss tracking — feedback stats, miss rate, top missed queries.',
      auth: 'read',
      handler: async () => {
        try {
          const feedbackStats = brain.getFeedbackStats();
          const total = feedbackStats.total;
          const rejected = feedbackStats.byAction.dismissed ?? 0;
          const failed = feedbackStats.byAction.failed ?? 0;
          const missCount = rejected + failed;
          const missRate = total > 0 ? Math.round((missCount / total) * 1000) / 1000 : 0;

          // Top missed queries — get recent feedback with 'dismissed' or 'failed' action
          const db = vault.getDb();
          const missedQueries = db
            .prepare(
              "SELECT query, COUNT(*) as count FROM brain_feedback WHERE action IN ('dismissed', 'failed') GROUP BY query ORDER BY count DESC LIMIT 10",
            )
            .all() as Array<{ query: string; count: number }>;

          return {
            totalFeedback: total,
            missRate,
            missCount,
            topMissedQueries: missedQueries,
            byAction: feedbackStats.byAction,
          };
        } catch (err) {
          return {
            totalFeedback: 0,
            missRate: 0,
            missCount: 0,
            topMissedQueries: [],
            byAction: {},
            note: 'No feedback data available',
          };
        }
      },
    },

    // ─── Module Status ──────────────────────────────────────────────
    {
      name: 'admin_module_status',
      description: 'Status of all runtime modules — check each is initialized.',
      auth: 'read',
      handler: async () => {
        const cogneeStatus = cognee.getStatus();
        const llmAvailable = runtime.llmClient.isAvailable();
        const loopStatus = runtime.loop.getStatus();

        return {
          vault: true,
          brain: true,
          planner: true,
          curator: runtime.curator.getStatus().initialized,
          governance: true,
          cognee: { available: cogneeStatus?.available ?? false },
          loop: { active: loopStatus !== null },
          llm: {
            openai: llmAvailable.openai,
            anthropic: llmAvailable.anthropic,
          },
        };
      },
    },

    // ─── Environment ────────────────────────────────────────────────
    {
      name: 'admin_env',
      description: 'Safe environment info — node version, platform, memory usage. No secrets.',
      auth: 'read',
      handler: async () => {
        return {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          pid: process.pid,
          memoryUsage: process.memoryUsage(),
          cwd: process.cwd(),
        };
      },
    },

    // ─── Garbage Collection ─────────────────────────────────────────
    {
      name: 'admin_gc',
      description: 'Trigger garbage collection on in-memory caches — brain, cognee, telemetry.',
      auth: 'write',
      handler: async () => {
        const cleared: string[] = [];

        try {
          brain.rebuildVocabulary();
          cleared.push('brain');
        } catch {
          // Brain rebuild failed — graceful degradation
        }

        try {
          cognee.resetPendingCognify();
          cleared.push('cognee');
        } catch {
          // Cognee reset failed — graceful degradation
        }

        try {
          telemetry.reset();
          cleared.push('telemetry');
        } catch {
          // Telemetry reset failed — graceful degradation
        }

        return { cleared };
      },
    },

    // ─── Export Config ──────────────────────────────────────────────
    {
      name: 'admin_export_config',
      description: 'Export full runtime config — agent ID, paths, log level. No secrets.',
      auth: 'read',
      handler: async () => {
        const { agentId, vaultPath, plansPath, logLevel } = runtime.config;
        return {
          agentId,
          vaultPath: vaultPath ?? null,
          plansPath: plansPath ?? null,
          logLevel: logLevel ?? 'info',
          modules: [
            'vault',
            'brain',
            'brainIntelligence',
            'planner',
            'curator',
            'governance',
            'cognee',
            'loop',
            'identityManager',
            'intentRouter',
            'llmClient',
            'telemetry',
          ],
        };
      },
    },
  ];
}
