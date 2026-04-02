import { z } from 'zod';

/**
 * Wraps a Zod array schema so it also accepts a JSON-stringified array.
 * MCP transports sometimes serialize array params as strings.
 */
export function coerceArray<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.preprocess((val) => {
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        /* fall through to let Zod reject */
      }
    }
    return val;
  }, z.array(itemSchema));
}
