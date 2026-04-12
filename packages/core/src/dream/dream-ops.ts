/**
 * Dream runtime ops — facade operations for the dream engine.
 * dream_run, dream_status, dream_check_gate.
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from '../runtime/types.js';
import { DreamEngine } from './dream-engine.js';
import { ensureDreamSchema } from './schema.js';
import { OperationLogger } from '../vault/operation-log.js';

export function createDreamOps(runtime: AgentRuntime): OpDefinition[] {
  const { vault, curator } = runtime;
  ensureDreamSchema(vault.getProvider());
  const engine = new DreamEngine(vault, curator);
  let opLogger: OperationLogger | null = null;
  try {
    opLogger = new OperationLogger(vault.getProvider());
  } catch {
    /* optional */
  }

  return [
    {
      name: 'dream_run',
      description:
        'Run a dream cycle — consolidate vault knowledge (duplicates, stale entries, contradictions). Checks gate unless force=true.',
      auth: 'write',
      schema: z.object({
        force: z.boolean().optional().describe('Skip gate check. Default false.'),
      }),
      handler: async (params) => {
        const force = (params.force as boolean) ?? false;
        if (!force) {
          const gate = engine.checkGate();
          if (!gate.eligible) {
            return { skipped: true, reason: gate.reason, status: engine.getStatus() };
          }
        }
        const result = engine.run();
        if (opLogger) {
          try {
            opLogger.log(
              'dream',
              'dream_run',
              `Dream cycle: ${result.duplicatesFound} dupes, ${result.staleArchived} stale archived`,
              result.duplicatesFound + result.staleArchived,
              { durationMs: result.durationMs, contradictions: result.contradictionsFound },
            );
          } catch {
            /* best-effort */
          }
        }
        return result;
      },
    },
    {
      name: 'dream_status',
      description:
        'Dream status — sessions since last dream, last dream timestamp, gate eligibility.',
      auth: 'read',
      handler: async () => {
        return engine.getStatus();
      },
    },
    {
      name: 'dream_check_gate',
      description:
        'Check whether dream gate conditions are met (session threshold + time threshold).',
      auth: 'read',
      handler: async () => {
        return engine.checkGate();
      },
    },
  ];
}
