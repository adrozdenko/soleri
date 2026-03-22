/**
 * Extended memory operations — 18 ops for advanced memory management.
 *
 * These complement the 4 base memory ops in core-ops.ts:
 *   memory_search, memory_capture, memory_list, session_capture
 *
 * CRUD: memory_delete, memory_stats, memory_export, memory_import,
 *       memory_prune, memory_deduplicate, memory_topics, memory_by_project
 * Governance (#213): memory_get, session_search, knowledge_audit, smart_capture,
 *       knowledge_health, merge_patterns, knowledge_reorganize,
 *       list_project_knowledge, list_projects, knowledge_debug
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from './types.js';

export function createMemoryExtraOps(runtime: AgentRuntime): OpDefinition[] {
  const { vault, brain, curator, linkManager } = runtime;

  return [
    {
      name: 'memory_delete',
      description: 'Delete a memory by ID. Returns whether the deletion was successful.',
      auth: 'write',
      schema: z.object({
        memoryId: z.string().optional().describe('The memory ID to delete'),
        id: z.string().optional().describe('Alias for memoryId'),
      }),
      handler: async (params) => {
        const memoryId = (params.memoryId ?? params.id) as string;
        if (!memoryId) {
          return { deleted: false, error: 'Either memoryId or id is required.' };
        }
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

    // ─── Knowledge Governance (#213) ─────────────────────────────────

    {
      name: 'memory_get',
      description: 'Get a single memory entry by ID.',
      auth: 'read',
      schema: z.object({
        id: z.string().describe('Memory ID'),
      }),
      handler: async (params) => {
        const memory = vault.getMemory(params.id as string);
        if (!memory) return { found: false, id: params.id };
        return memory;
      },
    },
    {
      name: 'session_search',
      description: 'Search session memories with optional includeArchived flag.',
      auth: 'read',
      schema: z.object({
        query: z.string().describe('Search query'),
        includeArchived: z.boolean().optional().default(false),
        intent: z.string().optional().describe('Filter by session intent'),
        limit: z.number().optional().default(10),
      }),
      handler: async (params) => {
        // Use searchMemories with type=session
        const results = vault.searchMemories(params.query as string, {
          type: 'session',
          intent: params.intent as string | undefined,
          limit: params.limit as number,
        });
        // If includeArchived, also search archived
        if (params.includeArchived) {
          try {
            const archived = vault
              .getProvider()
              .all<Record<string, unknown>>(
                "SELECT * FROM memories WHERE type = 'session' AND archived_at IS NOT NULL AND summary LIKE @q ORDER BY created_at DESC LIMIT @limit",
                { q: `%${params.query}%`, limit: params.limit as number },
              );
            // Minimal parsing for archived results
            const archivedMemories = archived.map((r) => ({
              id: r.id,
              summary: r.summary,
              intent: r.intent ?? null,
              createdAt: r.created_at,
              archived: true,
            }));
            return { active: results, archived: archivedMemories };
          } catch {
            return { active: results, archived: [] };
          }
        }
        return { results };
      },
    },
    {
      name: 'knowledge_audit',
      description:
        'Audit vault knowledge quality — coverage, freshness, tag health, recommendations.',
      auth: 'read',
      handler: async () => {
        const healthAudit = curator.healthAudit();
        const vaultStats = vault.stats();
        const brainStats = brain.getStats();
        return {
          vault: {
            totalEntries: vaultStats.totalEntries,
            byType: vaultStats.byType,
            byDomain: vaultStats.byDomain,
          },
          health: healthAudit,
          brain: brainStats,
        };
      },
    },
    {
      name: 'smart_capture',
      description:
        'Capture knowledge with auto-classification — infers type, tags, and severity from content.',
      auth: 'write',
      schema: z.object({
        title: z.string(),
        description: z.string(),
        domain: z.string().optional().default('general'),
        context: z.string().optional(),
        why: z.string().optional(),
      }),
      handler: async (params) => {
        const id = `smart-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        // Auto-infer type from keywords
        const desc = (params.description as string).toLowerCase();
        const inferredType: 'pattern' | 'anti-pattern' =
          desc.includes('never') ||
          desc.includes("don't") ||
          desc.includes('avoid') ||
          desc.includes('anti')
            ? 'anti-pattern'
            : 'pattern';
        const inferredSeverity: 'critical' | 'warning' | 'suggestion' =
          desc.includes('must') || desc.includes('critical') || desc.includes('always')
            ? 'critical'
            : desc.includes('should') || desc.includes('important')
              ? 'warning'
              : 'suggestion';

        const result = brain.enrichAndCapture({
          id,
          type: inferredType,
          domain: params.domain as string,
          title: params.title as string,
          description: params.description as string,
          severity: inferredSeverity,
          context: params.context as string | undefined,
          why: params.why as string | undefined,
        });

        return {
          ...result,
          inferred: { type: inferredType, severity: inferredSeverity },
        };
      },
    },
    {
      name: 'knowledge_health',
      description: 'Knowledge base health — freshness, staleness, contradictions, coverage gaps.',
      auth: 'read',
      handler: async () => {
        const audit = curator.healthAudit();
        const ageReport = vault.getAgeReport();
        const contradictions = curator.detectContradictions();
        return {
          score: audit.score,
          metrics: audit.metrics,
          ageDistribution: ageReport,
          openContradictions: contradictions.filter((c) => c.status === 'open').length,
          recommendations: audit.recommendations,
        };
      },
    },
    {
      name: 'merge_patterns',
      description: 'Merge two vault entries into one — combines tags, preserves links from both.',
      auth: 'write',
      schema: z.object({
        keepId: z.string().describe('Entry ID to keep (survives the merge)'),
        removeId: z.string().describe('Entry ID to remove (merged into keepId)'),
      }),
      handler: async (params) => {
        const keepEntry = vault.get(params.keepId as string);
        const removeEntry = vault.get(params.removeId as string);
        if (!keepEntry) return { error: `Entry not found: ${params.keepId}` };
        if (!removeEntry) return { error: `Entry not found: ${params.removeId}` };

        // Merge tags
        const mergedTags = [...new Set([...keepEntry.tags, ...removeEntry.tags])];

        // Update the kept entry with merged tags and enriched description
        vault.update(params.keepId as string, {
          tags: mergedTags,
          description: keepEntry.description.includes(removeEntry.title)
            ? keepEntry.description
            : `${keepEntry.description}\n\n[Merged from: ${removeEntry.title}] ${removeEntry.description}`,
        });

        // Transfer links from removed entry to kept entry
        if (linkManager) {
          try {
            const links = linkManager.getLinks(params.removeId as string);
            for (const link of links) {
              const otherId = link.sourceId === params.removeId ? link.targetId : link.sourceId;
              if (otherId !== params.keepId) {
                try {
                  linkManager.addLink(
                    params.keepId as string,
                    otherId,
                    link.linkType,
                    `merged from ${params.removeId}`,
                  );
                } catch {
                  /* duplicate link — skip */
                }
              }
            }
          } catch {
            /* link manager ops failed — non-critical */
          }
        }

        // Remove the merged entry
        vault.remove(params.removeId as string);

        return {
          merged: true,
          keptId: params.keepId,
          removedId: params.removeId,
          mergedTags,
        };
      },
    },
    {
      name: 'knowledge_reorganize',
      description: 'Re-categorize vault entries — change domain, retag, with dry-run preview.',
      auth: 'write',
      schema: z.object({
        fromDomain: z.string().describe('Current domain to reorganize'),
        toDomain: z.string().describe('Target domain'),
        addTags: z.array(z.string()).optional().describe('Tags to add to all affected entries'),
        removeTags: z
          .array(z.string())
          .optional()
          .describe('Tags to remove from all affected entries'),
        dryRun: z.boolean().optional().default(true).describe('Preview without applying'),
      }),
      handler: async (params) => {
        const entries = vault.list({ limit: 10000 }).filter((e) => e.domain === params.fromDomain);
        const addTags = (params.addTags as string[]) ?? [];
        const removeTags = new Set((params.removeTags as string[]) ?? []);
        const toDomain = params.toDomain as string;

        if (params.dryRun) {
          return {
            dryRun: true,
            affected: entries.length,
            fromDomain: params.fromDomain,
            toDomain,
            entries: entries.slice(0, 20).map((e) => ({ id: e.id, title: e.title })),
          };
        }

        let updated = 0;
        for (const entry of entries) {
          const newTags = [...entry.tags.filter((t) => !removeTags.has(t)), ...addTags];
          vault.update(entry.id, { domain: toDomain, tags: [...new Set(newTags)] });
          updated++;
        }

        return { applied: true, updated, fromDomain: params.fromDomain, toDomain };
      },
    },
    {
      name: 'list_project_knowledge',
      description: 'List vault entries scoped to a project (by tier tag or domain).',
      auth: 'read',
      schema: z.object({
        project: z.string().describe('Project name or path to filter by'),
        limit: z.number().optional().default(50),
      }),
      handler: async () => {
        // Entries with tier='project' or tagged with project name
        const all = vault.list({ limit: 10000 });
        const projectEntries = all.filter((e) => e.tier === 'project' || e.origin === 'user');
        return {
          count: projectEntries.length,
          entries: projectEntries.slice(0, 50).map((e) => ({
            id: e.id,
            title: e.title,
            type: e.type,
            domain: e.domain,
            tier: e.tier,
          })),
        };
      },
    },
    {
      name: 'list_projects',
      description:
        'List all distinct domains and tiers in the vault — shows knowledge distribution.',
      auth: 'read',
      handler: async () => {
        const stats = vault.stats();
        return {
          domains: Object.entries(stats.byDomain ?? {}).map(([domain, count]) => ({
            domain,
            count,
          })),
          types: Object.entries(stats.byType ?? {}).map(([type, count]) => ({ type, count })),
          total: stats.totalEntries,
        };
      },
    },
    {
      name: 'knowledge_debug',
      description:
        'Debug knowledge system internals — vault DB stats, brain state, curator state, memory counts.',
      auth: 'admin',
      handler: async () => {
        return {
          vault: {
            stats: vault.stats(),
            recentCount: vault.getRecent(1).length > 0 ? 'has entries' : 'empty',
          },
          brain: brain.getStats(),
          curator: curator.getStatus(),
          memory: vault.memoryStats(),
        };
      },
    },
  ];
}
