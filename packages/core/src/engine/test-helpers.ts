/**
 * Test helpers for the engine registration.
 *
 * Provides captureOps() — equivalent to the old captureHandler() pattern
 * used across 18+ E2E tests — but for the new direct registration.
 */

import type { OpDefinition } from '../facades/types.js';

export interface CapturedOp {
  name: string;
  handler: (params: Record<string, unknown>) => Promise<unknown>;
  schema?: unknown;
  auth: string;
}

/**
 * Capture all op handlers from an op creator function for direct testing.
 * Replaces the old pattern of mocking McpServer + registerFacade + captureHandler.
 */
export function captureOps(ops: OpDefinition[]): Map<string, CapturedOp> {
  const map = new Map<string, CapturedOp>();
  for (const op of ops) {
    map.set(op.name, {
      name: op.name,
      handler: op.handler,
      schema: op.schema,
      auth: op.auth,
    });
  }
  return map;
}

/**
 * Execute an op by name against captured ops, with response envelope.
 * Matches the old dispatchOp() behavior for test compatibility.
 */
export async function executeOp(
  ops: Map<string, CapturedOp>,
  opName: string,
  params: Record<string, unknown> = {},
  facadeName = 'test',
): Promise<{ success: boolean; data?: unknown; error?: string; op: string; facade: string }> {
  const op = ops.get(opName);
  if (!op) {
    return {
      success: false,
      error: `Unknown operation "${opName}". Available: ${[...ops.keys()].join(', ')}`,
      op: opName,
      facade: facadeName,
    };
  }

  try {
    let validatedParams = params;
    if (op.schema && typeof (op.schema as { safeParse?: unknown }).safeParse === 'function') {
      const result = (
        op.schema as {
          safeParse: (p: unknown) => {
            success: boolean;
            data?: unknown;
            error?: { message: string };
          };
        }
      ).safeParse(params);
      if (!result.success) {
        return {
          success: false,
          error: `Invalid params for ${opName}: ${result.error?.message}`,
          op: opName,
          facade: facadeName,
        };
      }
      validatedParams = result.data as Record<string, unknown>;
    }

    const data = await op.handler(validatedParams);
    return { success: true, data, op: opName, facade: facadeName };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message, op: opName, facade: facadeName };
  }
}
