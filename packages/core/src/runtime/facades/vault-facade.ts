/**
 * Vault facade — knowledge management ops.
 * search, CRUD, import/export, intake, archival.
 */

import { z } from 'zod';
import type { OpDefinition } from '../../facades/types.js';
import type { IntelligenceEntry } from '../../intelligence/types.js';
import type { VaultTier } from '../../vault/vault-types.js';
import type { AgentRuntime } from '../types.js';
import { createVaultExtraOps } from '../vault-extra-ops.js';
import { createCaptureOps } from '../capture-ops.js';
import { createIntakeOps } from '../intake-ops.js';
import { createVaultSharingOps } from '../vault-sharing-ops.js';
import { createVaultLinkingOps } from '../vault-linking-ops.js';
import { ObsidianSync } from '../../vault/obsidian-sync.js';

export function createVaultFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  const { vault, brain, intakePipeline, textIngester, vaultManager } = runtime;

  return [
    // ─── Search / Vault (inline from core-ops.ts) ───────────────
    {
      name: 'search',
      description:
        'Search knowledge. mode:"scan" returns lightweight results (titles + scores + snippets) for two-pass retrieval. mode:"full" (default) returns complete entries.',
      auth: 'read',
      schema: z.object({
        query: z.string(),
        domain: z.string().optional(),
        type: z.enum(['pattern', 'anti-pattern', 'rule', 'playbook']).optional(),
        severity: z.enum(['critical', 'warning', 'suggestion']).optional(),
        tags: z.array(z.string()).optional(),
        limit: z.number().optional(),
        mode: z
          .enum(['full', 'scan'])
          .optional()
          .default('full')
          .describe(
            'full = complete entries, scan = lightweight titles + scores for two-pass retrieval',
          ),
      }),
      handler: async (params) => {
        const opts = {
          domain: params.domain as string | undefined,
          type: params.type as string | undefined,
          severity: params.severity as string | undefined,
          tags: params.tags as string[] | undefined,
          limit: (params.limit as number) ?? 10,
        };
        if (params.mode === 'scan') {
          return brain.scanSearch(params.query as string, opts);
        }
        return brain.intelligentSearch(params.query as string, opts);
      },
    },
    {
      name: 'load_entries',
      description:
        'Two-pass retrieval — Pass 2: Load full entries by IDs (from a previous scan search).',
      auth: 'read',
      schema: z.object({
        ids: z.array(z.string()).min(1).describe('Entry IDs from a previous scan search'),
      }),
      handler: async (params) => {
        return brain.loadEntries(params.ids as string[]);
      },
    },
    {
      name: 'vault_stats',
      description: 'Get vault statistics — entry counts by type, domain, severity.',
      auth: 'read',
      handler: async () => vault.stats(),
    },
    {
      name: 'list_all',
      description: 'List all knowledge entries with optional filters.',
      auth: 'read',
      schema: z.object({
        domain: z.string().optional(),
        type: z.enum(['pattern', 'anti-pattern', 'rule', 'playbook']).optional(),
        severity: z.enum(['critical', 'warning', 'suggestion']).optional(),
        tags: z.array(z.string()).optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }),
      handler: async (params) => {
        return vault.list({
          domain: params.domain as string | undefined,
          type: params.type as string | undefined,
          severity: params.severity as string | undefined,
          tags: params.tags as string[] | undefined,
          limit: (params.limit as number) ?? 50,
          offset: (params.offset as number) ?? 0,
        });
      },
    },
    {
      name: 'export',
      description:
        'Export vault entries as JSON intelligence bundles — one per domain. Enables version control and sharing.',
      auth: 'read',
      schema: z.object({
        domain: z.string().optional().describe('Export only this domain. Omit to export all.'),
      }),
      handler: async (params) => {
        const stats = vault.stats();
        const domains = params.domain ? [params.domain as string] : Object.keys(stats.byDomain);
        const bundles: Array<{ domain: string; version: string; entries: IntelligenceEntry[] }> =
          [];
        for (const d of domains) {
          const entries = vault.list({ domain: d, limit: 10000 });
          bundles.push({ domain: d, version: '1.0.0', entries });
        }
        return {
          exported: true,
          bundles,
          totalEntries: bundles.reduce((sum, b) => sum + b.entries.length, 0),
          domains: bundles.map((b) => b.domain),
        };
      },
    },

    // ─── Enriched Capture ────────────────────────────────────────
    {
      name: 'capture_enriched',
      description:
        'Unified LLM-enriched capture — accepts minimal fields (title, description, type), uses LLM to auto-infer tags, category, and severity.',
      auth: 'write',
      schema: z.object({
        title: z.string().describe('Knowledge title'),
        description: z.string().describe('Knowledge description'),
        type: z
          .enum(['pattern', 'anti-pattern', 'rule', 'playbook'])
          .optional()
          .describe('Entry type. If omitted, LLM infers from content.'),
        domain: z.string().optional().describe('Domain. If omitted, LLM infers.'),
        tags: z.array(z.string()).optional().describe('Tags. LLM adds more if needed.'),
      }),
      handler: async (params) => {
        try {
          const title = params.title as string;
          const description = params.description as string;

          // Try LLM enrichment for auto-tagging
          let inferredTags: string[] = (params.tags as string[] | undefined) ?? [];
          let inferredType = (params.type as IntelligenceEntry['type'] | undefined) ?? 'pattern';
          const inferredDomain = (params.domain as string | undefined) ?? 'general';
          let inferredSeverity: IntelligenceEntry['severity'] = 'suggestion';
          const enriched = false;

          try {
            const captureId = `enriched-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const enrichResult = brain.enrichAndCapture({
              id: captureId,
              title,
              description,
              type: inferredType,
              domain: inferredDomain,
              severity: inferredSeverity,
              tags: inferredTags,
            });

            if (enrichResult.captured) {
              return {
                captured: true,
                enriched: true,
                entryId: enrichResult.id,
                autoTags: enrichResult.autoTags,
                duplicate: enrichResult.duplicate ?? null,
              };
            }
          } catch {
            // LLM enrichment failed — fall back to basic capture
          }

          // Fallback: basic capture without LLM enrichment
          // Infer type from keywords
          const lowerDesc = description.toLowerCase();
          if (!params.type) {
            if (
              lowerDesc.includes('avoid') ||
              lowerDesc.includes("don't") ||
              lowerDesc.includes('anti-pattern')
            )
              inferredType = 'anti-pattern';
            else if (
              lowerDesc.includes('rule') ||
              lowerDesc.includes('must') ||
              lowerDesc.includes('always')
            )
              inferredType = 'rule';
          }

          // Infer severity from keywords
          if (
            lowerDesc.includes('critical') ||
            lowerDesc.includes('security') ||
            lowerDesc.includes('breaking')
          )
            inferredSeverity = 'critical';
          else if (
            lowerDesc.includes('warning') ||
            lowerDesc.includes('careful') ||
            lowerDesc.includes('avoid')
          )
            inferredSeverity = 'warning';

          // Auto-generate tags from title words
          if (inferredTags.length === 0) {
            inferredTags = title
              .toLowerCase()
              .split(/\s+/)
              .filter(
                (w) =>
                  w.length > 3 && !['with', 'from', 'that', 'this', 'have', 'been'].includes(w),
              )
              .slice(0, 5);
          }

          const entry: IntelligenceEntry = {
            id: `enriched-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: inferredType,
            domain: inferredDomain,
            title,
            severity: inferredSeverity,
            description,
            tags: inferredTags,
          };

          vault.add(entry);

          return {
            captured: true,
            enriched,
            entry,
            autoTags: inferredTags,
          };
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },

    // ─── Multi-vault ops ────────────────────────────────────────
    {
      name: 'vault_connect',
      description:
        'Connect an additional vault tier (project or team). Opens a separate SQLite database.',
      auth: 'admin',
      schema: z.object({
        tier: z.enum(['project', 'team']).describe('Vault tier to connect'),
        path: z.string().describe('Path to the SQLite database file'),
      }),
      handler: async (params) => {
        const tier = params.tier as VaultTier;
        const path = params.path as string;
        vaultManager.open(tier, path);
        return { connected: true, tier, path };
      },
    },
    {
      name: 'vault_disconnect',
      description: 'Disconnect a vault tier. Cannot disconnect the agent tier.',
      auth: 'admin',
      schema: z.object({
        tier: z.enum(['project', 'team']).describe('Vault tier to disconnect'),
      }),
      handler: async (params) => {
        const tier = params.tier as VaultTier;
        const removed = vaultManager.disconnect(tier);
        return { disconnected: removed, tier };
      },
    },
    {
      name: 'vault_tiers',
      description: 'List all vault tiers with connection status and entry counts.',
      auth: 'read',
      handler: async () => {
        return { tiers: vaultManager.listTiers() };
      },
    },
    {
      name: 'vault_search_all',
      description:
        'Search across all connected vault tiers with priority-weighted cascading. Agent tier results ranked highest.',
      auth: 'read',
      schema: z.object({
        query: z.string(),
        limit: z.number().optional(),
      }),
      handler: async (params) => {
        const results = vaultManager.search(params.query as string, (params.limit as number) ?? 20);
        return { results, count: results.length };
      },
    },

    // ─── Named vault connections ────────────────────────────────
    {
      name: 'vault_connect_source',
      description:
        'Connect a named vault source (e.g., shared team knowledge base) with a configurable search priority.',
      auth: 'admin',
      schema: z.object({
        name: z.string().describe('Unique name for this vault connection'),
        path: z.string().describe('Path to the SQLite database file'),
        priority: z
          .number()
          .min(0)
          .max(2)
          .optional()
          .describe('Search priority weight (default: 0.5)'),
      }),
      handler: async (params) => {
        const name = params.name as string;
        const path = params.path as string;
        const priority = (params.priority as number) ?? 0.5;
        vaultManager.connect(name, path, priority);
        return { connected: true, name, path, priority };
      },
    },
    {
      name: 'vault_disconnect_source',
      description: 'Disconnect a named vault source.',
      auth: 'admin',
      schema: z.object({
        name: z.string().describe('Name of the vault connection to remove'),
      }),
      handler: async (params) => {
        const name = params.name as string;
        const removed = vaultManager.disconnectNamed(name);
        return { disconnected: removed, name };
      },
    },
    {
      name: 'vault_list_sources',
      description: 'List all dynamically connected vault sources with their priorities.',
      auth: 'read',
      handler: async () => {
        return { sources: vaultManager.listConnected() };
      },
    },

    // ─── Branching ─────────────────────────────────────────────
    {
      name: 'vault_branch',
      description:
        'Create a named vault branch for experimentation. Changes can be reviewed and merged later.',
      auth: 'write',
      schema: z.object({
        name: z.string().describe('Unique branch name'),
      }),
      handler: async (params) => {
        const { vaultBranching } = runtime;
        try {
          vaultBranching.branch(params.name as string);
          return { created: true, name: params.name };
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },
    {
      name: 'vault_branch_add',
      description: 'Add an operation (add/modify/remove) to a vault branch.',
      auth: 'write',
      schema: z.object({
        branchName: z.string().describe('Branch to add the operation to'),
        entryId: z.string().describe('Entry ID'),
        action: z.enum(['add', 'modify', 'remove']).describe('Operation type'),
        entryData: z
          .record(z.unknown())
          .optional()
          .describe('Full entry data (required for add/modify)'),
      }),
      handler: async (params) => {
        const { vaultBranching } = runtime;
        try {
          vaultBranching.addOperation(
            params.branchName as string,
            params.entryId as string,
            params.action as 'add' | 'modify' | 'remove',
            params.entryData as IntelligenceEntry | undefined,
          );
          return {
            added: true,
            branchName: params.branchName,
            entryId: params.entryId,
            action: params.action,
          };
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },
    {
      name: 'vault_branch_list',
      description: 'List all vault branches with entry counts and merge status.',
      auth: 'read',
      handler: async () => {
        const { vaultBranching } = runtime;
        return { branches: vaultBranching.listBranches() };
      },
    },
    {
      name: 'vault_merge_branch',
      description: 'Merge a branch into the main vault. Branch entries win on conflict.',
      auth: 'admin',
      schema: z.object({
        branchName: z.string().describe('Branch to merge'),
      }),
      handler: async (params) => {
        const { vaultBranching } = runtime;
        try {
          return vaultBranching.merge(params.branchName as string);
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },
    {
      name: 'vault_delete_branch',
      description: 'Delete a vault branch and all its operations.',
      auth: 'admin',
      schema: z.object({
        branchName: z.string().describe('Branch to delete'),
      }),
      handler: async (params) => {
        const { vaultBranching } = runtime;
        const deleted = vaultBranching.deleteBranch(params.branchName as string);
        return { deleted, branchName: params.branchName };
      },
    },

    // ─── Obsidian Sync ──────────────────────────────────────────
    {
      name: 'obsidian_export',
      description:
        'Export vault entries to Obsidian-compatible markdown files with YAML frontmatter. Creates domain subdirectories.',
      auth: 'read',
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
      auth: 'write',
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
      auth: 'write',
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

    // ─── Satellite ops ───────────────────────────────────────────
    ...createVaultExtraOps(runtime),
    ...createCaptureOps(runtime),
    ...createIntakeOps(intakePipeline, textIngester),
    ...createVaultSharingOps(runtime),
    ...createVaultLinkingOps(runtime),
  ];
}
