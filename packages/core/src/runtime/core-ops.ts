/**
 * Generic core operations factory — 26 ops that every agent gets.
 *
 * These ops are agent-agnostic (no persona, no activation).
 * The 5 agent-specific ops (health, identity, activate, inject_claude_md, setup)
 * stay in generated code because they reference agent-specific modules.
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { IntelligenceEntry } from '../intelligence/types.js';
import type { AgentRuntime } from './types.js';

/**
 * Create the 26 generic core operations for an agent runtime.
 *
 * Groups: search/vault (4), memory (4), export (1), planning (5),
 *         brain (4), curator (8).
 */
export function createCoreOps(runtime: AgentRuntime): OpDefinition[] {
  const { vault, brain, planner, curator, llmClient, keyPool } = runtime;

  return [
    // ─── Search / Vault ──────────────────────────────────────────
    {
      name: 'search',
      description:
        'Search across all knowledge domains. Results ranked by TF-IDF + severity + recency + tag overlap + domain match.',
      auth: 'read',
      schema: z.object({
        query: z.string(),
        domain: z.string().optional(),
        type: z.enum(['pattern', 'anti-pattern', 'rule']).optional(),
        severity: z.enum(['critical', 'warning', 'suggestion']).optional(),
        tags: z.array(z.string()).optional(),
        limit: z.number().optional(),
      }),
      handler: async (params) => {
        return brain.intelligentSearch(params.query as string, {
          domain: params.domain as string | undefined,
          type: params.type as string | undefined,
          severity: params.severity as string | undefined,
          tags: params.tags as string[] | undefined,
          limit: (params.limit as number) ?? 10,
        });
      },
    },
    {
      name: 'vault_stats',
      description: 'Get vault statistics — entry counts by type, domain, severity.',
      auth: 'read',
      handler: async () => vault.stats(),
    },
    {
      name: 'list_all',
      description: 'List all knowledge entries with optional filters.',
      auth: 'read',
      schema: z.object({
        domain: z.string().optional(),
        type: z.enum(['pattern', 'anti-pattern', 'rule']).optional(),
        severity: z.enum(['critical', 'warning', 'suggestion']).optional(),
        tags: z.array(z.string()).optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }),
      handler: async (params) => {
        return vault.list({
          domain: params.domain as string | undefined,
          type: params.type as string | undefined,
          severity: params.severity as string | undefined,
          tags: params.tags as string[] | undefined,
          limit: (params.limit as number) ?? 50,
          offset: (params.offset as number) ?? 0,
        });
      },
    },
    {
      name: 'register',
      description:
        'Register a project for this session. Call on every new session to track usage and get context.',
      auth: 'write',
      schema: z.object({
        projectPath: z.string().optional().default('.'),
        name: z.string().optional().describe('Project display name (derived from path if omitted)'),
      }),
      handler: async (params) => {
        const { resolve } = await import('node:path');
        const projectPath = resolve((params.projectPath as string) ?? '.');
        const project = vault.registerProject(projectPath, params.name as string | undefined);
        const stats = vault.stats();
        const isNew = project.sessionCount === 1;

        return {
          project,
          is_new: isNew,
          message: isNew
            ? 'Welcome! New project registered.'
            : 'Welcome back! Session #' + project.sessionCount + ' for ' + project.name + '.',
          vault: { entries: stats.totalEntries, domains: Object.keys(stats.byDomain) },
        };
      },
    },

    // ─── Memory ──────────────────────────────────────────────────
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

    // ─── Export ───────────────────────────────────────────────────
    {
      name: 'export',
      description:
        'Export vault entries as JSON intelligence bundles — one per domain. Enables version control and sharing.',
      auth: 'read',
      schema: z.object({
        domain: z.string().optional().describe('Export only this domain. Omit to export all.'),
      }),
      handler: async (params) => {
        const stats = vault.stats();
        const domains = params.domain ? [params.domain as string] : Object.keys(stats.byDomain);
        const bundles: Array<{ domain: string; version: string; entries: IntelligenceEntry[] }> =
          [];
        for (const d of domains) {
          const entries = vault.list({ domain: d, limit: 10000 });
          bundles.push({ domain: d, version: '1.0.0', entries });
        }
        return {
          exported: true,
          bundles,
          totalEntries: bundles.reduce((sum, b) => sum + b.entries.length, 0),
          domains: bundles.map((b) => b.domain),
        };
      },
    },

    // ─── Planning ────────────────────────────────────────────────
    {
      name: 'create_plan',
      description:
        'Create a new plan in draft status. Plans track multi-step tasks with decisions and sub-tasks.',
      auth: 'write',
      schema: z.object({
        objective: z.string().describe('What the plan aims to achieve'),
        scope: z.string().describe('Which parts of the codebase are affected'),
        decisions: z.array(z.string()).optional().default([]),
        tasks: z
          .array(z.object({ title: z.string(), description: z.string() }))
          .optional()
          .default([]),
      }),
      handler: async (params) => {
        const plan = planner.create({
          objective: params.objective as string,
          scope: params.scope as string,
          decisions: (params.decisions as string[]) ?? [],
          tasks: (params.tasks as Array<{ title: string; description: string }>) ?? [],
        });
        return { created: true, plan };
      },
    },
    {
      name: 'get_plan',
      description: 'Get a plan by ID, or list all active plans if no ID provided.',
      auth: 'read',
      schema: z.object({
        planId: z.string().optional().describe('Plan ID. Omit to list all active plans.'),
      }),
      handler: async (params) => {
        if (params.planId) {
          const plan = planner.get(params.planId as string);
          if (!plan) return { error: 'Plan not found: ' + params.planId };
          return plan;
        }
        return { active: planner.getActive(), executing: planner.getExecuting() };
      },
    },
    {
      name: 'approve_plan',
      description: 'Approve a draft plan and optionally start execution.',
      auth: 'write',
      schema: z.object({
        planId: z.string(),
        startExecution: z
          .boolean()
          .optional()
          .default(false)
          .describe('If true, immediately start execution after approval'),
      }),
      handler: async (params) => {
        let plan = planner.approve(params.planId as string);
        if (params.startExecution) {
          plan = planner.startExecution(plan.id);
        }
        return { approved: true, executing: plan.status === 'executing', plan };
      },
    },
    {
      name: 'update_task',
      description: 'Update a task status within an executing plan.',
      auth: 'write',
      schema: z.object({
        planId: z.string(),
        taskId: z.string(),
        status: z.enum(['pending', 'in_progress', 'completed', 'skipped', 'failed']),
      }),
      handler: async (params) => {
        const plan = planner.updateTask(
          params.planId as string,
          params.taskId as string,
          params.status as 'pending' | 'in_progress' | 'completed' | 'skipped' | 'failed',
        );
        const task = plan.tasks.find((t) => t.id === params.taskId);
        return { updated: true, task, plan: { id: plan.id, status: plan.status } };
      },
    },
    {
      name: 'complete_plan',
      description: 'Mark an executing plan as completed.',
      auth: 'write',
      schema: z.object({
        planId: z.string(),
      }),
      handler: async (params) => {
        const plan = planner.complete(params.planId as string);
        const taskSummary = {
          completed: plan.tasks.filter((t) => t.status === 'completed').length,
          skipped: plan.tasks.filter((t) => t.status === 'skipped').length,
          failed: plan.tasks.filter((t) => t.status === 'failed').length,
          total: plan.tasks.length,
        };
        return { completed: true, plan, taskSummary };
      },
    },

    // ─── Brain ───────────────────────────────────────────────────
    {
      name: 'record_feedback',
      description:
        'Record feedback on a search result — accepted or dismissed. Used for adaptive weight tuning.',
      auth: 'write',
      schema: z.object({
        query: z.string().describe('The original search query'),
        entryId: z.string().describe('The entry ID that was accepted or dismissed'),
        action: z.enum(['accepted', 'dismissed']),
      }),
      handler: async (params) => {
        brain.recordFeedback(
          params.query as string,
          params.entryId as string,
          params.action as 'accepted' | 'dismissed',
        );
        return {
          recorded: true,
          query: params.query,
          entryId: params.entryId,
          action: params.action,
        };
      },
    },
    {
      name: 'rebuild_vocabulary',
      description: 'Force rebuild the TF-IDF vocabulary from all vault entries.',
      auth: 'write',
      handler: async () => {
        brain.rebuildVocabulary();
        return { rebuilt: true, vocabularySize: brain.getVocabularySize() };
      },
    },
    {
      name: 'brain_stats',
      description:
        'Get brain intelligence stats — vocabulary size, feedback count, current scoring weights.',
      auth: 'read',
      handler: async () => {
        return brain.getStats();
      },
    },
    {
      name: 'llm_status',
      description:
        'LLM client status — provider availability, key pool status, model routing config.',
      auth: 'read',
      handler: async () => {
        const available = llmClient.isAvailable();
        return {
          providers: {
            openai: {
              available: available.openai,
              keyPool: keyPool.openai.hasKeys ? keyPool.openai.getStatus() : null,
            },
            anthropic: {
              available: available.anthropic,
              keyPool: keyPool.anthropic.hasKeys ? keyPool.anthropic.getStatus() : null,
            },
          },
          routes: llmClient.getRoutes(),
        };
      },
    },

    // ─── Curator ─────────────────────────────────────────────────
    {
      name: 'curator_status',
      description: 'Curator status — table row counts, last groomed timestamp.',
      auth: 'read',
      handler: async () => {
        return curator.getStatus();
      },
    },
    {
      name: 'curator_detect_duplicates',
      description: 'Detect duplicate entries using TF-IDF cosine similarity.',
      auth: 'read',
      schema: z.object({
        entryId: z.string().optional().describe('Check a specific entry. Omit to scan all.'),
        threshold: z.number().optional().describe('Similarity threshold (0-1). Default 0.45.'),
      }),
      handler: async (params) => {
        return curator.detectDuplicates(
          params.entryId as string | undefined,
          params.threshold as number | undefined,
        );
      },
    },
    {
      name: 'curator_contradictions',
      description: 'List or detect contradictions between patterns and anti-patterns.',
      auth: 'read',
      schema: z.object({
        status: z.enum(['open', 'resolved', 'dismissed']).optional().describe('Filter by status.'),
        detect: z.boolean().optional().describe('If true, run detection before listing.'),
      }),
      handler: async (params) => {
        if (params.detect) {
          curator.detectContradictions();
        }
        return curator.getContradictions(
          params.status as 'open' | 'resolved' | 'dismissed' | undefined,
        );
      },
    },
    {
      name: 'curator_resolve_contradiction',
      description: 'Resolve or dismiss a contradiction.',
      auth: 'write',
      schema: z.object({
        id: z.number().describe('Contradiction ID.'),
        resolution: z.enum(['resolved', 'dismissed']),
      }),
      handler: async (params) => {
        return curator.resolveContradiction(
          params.id as number,
          params.resolution as 'resolved' | 'dismissed',
        );
      },
    },
    {
      name: 'curator_groom',
      description: 'Groom a single entry — normalize tags, check staleness.',
      auth: 'write',
      schema: z.object({
        entryId: z.string().describe('Entry ID to groom.'),
      }),
      handler: async (params) => {
        return curator.groomEntry(params.entryId as string);
      },
    },
    {
      name: 'curator_groom_all',
      description: 'Groom all vault entries — normalize tags, detect staleness.',
      auth: 'write',
      handler: async () => {
        return curator.groomAll();
      },
    },
    {
      name: 'curator_consolidate',
      description:
        'Consolidate vault — find duplicates, stale entries, contradictions. Dry-run by default.',
      auth: 'write',
      schema: z.object({
        dryRun: z.boolean().optional().describe('Default true. Set false to apply mutations.'),
        staleDaysThreshold: z
          .number()
          .optional()
          .describe('Days before entry is stale. Default 90.'),
        duplicateThreshold: z
          .number()
          .optional()
          .describe('Cosine similarity threshold. Default 0.45.'),
        contradictionThreshold: z
          .number()
          .optional()
          .describe('Contradiction threshold. Default 0.4.'),
      }),
      handler: async (params) => {
        return curator.consolidate({
          dryRun: params.dryRun as boolean | undefined,
          staleDaysThreshold: params.staleDaysThreshold as number | undefined,
          duplicateThreshold: params.duplicateThreshold as number | undefined,
          contradictionThreshold: params.contradictionThreshold as number | undefined,
        });
      },
    },
    {
      name: 'curator_health_audit',
      description:
        'Audit vault health — score (0-100), coverage, freshness, quality, tag health, recommendations.',
      auth: 'read',
      handler: async () => {
        return curator.healthAudit();
      },
    },
  ];
}
