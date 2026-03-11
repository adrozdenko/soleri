/**
 * Extended telemetry ops — error aggregation and slow op detection.
 *
 * Complements admin_telemetry, admin_telemetry_recent, admin_telemetry_reset
 * in admin-extra-ops with higher-level analysis.
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from './types.js';

export function createTelemetryOps(runtime: AgentRuntime): OpDefinition[] {
  const { telemetry } = runtime;

  return [
    {
      name: 'telemetry_errors',
      description: 'Get recent errors grouped by op name with error details.',
      auth: 'read' as const,
      handler: async () => {
        const stats = telemetry.getStats();
        const recent = telemetry.getRecent(200);
        const errors = recent.filter((c) => !c.success);
        return {
          errorCount: errors.length,
          errorsByOp: stats.errorsByOp,
          recentErrors: errors.slice(0, 20).map((e) => ({
            op: e.op,
            facade: e.facade,
            error: e.error,
            timestamp: e.timestamp,
          })),
        };
      },
    },
    {
      name: 'telemetry_slow_ops',
      description: 'Get the slowest ops by average duration, filtered by threshold.',
      auth: 'read' as const,
      schema: z.object({
        threshold: z
          .number()
          .optional()
          .default(100)
          .describe('Minimum avg duration in ms to report'),
      }),
      handler: async (params) => {
        const stats = telemetry.getStats();
        const threshold = (params.threshold as number) ?? 100;
        return {
          slowOps: stats.slowestOps.filter((o) => o.avgMs >= threshold),
          avgDurationMs: stats.avgDurationMs,
        };
      },
    },
  ];
}
