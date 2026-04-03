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
import { buildPreflightManifest } from '../preflight.js';
import { ENGINE_MODULE_MANIFEST } from '../../engine/module-manifest.js';
import {
  createTracker,
  advanceStep,
  recordEvidence,
  generateCheckpoint,
  validateCompletion,
  persistTracker,
  loadTracker,
} from '../../skills/step-tracker.js';
import type { SkillStep, EvidenceType } from '../../skills/step-tracker.js';

export function createOrchestrateFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  const { vault, governance, projectRegistry, brainIntelligence } = runtime;

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

        // ─── Pre-flight manifest ───────────────────────────────
        let skills: string[] = [];
        try {
          const { discoverSkills } = await import('../../skills/sync-skills.js');
          const agentDir = runtime.config.agentDir;
          const skillsDirs = agentDir ? [join(agentDir, 'skills')] : [];
          skills = discoverSkills(skillsDirs).map((s) => s.name);
        } catch {
          // Skills discovery is best-effort
        }

        const agentId = runtime.config.agentId;
        const facades = ENGINE_MODULE_MANIFEST.map((m) => ({
          name: `${agentId}_${m.suffix}`,
          ops: m.keyOps.map((op) => ({ name: op, description: m.description })),
        }));

        const executingPlans = runtime.planner.getExecuting().map((p) => ({
          id: p.id,
          objective: p.objective,
          status: p.status,
        }));

        const preflight = buildPreflightManifest({
          facades,
          skills,
          executingPlans,
          vaultStats: stats,
        });

        // Auto-close orphaned brain sessions (endedAt IS NULL, startedAt < now - 2h)
        let orphansClosed = 0;
        try {
          const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
          const cutoff = new Date(Date.now() - TWO_HOURS_MS);
          const activeSessions = brainIntelligence.listSessions({ active: true, limit: 1000 });
          for (const s of activeSessions) {
            if (new Date(s.startedAt) < cutoff) {
              try {
                brainIntelligence.lifecycle({
                  action: 'end',
                  sessionId: s.id,
                  planOutcome: 'abandoned',
                  context: 'auto-closed: orphan from previous conversation',
                });
                orphansClosed++;
              } catch {
                // Best-effort per session — never let one failure abort the rest
              }
            }
          }
        } catch {
          // Non-critical — don't fail session start over orphan cleanup
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
          preflight,
          orphansClosed,
          ...(stagingWarning ? { stagingWarning } : {}),
          ...(dreamInfo ? { dream: dreamInfo } : {}),
        };
      },
    },

    // ─── Skill Step Tracking ──────────────────────────────────────
    {
      name: 'skill_step_start',
      description:
        'Create a skill step tracker. Persists initial state to disk and returns the tracker with checkpoint summary.',
      auth: 'write',
      schema: z.object({
        skillName: z.string().describe('Name of the skill being tracked'),
        steps: z
          .array(
            z.object({
              id: z.string(),
              description: z.string(),
              evidence: z.enum(['tool_called', 'file_exists']),
            }),
          )
          .describe('Ordered steps with evidence requirements'),
      }),
      handler: async (params) => {
        const steps = (
          params.steps as Array<{ id: string; description: string; evidence: EvidenceType }>
        ).map((s): SkillStep => ({ id: s.id, description: s.description, evidence: s.evidence }));
        const tracker = createTracker(params.skillName as string, steps);
        const filePath = persistTracker(tracker);
        const checkpoint = generateCheckpoint(tracker);
        return { tracker, filePath, checkpoint };
      },
    },
    {
      name: 'skill_step_advance',
      description:
        'Record evidence for the current step, advance to the next step, persist state, and return checkpoint summary.',
      auth: 'write',
      schema: z.object({
        runId: z.string().describe('Run ID returned by skill_step_start'),
        stepId: z.string().describe('Step ID to record evidence for'),
        evidence: z.string().describe('Evidence value (tool name or file path)'),
        verified: z.boolean().optional().default(true).describe('Whether evidence is verified'),
      }),
      handler: async (params) => {
        let tracker = loadTracker(params.runId as string);
        if (!tracker) {
          return { error: `No tracker found for runId: ${params.runId}` };
        }
        tracker = recordEvidence(
          tracker,
          params.stepId as string,
          params.evidence as string,
          (params.verified as boolean) ?? true,
        );
        tracker = advanceStep(tracker);
        const filePath = persistTracker(tracker);
        const checkpoint = generateCheckpoint(tracker);
        return { tracker, filePath, checkpoint };
      },
    },
    {
      name: 'skill_step_complete',
      description:
        'Validate skill completion, persist final state, and return a completion result with any skipped steps.',
      auth: 'write',
      schema: z.object({
        runId: z.string().describe('Run ID returned by skill_step_start'),
      }),
      handler: async (params) => {
        const tracker = loadTracker(params.runId as string);
        if (!tracker) {
          return { error: `No tracker found for runId: ${params.runId}` };
        }
        const result = validateCompletion(tracker);
        // Mark completed if all steps have evidence
        const finalTracker = result.complete
          ? { ...tracker, completedAt: tracker.completedAt ?? new Date().toISOString() }
          : tracker;
        const filePath = persistTracker(finalTracker);
        return { result, tracker: finalTracker, filePath };
      },
    },

    // ─── Satellite ops ───────────────────────────────────────────
    ...createOrchestrateOps(runtime),
    ...createProjectOps(runtime),
    ...createPlaybookOps(runtime),
  ];
}
