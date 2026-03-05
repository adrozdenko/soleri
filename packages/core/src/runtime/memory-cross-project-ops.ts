/**
 * Cross-project memory operations — 3 ops for sharing knowledge across linked projects.
 *
 * Ops: memory_promote_to_global, memory_configure, memory_cross_project_search.
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from './types.js';

/**
 * Create the 3 cross-project memory operations for an agent runtime.
 */
export function createMemoryCrossProjectOps(runtime: AgentRuntime): OpDefinition[] {
  const { vault, projectRegistry } = runtime;

  return [
    {
      name: 'memory_promote_to_global',
      description:
        'Promote a vault entry to the global pool by adding a _global tag. Promoted entries surface in cross-project searches across all linked projects.',
      auth: 'write',
      schema: z.object({
        entryId: z.string().describe('The vault entry ID to promote.'),
      }),
      handler: async (params) => {
        const entryId = params.entryId as string;
        const entry = vault.get(entryId);
        if (!entry) return { promoted: false, error: `Entry not found: ${entryId}` };

        const tags = entry.tags ?? [];
        if (tags.includes('_global')) {
          return { promoted: false, entryId, message: 'Entry is already promoted to global.' };
        }

        vault.update(entryId, { tags: [...tags, '_global'] });
        return { promoted: true, entryId, tags: [...tags, '_global'] };
      },
    },

    {
      name: 'memory_configure',
      description:
        'Configure cross-project memory settings for a project. Stores config in the project registry metadata.',
      auth: 'admin',
      schema: z.object({
        projectPath: z.string().describe('Project path to configure.'),
        crossProjectEnabled: z
          .boolean()
          .optional()
          .describe('Enable/disable cross-project memory search.'),
        extraPaths: z
          .array(z.string())
          .optional()
          .describe('Additional project paths to include in cross-project searches.'),
      }),
      handler: async (params) => {
        const projectPath = params.projectPath as string;
        const project = projectRegistry.getByPath(projectPath);
        if (!project) {
          return { configured: false, error: `Project not registered: ${projectPath}` };
        }

        const currentMeta = project.metadata ?? {};
        const memoryConfig = (currentMeta.memoryConfig as Record<string, unknown>) ?? {};

        if (params.crossProjectEnabled !== undefined) {
          memoryConfig.crossProjectEnabled = params.crossProjectEnabled;
        }
        if (params.extraPaths !== undefined) {
          memoryConfig.extraPaths = params.extraPaths;
        }

        projectRegistry.register(projectPath, project.name, {
          ...currentMeta,
          memoryConfig,
        });

        return { configured: true, projectPath, memoryConfig };
      },
    },

    {
      name: 'memory_cross_project_search',
      description:
        'Search memories across the current project and all linked projects. Results weighted: current=1.0, global=0.9, linked=0.8. Requires cross-project search to be enabled.',
      auth: 'read',
      schema: z.object({
        query: z.string().describe('Search query.'),
        projectPath: z.string().describe('Current project path.'),
        type: z
          .enum(['session', 'lesson', 'preference'])
          .optional()
          .describe('Filter by memory type.'),
        limit: z.number().optional().describe('Max results per project (default 10).'),
      }),
      handler: async (params) => {
        const query = params.query as string;
        const projectPath = params.projectPath as string;
        const type = params.type as string | undefined;
        const limit = (params.limit as number) ?? 10;

        // Search current project (weight 1.0)
        const currentResults = vault.searchMemories(query, { projectPath, type, limit });
        const weightedResults = currentResults.map((m) => ({
          memory: m,
          weight: 1.0,
          source: 'current' as const,
        }));

        // Search for globally promoted entries (search broadly, then filter for _global tag)
        const allResults = vault.search(query, { limit: limit * 3 });
        const globalEntries = allResults
          .filter((r) => r.entry.tags?.includes('_global'))
          .slice(0, limit)
          .map((r) => ({
            entry: r.entry,
            score: r.score,
            weight: 0.9,
            source: 'global' as const,
          }));

        // Get linked projects and search their memories
        const project = projectRegistry.getByPath(projectPath);
        const linkedMemories: Array<{
          memory: (typeof currentResults)[0];
          weight: number;
          source: 'linked';
          linkedProject: string;
        }> = [];

        if (project) {
          const config = (project.metadata?.memoryConfig as Record<string, unknown>) ?? {};
          const enabled = config.crossProjectEnabled !== false; // default enabled

          if (enabled) {
            const linked = projectRegistry.getLinkedProjects(project.id);
            for (const { project: linkedProj } of linked) {
              const results = vault.searchMemories(query, {
                projectPath: linkedProj.path,
                type,
                limit: Math.ceil(limit / 2), // fewer results from linked projects
              });
              for (const m of results) {
                linkedMemories.push({
                  memory: m,
                  weight: 0.8,
                  source: 'linked',
                  linkedProject: linkedProj.path,
                });
              }
            }

            // Also search extra paths
            const extraPaths = (config.extraPaths as string[]) ?? [];
            for (const extraPath of extraPaths) {
              const results = vault.searchMemories(query, {
                projectPath: extraPath,
                type,
                limit: Math.ceil(limit / 2),
              });
              for (const m of results) {
                linkedMemories.push({
                  memory: m,
                  weight: 0.7,
                  source: 'linked',
                  linkedProject: extraPath,
                });
              }
            }
          }
        }

        // Deduplicate by memory ID
        const seen = new Set(weightedResults.map((r) => r.memory.id));
        const dedupedLinked = linkedMemories.filter((r) => {
          if (seen.has(r.memory.id)) return false;
          seen.add(r.memory.id);
          return true;
        });

        return {
          memories: weightedResults,
          globalEntries,
          linkedMemories: dedupedLinked,
          totalResults:
            weightedResults.length + globalEntries.length + dedupedLinked.length,
        };
      },
    },
  ];
}
