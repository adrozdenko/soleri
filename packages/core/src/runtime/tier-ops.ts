/**
 * Tier Ops — multi-vault tier and named source operations.
 *
 * Covers:
 * - Connect/disconnect vault tiers (project, team)
 * - List tiers with connection status
 * - Search across all connected tiers
 * - Named vault source connections with configurable priority
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { VaultTier } from '../vault/vault-types.js';
import type { AgentRuntime } from './types.js';

export function createTierOps(runtime: AgentRuntime): OpDefinition[] {
  const { vaultManager } = runtime;

  return [
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
  ];
}
