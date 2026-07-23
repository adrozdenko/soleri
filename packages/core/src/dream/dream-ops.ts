/**
 * Dream runtime ops — facade operations for the dream engine.
 * dream_run, dream_propose, dream_adopt, dream_discard, dream_status, dream_check_gate.
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from '../runtime/types.js';
import { DreamEngine } from './dream-engine.js';
import { ensureDreamSchema } from './schema.js';
import { OperationLogger } from '../vault/operation-log.js';

export function createDreamOps(runtime: AgentRuntime): OpDefinition[] {
  const { vault, curator, brain } = runtime;
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
      name: 'dream_propose',
      description:
        'Stage a consolidation proposal (dry-run) for review — never mutates the vault. Adopt via dream_adopt, reject via dream_discard.',
      auth: 'write',
      schema: z.object({}),
      handler: async () => {
        return { proposal: engine.propose() };
      },
    },
    {
      name: 'dream_adopt',
      description:
        'Adopt the staged dream proposal — applies consolidation to the vault and closes the proposal.',
      auth: 'write',
      schema: z.object({
        proposalId: z.number().optional().describe('Proposal id. Default: latest pending.'),
      }),
      handler: async (params) => {
        const { report, proposal } = engine.adopt(params.proposalId as number | undefined);
        if (opLogger) {
          try {
            opLogger.log(
              'dream',
              'dream_adopt',
              `Adopted proposal ${proposal.id}: ${report.duplicatesFound} dupes, ${report.staleArchived} stale archived`,
              report.duplicatesFound + report.staleArchived,
              { durationMs: report.durationMs, contradictions: report.contradictionsFound },
            );
          } catch {
            /* best-effort */
          }
        }
        return { report, proposal };
      },
    },
    {
      name: 'dream_discard',
      description:
        'Discard the staged dream proposal with a reason — vault untouched. The rejection is recorded as brain feedback so the engine learns which consolidations the operator refuses.',
      auth: 'write',
      schema: z.object({
        reason: z.string().min(1).describe('Why this consolidation should not be applied.'),
        proposalId: z.number().optional().describe('Proposal id. Default: latest pending.'),
      }),
      handler: async (params) => {
        const proposal = engine.discard(
          params.reason as string,
          params.proposalId as number | undefined,
        );
        // Rejected-candidate ledger: the operator's "no" is signal, not noise.
        try {
          brain.recordFeedback({
            query: `dream-proposal:${proposal.id}`,
            entryId: `dream-proposal-${proposal.id}`,
            action: 'dismissed',
            source: 'explicit',
            reason: params.reason as string,
            context: JSON.stringify({
              duplicatesFound: proposal.evidence.duplicatesFound,
              staleCandidates: proposal.evidence.staleCandidates,
              contradictionsFound: proposal.evidence.contradictionsFound,
            }),
          });
        } catch {
          /* feedback is best-effort — discard itself already succeeded */
        }
        return { proposal };
      },
    },
    {
      name: 'dream_status',
      description:
        'Dream status — sessions since last dream, last dream timestamp, gate eligibility, pending staged proposal.',
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
