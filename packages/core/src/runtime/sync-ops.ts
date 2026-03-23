/**
 * Sync Ops — git, Obsidian, and pack sync operations.
 *
 * Covers:
 * - #67: Vault push/pull git sync with conflict resolution
 * - Obsidian bidirectional sync
 * - #104: Vault export/import shareable packs
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from './types.js';
import { GitVaultSync, type GitVaultSyncConfig } from '../vault/git-vault-sync.js';
import type {
  IntelligenceEntry,
  IntelligenceBundle,
  IntelligenceBundleLink,
} from '../intelligence/types.js';
import { LinkManager } from '../vault/linking.js';
import { ObsidianSync } from '../vault/obsidian-sync.js';

export function createSyncOps(runtime: AgentRuntime): OpDefinition[] {
  const { vault } = runtime;

  return [
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

    // ─── Obsidian Sync ──────────────────────────────────────────
    {
      name: 'obsidian_export',
      description:
        'Export vault entries to Obsidian-compatible markdown files with YAML frontmatter. Creates domain subdirectories.',
      auth: 'read' as const,
      schema: z.object({
        obsidianDir: z.string().describe('Path to Obsidian vault directory'),
        types: z.array(z.string()).optional().describe('Filter by entry types'),
        domains: z.array(z.string()).optional().describe('Filter by domains'),
        dryRun: z.boolean().optional().describe('Preview without writing files'),
      }),
      handler: async (params) => {
        const sync = new ObsidianSync({ vault });
        return sync.export(params.obsidianDir as string, {
          types: params.types as string[] | undefined,
          domains: params.domains as string[] | undefined,
          dryRun: params.dryRun as boolean | undefined,
        });
      },
    },
    {
      name: 'obsidian_import',
      description:
        'Import Obsidian markdown files with YAML frontmatter into the vault. Parses title, type, domain, tags from frontmatter.',
      auth: 'write' as const,
      schema: z.object({
        obsidianDir: z.string().describe('Path to Obsidian vault directory to import from'),
        defaultType: z
          .string()
          .optional()
          .describe('Default type for entries without frontmatter type'),
        defaultDomain: z.string().optional().describe('Default domain for entries without one'),
        dryRun: z.boolean().optional().describe('Preview without modifying vault'),
      }),
      handler: async (params) => {
        const sync = new ObsidianSync({ vault });
        return sync.import(params.obsidianDir as string, {
          defaultType: params.defaultType as string | undefined,
          defaultDomain: params.defaultDomain as string | undefined,
          dryRun: params.dryRun as boolean | undefined,
        });
      },
    },
    {
      name: 'obsidian_sync',
      description:
        'Bidirectional sync between vault and Obsidian directory. Modes: push (vault→Obsidian), pull (Obsidian→vault), bidirectional.',
      auth: 'write' as const,
      schema: z.object({
        obsidianDir: z.string().describe('Path to Obsidian vault directory'),
        mode: z
          .enum(['push', 'pull', 'bidirectional'])
          .optional()
          .describe('Sync mode. Default: bidirectional'),
        dryRun: z.boolean().optional().describe('Preview without making changes'),
      }),
      handler: async (params) => {
        const sync = new ObsidianSync({ vault });
        return sync.sync(params.obsidianDir as string, {
          mode: params.mode as 'push' | 'pull' | 'bidirectional' | undefined,
          dryRun: params.dryRun as boolean | undefined,
        });
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
  ];
}
