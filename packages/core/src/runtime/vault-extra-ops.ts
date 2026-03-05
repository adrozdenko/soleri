/**
 * Extra vault operations — 12 ops that extend the 4 base vault ops in core-ops.ts.
 *
 * Groups: single-entry CRUD (3), bulk (2), discovery (3), import/export (3), analytics (1).
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { IntelligenceEntry } from '../intelligence/types.js';
import type { AgentRuntime } from './types.js';

const entrySchema = z.object({
  id: z.string(),
  type: z.enum(['pattern', 'anti-pattern', 'rule']),
  domain: z.string(),
  title: z.string(),
  severity: z.enum(['critical', 'warning', 'suggestion']),
  description: z.string(),
  context: z.string().optional(),
  example: z.string().optional(),
  counterExample: z.string().optional(),
  why: z.string().optional(),
  tags: z.array(z.string()),
  appliesTo: z.array(z.string()).optional(),
});

export function createVaultExtraOps(runtime: AgentRuntime): OpDefinition[] {
  const { vault } = runtime;

  return [
    // ─── Single-Entry CRUD ──────────────────────────────────────────
    {
      name: 'vault_get',
      description: 'Get a single vault entry by ID.',
      auth: 'read',
      schema: z.object({ id: z.string() }),
      handler: async (params) => {
        const entry = vault.get(params.id as string);
        if (!entry) return { error: 'Entry not found: ' + params.id };
        return entry;
      },
    },
    {
      name: 'vault_update',
      description:
        'Update an existing vault entry. Only the fields provided are changed; the rest stay the same.',
      auth: 'write',
      schema: z.object({
        id: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        context: z.string().optional(),
        example: z.string().optional(),
        counterExample: z.string().optional(),
        why: z.string().optional(),
        tags: z.array(z.string()).optional(),
        appliesTo: z.array(z.string()).optional(),
        severity: z.enum(['critical', 'warning', 'suggestion']).optional(),
        type: z.enum(['pattern', 'anti-pattern', 'rule']).optional(),
        domain: z.string().optional(),
      }),
      handler: async (params) => {
        const id = params.id as string;
        const { id: _id, ...fields } = params;
        // Strip undefined values so we only pass what was actually provided
        const cleaned: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(fields)) {
          if (v !== undefined) cleaned[k] = v;
        }
        if (Object.keys(cleaned).length === 0) {
          return { error: 'No fields to update' };
        }
        const updated = vault.update(
          id,
          cleaned as Partial<
            Pick<
              IntelligenceEntry,
              | 'title'
              | 'description'
              | 'context'
              | 'example'
              | 'counterExample'
              | 'why'
              | 'tags'
              | 'appliesTo'
              | 'severity'
              | 'type'
              | 'domain'
            >
          >,
        );
        if (!updated) return { error: 'Entry not found: ' + id };
        return { updated: true, entry: updated };
      },
    },
    {
      name: 'vault_remove',
      description: 'Remove a single vault entry by ID.',
      auth: 'admin',
      schema: z.object({ id: z.string() }),
      handler: async (params) => {
        const removed = vault.remove(params.id as string);
        return { removed, id: params.id };
      },
    },

    // ─── Bulk Operations ────────────────────────────────────────────
    {
      name: 'vault_bulk_add',
      description: 'Add multiple vault entries at once. Uses upsert — existing IDs are updated.',
      auth: 'write',
      schema: z.object({
        entries: z.array(entrySchema),
      }),
      handler: async (params) => {
        const entries = params.entries as IntelligenceEntry[];
        const count = vault.seed(entries);
        return { added: count, total: vault.stats().totalEntries };
      },
    },
    {
      name: 'vault_bulk_remove',
      description: 'Remove multiple vault entries by IDs in a single transaction.',
      auth: 'admin',
      schema: z.object({
        ids: z.array(z.string()),
      }),
      handler: async (params) => {
        const ids = params.ids as string[];
        const removed = vault.bulkRemove(ids);
        return { removed, requested: ids.length, total: vault.stats().totalEntries };
      },
    },

    // ─── Discovery ──────────────────────────────────────────────────
    {
      name: 'vault_tags',
      description: 'List all unique tags used across vault entries with their occurrence counts.',
      auth: 'read',
      handler: async () => {
        const tags = vault.getTags();
        return { tags, count: tags.length };
      },
    },
    {
      name: 'vault_domains',
      description: 'List all domains in the vault with their entry counts.',
      auth: 'read',
      handler: async () => {
        const domains = vault.getDomains();
        return { domains, count: domains.length };
      },
    },
    {
      name: 'vault_recent',
      description: 'Get recently added or updated vault entries, ordered by most recent first.',
      auth: 'read',
      schema: z.object({
        limit: z.number().optional().describe('Max entries to return (default 20)'),
      }),
      handler: async (params) => {
        const limit = (params.limit as number | undefined) ?? 20;
        const entries = vault.getRecent(limit);
        return { entries, count: entries.length };
      },
    },

    // ─── Import / Export / Seed ──────────────────────────────────────
    {
      name: 'vault_import',
      description:
        'Import vault entries from a JSON bundle. Uses upsert — existing IDs are updated, new IDs are inserted.',
      auth: 'write',
      schema: z.object({
        entries: z.array(entrySchema),
      }),
      handler: async (params) => {
        const entries = params.entries as IntelligenceEntry[];
        const before = vault.stats().totalEntries;
        const count = vault.seed(entries);
        const after = vault.stats().totalEntries;
        return {
          imported: count,
          newEntries: after - before,
          updatedEntries: count - (after - before),
          total: after,
        };
      },
    },
    {
      name: 'vault_seed',
      description:
        'Seed the vault from intelligence data. Idempotent — safe to call multiple times. Uses upsert.',
      auth: 'write',
      schema: z.object({
        entries: z.array(entrySchema),
      }),
      handler: async (params) => {
        const entries = params.entries as IntelligenceEntry[];
        const count = vault.seed(entries);
        return { seeded: count, total: vault.stats().totalEntries };
      },
    },
    {
      name: 'vault_backup',
      description:
        'Export the full vault as a JSON bundle suitable for backup or transfer to another agent.',
      auth: 'read',
      handler: async () => {
        return vault.exportAll();
      },
    },

    // ─── Analytics ──────────────────────────────────────────────────
    {
      name: 'vault_age_report',
      description:
        'Show vault entry age distribution — how many entries are from today, this week, this month, this quarter, or older.',
      auth: 'read',
      handler: async () => {
        return vault.getAgeReport();
      },
    },
  ];
}
