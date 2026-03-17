/**
 * Chain operations — 5 ops for composable multi-step workflows.
 *
 * Ops: chain_execute, chain_status, chain_resume, chain_list, chain_step_approve
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from './types.js';
import { chainDefSchema } from '../flows/chain-types.js';

export function createChainOps(runtime: AgentRuntime): OpDefinition[] {
  const { chainRunner } = runtime;

  /**
   * Dispatch function that routes op calls to the appropriate facade handler.
   * Looks up the op across all registered facades.
   */
  const createDispatch = (allOps: OpDefinition[]) => {
    return async (op: string, params: Record<string, unknown>): Promise<unknown> => {
      const opDef = allOps.find((o) => o.name === op);
      if (!opDef) throw new Error(`Unknown op: ${op}`);
      return opDef.handler(params);
    };
  };

  // We need access to all ops for dispatch. The plan facade passes them in.
  // For now, store a reference that gets set after facade registration.
  let allOps: OpDefinition[] = [];

  const ops: OpDefinition[] = [
    {
      name: 'chain_execute',
      description:
        "Execute a multi-step chain workflow. Steps run sequentially, each step's output feeds the next via $variable references. " +
        'Gates (user-approval, auto-test, vault-check) can pause execution.',
      auth: 'write',
      schema: z.object({
        chain: chainDefSchema.describe('Chain definition with steps'),
        input: z
          .record(z.unknown())
          .optional()
          .default({})
          .describe('Initial input params (accessible as $input.*)'),
        startFromStep: z.string().optional().describe('Skip to a specific step ID'),
      }),
      handler: async (params) => {
        const chainDef = params.chain as z.infer<typeof chainDefSchema>;
        const input = (params.input as Record<string, unknown>) ?? {};
        const dispatch = createDispatch(allOps);
        return chainRunner.execute(
          chainDef,
          input,
          dispatch,
          undefined,
          params.startFromStep as string | undefined,
        );
      },
    },
    {
      name: 'chain_status',
      description:
        'Get the current status of a chain instance — steps completed, paused gates, outputs.',
      auth: 'read',
      schema: z.object({
        instanceId: z.string().describe('Chain instance ID'),
      }),
      handler: async (params) => {
        const instance = chainRunner.getInstance(params.instanceId as string);
        if (!instance) return { error: `Chain instance not found: ${params.instanceId}` };
        return instance;
      },
    },
    {
      name: 'chain_resume',
      description: 'Resume a paused chain from where it stopped (after a gate approval).',
      auth: 'write',
      schema: z.object({
        instanceId: z.string().describe('Chain instance ID to resume'),
        chain: chainDefSchema.describe('Chain definition (needed to know remaining steps)'),
      }),
      handler: async (params) => {
        const chainDef = params.chain as z.infer<typeof chainDefSchema>;
        const dispatch = createDispatch(allOps);
        return chainRunner.resume(params.instanceId as string, chainDef, dispatch);
      },
    },
    {
      name: 'chain_list',
      description: 'List all chain instances — running, paused, completed, failed.',
      auth: 'read',
      schema: z.object({
        limit: z.number().optional().default(20),
      }),
      handler: async (params) => {
        return chainRunner.list(params.limit as number);
      },
    },
    {
      name: 'chain_step_approve',
      description: 'Approve a gate-paused step and resume chain execution from the next step.',
      auth: 'write',
      schema: z.object({
        instanceId: z.string().describe('Chain instance ID'),
        chain: chainDefSchema.describe('Chain definition (needed to continue execution)'),
      }),
      handler: async (params) => {
        const chainDef = params.chain as z.infer<typeof chainDefSchema>;
        const dispatch = createDispatch(allOps);
        return chainRunner.approve(params.instanceId as string, chainDef, dispatch);
      },
    },
  ];

  // Expose a setter for wiring all ops after facade registration
  (ops as OpDefinition[] & { _setAllOps: (o: OpDefinition[]) => void })._setAllOps = (o) => {
    allOps = o;
  };

  return ops;
}
