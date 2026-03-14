/**
 * Vault linking ops — Zettelkasten bidirectional linking.
 *
 * Provides 6 ops: link_entries, unlink_entries, get_links, traverse, suggest_links, get_orphans.
 * Ported from Salvador MCP with FTS5 improvement for suggest_links.
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from './types.js';
import { LinkManager } from '../vault/linking.js';

export function createVaultLinkingOps(runtime: AgentRuntime): OpDefinition[] {
  const { vault } = runtime;
  const linkManager = new LinkManager(vault.getProvider());

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
        linkManager.addLink(
          params.sourceId as string,
          params.targetId as string,
          params.linkType as 'supports' | 'contradicts' | 'extends' | 'sequences',
          params.note as string | undefined,
        );
        return {
          success: true,
          link: {
            sourceId: params.sourceId,
            targetId: params.targetId,
            linkType: params.linkType,
            note: params.note,
          },
          sourceLinkCount: linkManager.getLinkCount(params.sourceId as string),
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
  ];
}
