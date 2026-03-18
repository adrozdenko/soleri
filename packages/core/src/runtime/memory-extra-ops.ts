/**
 * Extended memory operations — 8 ops for advanced memory management.
 *
 * These complement the 4 base memory ops in core-ops.ts:
 *   memory_search, memory_capture, memory_list, session_capture
 *
 * New ops: memory_delete, memory_stats, memory_export, memory_import,
 *          memory_prune, memory_deduplicate, memory_topics, memory_by_project
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from './types.js';

export function createMemoryExtraOps(runtime: AgentRuntime): OpDefinition[] {
  const { vault } = runtime;

  return [
    {
      name: 'memory_delete',
      description: 'Delete a memory by ID. Returns whether the deletion was successful.',
      auth: 'write',
      schema: z.object({
        memoryId: z.string().describe('The memory ID to delete'),
      }),
      handler: async (params) => {
        const memoryId = params.memoryId as string;
        const existing = vault.getMemory(memoryId);
        if (!existing) {
          return { deleted: false, error: `Memory "${memoryId}" not found.` };
        }
        const deleted = vault.deleteMemory(memoryId);
        return { deleted, memoryId };
      },
    },
    {
      name: 'memory_stats',
      description:
        'Detailed memory statistics — counts by type, project, date range, plus oldest/newest timestamps and archived count.',
      auth: 'read',
      schema: z.object({
        projectPath: z.string().optional().describe('Filter stats to a specific project'),
        fromDate: z
          .number()
          .optional()
          .describe('Unix timestamp — only include memories created after this date'),
        toDate: z
          .number()
          .optional()
          .describe('Unix timestamp — only include memories created before this date'),
      }),
      handler: async (params) => {
        return vault.memoryStatsDetailed({
          projectPath: params.projectPath as string | undefined,
          fromDate: params.fromDate as number | undefined,
          toDate: params.toDate as number | undefined,
        });
      },
    },
    {
      name: 'memory_export',
      description:
        'Export memories as a JSON array. Optionally filter by project or type. Useful for backup and migration.',
      auth: 'read',
      schema: z.object({
        projectPath: z.string().optional().describe('Filter to a specific project'),
        type: z
          .enum(['session', 'lesson', 'preference'])
          .optional()
          .describe('Filter by memory type'),
        includeArchived: z
          .boolean()
          .optional()
          .default(false)
          .describe('Whether to include archived memories'),
      }),
      handler: async (params) => {
        const memories = vault.exportMemories({
          projectPath: params.projectPath as string | undefined,
          type: params.type as string | undefined,
          includeArchived: (params.includeArchived as boolean | undefined) ?? false,
        });
        return { exported: true, count: memories.length, memories };
      },
    },
    {
      name: 'memory_import',
      description:
        'Import memories from a JSON array. Duplicates (same ID) are skipped. Returns imported and skipped counts.',
      auth: 'write',
      schema: z.object({
        memories: z
          .array(
            z.object({
              id: z.string(),
              projectPath: z.string(),
              type: z.enum(['session', 'lesson', 'preference']),
              context: z.string(),
              summary: z.string(),
              topics: z.array(z.string()).optional().default([]),
              filesModified: z.array(z.string()).optional().default([]),
              toolsUsed: z.array(z.string()).optional().default([]),
              createdAt: z.number(),
              archivedAt: z.number().nullable().optional().default(null),
            }),
          )
          .describe('Array of memory objects to import'),
      }),
      handler: async (params) => {
        const memories = (params.memories as Array<Record<string, unknown>>).map((m) => ({
          id: m.id as string,
          projectPath: m.projectPath as string,
          type: m.type as 'session' | 'lesson' | 'preference',
          context: m.context as string,
          summary: m.summary as string,
          topics: (m.topics as string[]) ?? [],
          filesModified: (m.filesModified as string[]) ?? [],
          toolsUsed: (m.toolsUsed as string[]) ?? [],
          intent: (m.intent as string) ?? null,
          decisions: (m.decisions as string[]) ?? [],
          currentState: (m.currentState as string) ?? null,
          nextSteps: (m.nextSteps as string[]) ?? [],
          vaultEntriesReferenced: (m.vaultEntriesReferenced as string[]) ?? [],
          createdAt: m.createdAt as number,
          archivedAt: (m.archivedAt as number | null) ?? null,
        }));
        const result = vault.importMemories(memories);
        return { ...result, total: memories.length };
      },
    },
    {
      name: 'memory_prune',
      description:
        'Delete non-archived memories older than N days. Destructive — cannot be undone.',
      auth: 'admin',
      schema: z.object({
        olderThanDays: z.number().min(1).describe('Delete memories older than this many days'),
      }),
      handler: async (params) => {
        const days = params.olderThanDays as number;
        const result = vault.pruneMemories(days);
        return { ...result, olderThanDays: days };
      },
    },
    {
      name: 'memory_deduplicate',
      description:
        'Find and remove duplicate memories (same summary + project + type). Keeps the earliest entry in each duplicate group.',
      auth: 'admin',
      schema: z.object({}),
      handler: async () => {
        return vault.deduplicateMemories();
      },
    },
    {
      name: 'memory_topics',
      description:
        'List all unique topics across memories, with occurrence counts. Sorted by frequency descending.',
      auth: 'read',
      schema: z.object({}),
      handler: async () => {
        const topics = vault.memoryTopics();
        return { count: topics.length, topics };
      },
    },
    {
      name: 'memory_by_project',
      description:
        'List memories grouped by project path. Each group includes the project path, count, and the memories themselves.',
      auth: 'read',
      schema: z.object({
        includeMemories: z
          .boolean()
          .optional()
          .default(true)
          .describe('Whether to include full memory objects or just counts'),
      }),
      handler: async (params) => {
        const includeMemories = (params.includeMemories as boolean | undefined) ?? true;
        const groups = vault.memoriesByProject();
        if (!includeMemories) {
          return {
            count: groups.length,
            projects: groups.map((g) => ({ project: g.project, count: g.count })),
          };
        }
        return { count: groups.length, projects: groups };
      },
    },
  ];
}
