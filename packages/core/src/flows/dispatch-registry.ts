/**
 * Dispatch registry — maps tool names to real facade op handlers.
 *
 * Tool names follow the convention: `{agentId}_{facadeName}_{opName}`
 * e.g. "myagent_vault_search" → facade "myagent_vault", op "search".
 */

import type { FacadeConfig } from '../facades/types.js';

type DispatchResult = { tool: string; status: string; data?: unknown; error?: string };
type DispatchFn = (toolName: string, params: Record<string, unknown>) => Promise<DispatchResult>;

/**
 * Create a dispatcher function that routes tool calls to the correct facade op.
 *
 * @param agentId - Agent identifier prefix (e.g. "myagent")
 * @param facades - Array of registered facade configs
 * @returns A dispatch function that takes (toolName, params) and calls the matching handler
 */
export function createDispatcher(agentId: string, facades: FacadeConfig[]): DispatchFn {
  // Build a lookup map: facadeName → { opName → handler }
  const facadeMap = new Map<string, FacadeConfig>();
  for (const facade of facades) {
    facadeMap.set(facade.name, facade);
  }

  return async (toolName: string, params: Record<string, unknown>): Promise<DispatchResult> => {
    const prefix = `${agentId}_`;

    // Strip agent prefix if present
    const unprefixed = toolName.startsWith(prefix) ? toolName.slice(prefix.length) : toolName;

    // Try progressively longer facade name prefixes.
    // E.g. for "vault_extra_search": try "vault_extra_search", "vault_extra", "vault"
    const parts = unprefixed.split('_');

    for (let splitAt = parts.length - 1; splitAt >= 1; splitAt--) {
      const facadeSuffix = parts.slice(0, splitAt).join('_');
      const opName = parts.slice(splitAt).join('_');
      const facadeFullName = `${prefix}${facadeSuffix}`;

      const facade = facadeMap.get(facadeFullName);
      if (!facade) continue;

      const op = facade.ops.find((o) => o.name === opName);
      if (!op) continue;

      try {
        const result = await op.handler(params);
        return { tool: toolName, status: 'ok', data: result };
      } catch (err) {
        return {
          tool: toolName,
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    // Also try matching the full unprefixed name as a facade with "op" from params
    const facade = facadeMap.get(`${prefix}${unprefixed}`);
    if (facade && params.op && typeof params.op === 'string') {
      const op = facade.ops.find((o) => o.name === params.op);
      if (op) {
        try {
          const result = await op.handler(params);
          return { tool: toolName, status: 'ok', data: result };
        } catch (err) {
          return {
            tool: toolName,
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }
    }

    return { tool: toolName, status: 'unregistered' };
  };
}
