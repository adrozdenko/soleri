import type { OpDefinition, FacadeConfig } from '../facades/types.js';
import type { AgentRuntime } from '../runtime/types.js';

/**
 * Middleware that wraps op execution with before/after hooks.
 *
 * - `before` runs before the op handler. Return modified params or throw to reject.
 * - `after` runs after the op handler. Return modified result or throw.
 *
 * Multiple middleware are chained: before hooks run first→last,
 * after hooks run last→first (onion model).
 */
export interface OpMiddleware {
  /** Middleware name (for logging/debugging) */
  name: string;
  /** Runs before op handler. Return modified params or throw to reject. */
  before?: (ctx: MiddlewareContext) => Promise<Record<string, unknown>>;
  /** Runs after op handler. Return modified result or throw. */
  after?: (ctx: MiddlewareContext & { result: unknown }) => Promise<unknown>;
}

export interface MiddlewareContext {
  facade: string;
  op: string;
  params: Record<string, unknown>;
}

/**
 * User-defined extensions for a Soleri agent.
 *
 * Extensions live in `src/extensions/` and are auto-discovered by the entry
 * point at startup. Core ops from `@soleri/core` are never modified — extensions
 * are additive (new ops, new facades) or decorative (middleware).
 *
 * @example
 * ```ts
 * // src/extensions/index.ts
 * import type { AgentExtensions } from '@soleri/core';
 * import type { AgentRuntime } from '@soleri/core';
 *
 * export default function loadExtensions(runtime: AgentRuntime): AgentExtensions {
 *   return {
 *     ops: [myCustomOp(runtime)],
 *     facades: [myCustomFacade(runtime)],
 *     middleware: [auditLogger],
 *   };
 * }
 * ```
 */
export interface AgentExtensions {
  /** Extra ops merged into the core facade */
  ops?: OpDefinition[];
  /** New facades registered as separate MCP tools */
  facades?: FacadeConfig[];
  /** Middleware applied to all ops across all facades */
  middleware?: OpMiddleware[];
  /** Lifecycle hooks */
  hooks?: {
    /** Called after runtime init, before MCP server starts */
    onStartup?: (runtime: AgentRuntime) => Promise<void>;
    /** Called on SIGTERM/SIGINT before process exits */
    onShutdown?: (runtime: AgentRuntime) => Promise<void>;
  };
}
