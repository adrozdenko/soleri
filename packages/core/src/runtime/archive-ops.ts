/**
 * Archive operations — 12 ops for archival, lifecycle, temporal, and knowledge maintenance.
 *
 * Split from vault-extra-ops.ts. Groups: archival (3), temporal (3),
 * analytics (1), knowledge lifecycle (4), backup (1).
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { IntelligenceEntry } from '../intelligence/types.js';
import type { AgentRuntime } from './types.js';

export function createArchiveOps(runtime: AgentRuntime): OpDefinition[] {
  const { vault } = runtime;

  return [
    // ─── Archival ───────────────────────────────────────────────────
    {
      name: 'vault_archive',
      description:
        'Archive entries older than N days to entries_archive table. Keeps active table lean.',
      auth: 'write',
      schema: z.object({
        olderThanDays: z.number().describe('Archive entries not updated in this many days'),
        reason: z.string().optional().describe('Reason for archiving'),
      }),
      handler: async (params) => {
        return vault.archive({
          olderThanDays: params.olderThanDays as number,
          reason: params.reason as string | undefined,
        });
      },
    },
    {
      name: 'vault_restore',
      description: 'Restore an archived entry back to the active entries table.',
      auth: 'write',
      schema: z.object({
        id: z.string().describe('ID of the archived entry to restore'),
      }),
      handler: async (params) => {
        const restored = vault.restore(params.id as string);
        return { restored, id: params.id };
      },
    },
    {
      name: 'vault_optimize',
      description: 'Optimize the vault database: VACUUM (SQLite), ANALYZE, and FTS index rebuild.',
      auth: 'write',
      schema: z.object({}),
      handler: async () => {
        return vault.optimize();
      },
    },

    // ─── Backup ──────────────────────────────────────────────────────
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
  ];
}
