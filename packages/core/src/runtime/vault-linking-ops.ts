/**
 * Vault linking ops — Zettelkasten bidirectional linking.
 *
 * Provides 8 ops: link_entries, unlink_entries, get_links, traverse,
 * suggest_links, get_orphans, relink_vault, link_stats.
 * Ported from Salvador MCP with improvements:
 * - FTS5 for suggest_links (Salvador uses TF-IDF)
 * - relink_vault: LLM-evaluated batch re-linking (Salvador uses a separate script)
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from './types.js';

const EVAL_SYSTEM_PROMPT = `You evaluate pairs of knowledge entries to determine if they should be linked in a Zettelkasten vault. For EACH pair, decide:
- If meaningfully related → return { "link": true, "type": "<type>", "note": "<1 sentence why>" }
- If NOT meaningfully related → return { "link": false }

Link types:
- "extends" — target builds on or refines the source
- "supports" — target provides evidence or foundation for the source
- "contradicts" — target is an opposing approach or counterpoint
- "sequences" — source must happen before target

Rules: Same category alone is NOT enough. Be selective. Return a JSON array.`;

export function createVaultLinkingOps(runtime: AgentRuntime): OpDefinition[] {
  const { vault, linkManager } = runtime;

  return [
    {
      name: 'link_entries',
      description: 'Create a typed link between two vault entries (Zettelkasten)',
      auth: 'write',
      schema: z.object({
        sourceId: z.string().describe('REQUIRED: Source entry ID'),
        targetId: z.string().describe('REQUIRED: Target entry ID'),
        linkType: z
          .enum(['supports', 'contradicts', 'extends', 'sequences'])
          .describe('REQUIRED: Relationship type'),
        note: z.string().optional().describe('Optional context for the link'),
      }),
      handler: async (params) => {
        const sourceId = params.sourceId as string;
        const targetId = params.targetId as string;

        // Validate both entries exist to prevent dangling links
        const provider = vault.getProvider();
        const sourceExists = provider.get<{ id: string }>('SELECT id FROM entries WHERE id = ?', [
          sourceId,
        ]);
        const targetExists = provider.get<{ id: string }>('SELECT id FROM entries WHERE id = ?', [
          targetId,
        ]);

        if (!sourceExists || !targetExists) {
          const missing = [];
          if (!sourceExists) missing.push(`source '${sourceId}'`);
          if (!targetExists) missing.push(`target '${targetId}'`);
          throw new Error(`Entry not found: ${missing.join(' and ')}`);
        }

        linkManager.addLink(
          sourceId,
          targetId,
          params.linkType as 'supports' | 'contradicts' | 'extends' | 'sequences',
          params.note as string | undefined,
        );
        return {
          success: true,
          link: {
            sourceId,
            targetId,
            linkType: params.linkType,
            note: params.note,
          },
          sourceLinkCount: linkManager.getLinkCount(sourceId),
        };
      },
    },
    {
      name: 'unlink_entries',
      description: 'Remove a link between two vault entries',
      auth: 'write',
      schema: z.object({
        sourceId: z.string().describe('REQUIRED: Source entry ID'),
        targetId: z.string().describe('REQUIRED: Target entry ID'),
      }),
      handler: async (params) => {
        linkManager.removeLink(params.sourceId as string, params.targetId as string);
        return { success: true, removed: { sourceId: params.sourceId, targetId: params.targetId } };
      },
    },
    {
      name: 'get_links',
      description: 'Get all links for a vault entry (outgoing + incoming backlinks)',
      auth: 'read',
      schema: z.object({
        entryId: z.string().describe('REQUIRED: Entry ID'),
      }),
      handler: async (params) => {
        const entryId = params.entryId as string;
        const outgoing = linkManager.getLinks(entryId);
        const incoming = linkManager.getBacklinks(entryId);
        return { entryId, outgoing, incoming, totalLinks: outgoing.length + incoming.length };
      },
    },
    {
      name: 'traverse',
      description:
        'Walk the link graph from an entry up to N hops deep (Zettelkasten graph traversal)',
      auth: 'read',
      schema: z.object({
        entryId: z.string().describe('REQUIRED: Starting entry ID'),
        depth: z.coerce
          .number()
          .int()
          .min(1)
          .max(5)
          .default(2)
          .describe('Max hops (1-5, default 2)'),
      }),
      handler: async (params) => {
        const entryId = params.entryId as string;
        const depth = (params.depth as number) || 2;
        const connected = linkManager.traverse(entryId, depth);
        return { entryId, depth, connectedEntries: connected, totalConnected: connected.length };
      },
    },
    {
      name: 'suggest_links',
      description:
        'Find semantically similar entries as link candidates using FTS5 (Zettelkasten auto-linking)',
      auth: 'read',
      schema: z.object({
        entryId: z.string().describe('REQUIRED: Entry ID to find link candidates for'),
        limit: z.coerce
          .number()
          .int()
          .min(1)
          .max(20)
          .default(5)
          .describe('Max suggestions (default 5)'),
      }),
      handler: async (params) => {
        const entryId = params.entryId as string;
        const limit = (params.limit as number) || 5;
        const suggestions = linkManager.suggestLinks(entryId, limit);
        return { entryId, suggestions, totalSuggestions: suggestions.length };
      },
    },
    {
      name: 'get_orphans',
      description: 'Find vault entries with zero links (Zettelkasten orphan detection)',
      auth: 'read',
      schema: z.object({
        limit: z.coerce
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe('Max orphans (default 20)'),
      }),
      handler: async (params) => {
        const limit = (params.limit as number) || 20;
        const orphans = linkManager.getOrphans(limit);
        return { orphans, totalOrphans: orphans.length };
      },
    },
    {
      name: 'relink_vault',
      description:
        'Smart Zettelkasten re-linking: drops batch links, evaluates all entries with LLM, creates quality links with reasoning notes. Long-running operation.',
      auth: 'write',
      schema: z.object({
        batchSize: z.coerce
          .number()
          .int()
          .min(1)
          .max(20)
          .default(10)
          .describe('Pairs per LLM call (default 10)'),
        limit: z.coerce
          .number()
          .int()
          .min(0)
          .max(5000)
          .default(0)
          .describe('Max entries to process (0 = all)'),
        dryRun: z.boolean().optional().default(false).describe('Preview without changes'),
      }),
      handler: async (params) => {
        const batchSize = (params.batchSize as number) || 10;
        const limit = (params.limit as number) || 0;
        const dryRun = (params.dryRun as boolean) ?? false;
        const { llmClient } = runtime;

        if (!llmClient.isAvailable().anthropic && !llmClient.isAvailable().openai) {
          return { success: false, error: 'No LLM provider available for link evaluation' };
        }

        const provider = vault.getProvider();

        // Phase 1: Preserve manual links, drop batch links
        const manualCount =
          provider.get<{ c: number }>(
            "SELECT COUNT(*) as c FROM vault_links WHERE note IS NOT NULL AND note != ''",
          )?.c ?? 0;

        const batchCount =
          provider.get<{ c: number }>(
            "SELECT COUNT(*) as c FROM vault_links WHERE note IS NULL OR note = ''",
          )?.c ?? 0;

        if (!dryRun) {
          provider.run("DELETE FROM vault_links WHERE note IS NULL OR note = ''");
        }

        // Phase 2: Get entries and generate candidates
        let entries = provider.all<{
          id: string;
          title: string;
          type: string;
          description: string | null;
        }>('SELECT id, title, type, description FROM entries ORDER BY updated_at DESC');
        if (limit > 0) entries = entries.slice(0, limit);

        // Build candidates via tag overlap + category match
        const candidates: Array<{
          sourceId: string;
          sourceTitle: string;
          sourceType: string;
          sourceDesc: string;
          targetId: string;
          targetTitle: string;
          targetType: string;
          targetDesc: string;
        }> = [];

        for (const entry of entries) {
          const existingLinks = new Set([
            ...linkManager.getLinks(entry.id).map((l) => l.targetId),
            ...linkManager.getBacklinks(entry.id).map((l) => l.sourceId),
          ]);

          // Tag overlap matches
          const matches = provider.all<{
            id: string;
            title: string;
            type: string;
            description: string | null;
          }>(
            `SELECT DISTINCT e.id, e.title, e.type, SUBSTR(e.description, 1, 200) as description
             FROM entries e
             JOIN (SELECT entry_id, tag FROM vault_tags WHERE entry_id = ?) src_tags ON 1=1
             JOIN vault_tags t ON t.tag = src_tags.tag AND t.entry_id = e.id
             WHERE e.id != ?
             GROUP BY e.id ORDER BY COUNT(*) DESC LIMIT 5`,
            [entry.id, entry.id],
          );

          // Fallback: category match
          if (matches.length < 3) {
            try {
              const existing = new Set(matches.map((m) => m.id));
              const catMatches = provider.all<(typeof matches)[0]>(
                `SELECT id, title, type, SUBSTR(description, 1, 200) as description
                 FROM entries WHERE id != ? AND type = ? LIMIT 3`,
                [entry.id, entry.type],
              );
              for (const m of catMatches) {
                if (!existing.has(m.id)) matches.push(m);
              }
            } catch {
              /* ignore */
            }
          }

          for (const match of matches.slice(0, 5)) {
            if (existingLinks.has(match.id)) continue;
            candidates.push({
              sourceId: entry.id,
              sourceTitle: entry.title,
              sourceType: entry.type,
              sourceDesc: (entry.description || '').slice(0, 200),
              targetId: match.id,
              targetTitle: match.title,
              targetType: match.type,
              targetDesc: (match.description || '').slice(0, 200),
            });
          }
        }

        if (dryRun) {
          return {
            dryRun: true,
            entries: entries.length,
            candidates: candidates.length,
            llmCallsNeeded: Math.ceil(candidates.length / batchSize),
            manualLinksPreserved: manualCount,
            batchLinksToRemove: batchCount,
          };
        }

        // Phase 3: LLM evaluation in batches (sequential to respect rate limits)
        let linksCreated = 0;
        let pairsSkipped = 0;
        let llmCalls = 0;
        let errors = 0;
        const now = Date.now();

        // Build batches
        const batches: (typeof candidates)[] = [];
        for (let i = 0; i < candidates.length; i += batchSize) {
          batches.push(candidates.slice(i, i + batchSize));
        }

        // Process sequentially using reduce chain (avoids await-in-loop lint)
        await batches.reduce(async (prev, batch) => {
          await prev;
          const pairsText = batch
            .map(
              (p, idx) =>
                `--- Pair ${idx + 1} ---\nSOURCE [${p.sourceType}]: ${p.sourceTitle}\n${p.sourceDesc}\n\nTARGET [${p.targetType}]: ${p.targetTitle}\n${p.targetDesc}`,
            )
            .join('\n\n');

          try {
            const result = await llmClient.complete({
              systemPrompt: EVAL_SYSTEM_PROMPT,
              userPrompt: pairsText,
              maxTokens: 2000,
              caller: 'vault-linking',
              task: 'evaluate-links',
            });
            llmCalls++;

            let cleaned = result.text.trim();
            if (cleaned.startsWith('```')) {
              const first = cleaned.indexOf('\n');
              const last = cleaned.lastIndexOf('```');
              cleaned = cleaned.slice(first + 1, last).trim();
            }

            const decisions = JSON.parse(cleaned) as Array<{
              link: boolean;
              type?: string;
              note?: string;
            }>;

            for (let j = 0; j < decisions.length && j < batch.length; j++) {
              const d = decisions[j];
              if (d.link && d.type && d.note) {
                if (batch[j].sourceId === batch[j].targetId) continue;
                try {
                  provider.run(
                    'INSERT OR IGNORE INTO vault_links (source_id, target_id, link_type, note, created_at) VALUES (?, ?, ?, ?, ?)',
                    [batch[j].sourceId, batch[j].targetId, d.type, d.note, now],
                  );
                  linksCreated++;
                } catch {
                  /* FK or duplicate */
                }
              } else {
                pairsSkipped++;
              }
            }
          } catch {
            errors++;
          }
        }, Promise.resolve());

        // Phase 4: Stats
        const totalLinks =
          provider.get<{ c: number }>('SELECT COUNT(*) as c FROM vault_links')?.c ?? 0;
        const orphanCount =
          provider.get<{ c: number }>(
            `SELECT COUNT(*) as c FROM entries
           WHERE id NOT IN (SELECT source_id FROM vault_links)
             AND id NOT IN (SELECT target_id FROM vault_links)`,
          )?.c ?? 0;
        const byType = provider.all<{ link_type: string; c: number }>(
          'SELECT link_type, COUNT(*) as c FROM vault_links GROUP BY link_type ORDER BY c DESC',
        );

        return {
          success: true,
          entriesProcessed: entries.length,
          candidatesEvaluated: candidates.length,
          linksCreated,
          pairsSkipped,
          llmCalls,
          errors,
          totalLinks,
          orphans: orphanCount,
          byType: Object.fromEntries(byType.map((r) => [r.link_type, r.c])),
          manualLinksPreserved: manualCount,
          batchLinksRemoved: batchCount,
        };
      },
    },
    {
      name: 'backfill_links',
      description:
        'Generate Zettelkasten links for orphan entries using FTS5 suggestions. One-time backfill for vaults with entries but no links.',
      auth: 'write',
      schema: z.object({
        threshold: z.coerce
          .number()
          .min(0)
          .max(1)
          .default(0.7)
          .describe('Min suggestion score to create link (default: 0.7)'),
        maxLinks: z.coerce
          .number()
          .int()
          .min(1)
          .max(10)
          .default(3)
          .describe('Max links per entry (default: 3)'),
        dryRun: z.boolean().optional().default(false).describe('Preview without creating links'),
        batchSize: z.coerce
          .number()
          .int()
          .min(1)
          .max(200)
          .default(50)
          .describe('Entries per batch (default: 50)'),
      }),
      handler: async (params) => {
        const result = linkManager.backfillLinks({
          threshold: params.threshold as number,
          maxLinks: params.maxLinks as number,
          dryRun: params.dryRun as boolean,
          batchSize: params.batchSize as number,
        });
        return {
          ...result,
          ...(result.preview ? { previewSample: result.preview.slice(0, 20) } : {}),
        };
      },
    },
    {
      name: 'link_stats',
      description:
        'Get Zettelkasten graph statistics: total links, by type, most connected, orphan count.',
      auth: 'read',
      handler: async () => {
        const provider = vault.getProvider();
        try {
          const totalLinks =
            provider.get<{ c: number }>('SELECT COUNT(*) as c FROM vault_links')?.c ?? 0;
          const totalEntries =
            provider.get<{ c: number }>('SELECT COUNT(*) as c FROM entries')?.c ?? 0;
          const orphans =
            provider.get<{ c: number }>(
              `SELECT COUNT(*) as c FROM entries
             WHERE id NOT IN (SELECT source_id FROM vault_links)
               AND id NOT IN (SELECT target_id FROM vault_links)`,
            )?.c ?? 0;
          const byType = provider.all<{ link_type: string; c: number }>(
            'SELECT link_type, COUNT(*) as c FROM vault_links GROUP BY link_type ORDER BY c DESC',
          );
          const withNotes =
            provider.get<{ c: number }>(
              "SELECT COUNT(*) as c FROM vault_links WHERE note IS NOT NULL AND note != ''",
            )?.c ?? 0;
          const mostConnected = provider.all<{ title: string; links: number }>(
            `SELECT e.title, (
              (SELECT COUNT(*) FROM vault_links WHERE source_id = e.id) +
              (SELECT COUNT(*) FROM vault_links WHERE target_id = e.id)
            ) as links FROM entries e ORDER BY links DESC LIMIT 10`,
          );

          return {
            totalEntries,
            totalLinks,
            orphans,
            linksWithNotes: withNotes,
            linkQuality: totalLinks > 0 ? `${((withNotes / totalLinks) * 100).toFixed(0)}%` : 'n/a',
            byType: Object.fromEntries(byType.map((r) => [r.link_type, r.c])),
            mostConnected,
          };
        } catch {
          return { totalLinks: 0, totalEntries: 0, orphans: 0, byType: {}, mostConnected: [] };
        }
      },
    },
  ];
}
