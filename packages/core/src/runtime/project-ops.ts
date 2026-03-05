/**
 * Project registry operations — 12 ops for managing projects, rules, and links.
 *
 * These ops expose the ProjectRegistry module as facade operations.
 * All state is persisted in the Vault's SQLite database.
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from './types.js';

/**
 * Create the 12 project registry operations for an agent runtime.
 *
 * Groups: projects (3), rules (4), links (4), misc (1).
 */
export function createProjectOps(runtime: AgentRuntime): OpDefinition[] {
  const { projectRegistry } = runtime;

  return [
    // ─── Projects ───────────────────────────────────────────────────
    {
      name: 'project_get',
      description: 'Get a registered project by ID.',
      auth: 'read',
      schema: z.object({
        projectId: z.string().describe('Project ID to look up'),
      }),
      handler: async (params) => {
        const project = projectRegistry.get(params.projectId as string);
        if (!project) {
          return { found: false, project: null };
        }
        return { found: true, project };
      },
    },
    {
      name: 'project_list',
      description: 'List all registered projects, ordered by last accessed time.',
      auth: 'read',
      handler: async () => {
        const projects = projectRegistry.list();
        return { count: projects.length, projects };
      },
    },
    {
      name: 'project_unregister',
      description: 'Unregister a project — removes it and all associated rules and links.',
      auth: 'write',
      schema: z.object({
        projectId: z.string().describe('Project ID to unregister'),
      }),
      handler: async (params) => {
        const removed = projectRegistry.unregister(params.projectId as string);
        return { removed, projectId: params.projectId };
      },
    },

    // ─── Rules ──────────────────────────────────────────────────────
    {
      name: 'project_get_rules',
      description: 'Get all rules for a specific project.',
      auth: 'read',
      schema: z.object({
        projectId: z.string().describe('Project ID'),
      }),
      handler: async (params) => {
        const rules = projectRegistry.getRules(params.projectId as string);
        return { count: rules.length, rules };
      },
    },
    {
      name: 'project_list_rules',
      description: 'List all projects with their associated rules.',
      auth: 'read',
      handler: async () => {
        const result = projectRegistry.listRulesAll();
        return {
          count: result.length,
          projects: result.map((r) => ({
            project: r.project,
            ruleCount: r.rules.length,
            rules: r.rules,
          })),
        };
      },
    },
    {
      name: 'project_add_rule',
      description: 'Add a rule to a project — behavior, preference, restriction, or convention.',
      auth: 'write',
      schema: z.object({
        projectId: z.string().describe('Project ID to add the rule to'),
        category: z.enum(['behavior', 'preference', 'restriction', 'convention']).describe('Rule category'),
        text: z.string().describe('Rule text'),
        priority: z.number().default(0).describe('Priority (higher = more important)'),
      }),
      handler: async (params) => {
        const rule = projectRegistry.addRule(params.projectId as string, {
          category: params.category as 'behavior' | 'preference' | 'restriction' | 'convention',
          text: params.text as string,
          priority: (params.priority as number) ?? 0,
        });
        return { added: true, rule };
      },
    },
    {
      name: 'project_remove_rule',
      description: 'Remove a project rule by its ID.',
      auth: 'write',
      schema: z.object({
        ruleId: z.string().describe('Rule ID to remove'),
      }),
      handler: async (params) => {
        const removed = projectRegistry.removeRule(params.ruleId as string);
        return { removed, ruleId: params.ruleId };
      },
    },

    // ─── Links ──────────────────────────────────────────────────────
    {
      name: 'project_link',
      description: 'Create a link between two projects (related, parent, child, fork).',
      auth: 'write',
      schema: z.object({
        sourceId: z.string().describe('Source project ID'),
        targetId: z.string().describe('Target project ID'),
        linkType: z.enum(['related', 'parent', 'child', 'fork']).describe('Type of link'),
      }),
      handler: async (params) => {
        const link = projectRegistry.link(
          params.sourceId as string,
          params.targetId as string,
          params.linkType as 'related' | 'parent' | 'child' | 'fork',
        );
        return { linked: true, link };
      },
    },
    {
      name: 'project_unlink',
      description: 'Remove links between two projects. Omit linkType to remove all link types.',
      auth: 'write',
      schema: z.object({
        sourceId: z.string().describe('Source project ID'),
        targetId: z.string().describe('Target project ID'),
        linkType: z.enum(['related', 'parent', 'child', 'fork']).optional().describe('Specific link type to remove'),
      }),
      handler: async (params) => {
        const count = projectRegistry.unlink(
          params.sourceId as string,
          params.targetId as string,
          params.linkType as 'related' | 'parent' | 'child' | 'fork' | undefined,
        );
        return { removed: count, sourceId: params.sourceId, targetId: params.targetId };
      },
    },
    {
      name: 'project_get_links',
      description: 'Get all links for a project (both incoming and outgoing).',
      auth: 'read',
      schema: z.object({
        projectId: z.string().describe('Project ID'),
      }),
      handler: async (params) => {
        const links = projectRegistry.getLinks(params.projectId as string);
        return { count: links.length, links };
      },
    },
    {
      name: 'project_linked_projects',
      description: 'Get linked projects with full details — project info, link type, and direction.',
      auth: 'read',
      schema: z.object({
        projectId: z.string().describe('Project ID'),
      }),
      handler: async (params) => {
        const linked = projectRegistry.getLinkedProjects(params.projectId as string);
        return { count: linked.length, linked };
      },
    },

    // ─── Misc ───────────────────────────────────────────────────────
    {
      name: 'project_touch',
      description: 'Update the last accessed timestamp for a project.',
      auth: 'write',
      schema: z.object({
        projectId: z.string().describe('Project ID to touch'),
      }),
      handler: async (params) => {
        projectRegistry.touch(params.projectId as string);
        return { touched: true, projectId: params.projectId };
      },
    },
  ];
}
