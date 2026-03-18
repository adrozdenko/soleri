/**
 * Vault Sharing Ops — knowledge scoping, export, sync, and review ops.
 *
 * Covers:
 * - #105: Knowledge scoping (detect_scope, set_scope, scope-aware filtering)
 * - #104: Vault export to shareable packs
 * - #67: Vault push/pull git sync with conflict resolution
 * - #65: Team review workflows (submit/approve/reject)
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from './types.js';
import { detectScope, type ScopeInput } from '../vault/scope-detector.js';
import { GitVaultSync, type GitVaultSyncConfig } from '../vault/git-vault-sync.js';
import type {
  IntelligenceEntry,
  IntelligenceBundle,
  IntelligenceBundleLink,
} from '../intelligence/types.js';
import { LinkManager } from '../vault/linking.js';

export function createVaultSharingOps(runtime: AgentRuntime): OpDefinition[] {
  const { vault, knowledgeReview } = runtime;

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

    // ─── Export to Pack (#104) ─────────────────────────────────────
    {
      name: 'vault_export_pack',
      description:
        'Export vault entries as a shareable intelligence pack. Filters by tier, domain, or tags. Returns IntelligenceBundle format.',
      auth: 'read' as const,
      schema: z.object({
        name: z.string().optional().describe('Pack name (default: agent ID)'),
        version: z.string().optional().describe('Pack version (default: 1.0.0)'),
        tier: z.enum(['agent', 'project', 'team']).optional().describe('Filter by scope tier'),
        domain: z.string().optional().describe('Filter by domain'),
        tags: z.array(z.string()).optional().describe('Filter by tags (OR match)'),
        excludeIds: z.array(z.string()).optional().describe('Entry IDs to exclude'),
      }),
      handler: async (params) => {
        const tier = params.tier as string | undefined;
        const domain = params.domain as string | undefined;
        const tags = params.tags as string[] | undefined;
        const excludeIds = new Set((params.excludeIds as string[] | undefined) ?? []);

        // Get all matching entries
        let entries = vault.list({ domain, tags, limit: 10000 });

        // Filter by tier if specified
        if (tier) {
          entries = entries.filter((e) => e.tier === tier);
        }

        // Exclude specified IDs
        if (excludeIds.size > 0) {
          entries = entries.filter((e) => !excludeIds.has(e.id));
        }

        // Group by domain into bundles
        const byDomain = new Map<string, IntelligenceEntry[]>();
        for (const entry of entries) {
          const d = entry.domain;
          if (!byDomain.has(d)) byDomain.set(d, []);
          byDomain.get(d)!.push(entry);
        }

        // Collect links for exported entries (Zettelkasten edge export)
        const entryIds = new Set(entries.map((e) => e.id));
        const linkManager = new LinkManager(vault.getProvider());
        const allLinks = linkManager.getAllLinksForEntries([...entryIds]);
        // Only include links where BOTH endpoints are in the export set
        const exportLinks = allLinks.filter(
          (l) => entryIds.has(l.sourceId) && entryIds.has(l.targetId),
        );

        // Build a domain→links map (group by source entry's domain)
        const entryDomainMap = new Map(entries.map((e) => [e.id, e.domain]));
        const linksByDomain = new Map<string, IntelligenceBundleLink[]>();
        for (const link of exportLinks) {
          const linkDomain = entryDomainMap.get(link.sourceId) ?? 'unknown';
          if (!linksByDomain.has(linkDomain)) linksByDomain.set(linkDomain, []);
          linksByDomain.get(linkDomain)!.push({
            sourceId: link.sourceId,
            targetId: link.targetId,
            linkType: link.linkType,
            note: link.note,
          });
        }

        const version = (params.version as string) ?? '1.0.0';
        const bundles: IntelligenceBundle[] = [];
        for (const [d, domainEntries] of byDomain) {
          bundles.push({
            domain: d,
            version,
            entries: domainEntries,
            links: linksByDomain.get(d) ?? [],
          });
        }

        return {
          name: (params.name as string) ?? runtime.config.agentId,
          version,
          bundles,
          totalEntries: entries.length,
          totalLinks: exportLinks.length,
          domains: [...byDomain.keys()],
        };
      },
    },
    {
      name: 'vault_import_pack',
      description:
        'Import an intelligence pack into the vault with content-hash dedup. Entries with duplicate content are skipped.',
      auth: 'write' as const,
      schema: z.object({
        bundles: z
          .array(
            z.object({
              domain: z.string(),
              version: z.string(),
              entries: z.array(z.record(z.unknown())),
            }),
          )
          .describe('Array of IntelligenceBundle objects to import'),
        tier: z
          .enum(['agent', 'project', 'team'])
          .optional()
          .describe('Force all imported entries to this tier'),
      }),
      handler: async (params) => {
        const bundles = params.bundles as Array<{
          domain: string;
          version: string;
          entries: IntelligenceEntry[];
          links?: IntelligenceBundleLink[];
        }>;
        const forceTier = params.tier as 'agent' | 'project' | 'team' | undefined;
        let imported = 0;
        let duplicates = 0;
        let linksCreated = 0;
        let linksSkipped = 0;

        // Track ID remapping: bundle entry ID → actual vault entry ID
        const idRemap = new Map<string, string>();
        const linkManager = new LinkManager(vault.getProvider());

        for (const bundle of bundles) {
          const entries = bundle.entries.map((e) => ({
            ...e,
            tier: forceTier ?? e.tier ?? 'project',
          }));
          const results = vault.seedDedup(entries);
          for (let i = 0; i < results.length; i++) {
            const r = results[i];
            const originalId = bundle.entries[i].id;
            // For duplicates, map to the existing vault entry; for inserts, keep original ID
            idRemap.set(originalId, r.existingId ?? r.id);
            if (r.action === 'inserted') imported++;
            else duplicates++;
          }

          // Import links if present
          if (bundle.links && bundle.links.length > 0) {
            for (const link of bundle.links) {
              const sourceId = idRemap.get(link.sourceId);
              const targetId = idRemap.get(link.targetId);
              if (sourceId && targetId) {
                linkManager.addLink(sourceId, targetId, link.linkType, link.note);
                linksCreated++;
              } else {
                linksSkipped++;
              }
            }
          }
        }

        return { imported, duplicates, linksCreated, linksSkipped, total: imported + duplicates };
      },
    },

    // ─── Git Sync (#67) ───────────────────────────────────────────
    {
      name: 'vault_git_push',
      description:
        'Push all vault entries to a git-tracked directory. Each entry becomes a JSON file under domain subdirectories.',
      auth: 'write' as const,
      schema: z.object({
        repoDir: z.string().describe('Path to git-tracked vault directory'),
        authorName: z.string().optional().describe('Git author name'),
        authorEmail: z.string().optional().describe('Git author email'),
      }),
      handler: async (params) => {
        const config: GitVaultSyncConfig = {
          repoDir: params.repoDir as string,
          authorName: params.authorName as string | undefined,
          authorEmail: params.authorEmail as string | undefined,
        };
        const sync = new GitVaultSync(config);
        await sync.init();
        const { entries } = vault.exportAll();
        return sync.syncAll(entries);
      },
    },
    {
      name: 'vault_git_pull',
      description:
        'Pull entries from a git-tracked directory into the vault. Reads JSON files and imports with conflict resolution.',
      auth: 'write' as const,
      schema: z.object({
        repoDir: z.string().describe('Path to git-tracked vault directory'),
        onConflict: z
          .enum(['git', 'vault'])
          .optional()
          .describe(
            'Conflict resolution: "git" (default) overwrites vault, "vault" keeps existing',
          ),
      }),
      handler: async (params) => {
        const config: GitVaultSyncConfig = {
          repoDir: params.repoDir as string,
          autoCommit: false,
        };
        const sync = new GitVaultSync(config);
        await sync.init();
        return sync.pull(vault, {
          onConflict: params.onConflict as 'git' | 'vault' | undefined,
        });
      },
    },
    {
      name: 'vault_git_sync',
      description:
        'Bidirectional sync between vault and git directory. Pushes vault entries to git and pulls git-only entries into vault.',
      auth: 'write' as const,
      schema: z.object({
        repoDir: z.string().describe('Path to git-tracked vault directory'),
        onConflict: z
          .enum(['git', 'vault'])
          .optional()
          .describe('Conflict resolution for entries that exist in both'),
        authorName: z.string().optional(),
        authorEmail: z.string().optional(),
      }),
      handler: async (params) => {
        const config: GitVaultSyncConfig = {
          repoDir: params.repoDir as string,
          authorName: params.authorName as string | undefined,
          authorEmail: params.authorEmail as string | undefined,
        };
        const sync = new GitVaultSync(config);
        await sync.init();
        return sync.sync(vault, {
          onConflict: params.onConflict as 'git' | 'vault' | undefined,
        });
      },
    },

    // ─── Review Workflows (#65) ───────────────────────────────────
    {
      name: 'vault_submit_review',
      description:
        'Submit a vault entry for team review. Transitions entry from draft → pending_review.',
      auth: 'write' as const,
      schema: z.object({
        entryId: z.string().describe('Entry ID to submit for review'),
        submittedBy: z.string().optional().describe('Name/ID of the submitter'),
      }),
      handler: async (params) => {
        try {
          return knowledgeReview.submit({
            entryId: params.entryId as string,
            submittedBy: params.submittedBy as string | undefined,
          });
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },
    {
      name: 'vault_approve',
      description: 'Approve a pending vault entry. Transitions from pending_review → approved.',
      auth: 'admin' as const,
      schema: z.object({
        entryId: z.string().describe('Entry ID to approve'),
        reviewedBy: z.string().optional().describe('Name/ID of the reviewer'),
        comment: z.string().optional().describe('Review comment'),
      }),
      handler: async (params) => {
        try {
          return knowledgeReview.approve({
            entryId: params.entryId as string,
            reviewedBy: params.reviewedBy as string | undefined,
            comment: params.comment as string | undefined,
          });
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },
    {
      name: 'vault_reject',
      description: 'Reject a pending vault entry. Transitions from pending_review → rejected.',
      auth: 'admin' as const,
      schema: z.object({
        entryId: z.string().describe('Entry ID to reject'),
        reviewedBy: z.string().optional().describe('Name/ID of the reviewer'),
        comment: z.string().optional().describe('Reason for rejection'),
      }),
      handler: async (params) => {
        try {
          return knowledgeReview.reject({
            entryId: params.entryId as string,
            reviewedBy: params.reviewedBy as string | undefined,
            comment: params.comment as string | undefined,
          });
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },
    {
      name: 'vault_pending_reviews',
      description: 'List all vault entries pending team review.',
      auth: 'read' as const,
      schema: z.object({
        limit: z.number().optional().describe('Max entries to return'),
      }),
      handler: async (params) => {
        const pending = knowledgeReview.listPending((params.limit as number) ?? 50);
        return { pending, count: pending.length };
      },
    },
    {
      name: 'vault_review_stats',
      description: 'Get review workflow statistics — counts by status.',
      auth: 'read' as const,
      handler: async () => {
        return knowledgeReview.stats();
      },
    },
  ];
}
