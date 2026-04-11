/**
 * Memory facade — session & cross-project memory ops.
 * capture, search, dedup, promote.
 * Transcript ops — capture, search, replay, promote.
 */

import { z } from 'zod';
import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';
import { createMemoryExtraOps } from '../memory-extra-ops.js';
import { createMemoryCrossProjectOps } from '../memory-cross-project-ops.js';
import { createMemorySyncOps } from '../../adapters/memory-sync/memory-sync-ops.js';
import { extractFromSession } from '../../operator/operator-signals.js';
import type { SessionCaptureData } from '../../operator/operator-signals.js';
import {
  captureTranscriptSession,
  searchTranscriptSegments,
  getTranscriptSession,
  getTranscriptMessages,
} from '../../vault/vault-transcripts.js';
import { rankTranscriptCandidates } from '../../transcript/ranker.js';

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
        'Search memories using full-text search. Returns summaries by default; pass verbose: true for full objects. ' +
        'Use source to search transcripts or both memories and transcripts.',
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
        source: z
          .enum(['memory', 'transcript', 'all'])
          .optional()
          .default('memory')
          .describe(
            'Search source: memory (default), transcript (raw transcript segments), or all (both)',
          ),
      }),
      handler: async (params) => {
        const query = params.query as string;
        const limit = (params.limit as number) ?? 10;
        const source = (params.source as string) ?? 'memory';
        const projectPath = params.projectPath as string | undefined;

        const searchMemoriesLocal = () => {
          const memories = vault.searchMemories(query, {
            type: params.type as string | undefined,
            projectPath,
            limit,
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
        };

        const searchTranscriptsLocal = () => {
          const provider = vault.getProvider();
          const candidates = searchTranscriptSegments(provider, query, {
            projectPath,
            limit,
          });
          return rankTranscriptCandidates(candidates, query, { limit });
        };

        if (source === 'transcript') {
          return searchTranscriptsLocal();
        }

        if (source === 'all') {
          return {
            memories: searchMemoriesLocal(),
            transcripts: searchTranscriptsLocal(),
          };
        }

        // default: 'memory' — existing behavior
        return searchMemoriesLocal();
      },
    },
    {
      name: 'memory_capture',
      description: 'Capture a memory — session summary, lesson learned, or preference.',
      auth: 'write',
      schema: z
        .object({
          projectPath: z.string().optional().default('.'),
          type: z
            .enum(['session', 'lesson', 'preference'])
            .optional()
            .default('lesson')
            .describe('Memory type: session | lesson | preference (default: "lesson")'),
          context: z.string().optional().describe('What was happening — situation or task context'),
          summary: z.string().optional().describe('What was learned or decided'),
          content: z
            .string()
            .optional()
            .describe('Alias: sets both context and summary when neither is provided'),
          topics: z.array(z.string()).optional().default([]),
          filesModified: z.array(z.string()).optional().default([]),
          toolsUsed: z.array(z.string()).optional().default([]),
        })
        .refine(
          (v) => v.context !== undefined || v.summary !== undefined || v.content !== undefined,
          {
            message: 'Provide at least one of: context, summary, or content',
          },
        ),
      handler: async (params) => {
        const rawContent = params.content as string | undefined;
        const memory = vault.captureMemory({
          projectPath: params.projectPath as string,
          type: params.type as 'session' | 'lesson' | 'preference',
          context: (params.context as string | undefined) ?? rawContent ?? '',
          summary: (params.summary as string | undefined) ?? rawContent ?? '',
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
        const { findProjectRoot } = await import('../../paths.js');
        const projectPath = findProjectRoot(resolve((params.projectPath as string) ?? '.'));
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

    // ─── Transcript ops ─────────────────────────────────────────
    {
      name: 'transcript_capture',
      description: 'Persist raw transcript data as a searchable transcript session.',
      auth: 'write',
      schema: z.object({
        projectPath: z.string().optional(),
        sessionId: z.string().optional(),
        title: z.string().optional(),
        sourceKind: z.enum(['live_chat', 'imported_text', 'imported_file', 'external']).optional(),
        sourceRef: z.string().optional(),
        participants: z.array(z.string()).optional(),
        tags: z.array(z.string()).optional(),
        importance: z.number().optional(),
        segmentMode: z.enum(['exchange', 'window']).optional(),
        messages: z
          .array(
            z.object({
              role: z.enum(['user', 'assistant', 'system', 'tool']),
              content: z.string(),
              speaker: z.string().optional(),
              timestamp: z.number().optional(),
            }),
          )
          .optional(),
        text: z.string().optional(),
        transcriptPath: z.string().optional(),
      }),
      handler: async (params) => {
        const provider = vault.getProvider();
        return captureTranscriptSession(provider, {
          projectPath: params.projectPath as string | undefined,
          sessionId: params.sessionId as string | undefined,
          title: params.title as string | undefined,
          sourceKind: params.sourceKind as
            | 'live_chat'
            | 'imported_text'
            | 'imported_file'
            | 'external'
            | undefined,
          sourceRef: params.sourceRef as string | undefined,
          participants: params.participants as string[] | undefined,
          tags: params.tags as string[] | undefined,
          importance: params.importance as number | undefined,
          segmentMode: params.segmentMode as 'exchange' | 'window' | undefined,
          messages: params.messages as
            | Array<{
                role: 'user' | 'assistant' | 'system' | 'tool';
                content: string;
                speaker?: string;
                timestamp?: number;
              }>
            | undefined,
          text: params.text as string | undefined,
          transcriptPath: params.transcriptPath as string | undefined,
        });
      },
    },
    {
      name: 'transcript_search',
      description: 'Search raw transcript segments for exact recall.',
      auth: 'read',
      schema: z.object({
        query: z.string(),
        projectPath: z.string().optional(),
        sessionId: z.string().optional(),
        sourceKind: z.enum(['live_chat', 'imported_text', 'imported_file', 'external']).optional(),
        role: z.enum(['user', 'assistant', 'system', 'tool']).optional(),
        startedAfter: z.number().optional(),
        startedBefore: z.number().optional(),
        limit: z.number().optional(),
        verbose: z.boolean().optional(),
      }),
      handler: async (params) => {
        const provider = vault.getProvider();
        const query = params.query as string;
        const limit = (params.limit as number) ?? 10;

        const candidates = searchTranscriptSegments(provider, query, {
          projectPath: params.projectPath as string | undefined,
          sessionId: params.sessionId as string | undefined,
          sourceKind: params.sourceKind as string | undefined,
          limit,
        });

        return rankTranscriptCandidates(candidates, query, {
          limit,
          verbose: params.verbose as boolean | undefined,
        });
      },
    },
    {
      name: 'transcript_session_get',
      description: 'Replay exact messages for a transcript session or range.',
      auth: 'read',
      schema: z.object({
        sessionId: z.string(),
        seqStart: z.number().optional(),
        seqEnd: z.number().optional(),
        aroundSeq: z.number().optional().describe('Center the range around this sequence number'),
        before: z.number().optional().describe('Number of messages before aroundSeq (default 5)'),
        after: z.number().optional().describe('Number of messages after aroundSeq (default 5)'),
      }),
      handler: async (params) => {
        const provider = vault.getProvider();
        const sessionId = params.sessionId as string;

        const session = getTranscriptSession(provider, sessionId);
        if (!session) {
          return { error: `Transcript session not found: ${sessionId}` };
        }

        let range: { seqStart?: number; seqEnd?: number } | undefined;

        if (params.aroundSeq !== undefined) {
          const aroundSeq = params.aroundSeq as number;
          const before = (params.before as number) ?? 5;
          const after = (params.after as number) ?? 5;
          range = {
            seqStart: Math.max(0, aroundSeq - before),
            seqEnd: aroundSeq + after,
          };
        } else if (params.seqStart !== undefined || params.seqEnd !== undefined) {
          range = {
            seqStart: params.seqStart as number | undefined,
            seqEnd: params.seqEnd as number | undefined,
          };
        }

        const messages = getTranscriptMessages(provider, sessionId, range);

        return {
          session,
          messages,
          totalMessages: session.messageCount,
        };
      },
    },
    {
      name: 'transcript_promote',
      description: 'Promote a raw transcript span to structured memory or vault knowledge.',
      auth: 'write',
      schema: z.object({
        sessionId: z.string(),
        seqStart: z.number(),
        seqEnd: z.number(),
        target: z.enum(['memory', 'vault']),
        memoryType: z
          .enum(['session', 'lesson', 'preference'])
          .optional()
          .describe('Memory type when target is memory (default: lesson)'),
        entryType: z
          .enum(['pattern', 'anti-pattern', 'rule', 'playbook'])
          .optional()
          .describe('Entry type when target is vault (default: pattern)'),
        title: z.string().optional(),
        domain: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }),
      handler: async (params) => {
        const provider = vault.getProvider();
        const sessionId = params.sessionId as string;
        const seqStart = params.seqStart as number;
        const seqEnd = params.seqEnd as number;
        const target = params.target as 'memory' | 'vault';

        const messages = getTranscriptMessages(provider, sessionId, { seqStart, seqEnd });
        if (messages.length === 0) {
          return { promoted: false, error: 'No messages found in the specified range.' };
        }

        const spanText = messages.map((m) => `${m.role}: ${m.content}`).join('\n');
        const citation = { promotedFrom: { sessionId, seqStart, seqEnd } };

        if (target === 'memory') {
          const memoryType = (params.memoryType as 'session' | 'lesson' | 'preference') ?? 'lesson';
          const memory = vault.captureMemory({
            projectPath: '.',
            type: memoryType,
            context: `Promoted from transcript ${sessionId} [${seqStart}-${seqEnd}]`,
            summary: spanText,
            topics: (params.tags as string[]) ?? [],
            filesModified: [],
            toolsUsed: [],
            intent: null,
            decisions: [],
            currentState: JSON.stringify(citation),
            nextSteps: [],
            vaultEntriesReferenced: [],
          });
          return { promoted: true, target: 'memory', id: memory.id };
        }

        // target === 'vault'
        const entryType =
          (params.entryType as 'pattern' | 'anti-pattern' | 'rule' | 'playbook') ?? 'pattern';
        const entryId = `ve-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const title = (params.title as string) ?? `Promoted from transcript ${sessionId}`;
        const domain = (params.domain as string) ?? 'general';
        const tags = (params.tags as string[]) ?? [];

        vault.add({
          id: entryId,
          type: entryType,
          domain,
          title,
          severity: 'suggestion',
          description: spanText,
          context: JSON.stringify(citation),
          tags,
        });

        return { promoted: true, target: 'vault', id: entryId };
      },
    },

    // ─── Satellite ops ───────────────────────────────────────────
    ...createMemoryExtraOps(runtime),
    ...createMemoryCrossProjectOps(runtime),
    ...createMemorySyncOps(runtime),
  ];
}
