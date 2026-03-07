/**
 * Memory facade — session & cross-project memory ops.
 * capture, search, dedup, promote.
 */

import { z } from 'zod';
import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';
import { createMemoryExtraOps } from '../memory-extra-ops.js';
import { createMemoryCrossProjectOps } from '../memory-cross-project-ops.js';

export function createMemoryFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  const { vault } = runtime;

  return [
    // ─── Memory (inline from core-ops.ts) ───────────────────────
    {
      name: 'memory_search',
      description: 'Search memories using full-text search.',
      auth: 'read',
      schema: z.object({
        query: z.string(),
        type: z.enum(['session', 'lesson', 'preference']).optional(),
        projectPath: z.string().optional(),
        limit: z.number().optional(),
      }),
      handler: async (params) => {
        return vault.searchMemories(params.query as string, {
          type: params.type as string | undefined,
          projectPath: params.projectPath as string | undefined,
          limit: (params.limit as number) ?? 10,
        });
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
        });
        return { captured: true, memory };
      },
    },
    {
      name: 'memory_list',
      description: 'List memories with optional filters.',
      auth: 'read',
      schema: z.object({
        type: z.enum(['session', 'lesson', 'preference']).optional(),
        projectPath: z.string().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }),
      handler: async (params) => {
        const memories = vault.listMemories({
          type: params.type as string | undefined,
          projectPath: params.projectPath as string | undefined,
          limit: (params.limit as number) ?? 50,
          offset: (params.offset as number) ?? 0,
        });
        const stats = vault.memoryStats();
        return { memories, stats };
      },
    },
    {
      name: 'session_capture',
      description:
        'Capture a session summary before context compaction. Called automatically by PreCompact hook.',
      auth: 'write',
      schema: z.object({
        projectPath: z.string().optional().default('.'),
        summary: z.string().describe('Brief summary of what was accomplished in this session'),
        topics: z.array(z.string()).optional().default([]),
        filesModified: z.array(z.string()).optional().default([]),
        toolsUsed: z.array(z.string()).optional().default([]),
      }),
      handler: async (params) => {
        const { resolve } = await import('node:path');
        const projectPath = resolve((params.projectPath as string) ?? '.');
        const memory = vault.captureMemory({
          projectPath,
          type: 'session',
          context: 'Auto-captured before context compaction',
          summary: params.summary as string,
          topics: (params.topics as string[]) ?? [],
          filesModified: (params.filesModified as string[]) ?? [],
          toolsUsed: (params.toolsUsed as string[]) ?? [],
        });
        return { captured: true, memory, message: 'Session summary saved to memory.' };
      },
    },

    // ─── Satellite ops ───────────────────────────────────────────
    ...createMemoryExtraOps(runtime),
    ...createMemoryCrossProjectOps(runtime),
  ];
}
