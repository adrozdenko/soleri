/**
 * Branching Ops — vault branch lifecycle operations.
 *
 * Covers:
 * - Create named branches for experimentation
 * - Add operations (add/modify/remove) to branches
 * - List, merge, and delete branches
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { IntelligenceEntry } from '../intelligence/types.js';
import type { AgentRuntime } from './types.js';

export function createBranchingOps(runtime: AgentRuntime): OpDefinition[] {
  return [
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
  ];
}
