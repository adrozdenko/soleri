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
import { checkForUpdate } from '../../update-check.js';

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
        const { resolve, join } = await import('node:path');
        const { homedir } = await import('node:os');
        const { existsSync, readdirSync, statSync } = await import('node:fs');
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

        // Check for stale staging backups (lightweight — stat only, no tree walk)
        let stagingWarning: { count: number; message: string } | undefined;
        try {
          const stagingRoot = join(homedir(), '.soleri', 'staging');
          if (existsSync(stagingRoot)) {
            const maxAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 days
            const cutoff = Date.now() - maxAgeMs;
            const dirs = readdirSync(stagingRoot, { withFileTypes: true });
            let staleCount = 0;
            for (const dir of dirs) {
              if (!dir.isDirectory()) continue;
              try {
                const st = statSync(join(stagingRoot, dir.name));
                if (st.mtimeMs < cutoff) staleCount++;
              } catch {
                // skip unreadable entries
              }
            }
            if (staleCount > 0) {
              stagingWarning = {
                count: staleCount,
                message: `${staleCount} staging backup(s) older than 7 days. Run: soleri staging cleanup --yes`,
              };
            }
          }
        } catch {
          // Non-critical — don't fail session start over staging check
        }

        // Fire-and-forget update check — never blocks, never throws
        try {
          const enginePkgUrl = new URL('../../../package.json', import.meta.url);
          const { readFileSync: readFs } = await import('node:fs');
          const enginePkg = JSON.parse(readFs(enginePkgUrl, 'utf-8'));
          void checkForUpdate(
            runtime.config.agentId ?? 'unknown',
            enginePkg.version ?? '0.0.0',
          ).catch(() => {});
        } catch {
          // package.json not readable — skip update check silently
        }

        // Auto-dream: increment session counter and check gate
        let dreamInfo: { status: unknown; gate: { eligible: boolean; reason: string } } | null =
          null;
        try {
          const { ensureDreamSchema } = await import('../../dream/schema.js');
          const { DreamEngine } = await import('../../dream/dream-engine.js');
          ensureDreamSchema(runtime.vault.getProvider());
          const dreamEngine = new DreamEngine(runtime.vault, runtime.curator);
          dreamEngine.incrementSessionCount();
          const gate = dreamEngine.checkGate();
          dreamInfo = { status: dreamEngine.getStatus(), gate };
          if (gate.eligible) {
            // Fire-and-forget: don't block session_start
            Promise.resolve()
              .then(() => dreamEngine.run())
              .catch(() => {
                /* best-effort */
              });
          }
        } catch {
          /* dream module not available — skip silently */
        }

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
          ...(stagingWarning ? { stagingWarning } : {}),
          ...(dreamInfo ? { dream: dreamInfo } : {}),
        };
      },
    },

    // ─── Satellite ops ───────────────────────────────────────────
    ...createOrchestrateOps(runtime),
    ...createProjectOps(runtime),
    ...createPlaybookOps(runtime),
  ];
}
