/**
 * Orchestrate facade — execution orchestration ops.
 * project registration, playbooks, plan/execute/complete.
 */

import { z } from 'zod';
import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';
import { createOrchestrateOps } from '../orchestrate-ops.js';
import { createProjectOps } from '../project-ops.js';
import { createPlaybookOps } from '../playbook-ops.js';

export function createOrchestrateFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  const { vault, governance, projectRegistry } = runtime;

  return [
    // ─── Session Start (inline from core-ops.ts) ─────────────────────
    {
      name: 'session_start',
      description:
        'Start a session for this project. Call on every new session to track usage and get context.',
      auth: 'write',
      schema: z.object({
        projectPath: z.string().optional().default('.'),
        name: z.string().optional().describe('Project display name (derived from path if omitted)'),
      }),
      handler: async (params) => {
        const { resolve } = await import('node:path');
        const projectPath = resolve((params.projectPath as string) ?? '.');
        const project = vault.registerProject(projectPath, params.name as string | undefined);
        // Also track in project registry for cross-project features
        projectRegistry.register(projectPath, params.name as string | undefined);
        const stats = vault.stats();
        const isNew = project.sessionCount === 1;

        // Expire stale proposals on session start (fire-and-forget)
        const policy = governance.getPolicy(projectPath);
        const expired = governance.expireStaleProposals(policy.autoCapture.autoExpireDays);

        const proposalStats = governance.getProposalStats(projectPath);
        const quotaStatus = governance.getQuotaStatus(projectPath);

        return {
          project,
          is_new: isNew,
          message: isNew
            ? 'Welcome! New project registered.'
            : 'Welcome back! Session #' + project.sessionCount + ' for ' + project.name + '.',
          vault: { entries: stats.totalEntries, domains: Object.keys(stats.byDomain) },
          governance: {
            pendingProposals: proposalStats.pending,
            quotaPercent:
              quotaStatus.maxTotal > 0
                ? Math.round((quotaStatus.total / quotaStatus.maxTotal) * 100)
                : 0,
            isQuotaWarning: quotaStatus.isWarning,
            expiredThisSession: expired,
          },
        };
      },
    },

    // ─── Satellite ops ───────────────────────────────────────────
    ...createOrchestrateOps(runtime),
    ...createProjectOps(runtime),
    ...createPlaybookOps(runtime),
  ];
}
