/**
 * Memory facade — session & cross-project memory ops.
 * capture, search, dedup, promote.
 */

import { z } from 'zod';
import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';
import { createMemoryExtraOps } from '../memory-extra-ops.js';
import { createMemoryCrossProjectOps } from '../memory-cross-project-ops.js';
import { extractFromSession } from '../../operator/operator-signals.js';
import type { SessionCaptureData } from '../../operator/operator-signals.js';

/** Truncate text to maxLen chars, appending ellipsis when truncated. */
function truncateSummary(text: string, maxLen = 120): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '\u2026';
}

export function createMemoryFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  const { vault } = runtime;

  return [
    // ─── Memory (inline from core-ops.ts) ───────────────────────
    {
      name: 'memory_search',
      description:
        'Search memories using full-text search. Returns summaries by default; pass verbose: true for full objects.',
      auth: 'read',
      schema: z.object({
        query: z.string(),
        type: z.enum(['session', 'lesson', 'preference']).optional(),
        projectPath: z.string().optional(),
        limit: z.number().optional(),
        verbose: z
          .boolean()
          .optional()
          .default(false)
          .describe('Return full memory objects instead of summaries'),
      }),
      handler: async (params) => {
        const memories = vault.searchMemories(params.query as string, {
          type: params.type as string | undefined,
          projectPath: params.projectPath as string | undefined,
          limit: (params.limit as number) ?? 10,
        });
        if (params.verbose) {
          return memories;
        }
        return memories.map((m) => ({
          id: m.id,
          type: m.type,
          summary: truncateSummary(m.summary || m.context),
          score: null,
          project: m.projectPath,
        }));
      },
    },
    {
      name: 'memory_capture',
      description: 'Capture a memory — session summary, lesson learned, or preference.',
      auth: 'write',
      schema: z.object({
        projectPath: z.string(),
        type: z.enum(['session', 'lesson', 'preference']),
        context: z.string(),
        summary: z.string(),
        topics: z.array(z.string()).optional().default([]),
        filesModified: z.array(z.string()).optional().default([]),
        toolsUsed: z.array(z.string()).optional().default([]),
      }),
      handler: async (params) => {
        const memory = vault.captureMemory({
          projectPath: params.projectPath as string,
          type: params.type as 'session' | 'lesson' | 'preference',
          context: params.context as string,
          summary: params.summary as string,
          topics: (params.topics as string[]) ?? [],
          filesModified: (params.filesModified as string[]) ?? [],
          toolsUsed: (params.toolsUsed as string[]) ?? [],
          intent: null,
          decisions: [],
          currentState: null,
          nextSteps: [],
          vaultEntriesReferenced: [],
        });
        return { captured: true, memory };
      },
    },
    {
      name: 'memory_list',
      description:
        'List memories with optional filters. Returns summaries by default; pass verbose: true for full objects.',
      auth: 'read',
      schema: z.object({
        type: z.enum(['session', 'lesson', 'preference']).optional(),
        projectPath: z.string().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
        verbose: z
          .boolean()
          .optional()
          .default(false)
          .describe('Return full memory objects instead of summaries'),
      }),
      handler: async (params) => {
        const memories = vault.listMemories({
          type: params.type as string | undefined,
          projectPath: params.projectPath as string | undefined,
          limit: (params.limit as number) ?? 50,
          offset: (params.offset as number) ?? 0,
        });
        const stats = vault.memoryStats();
        if (params.verbose) {
          return { memories, stats };
        }
        return {
          memories: memories.map((m) => ({
            id: m.id,
            summary: truncateSummary(m.summary || m.context),
            project: m.projectPath,
            createdAt: m.createdAt,
          })),
          stats,
        };
      },
    },
    {
      name: 'session_capture',
      description:
        'Capture a session summary. Supports rich format: intent, decisions, currentState, nextSteps, vaultEntriesReferenced.',
      auth: 'write',
      schema: z.object({
        projectPath: z.string().optional().default('.'),
        summary: z.string().optional().describe('Brief summary of what was accomplished'),
        conversationContext: z
          .string()
          .optional()
          .describe('Alias for summary — brief summary of what was accomplished'),
        topics: z.array(z.string()).optional().default([]),
        filesModified: z.array(z.string()).optional().default([]),
        toolsUsed: z.array(z.string()).optional().default([]),
        intent: z.string().optional().describe('What the user was trying to accomplish'),
        decisions: z.array(z.string()).optional().describe('Key decisions and rationale'),
        currentState: z.string().optional().describe('Where things stand at capture time'),
        nextSteps: z.array(z.string()).optional().describe('What should happen next session'),
        vaultEntriesReferenced: z
          .array(z.string())
          .optional()
          .describe('Vault entry IDs that informed this session'),
      }),
      handler: async (params) => {
        const { resolve } = await import('node:path');
        const projectPath = resolve((params.projectPath as string) ?? '.');
        const summary = (params.summary ?? params.conversationContext) as string;
        if (!summary) {
          return { captured: false, error: 'Either summary or conversationContext is required.' };
        }
        const memory = vault.captureMemory({
          projectPath,
          type: 'session',
          context: 'Auto-captured before context compaction',
          summary,
          topics: (params.topics as string[]) ?? [],
          filesModified: (params.filesModified as string[]) ?? [],
          toolsUsed: (params.toolsUsed as string[]) ?? [],
          intent: (params.intent as string) ?? null,
          decisions: (params.decisions as string[]) ?? [],
          currentState: (params.currentState as string) ?? null,
          nextSteps: (params.nextSteps as string[]) ?? [],
          vaultEntriesReferenced: (params.vaultEntriesReferenced as string[]) ?? [],
        });
        // ─── Auto-signal extraction (never breaks session_capture) ───
        try {
          if (runtime.operatorProfile) {
            const sessionData: SessionCaptureData = {
              sessionId: memory.id ?? `session-${Date.now()}`,
              intent: (params.intent as string) ?? null,
              capturedAt: new Date().toISOString(),
              toolsUsed: (params.toolsUsed as string[]) ?? null,
              filesModified: (params.filesModified as string[]) ?? null,
              decisions: (params.decisions as string[]) ?? null,
              summary: summary ?? null,
            };
            const signals = extractFromSession(sessionData);
            if (signals.length > 0) {
              runtime.operatorProfile.accumulateSignals(signals);
            }
          }
        } catch {
          // Signal extraction must never break session_capture
        }

        return { captured: true, memory, message: 'Session summary saved to memory.' };
      },
    },

    // ─── Handoff ────────────────────────────────────────────────
    {
      name: 'handoff_generate',
      description:
        'Generate a structured handoff document for context transitions. ' +
        'Pulls from active plan (if any) and recent session memories to produce ' +
        'a markdown document that can bootstrap a new context window. ' +
        'Ephemeral — NOT persisted to vault.',
      auth: 'read',
      schema: z.object({
        projectPath: z
          .string()
          .optional()
          .default('.')
          .describe('Project path for filtering memories'),
        sessionLimit: z
          .number()
          .optional()
          .default(3)
          .describe('Number of recent session memories to include'),
      }),
      handler: async (params) => {
        const { planner } = runtime;
        const projectPath = params.projectPath as string;
        const sessionLimit = (params.sessionLimit as number) ?? 3;

        const sections: string[] = [];
        const now = new Date().toISOString();

        sections.push('# Handoff Document');
        sections.push('');
        sections.push(`Generated: ${now}`);
        sections.push('');

        // ─── Active Plan Context ───────────────────────────
        const activePlans = planner.getActive();
        if (activePlans.length > 0) {
          const plan = activePlans[0]; // Most relevant active plan
          sections.push('## Active Plan');
          sections.push('');
          sections.push(`| Field | Value |`);
          sections.push(`|-------|-------|`);
          sections.push(`| **Plan ID** | ${plan.id} |`);
          sections.push(`| **Objective** | ${plan.objective} |`);
          sections.push(`| **Status** | ${plan.status} |`);
          sections.push(`| **Scope** | ${plan.scope} |`);
          sections.push('');

          // Decisions
          if (plan.decisions.length > 0) {
            sections.push('### Decisions');
            sections.push('');
            for (const d of plan.decisions) {
              if (typeof d === 'string') {
                sections.push(`- ${d}`);
              } else {
                sections.push(`- **${d.decision}** — ${d.rationale}`);
              }
            }
            sections.push('');
          }

          // Task status summary
          if (plan.tasks.length > 0) {
            sections.push('### Tasks');
            sections.push('');
            sections.push('| # | Task | Status |');
            sections.push('|---|------|--------|');
            for (let i = 0; i < plan.tasks.length; i++) {
              const t = plan.tasks[i];
              sections.push(`| ${i + 1} | ${t.title} | ${t.status} |`);
            }
            sections.push('');
          }

          // Approach
          if (plan.approach) {
            sections.push('### Approach');
            sections.push('');
            sections.push(plan.approach);
            sections.push('');
          }

          // Additional active plans (just IDs)
          if (activePlans.length > 1) {
            sections.push('### Other Active Plans');
            sections.push('');
            for (let i = 1; i < activePlans.length; i++) {
              const p = activePlans[i];
              sections.push(`- **${p.id}**: ${p.objective} (${p.status})`);
            }
            sections.push('');
          }
        } else {
          sections.push('## Active Plan');
          sections.push('');
          sections.push('No active plans.');
          sections.push('');
        }

        // ─── Recent Session Context ────────────────────────
        const recentSessions = vault.listMemories({
          type: 'session',
          projectPath,
          limit: sessionLimit,
        });

        if (recentSessions.length > 0) {
          sections.push('## Recent Sessions');
          sections.push('');
          for (const session of recentSessions) {
            sections.push(`### ${session.createdAt}`);
            sections.push('');
            if (session.summary) {
              sections.push(session.summary);
              sections.push('');
            }
            if (session.nextSteps && session.nextSteps.length > 0) {
              sections.push('**Next steps:**');
              for (const step of session.nextSteps) {
                sections.push(`- ${step}`);
              }
              sections.push('');
            }
            if (session.decisions && session.decisions.length > 0) {
              sections.push('**Decisions:**');
              for (const d of session.decisions) {
                sections.push(`- ${d}`);
              }
              sections.push('');
            }
            if (session.filesModified && session.filesModified.length > 0) {
              sections.push(`**Files modified:** ${session.filesModified.join(', ')}`);
              sections.push('');
            }
          }
        } else {
          sections.push('## Recent Sessions');
          sections.push('');
          sections.push('No recent session memories found.');
          sections.push('');
        }

        // ─── Resumption Hints ──────────────────────────────
        sections.push('## Resumption');
        sections.push('');
        sections.push('Use this document to restore context after a context window transition.');
        sections.push('');
        if (activePlans.length > 0) {
          const plan = activePlans[0];
          const pendingTasks = plan.tasks.filter(
            (t) => t.status === 'pending' || t.status === 'in_progress',
          );
          if (pendingTasks.length > 0) {
            sections.push('**Immediate next actions:**');
            for (const t of pendingTasks.slice(0, 5)) {
              sections.push(
                `- ${t.status === 'in_progress' ? '[IN PROGRESS]' : '[PENDING]'} ${t.title}`,
              );
            }
            sections.push('');
          }
          if (plan.status === 'executing') {
            sections.push(
              '> Plan is in `executing` state. Continue with pending tasks or call `op:plan_reconcile` if complete.',
            );
          } else if (plan.status === 'reconciling') {
            sections.push(
              '> Plan is in `reconciling` state. Call `op:plan_complete_lifecycle` to finalize.',
            );
          }
        }

        const markdown = sections.join('\n');

        return {
          handoff: markdown,
          meta: {
            activePlanCount: activePlans.length,
            activePlanId: activePlans.length > 0 ? activePlans[0].id : null,
            recentSessionCount: recentSessions.length,
            generatedAt: now,
          },
        };
      },
    },

    // ─── Satellite ops ───────────────────────────────────────────
    ...createMemoryExtraOps(runtime),
    ...createMemoryCrossProjectOps(runtime),
  ];
}
