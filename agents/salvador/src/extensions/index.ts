/**
 * Salvador — Custom Extensions
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
    // ── Custom ops (merged into salvador_core facade) ──────────
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
    //     console.error('[salvador] Custom startup logic');
    //   },
    //   onShutdown: async (rt) => {
    //     console.error('[salvador] Custom shutdown logic');
    //   },
    // },
  };
}
