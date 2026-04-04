/**
 * Brain facade — learning system ops.
 * intelligence pipeline, strengths, feedback, sessions.
 */

import { z } from 'zod';
import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';

export function createBrainFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  const {
    brain,
    brainIntelligence,
    llmClient,
    keyPool,
    governance,
    learningRadar,
    knowledgeSynthesizer,
  } = runtime;

  return [
    // ─── Brain (inline from core-ops.ts) ────────────────────────
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
        brainIntelligence.maybeAutoBuildOnFeedback();
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
        brainIntelligence.maybeAutoBuildOnFeedback();
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
      name: 'brain_decay_report',
      description:
        'Show temporal decay scores for entries matching a query — reveals which entries are expiring, active, or expired.',
      auth: 'read',
      schema: z.object({
        query: z.string().describe('Search query to find entries'),
        limit: z.number().optional().describe('Max results (default 10)'),
      }),
      handler: async (params) => {
        const results = await brain.getDecayReport(
          params.query as string,
          (params.limit as number | undefined) ?? 10,
        );
        return { results, count: results.length };
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

    // ─── Brain Intelligence ──────────────────────────────────────
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
          params.data as import('../../brain/types.js').BrainExportData,
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
        'Promote knowledge proposals to vault entries. Creates intelligence entries from auto-extracted patterns. Gated by governance policies.',
      auth: 'write',
      schema: z.object({
        proposalIds: z.array(z.string()).describe('IDs of proposals to promote.'),
        projectPath: z.string().optional().default('.'),
      }),
      handler: async (params) => {
        const pp = (params.projectPath as string | undefined) ?? '.';
        return brainIntelligence.promoteProposals(params.proposalIds as string[], governance, pp);
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
      name: 'session_list',
      description:
        'List brain sessions with optional filters: domain, active/completed, extracted status.',
      auth: 'read',
      schema: z.object({
        domain: z.string().optional(),
        active: z.boolean().optional().describe('true = active (no end), false = completed.'),
        extracted: z.boolean().optional().describe('true = knowledge extracted, false = not yet.'),
        limit: z.number().optional().describe('Max results. Default 50.'),
        offset: z.number().optional().describe('Pagination offset. Default 0.'),
      }),
      handler: async (params) => {
        const sessions = brainIntelligence.listSessions({
          domain: params.domain as string | undefined,
          active: params.active as boolean | undefined,
          extracted: params.extracted as boolean | undefined,
          limit: (params.limit as number) ?? 50,
          offset: (params.offset as number) ?? 0,
        });
        return { sessions, count: sessions.length };
      },
    },
    {
      name: 'session_get',
      description: 'Get a single brain session by ID.',
      auth: 'read',
      schema: z.object({
        sessionId: z.string(),
      }),
      handler: async (params) => {
        const session = brainIntelligence.getSessionById(params.sessionId as string);
        if (!session) return { error: 'Session not found', sessionId: params.sessionId };
        return session;
      },
    },
    {
      name: 'session_quality',
      description:
        'Compute quality score for a session. 4-dimension scoring: completeness (0-25) + artifact density (0-25) + tool engagement (0-25) + outcome clarity (0-25).',
      auth: 'read',
      schema: z.object({
        sessionId: z.string(),
      }),
      handler: async (params) => {
        return brainIntelligence.computeSessionQuality(params.sessionId as string);
      },
    },
    {
      name: 'session_replay',
      description:
        'Replay a session — returns session data, quality score, extracted proposals, and duration.',
      auth: 'read',
      schema: z.object({
        sessionId: z.string(),
      }),
      handler: async (params) => {
        return brainIntelligence.replaySession(params.sessionId as string);
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

    // ─── Learning Radar (#208) ────────────────────────────────────
    {
      name: 'radar_analyze',
      description:
        'Analyze a learning signal (correction, search miss, workaround, etc.). ' +
        'High confidence auto-captures silently. Medium queues for review. Low logs only.',
      auth: 'write',
      schema: z.object({
        type: z.enum([
          'correction',
          'search_miss',
          'explicit_capture',
          'pattern_success',
          'workaround',
          'repeated_question',
        ]),
        title: z.string().describe('Short title for the detected pattern'),
        description: z.string().describe('What was learned and why it matters'),
        suggestedType: z.enum(['pattern', 'anti-pattern']).optional(),
        confidence: z
          .number()
          .optional()
          .describe('Override confidence (0-1). Default inferred from signal type.'),
        sourceQuery: z.string().optional().describe('Original query that triggered this signal'),
        context: z.string().optional().describe('Additional context'),
      }),
      handler: async (params) => {
        return learningRadar.analyze({
          type: params.type as
            | 'correction'
            | 'search_miss'
            | 'explicit_capture'
            | 'pattern_success'
            | 'workaround'
            | 'repeated_question',
          title: params.title as string,
          description: params.description as string,
          suggestedType: params.suggestedType as 'pattern' | 'anti-pattern' | undefined,
          confidence: params.confidence as number | undefined,
          sourceQuery: params.sourceQuery as string | undefined,
          context: params.context as string | undefined,
        });
      },
    },
    {
      name: 'radar_candidates',
      description: 'Get pending radar candidates queued for end-of-session review.',
      auth: 'read',
      schema: z.object({
        limit: z.number().optional().default(20),
      }),
      handler: async (params) => {
        return learningRadar.getCandidates(params.limit as number);
      },
    },
    {
      name: 'radar_approve',
      description: 'Approve a pending radar candidate — captures it to vault.',
      auth: 'write',
      schema: z.object({
        candidateId: z.number().describe('Radar candidate ID to approve'),
      }),
      handler: async (params) => {
        return learningRadar.approve(params.candidateId as number);
      },
    },
    {
      name: 'radar_dismiss',
      description:
        'Dismiss one or more pending radar candidates — marks them as not worth capturing. Accepts a single ID or an array.',
      auth: 'write',
      schema: z.object({
        candidateId: z
          .union([z.number(), z.array(z.number())])
          .describe('Radar candidate ID(s) to dismiss — single number or array'),
      }),
      handler: async (params) => {
        return learningRadar.dismiss(params.candidateId as number | number[]);
      },
    },
    {
      name: 'radar_flush',
      description:
        'Auto-capture all pending candidates above a confidence threshold. ' +
        'Use at end-of-session to batch-capture high-quality candidates.',
      auth: 'write',
      schema: z.object({
        minConfidence: z
          .number()
          .optional()
          .default(0.8)
          .describe('Minimum confidence to auto-capture (default 0.8)'),
      }),
      handler: async (params) => {
        return learningRadar.flush(params.minConfidence as number);
      },
    },
    {
      name: 'radar_stats',
      description:
        'Get learning radar statistics — analyzed, captured, queued, dismissed, knowledge gaps.',
      auth: 'read',
      handler: async () => {
        return learningRadar.getStats();
      },
    },

    // ─── Knowledge Synthesis (#207) ───────────────────────────────
    {
      name: 'synthesize',
      description:
        'Synthesize vault knowledge into structured content. Searches vault for relevant entries, ' +
        'then uses LLM to produce a brief, outline, talking points, or post draft. ' +
        'Includes source attribution, coverage score, and knowledge gap detection.',
      auth: 'read',
      schema: z.preprocess(
        (val) => {
          if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
            const obj = val as Record<string, unknown>;
            // Accept "topic" as alias for "query"
            if (obj.topic !== undefined && obj.query === undefined) {
              return { ...obj, query: obj.topic };
            }
          }
          return val;
        },
        z.object({
          query: z.string().describe('Topic to synthesize knowledge about (alias: topic)'),
          topic: z.string().optional().describe('Alias for query'),
          format: z
            .enum(['brief', 'outline', 'talking-points', 'post-draft'])
            .optional()
            .default('brief')
            .describe(
              'Output format: brief | outline | talking-points | post-draft (default: "brief")',
            ),
          maxEntries: z.number().optional().default(10).describe('Max vault entries to consult'),
          audience: z
            .enum(['technical', 'executive', 'general'])
            .optional()
            .default('general')
            .describe('Target audience for tone and language'),
        }),
      ),
      handler: async (params) => {
        return knowledgeSynthesizer.synthesize(params.query as string, {
          format: params.format as 'brief' | 'outline' | 'talking-points' | 'post-draft',
          maxEntries: params.maxEntries as number,
          audience: params.audience as 'technical' | 'executive' | 'general',
        });
      },
    },
  ];
}
