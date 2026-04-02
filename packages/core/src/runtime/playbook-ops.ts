/**
 * Playbook Operations — 8 ops for playbook management and execution.
 *
 * Management: playbook_list, playbook_get, playbook_create, playbook_match, playbook_seed
 * Execution:  playbook_start, playbook_step, playbook_complete
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from './types.js';
import { coerceArray } from './schema-helpers.js';
import { parsePlaybookFromEntry, validatePlaybook } from '../vault/playbook.js';
import {
  matchPlaybooks,
  seedDefaultPlaybooks,
  entryToPlaybookDefinition,
  getBuiltinPlaybook,
  getAllBuiltinPlaybooks,
} from '../playbooks/index.js';
import type { PlaybookIntent } from '../playbooks/index.js';

export function createPlaybookOps(runtime: AgentRuntime): OpDefinition[] {
  const { vault, playbookExecutor } = runtime;

  return [
    // ─── playbook_list ──────────────────────────────────────────────
    {
      name: 'playbook_list',
      description: 'List playbooks stored in the vault, optionally filtered by domain.',
      auth: 'read',
      schema: z.object({
        domain: z.string().optional(),
        limit: z.number().optional(),
      }),
      handler: async (params) => {
        const entries = vault.list({
          type: 'playbook',
          domain: params.domain as string | undefined,
          limit: (params.limit as number) ?? 50,
        });
        const playbooks = entries.map((e) => parsePlaybookFromEntry(e)).filter((p) => p !== null);
        return { playbooks, count: playbooks.length };
      },
    },

    // ─── playbook_get ───────────────────────────────────────────────
    {
      name: 'playbook_get',
      description: 'Get a single playbook by ID, parsed into structured steps.',
      auth: 'read',
      schema: z.object({ id: z.string() }),
      handler: async (params) => {
        const entry = vault.get(params.id as string);
        if (!entry) return { error: 'Playbook not found: ' + params.id };
        if (entry.type !== 'playbook') return { error: 'Entry is not a playbook: ' + params.id };
        const playbook = parsePlaybookFromEntry(entry);
        if (!playbook) return { error: 'Failed to parse playbook context: ' + params.id };
        return playbook;
      },
    },

    // ─── playbook_create ────────────────────────────────────────────
    {
      name: 'playbook_create',
      description:
        'Create a playbook with structured steps. Validates step ordering and builds vault entry automatically.',
      auth: 'write',
      schema: z.object({
        id: z.string().optional(),
        title: z.string(),
        domain: z.string(),
        description: z.string(),
        steps: coerceArray(
          z.object({
            title: z.string(),
            description: z.string(),
            validation: z.string().optional(),
          }),
        ),
        tags: z.array(z.string()).optional().default([]),
        severity: z.enum(['critical', 'warning', 'suggestion']).optional().default('suggestion'),
      }),
      handler: async (params) => {
        const title = params.title as string;
        const domain = params.domain as string;
        const rawSteps = params.steps as Array<{
          title: string;
          description: string;
          validation?: string;
        }>;

        const steps = rawSteps.map((s, i) => Object.assign({}, s, { order: i + 1 }));
        const id =
          (params.id as string | undefined) ??
          `playbook-${domain}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        const playbook = {
          id,
          title,
          domain,
          description: params.description as string,
          steps,
          tags: params.tags as string[],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        const validation = validatePlaybook(playbook);
        if (!validation.valid) {
          return { created: false, id, errors: validation.errors };
        }

        vault.add({
          id,
          type: 'playbook',
          domain,
          title,
          severity:
            (params.severity as 'critical' | 'warning' | 'suggestion' | undefined) ?? 'suggestion',
          description: params.description as string,
          context: JSON.stringify({ steps }),
          tags: params.tags as string[],
        });

        return { created: true, id, steps: steps.length };
      },
    },

    // ─── playbook_match (NEW) ───────────────────────────────────────
    {
      name: 'playbook_match',
      description:
        'Match playbooks by intent and text. Combines vault-stored and built-in playbooks, returns best match with merged gates/tasks/tools.',
      auth: 'read',
      schema: z.object({
        intent: z
          .enum(['BUILD', 'FIX', 'REVIEW', 'PLAN', 'IMPROVE', 'DELIVER'])
          .optional()
          .describe('Plan intent for matching'),
        text: z.string().describe('Plan objective + scope text to match against'),
      }),
      handler: async (params) => {
        const intent = params.intent as PlaybookIntent | undefined;
        const text = params.text as string;

        // Load vault playbooks and convert to PlaybookDefinition
        const vaultEntries = vault.list({ type: 'playbook', limit: 200 });
        const vaultPlaybooks = vaultEntries
          .map((e) => entryToPlaybookDefinition(e))
          .filter((p): p is NonNullable<typeof p> => p !== null);

        const result = matchPlaybooks(intent, text, vaultPlaybooks);
        return result;
      },
    },

    // ─── playbook_seed ─────────────────────────────────────────────
    {
      name: 'playbook_seed',
      description:
        'Seed built-in playbooks into the vault. Idempotent — skips existing playbooks. Seeds 6 generic playbooks (TDD, brainstorming, code-review, subagent-execution, debugging, verification).',
      auth: 'write',
      handler: async () => {
        return seedDefaultPlaybooks(vault);
      },
    },

    // ─── playbook_start ──────────────────────────────────────────
    {
      name: 'playbook_start',
      description:
        'Start a playbook execution session. Returns the first step, tools, and gates. Use playbook_step to advance through steps.',
      auth: 'write',
      schema: z.object({
        playbookId: z
          .string()
          .optional()
          .describe('Built-in or vault playbook ID to start directly.'),
        intent: z
          .enum(['BUILD', 'FIX', 'REVIEW', 'PLAN', 'IMPROVE', 'DELIVER'])
          .optional()
          .describe('Auto-match a playbook by intent. Ignored if playbookId is provided.'),
        text: z.string().optional().describe('Context text for auto-matching. Used with intent.'),
      }),
      handler: async (params) => {
        const playbookId = params.playbookId as string | undefined;
        const intent = params.intent as PlaybookIntent | undefined;
        const text = (params.text as string | undefined) ?? '';

        if (playbookId) {
          // Direct start by ID — check built-in first, then vault
          const builtin = getBuiltinPlaybook(playbookId);
          if (builtin) {
            return playbookExecutor.start(builtin);
          }
          const entry = vault.get(playbookId);
          if (entry && entry.type === 'playbook') {
            const def = entryToPlaybookDefinition(entry);
            if (def) return playbookExecutor.start(def);
          }
          return { error: `Playbook not found: ${playbookId}` };
        }

        if (intent || text) {
          // Auto-match
          const vaultEntries = vault.list({ type: 'playbook', limit: 200 });
          const vaultPlaybooks = vaultEntries
            .map((e) => entryToPlaybookDefinition(e))
            .filter((p): p is NonNullable<typeof p> => p !== null);

          const match = matchPlaybooks(intent, text, vaultPlaybooks);
          if (!match.playbook) {
            return {
              error: 'No matching playbook found',
              available: getAllBuiltinPlaybooks().map((p) => ({ id: p.id, title: p.title })),
            };
          }
          return playbookExecutor.start(match.playbook);
        }

        return {
          error: 'Provide playbookId or intent/text for auto-matching',
          available: getAllBuiltinPlaybooks().map((p) => ({ id: p.id, title: p.title })),
        };
      },
    },

    // ─── playbook_step ───────────────────────────────────────────
    {
      name: 'playbook_step',
      description:
        'Advance to the next step in an active playbook session. Marks the current step as done (or skipped) and returns the next step.',
      auth: 'write',
      schema: z.object({
        sessionId: z.string().describe('Active playbook session ID from playbook_start.'),
        output: z.string().optional().describe('Summary of what was accomplished in this step.'),
        skip: z.boolean().optional().describe('Skip this step instead of completing it.'),
      }),
      handler: async (params) => {
        return playbookExecutor.step(params.sessionId as string, {
          output: params.output as string | undefined,
          skip: params.skip as boolean | undefined,
        });
      },
    },

    // ─── playbook_complete ───────────────────────────────────────
    {
      name: 'playbook_complete',
      description:
        'Complete (or abort) a playbook session. Validates completion gates and returns a summary with pass/fail status.',
      auth: 'write',
      schema: z.object({
        sessionId: z.string().describe('Active playbook session ID.'),
        abort: z
          .boolean()
          .optional()
          .describe('Abort instead of completing. Skips remaining steps.'),
        gateResults: z
          .record(z.boolean())
          .optional()
          .describe(
            'Gate check results: { "gate-check-type": true/false }. Unmapped gates are treated as failed.',
          ),
      }),
      handler: async (params) => {
        return playbookExecutor.complete(params.sessionId as string, {
          abort: params.abort as boolean | undefined,
          gateResults: params.gateResults as Record<string, boolean> | undefined,
        });
      },
    },
  ];
}
