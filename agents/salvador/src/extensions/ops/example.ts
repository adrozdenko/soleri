/**
 * Example custom op — add your own logic here.
 *
 * Custom ops are merged into the salvador_core facade alongside
 * the built-in ops from @soleri/core. They have full access
 * to the agent runtime (vault, brain, planner, etc.).
 */

import { z } from 'zod';
import type { OpDefinition, AgentRuntime } from '@soleri/core';

export function createExampleOp(runtime: AgentRuntime): OpDefinition {
  return {
    name: 'example',
    description: 'Example custom op — replace with your own logic.',
    auth: 'read',
    schema: z.object({
      message: z.string().optional().describe('Optional message'),
    }),
    handler: async (params) => {
      const stats = runtime.vault.stats();
      return {
        message: params.message ?? 'Hello from custom extension!',
        vaultEntries: stats.totalEntries,
      };
    },
  };
}
