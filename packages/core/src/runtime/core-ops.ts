/**
 * Generic core operations factory — 53 ops that every agent gets.
 *
 * These ops are agent-agnostic (no persona, no activation).
 * The 5 agent-specific ops (health, identity, activate, inject_claude_md, setup)
 * stay in generated code because they reference agent-specific modules.
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { IntelligenceEntry } from '../intelligence/types.js';
import type { AgentRuntime } from './types.js';
import type { GuidelineCategory, OperationalMode } from '../control/types.js';
import type { PolicyType, PolicyPreset } from '../governance/types.js';

/**
 * Create the 53 generic core operations for an agent runtime.
 *
 * Groups: search/vault (4), memory (4), export (1), planning (5),
 *         brain (7), brain intelligence (11), curator (8), control (8),
 *         governance (5).
 */
export function createCoreOps(runtime: AgentRuntime): OpDefinition[] {
  const {
    vault,
    brain,
    brainIntelligence,
    planner,
    curator,
    governance,
    identityManager,
    intentRouter,
    llmClient,
    keyPool,
  } = runtime;

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
      name: 'brain_feedback',
      description:
        'Enhanced feedback with typed actions (accepted/dismissed/modified/failed), source tracking, confidence, duration, and reason.',
      auth: 'write',
      schema: z.object({
        query: z.string().describe('The original search query'),
        entryId: z.string().describe('The entry ID'),
        action: z.enum(['accepted', 'dismissed', 'modified', 'failed']),
        source: z
          .enum(['search', 'recommendation', 'tool-execution', 'explicit'])
          .optional()
          .describe("Feedback source. Default 'search'."),
        confidence: z.number().optional().describe('Confidence 0-1. Default 0.6.'),
        duration: z.number().optional().describe('Duration in ms.'),
        context: z.string().optional().describe("JSON context string. Default '{}'."),
        reason: z.string().optional().describe('Human-readable reason.'),
      }),
      handler: async (params) => {
        const entry = brain.recordFeedback({
          query: params.query as string,
          entryId: params.entryId as string,
          action: params.action as 'accepted' | 'dismissed' | 'modified' | 'failed',
          source: params.source as
            | 'search'
            | 'recommendation'
            | 'tool-execution'
            | 'explicit'
            | undefined,
          confidence: params.confidence as number | undefined,
          duration: params.duration as number | undefined,
          context: params.context as string | undefined,
          reason: params.reason as string | undefined,
        });
        return entry;
      },
    },
    {
      name: 'brain_feedback_stats',
      description:
        'Feedback statistics — counts by action and source, acceptance rate, average confidence.',
      auth: 'read',
      handler: async () => {
        return brain.getFeedbackStats();
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
        'Get brain intelligence stats — vocabulary size, feedback count, current scoring weights, intelligence pipeline stats.',
      auth: 'read',
      handler: async () => {
        const base = brain.getStats();
        const intelligence = brainIntelligence.getStats();
        return { ...base, intelligence };
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

    // ─── Brain Intelligence ───────────────────────────────────────
    {
      name: 'brain_session_context',
      description:
        'Get recent session context — sessions, tool usage frequency, file change frequency.',
      auth: 'read',
      schema: z.object({
        limit: z.number().optional().describe('Number of recent sessions. Default 10.'),
      }),
      handler: async (params) => {
        return brainIntelligence.getSessionContext((params.limit as number) ?? 10);
      },
    },
    {
      name: 'brain_strengths',
      description:
        'Get pattern strength scores. 4-signal scoring: usage (0-25) + spread (0-25) + success (0-25) + recency (0-25).',
      auth: 'read',
      schema: z.object({
        domain: z.string().optional(),
        minStrength: z.number().optional().describe('Minimum strength score (0-100).'),
        limit: z.number().optional(),
      }),
      handler: async (params) => {
        return brainIntelligence.getStrengths({
          domain: params.domain as string | undefined,
          minStrength: params.minStrength as number | undefined,
          limit: (params.limit as number) ?? 50,
        });
      },
    },
    {
      name: 'brain_global_patterns',
      description:
        'Get cross-domain pattern registry — patterns that appear across multiple domains.',
      auth: 'read',
      schema: z.object({
        limit: z.number().optional(),
      }),
      handler: async (params) => {
        return brainIntelligence.getGlobalPatterns((params.limit as number) ?? 20);
      },
    },
    {
      name: 'brain_recommend',
      description:
        'Get pattern recommendations for a task context. Matches domain, task terms, and source-specific acceptance rates against known strengths.',
      auth: 'read',
      schema: z.object({
        domain: z.string().optional(),
        task: z.string().optional().describe('Task description for contextual matching.'),
        source: z
          .string()
          .optional()
          .describe(
            'Feedback source to boost by (search, recommendation, tool-execution, explicit).',
          ),
        limit: z.number().optional(),
      }),
      handler: async (params) => {
        return brainIntelligence.recommend({
          domain: params.domain as string | undefined,
          task: params.task as string | undefined,
          source: params.source as string | undefined,
          limit: (params.limit as number) ?? 5,
        });
      },
    },
    {
      name: 'brain_build_intelligence',
      description:
        'Run the full intelligence pipeline: compute strengths → build global registry → build domain profiles.',
      auth: 'write',
      handler: async () => {
        return brainIntelligence.buildIntelligence();
      },
    },
    {
      name: 'brain_export',
      description:
        'Export all brain intelligence data — strengths, sessions, proposals, global patterns, domain profiles.',
      auth: 'read',
      handler: async () => {
        return brainIntelligence.exportData();
      },
    },
    {
      name: 'brain_import',
      description: 'Import brain intelligence data from a previous export.',
      auth: 'write',
      schema: z.object({
        data: z.any().describe('BrainExportData object from brain_export.'),
      }),
      handler: async (params) => {
        return brainIntelligence.importData(
          params.data as import('../brain/types.js').BrainExportData,
        );
      },
    },
    {
      name: 'brain_extract_knowledge',
      description:
        'Extract knowledge proposals from a session using 6 heuristic rules (repeated tools, multi-file edits, long sessions, plan outcomes, feedback ratios).',
      auth: 'write',
      schema: z.object({
        sessionId: z.string().describe('Session ID to extract knowledge from.'),
      }),
      handler: async (params) => {
        return brainIntelligence.extractKnowledge(params.sessionId as string);
      },
    },
    {
      name: 'brain_archive_sessions',
      description: 'Archive (delete) completed sessions older than N days.',
      auth: 'write',
      schema: z.object({
        olderThanDays: z.number().optional().describe('Days threshold. Default 30.'),
      }),
      handler: async (params) => {
        return brainIntelligence.archiveSessions((params.olderThanDays as number) ?? 30);
      },
    },
    {
      name: 'brain_promote_proposals',
      description:
        'Promote knowledge proposals to vault entries. Creates intelligence entries from auto-extracted patterns.',
      auth: 'write',
      schema: z.object({
        proposalIds: z.array(z.string()).describe('IDs of proposals to promote.'),
      }),
      handler: async (params) => {
        return brainIntelligence.promoteProposals(params.proposalIds as string[]);
      },
    },
    {
      name: 'brain_lifecycle',
      description:
        'Start or end a brain session. Sessions track tool usage, file changes, and plan context.',
      auth: 'write',
      schema: z.object({
        action: z.enum(['start', 'end']),
        sessionId: z
          .string()
          .optional()
          .describe('Required for end. Auto-generated for start if omitted.'),
        domain: z.string().optional(),
        context: z.string().optional(),
        toolsUsed: z.array(z.string()).optional(),
        filesModified: z.array(z.string()).optional(),
        planId: z.string().optional(),
        planOutcome: z.string().optional(),
      }),
      handler: async (params) => {
        return brainIntelligence.lifecycle({
          action: params.action as 'start' | 'end',
          sessionId: params.sessionId as string | undefined,
          domain: params.domain as string | undefined,
          context: params.context as string | undefined,
          toolsUsed: params.toolsUsed as string[] | undefined,
          filesModified: params.filesModified as string[] | undefined,
          planId: params.planId as string | undefined,
          planOutcome: params.planOutcome as string | undefined,
        });
      },
    },

    {
      name: 'brain_reset_extracted',
      description:
        'Reset extraction status on brain sessions, allowing re-extraction. Filter by sessionId, since date, or all.',
      auth: 'write',
      schema: z.object({
        sessionId: z.string().optional().describe('Reset a specific session.'),
        since: z.string().optional().describe('Reset sessions extracted since this ISO date.'),
        all: z.boolean().optional().describe('Reset all extracted sessions.'),
      }),
      handler: async (params) => {
        return brainIntelligence.resetExtracted({
          sessionId: params.sessionId as string | undefined,
          since: params.since as string | undefined,
          all: params.all as boolean | undefined,
        });
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

    // ─── Control ──────────────────────────────────────────────────────
    {
      name: 'get_identity',
      description: 'Get current agent identity with guidelines.',
      auth: 'read',
      schema: z.object({
        agentId: z.string().describe('Agent identifier.'),
      }),
      handler: async (params) => {
        const identity = identityManager.getIdentity(params.agentId as string);
        if (!identity) return { found: false, agentId: params.agentId };
        return identity;
      },
    },
    {
      name: 'update_identity',
      description: 'Update identity fields. Auto-versions and snapshots previous state.',
      auth: 'write',
      schema: z.object({
        agentId: z.string(),
        name: z.string().optional(),
        role: z.string().optional(),
        description: z.string().optional(),
        personality: z.array(z.string()).optional(),
        changedBy: z.string().optional(),
        changeReason: z.string().optional(),
      }),
      handler: async (params) => {
        const identity = identityManager.setIdentity(params.agentId as string, {
          name: params.name as string | undefined,
          role: params.role as string | undefined,
          description: params.description as string | undefined,
          personality: params.personality as string[] | undefined,
          changedBy: params.changedBy as string | undefined,
          changeReason: params.changeReason as string | undefined,
        });
        return { updated: true, identity };
      },
    },
    {
      name: 'add_guideline',
      description: 'Add a behavioral guideline (behavior/preference/restriction/style).',
      auth: 'write',
      schema: z.object({
        agentId: z.string(),
        category: z.enum(['behavior', 'preference', 'restriction', 'style']),
        text: z.string(),
        priority: z.number().optional(),
      }),
      handler: async (params) => {
        const guideline = identityManager.addGuideline(params.agentId as string, {
          category: params.category as GuidelineCategory,
          text: params.text as string,
          priority: params.priority as number | undefined,
        });
        return { added: true, guideline };
      },
    },
    {
      name: 'remove_guideline',
      description: 'Remove a guideline by ID.',
      auth: 'write',
      schema: z.object({
        guidelineId: z.string(),
      }),
      handler: async (params) => {
        const removed = identityManager.removeGuideline(params.guidelineId as string);
        return { removed };
      },
    },
    {
      name: 'rollback_identity',
      description: 'Restore a previous identity version. Creates a new version with the old data.',
      auth: 'write',
      schema: z.object({
        agentId: z.string(),
        version: z.number().describe('Version number to roll back to.'),
      }),
      handler: async (params) => {
        const identity = identityManager.rollback(
          params.agentId as string,
          params.version as number,
        );
        return { rolledBack: true, identity };
      },
    },
    {
      name: 'route_intent',
      description: 'Classify a prompt into intent + operational mode via keyword matching.',
      auth: 'read',
      schema: z.object({
        prompt: z.string().describe('The user prompt to classify.'),
      }),
      handler: async (params) => {
        return intentRouter.routeIntent(params.prompt as string);
      },
    },
    {
      name: 'morph',
      description: 'Switch operational mode manually.',
      auth: 'write',
      schema: z.object({
        mode: z
          .string()
          .describe('The operational mode to switch to (e.g., BUILD-MODE, FIX-MODE).'),
      }),
      handler: async (params) => {
        return intentRouter.morph(params.mode as OperationalMode);
      },
    },
    {
      name: 'get_behavior_rules',
      description: 'Get behavior rules for current or specified mode.',
      auth: 'read',
      schema: z.object({
        mode: z.string().optional().describe('Mode to get rules for. Defaults to current mode.'),
      }),
      handler: async (params) => {
        const mode = params.mode as OperationalMode | undefined;
        const rules = intentRouter.getBehaviorRules(mode);
        const currentMode = intentRouter.getCurrentMode();
        return { mode: mode ?? currentMode, rules };
      },
    },

    // ─── Governance ─────────────────────────────────────────────────
    {
      name: 'governance_policy',
      description:
        'Get, set, or apply a preset to vault governance policies (quota, retention, auto-capture).',
      auth: 'write',
      schema: z.object({
        action: z.enum(['get', 'set', 'applyPreset']),
        projectPath: z.string(),
        policyType: z.enum(['quota', 'retention', 'auto-capture']).optional(),
        config: z.record(z.unknown()).optional(),
        preset: z.enum(['strict', 'moderate', 'permissive']).optional(),
        changedBy: z.string().optional(),
      }),
      handler: async (params) => {
        const action = params.action as string;
        const projectPath = params.projectPath as string;
        if (action === 'get') {
          return governance.getPolicy(projectPath);
        }
        if (action === 'set') {
          governance.setPolicy(
            projectPath,
            params.policyType as PolicyType,
            params.config as Record<string, unknown>,
            params.changedBy as string | undefined,
          );
          return { updated: true, policy: governance.getPolicy(projectPath) };
        }
        if (action === 'applyPreset') {
          governance.applyPreset(
            projectPath,
            params.preset as PolicyPreset,
            params.changedBy as string | undefined,
          );
          return {
            applied: true,
            preset: params.preset,
            policy: governance.getPolicy(projectPath),
          };
        }
        return { error: 'Unknown action: ' + action };
      },
    },
    {
      name: 'governance_proposals',
      description:
        'Manage knowledge capture proposals — list, approve, reject, modify, get stats, or expire stale.',
      auth: 'write',
      schema: z.object({
        action: z.enum(['list', 'approve', 'reject', 'modify', 'stats', 'expire']),
        projectPath: z.string().optional(),
        proposalId: z.number().optional(),
        decidedBy: z.string().optional(),
        note: z.string().optional(),
        modifications: z.record(z.unknown()).optional(),
        maxAgeDays: z.number().optional(),
        limit: z.number().optional(),
      }),
      handler: async (params) => {
        const action = params.action as string;
        if (action === 'list') {
          return governance.listPendingProposals(
            params.projectPath as string | undefined,
            params.limit as number | undefined,
          );
        }
        if (action === 'approve') {
          return governance.approveProposal(
            params.proposalId as number,
            params.decidedBy as string | undefined,
          );
        }
        if (action === 'reject') {
          return governance.rejectProposal(
            params.proposalId as number,
            params.decidedBy as string | undefined,
            params.note as string | undefined,
          );
        }
        if (action === 'modify') {
          return governance.modifyProposal(
            params.proposalId as number,
            params.modifications as Record<string, unknown>,
            params.decidedBy as string | undefined,
          );
        }
        if (action === 'stats') {
          return governance.getProposalStats(params.projectPath as string | undefined);
        }
        if (action === 'expire') {
          const expired = governance.expireStaleProposals(params.maxAgeDays as number | undefined);
          return { expired };
        }
        return { error: 'Unknown action: ' + action };
      },
    },
    {
      name: 'governance_stats',
      description: 'Get governance statistics — quota status and proposal stats for a project.',
      auth: 'read',
      schema: z.object({
        projectPath: z.string(),
      }),
      handler: async (params) => {
        const projectPath = params.projectPath as string;
        return {
          quotaStatus: governance.getQuotaStatus(projectPath),
          proposalStats: governance.getProposalStats(projectPath),
        };
      },
    },
    {
      name: 'governance_expire',
      description: 'Expire stale pending proposals older than a threshold.',
      auth: 'write',
      schema: z.object({
        projectPath: z.string().optional(),
        maxAgeDays: z.number().optional().describe('Days threshold. Default 14.'),
      }),
      handler: async (params) => {
        const expired = governance.expireStaleProposals(params.maxAgeDays as number | undefined);
        return { expired };
      },
    },
    {
      name: 'governance_dashboard',
      description:
        'Get governance dashboard — vault size, quota usage, pending proposals, acceptance rate, evaluation trend.',
      auth: 'read',
      schema: z.object({
        projectPath: z.string(),
      }),
      handler: async (params) => {
        return governance.getDashboard(params.projectPath as string);
      },
    },
  ];
}
