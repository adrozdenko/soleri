/**
 * Extra vault operations — 13 ops for CRUD, bulk, discovery, import/export, seed, and content hashing.
 *
 * Archival, lifecycle, temporal, and knowledge maintenance ops are in archive-ops.ts.
 *
 * Groups: single-entry CRUD (3), bulk (2), discovery (3), import/export/seed (3),
 *         seed canonical (1), content hashing (2).
 */

import { z } from 'zod';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { OpDefinition } from '../facades/types.js';
import type { IntelligenceEntry } from '../intelligence/types.js';
import type { AgentRuntime } from './types.js';
import { coerceArray } from './schema-helpers.js';

const entrySchema = z.object({
  id: z.string(),
  type: z.enum(['pattern', 'anti-pattern', 'rule', 'playbook']),
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
        type: z.enum(['pattern', 'anti-pattern', 'rule', 'playbook']).optional(),
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
        entries: coerceArray(entrySchema),
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
        ids: coerceArray(z.string()),
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
        entries: coerceArray(entrySchema),
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
        entries: coerceArray(entrySchema),
      }),
      handler: async (params) => {
        const entries = params.entries as IntelligenceEntry[];
        const count = vault.seed(entries);
        return { seeded: count, total: vault.stats().totalEntries };
      },
    },

    // ─── Seed Canonical (#153) ───────────────────────────────────
    {
      name: 'vault_seed_canonical',
      description:
        'Seed vault knowledge from structured markdown files with YAML frontmatter. ' +
        'Reads .md files from a directory, parses them into IntelligenceEntry objects, and upserts. Idempotent.',
      auth: 'write',
      schema: z.object({
        directory: z
          .string()
          .describe('Path to directory containing .md files with YAML frontmatter'),
        domain: z
          .string()
          .optional()
          .describe('Override domain for all entries (default: from frontmatter or filename)'),
      }),
      handler: async (params) => {
        try {
          const dir = params.directory as string;
          const domainOverride = params.domain as string | undefined;

          if (!existsSync(dir)) {
            return { error: `Directory not found: ${dir}` };
          }

          const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
          const entries: IntelligenceEntry[] = [];
          const errors: Array<{ file: string; error: string }> = [];

          for (const file of files) {
            try {
              const content = readFileSync(join(dir, file), 'utf-8');
              const entry = parseMarkdownEntry(content, file, domainOverride);
              if (entry) entries.push(entry);
            } catch (err) {
              errors.push({ file, error: (err as Error).message });
            }
          }

          const seeded = entries.length > 0 ? vault.seed(entries) : 0;

          return {
            seeded,
            filesProcessed: files.length,
            errors: errors.length > 0 ? errors : undefined,
            total: vault.stats().totalEntries,
          };
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },

    // ── Content hashing (#166) ────────────────────────────────────────
    {
      name: 'vault_content_hash',
      description: 'Compute content hash for an entry without inserting',
      auth: 'read' as const,
      schema: z.object({
        type: z.string(),
        domain: z.string(),
        title: z.string(),
        description: z.string(),
        tags: z.array(z.string()).optional(),
        example: z.string().optional(),
        counterExample: z.string().optional(),
      }),
      handler: async (params) => {
        const { computeContentHash: hashFn } = await import('../vault/content-hash.js');
        const hash = hashFn(params as unknown as Parameters<typeof hashFn>[0]);
        const existingId = vault.findByContentHash(hash);
        return { hash, duplicate: existingId !== null, existingId };
      },
    },
    {
      name: 'vault_dedup_status',
      description: 'Report content hash coverage and duplicate statistics',
      auth: 'read' as const,
      handler: async () => {
        const stats = vault.contentHashStats();
        const duplicates = stats.total - stats.uniqueHashes;
        return {
          ...stats,
          duplicates,
          coverage: stats.total > 0 ? Math.round((stats.hashed / stats.total) * 100) : 100,
        };
      },
    },
  ];
}

/**
 * Parse a markdown file with YAML frontmatter into an IntelligenceEntry.
 * Expected frontmatter fields: id, type, domain, severity, title, tags.
 */
function parseMarkdownEntry(
  content: string,
  filename: string,
  domainOverride?: string,
): IntelligenceEntry | null {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;

  const frontmatter = match[1];
  const body = match[2].trim();

  // Simple YAML parser for flat key-value pairs
  const meta: Record<string, string | string[]> = {};
  for (const line of frontmatter.split('\n')) {
    const kvMatch = line.match(/^(\w+):\s*(.+)$/);
    if (kvMatch) {
      const key = kvMatch[1];
      let value = kvMatch[2].trim();
      // Handle quoted strings
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      // Handle arrays: [a, b, c]
      if (value.startsWith('[') && value.endsWith(']')) {
        meta[key] = value
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''));
      } else {
        meta[key] = value;
      }
    }
  }

  const id = (meta.id as string) || basename(filename, '.md');
  const tags = Array.isArray(meta.tags) ? meta.tags : meta.tags ? [meta.tags as string] : [];

  return {
    id,
    type: (meta.type as IntelligenceEntry['type']) || 'pattern',
    domain: domainOverride || (meta.domain as string) || 'general',
    title: (meta.title as string) || basename(filename, '.md'),
    severity: (meta.severity as IntelligenceEntry['severity']) || 'suggestion',
    description: body || (meta.description as string) || '',
    context: meta.context as string | undefined,
    tags,
  };
}
