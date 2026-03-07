import type { AgentConfig } from '../types.js';

/**
 * Generate the extensions manifest (src/extensions/index.ts).
 * This is the user's entry point for customization.
 */
export function generateExtensionsIndex(config: AgentConfig): string {
  return `/**
 * ${config.name} — Custom Extensions
 *
 * Add your custom ops, facades, middleware, and lifecycle hooks here.
 * This file is auto-discovered by the agent entry point at startup.
 *
 * Core ops from @soleri/core are never modified — your extensions are
 * additive (new ops, new facades) or decorative (middleware).
 *
 * See: https://soleri.dev/docs/extending
 */

import type { AgentExtensions, AgentRuntime } from '@soleri/core';

// Import your custom ops, facades, and middleware here:
// import { myCustomOp } from './ops/my-custom-op.js';
// import { myFacade } from './facades/my-facade.js';
// import { auditLogger } from './middleware/audit-logger.js';

export default function loadExtensions(runtime: AgentRuntime): AgentExtensions {
  return {
    // ── Custom ops (merged into ${config.id}_core facade) ──────────
    // ops: [
    //   myCustomOp(runtime),
    // ],

    // ── Custom facades (registered as separate MCP tools) ──────────
    // facades: [
    //   myFacade(runtime),
    // ],

    // ── Middleware (wraps ALL ops across ALL facades) ───────────────
    // middleware: [
    //   auditLogger,
    // ],

    // ── Lifecycle hooks ────────────────────────────────────────────
    // hooks: {
    //   onStartup: async (rt) => {
    //     console.error('[${config.id}] Custom startup logic');
    //   },
    //   onShutdown: async (rt) => {
    //     console.error('[${config.id}] Custom shutdown logic');
    //   },
    // },
  };
}
`;
}

/**
 * Generate an example custom op file.
 */
export function generateExampleOp(config: AgentConfig): string {
  return `/**
 * Example custom op — add your own logic here.
 *
 * Custom ops are merged into the ${config.id}_core facade alongside
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
`;
}
