import type { FacadeConfig } from '../facades/types.js';
import type { OpMiddleware } from './types.js';

/**
 * Wrap all ops in the given facades with middleware.
 *
 * Middleware chain follows the onion model:
 * - before hooks: first middleware → last middleware → handler
 * - after hooks:  last middleware → first middleware (reverse)
 *
 * This mutates the facade ops in-place (replaces handlers).
 */
export function wrapWithMiddleware(facades: FacadeConfig[], middleware: OpMiddleware[]): void {
  if (middleware.length === 0) return;

  for (const facade of facades) {
    for (const op of facade.ops) {
      const originalHandler = op.handler;

      op.handler = async (params: Record<string, unknown>) => {
        // Run before hooks (first → last)
        let currentParams = params;
        for (const mw of middleware) {
          if (mw.before) {
            currentParams = await mw.before({
              facade: facade.name,
              op: op.name,
              params: currentParams,
            });
          }
        }

        // Run original handler
        let result = await originalHandler(currentParams);

        // Run after hooks (last → first)
        for (let i = middleware.length - 1; i >= 0; i--) {
          const mw = middleware[i];
          if (mw.after) {
            result = await mw.after({
              facade: facade.name,
              op: op.name,
              params: currentParams,
              result,
            });
          }
        }

        return result;
      };
    }
  }
}
