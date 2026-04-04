/**
 * Vault facade — knowledge management ops.
 * search, CRUD, capture, sharing scope.
 * Archival and lifecycle ops are in archive-facade.ts.
 * Sync ops (git, obsidian, packs) are in sync-facade.ts.
 * Review ops are in review-facade.ts.
 *
 * Backward-compat stubs are appended at the end for ops that moved
 * to new facades, so existing agents/CLAUDE.md files keep working.
 */

import { z } from 'zod';
import type { OpDefinition } from '../../facades/types.js';
import type { IntelligenceEntry } from '../../intelligence/types.js';
import type { AgentRuntime } from '../types.js';
import { createVaultExtraOps } from '../vault-extra-ops.js';
import { createCaptureOps } from '../capture-ops.js';
import { createVaultSharingOps } from '../vault-sharing-ops.js';
import { createArchiveOps } from '../archive-ops.js';
import { createSyncOps } from '../sync-ops.js';
import { createReviewOps } from '../review-ops.js';
import { createVaultLinkingOps } from '../vault-linking-ops.js';
import { createBranchingOps } from '../branching-ops.js';
import { createTierOps } from '../tier-ops.js';
import { deprecationWarning } from '../deprecation.js';

export function createVaultFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  const { vault, brain } = runtime;

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
        'Two-pass retrieval — Pass 2: Load full entries by IDs (from a previous scan search). ' +
        'Alternative: pass domain + limit to list entries by domain without a prior scan.',
      auth: 'read',
      schema: z.object({
        ids: z
          .array(z.string())
          .min(1)
          .optional()
          .describe('Entry IDs from a previous scan search'),
        domain: z.string().optional().describe('Alternative to ids: filter entries by domain'),
        limit: z
          .number()
          .optional()
          .default(20)
          .describe('Max entries when using domain filter (default: 20)'),
      }),
      handler: async (params) => {
        const ids = params.ids as string[] | undefined;
        if (ids && ids.length > 0) {
          return brain.loadEntries(ids);
        }
        const domain = params.domain as string | undefined;
        if (domain) {
          const entries = vault.list({ domain, limit: (params.limit as number) ?? 20 });
          return { entries, total: entries.length };
        }
        throw new Error(
          'Provide ids (from search_intelligent scan) or domain to filter entries. ' +
            'Example: { ids: ["entry-id-1"] } or { domain: "testing", limit: 10 }',
        );
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
        verbose: z.boolean().optional().describe('Return full entry objects instead of summaries'),
      }),
      handler: async (params) => {
        const verbose = params.verbose === true;
        const entries = vault.list({
          domain: params.domain as string | undefined,
          type: params.type as string | undefined,
          severity: params.severity as string | undefined,
          tags: params.tags as string[] | undefined,
          limit: (params.limit as number) ?? 20,
          offset: (params.offset as number) ?? 0,
        });
        if (verbose) {
          return entries;
        }
        // Return lightweight summaries to reduce response size
        return (
          entries as Array<{
            id: string;
            title: string;
            type: string;
            domain: string;
            tags?: string[];
          }>
        ).map((e) => ({
          id: e.id,
          title: e.title,
          type: e.type,
          domain: e.domain,
          tags: e.tags ?? [],
        }));
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

    // ─── Satellite ops ───────────────────────────────────────────
    ...createVaultExtraOps(runtime),
    ...createCaptureOps(runtime),
    ...createVaultSharingOps(runtime),

    // ─── Backward-compat stubs for ops that moved to new facades ─
    ...deprecateOps(createArchiveOps(runtime), 'archive'),
    ...deprecateOps(createSyncOps(runtime), 'sync'),
    ...deprecateOps(createReviewOps(runtime), 'review'),
    ...deprecateOps(createVaultLinkingOps(runtime), 'links'),
    ...deprecateOps(createBranchingOps(runtime), 'branching'),
    ...deprecateOps(createTierOps(runtime), 'tier'),
  ];
}

// ─── Deprecation wrapper ────────────────────────────────────────────

/**
 * Wrap an array of ops with deprecation warnings.
 * Each op's handler logs a one-time warning before forwarding to the real handler.
 */
export function deprecateOps(ops: OpDefinition[], newFacade: string): OpDefinition[] {
  return ops.map((op) => ({
    ...op,
    handler: async (params: Record<string, unknown>) => {
      deprecationWarning({
        name: op.name,
        since: '0.5.0',
        replacement: `${newFacade}.${op.name}`,
        message: `Op "${op.name}" has moved to the ${newFacade} facade. Update your calls.`,
      });
      return op.handler(params);
    },
  }));
}
