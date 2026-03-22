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
          return { results: memories, total: memories.length };
        }
        return {
          results: memories.map((m) => ({
            id: m.id,
            summary: truncateSummary(m.summary || m.context),
            score: null,
            project: m.projectPath,
          })),
          total: memories.length,
        };
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
          entries: memories.map((m) => ({
            id: m.id,
            summary: truncateSummary(m.summary || m.context),
            project: m.projectPath,
            createdAt: m.createdAt,
          })),
          total: stats.total,
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

    // ─── Satellite ops ───────────────────────────────────────────
    ...createMemoryExtraOps(runtime),
    ...createMemoryCrossProjectOps(runtime),
  ];
}
