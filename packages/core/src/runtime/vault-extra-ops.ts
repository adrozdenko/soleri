/**
 * Extra vault operations — 20 ops that extend the 4 base vault ops in core-ops.ts.
 *
 * Groups: single-entry CRUD (3), bulk (2), discovery (3), import/export (3),
 *         analytics (1), seed canonical (1), knowledge lifecycle (4), temporal (3).
 */

import { z } from 'zod';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { OpDefinition } from '../facades/types.js';
import type { IntelligenceEntry } from '../intelligence/types.js';
import type { AgentRuntime } from './types.js';

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

    // ─── Knowledge Audit (#155) ──────────────────────────────────
    {
      name: 'knowledge_audit',
      description:
        'Audit vault quality — coverage gaps, stale entries, tag health, and recommendations.',
      auth: 'read',
      handler: async () => {
        try {
          const stats = vault.stats();
          const tags = vault.getTags();
          const domains = vault.getDomains();
          const ageReport = vault.getAgeReport();

          // Check coverage
          const entriesWithoutTags = tags.length === 0 ? stats.totalEntries : 0;
          const singletonTags = tags.filter((t) => t.count === 1).length;

          // Staleness: entries older than 90 days
          const staleCount = ageReport.buckets.find((b) => b.label === 'older')?.count ?? 0;

          const recommendations: string[] = [];
          if (stats.totalEntries < 10)
            recommendations.push('Vault has few entries — capture more knowledge');
          if (singletonTags > tags.length * 0.5)
            recommendations.push('Many singleton tags — consolidate tagging');
          if (staleCount > stats.totalEntries * 0.3)
            recommendations.push('>30% entries are stale — review and update');
          if (domains.length === 1)
            recommendations.push('Only one domain — consider categorizing by domain');

          return {
            totalEntries: stats.totalEntries,
            domainCount: domains.length,
            tagCount: tags.length,
            singletonTags,
            staleEntries: staleCount,
            entriesWithoutTags,
            recommendations,
          };
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },

    // ─── Knowledge Health (#155) ─────────────────────────────────
    {
      name: 'knowledge_health',
      description:
        'Knowledge base health metrics — entry counts, freshness, staleness, contradiction signals.',
      auth: 'read',
      handler: async () => {
        try {
          const stats = vault.stats();
          const ageReport = vault.getAgeReport();
          const domains = vault.getDomains();
          const tags = vault.getTags();

          // Detect potential contradictions: entries with same tags but different types (pattern vs anti-pattern)
          const db = vault.getDb();
          const contradictionSignals = db
            .prepare(
              `SELECT t.value as tag, COUNT(DISTINCT e.type) as type_count
               FROM entries e, json_each(e.tags) t
               GROUP BY t.value HAVING type_count > 1 LIMIT 10`,
            )
            .all() as Array<{ tag: string; type_count: number }>;

          return {
            totalEntries: stats.totalEntries,
            freshEntries:
              (ageReport.buckets.find((b) => b.label === 'today')?.count ?? 0) +
              (ageReport.buckets.find((b) => b.label === 'this_week')?.count ?? 0),
            staleEntries: ageReport.buckets.find((b) => b.label === 'older')?.count ?? 0,
            domainCount: domains.length,
            tagCount: tags.length,
            contradictionSignals: contradictionSignals.length,
            contradictionTags: contradictionSignals.map((c) => c.tag),
            oldestTimestamp: ageReport.oldestTimestamp,
            newestTimestamp: ageReport.newestTimestamp,
          };
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },

    // ─── Merge Patterns (#155) ───────────────────────────────────
    {
      name: 'knowledge_merge',
      description:
        'Merge two similar patterns into one — keeps the best metadata from both, removes the duplicate.',
      auth: 'write',
      schema: z.object({
        keepId: z.string().describe('ID of the entry to keep (will receive merged data)'),
        removeId: z.string().describe('ID of the duplicate entry to remove after merge'),
      }),
      handler: async (params) => {
        try {
          const keep = vault.get(params.keepId as string);
          const remove = vault.get(params.removeId as string);
          if (!keep) return { error: `Entry not found: ${params.keepId}` };
          if (!remove) return { error: `Entry not found: ${params.removeId}` };

          // Merge tags (deduplicated union)
          const mergedTags = [...new Set([...(keep.tags ?? []), ...(remove.tags ?? [])])];

          // Merge fields — prefer non-empty from either side
          const updates: Partial<IntelligenceEntry> = {
            tags: mergedTags,
            description: keep.description || remove.description,
            context: keep.context || remove.context,
            example: keep.example || remove.example,
            counterExample: keep.counterExample || remove.counterExample,
            why: keep.why || remove.why,
            appliesTo: keep.appliesTo?.length ? keep.appliesTo : remove.appliesTo,
          };

          vault.update(keep.id, updates);
          vault.remove(remove.id);

          return {
            merged: true,
            keptId: keep.id,
            removedId: remove.id,
            mergedTags,
          };
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },

    // ─── Knowledge Reorganize (#155) ─────────────────────────────
    {
      name: 'knowledge_reorganize',
      description:
        'Re-categorize vault entries — reassign domains, clean up tags, deduplicate. Dry-run by default.',
      auth: 'write',
      schema: z.object({
        dryRun: z
          .boolean()
          .optional()
          .describe('If true, only report what would change (default true)'),
        retagRules: z
          .array(
            z.object({
              from: z.string().describe('Tag to rename/remove'),
              to: z.string().optional().describe('New tag (omit to remove the tag)'),
            }),
          )
          .optional()
          .describe('Tag rename/removal rules'),
        domainRules: z
          .array(
            z.object({
              from: z.string().describe('Old domain name'),
              to: z.string().describe('New domain name'),
            }),
          )
          .optional()
          .describe('Domain rename rules'),
      }),
      handler: async (params) => {
        try {
          const dryRun = (params.dryRun as boolean | undefined) ?? true;
          const retagRules = (params.retagRules as Array<{ from: string; to?: string }>) ?? [];
          const domainRules = (params.domainRules as Array<{ from: string; to: string }>) ?? [];
          const changes: Array<{ id: string; field: string; from: string; to: string }> = [];

          const allEntries = vault.list({});

          for (const entry of allEntries) {
            // Apply domain rules
            for (const rule of domainRules) {
              if (entry.domain === rule.from) {
                changes.push({ id: entry.id, field: 'domain', from: rule.from, to: rule.to });
                if (!dryRun) vault.update(entry.id, { domain: rule.to });
              }
            }

            // Apply retag rules
            if (entry.tags) {
              let tagsChanged = false;
              const newTags = [...entry.tags];
              for (const rule of retagRules) {
                const idx = newTags.indexOf(rule.from);
                if (idx !== -1) {
                  if (rule.to) {
                    changes.push({ id: entry.id, field: 'tag', from: rule.from, to: rule.to });
                    newTags[idx] = rule.to;
                  } else {
                    changes.push({ id: entry.id, field: 'tag', from: rule.from, to: '(removed)' });
                    newTags.splice(idx, 1);
                  }
                  tagsChanged = true;
                }
              }
              if (tagsChanged && !dryRun) {
                vault.update(entry.id, { tags: [...new Set(newTags)] });
              }
            }
          }

          return {
            dryRun,
            changesFound: changes.length,
            changes: changes.slice(0, 100), // cap output
            entriesScanned: allEntries.length,
          };
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },

    // ─── Temporal (#89) ──────────────────────────────────────────────
    {
      name: 'vault_set_temporal',
      description:
        'Set valid_from and/or valid_until timestamps on a vault entry for bi-temporal validity windows.',
      auth: 'write',
      schema: z.object({
        id: z.string().describe('Entry ID'),
        validFrom: z.number().optional().describe('Unix epoch — when entry becomes active'),
        validUntil: z.number().optional().describe('Unix epoch — when entry expires'),
      }),
      handler: async (params) => {
        const updated = vault.setTemporal(
          params.id as string,
          params.validFrom as number | undefined,
          params.validUntil as number | undefined,
        );
        if (!updated) return { error: 'Entry not found or no fields to update' };
        const entry = vault.get(params.id as string);
        return {
          updated: true,
          id: params.id,
          validFrom: entry?.validFrom ?? null,
          validUntil: entry?.validUntil ?? null,
        };
      },
    },
    {
      name: 'vault_find_expiring',
      description:
        'Find vault entries expiring within a given number of days. Useful for proactive knowledge maintenance.',
      auth: 'read',
      schema: z.object({
        withinDays: z.number().describe('Number of days to look ahead'),
      }),
      handler: async (params) => {
        const entries = vault.findExpiring(params.withinDays as number);
        return { entries, count: entries.length };
      },
    },
    {
      name: 'vault_find_expired',
      description: 'List expired vault entries (valid_until in the past). Useful for cleanup.',
      auth: 'read',
      schema: z.object({
        limit: z.number().optional().describe('Max results (default 50)'),
      }),
      handler: async (params) => {
        const entries = vault.findExpired((params.limit as number | undefined) ?? 50);
        return { entries, count: entries.length };
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
