/**
 * Vault Sharing Ops — knowledge scoping operations.
 *
 * Covers:
 * - #105: Knowledge scoping (detect_scope, set_scope, scope-aware filtering)
 *
 * Git/Obsidian/pack sync ops → sync-ops.ts (sync facade)
 * Review workflow ops → review-ops.ts (review facade)
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from './types.js';
import { detectScope, type ScopeInput } from '../vault/scope-detector.js';

export function createVaultSharingOps(runtime: AgentRuntime): OpDefinition[] {
  const { vault } = runtime;

  return [
    // ─── Scoping (#105) ───────────────────────────────────────────
    {
      name: 'vault_detect_scope',
      description:
        'Auto-detect the appropriate scope tier (agent/project/team) for a knowledge entry using weighted heuristics on content, category, tags, and title.',
      auth: 'read' as const,
      schema: z.object({
        title: z.string().describe('Entry title'),
        description: z.string().describe('Entry description'),
        category: z.string().optional().describe('Entry category/domain'),
        tags: z.array(z.string()).optional().describe('Entry tags'),
      }),
      handler: async (params) => {
        const input: ScopeInput = {
          title: params.title as string,
          description: params.description as string,
          category: params.category as string | undefined,
          tags: params.tags as string[] | undefined,
        };
        return detectScope(input);
      },
    },
    {
      name: 'vault_set_scope',
      description: 'Manually set the scope tier for a vault entry. Overrides auto-detection.',
      auth: 'write' as const,
      schema: z.object({
        id: z.string().describe('Entry ID'),
        tier: z.enum(['agent', 'project', 'team']).describe('Scope tier'),
      }),
      handler: async (params) => {
        const id = params.id as string;
        const tier = params.tier as 'agent' | 'project' | 'team';
        const entry = vault.get(id);
        if (!entry) return { error: `Entry '${id}' not found` };
        vault.seed([{ ...entry, tier }]);
        return { updated: true, id, tier };
      },
    },
    {
      name: 'vault_list_by_scope',
      description: 'List vault entries filtered by scope tier, with optional domain/type filters.',
      auth: 'read' as const,
      schema: z.object({
        tier: z.enum(['agent', 'project', 'team']).describe('Scope tier to filter by'),
        domain: z.string().optional(),
        type: z.enum(['pattern', 'anti-pattern', 'rule', 'playbook']).optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }),
      handler: async (params) => {
        const tier = params.tier as string;
        const filters: string[] = ['tier = @tier'];
        const fp: Record<string, unknown> = { tier };
        if (params.domain) {
          filters.push('domain = @domain');
          fp.domain = params.domain;
        }
        if (params.type) {
          filters.push('type = @type');
          fp.type = params.type;
        }
        const limit = (params.limit as number) ?? 50;
        const offset = (params.offset as number) ?? 0;
        fp.limit = limit;
        fp.offset = offset;
        const wc = `WHERE ${filters.join(' AND ')}`;
        const provider = vault.getProvider();
        const rows = provider.all<Record<string, unknown>>(
          `SELECT * FROM entries ${wc} ORDER BY domain, title LIMIT @limit OFFSET @offset`,
          fp,
        );
        // Map to entries using the same logic as vault.list
        const entries = rows.map((row) => ({
          id: row.id as string,
          type: row.type as string,
          domain: row.domain as string,
          title: row.title as string,
          severity: row.severity as string,
          description: row.description as string,
          tier: (row.tier as string) ?? 'agent',
          tags: JSON.parse((row.tags as string) || '[]'),
        }));
        return { entries, count: entries.length, tier };
      },
    },
  ];
}
