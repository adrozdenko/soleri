/**
 * Pack Operations — 4 ops for knowledge pack management.
 *
 * pack_install, pack_list, pack_uninstall, pack_validate
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from './types.js';

export function createPackOps(runtime: AgentRuntime): OpDefinition[] {
  const { packInstaller } = runtime;

  return [
    // ─── pack_validate ────────────────────────────────────────────────
    {
      name: 'pack_validate',
      description:
        'Validate a knowledge pack directory without installing. Returns manifest, counts, and any errors/warnings.',
      auth: 'read',
      schema: z.object({
        packDir: z.string().describe('Path to the knowledge pack directory.'),
      }),
      handler: async (params) => {
        return packInstaller.validate(params.packDir as string);
      },
    },

    // ─── pack_install ─────────────────────────────────────────────────
    {
      name: 'pack_install',
      description:
        'Install a knowledge pack — validates manifest, seeds vault entries, registers facades, discovers skills and hooks.',
      auth: 'admin',
      schema: z.object({
        packDir: z.string().describe('Path to the knowledge pack directory.'),
      }),
      handler: async (params) => {
        return packInstaller.install(params.packDir as string, runtime);
      },
    },

    // ─── pack_list ────────────────────────────────────────────────────
    {
      name: 'pack_list',
      description: 'List all installed knowledge packs with their status and contents.',
      auth: 'read',
      handler: async () => {
        const packs = packInstaller.list();
        return {
          packs: packs.map((p) => ({
            id: p.id,
            name: p.manifest.name,
            version: p.manifest.version,
            domains: p.manifest.domains,
            status: p.status,
            vaultEntries: p.vaultEntries,
            skills: p.skills,
            hooks: p.hooks,
            facadesRegistered: p.facadesRegistered,
            error: p.error,
          })),
          count: packs.length,
        };
      },
    },

    // ─── pack_uninstall ───────────────────────────────────────────────
    {
      name: 'pack_uninstall',
      description:
        'Uninstall a knowledge pack — deactivates facades. Vault entries are NOT removed (knowledge persists).',
      auth: 'admin',
      schema: z.object({
        packId: z.string().describe('Pack ID to uninstall.'),
      }),
      handler: async (params) => {
        const packId = params.packId as string;
        const success = packInstaller.uninstall(packId);
        if (!success) return { error: `Pack not found: ${packId}` };
        return { uninstalled: true, id: packId };
      },
    },
  ];
}
