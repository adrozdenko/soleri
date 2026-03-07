import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { FacadeConfig, FacadeResponse, AuthPolicy } from './types.js';
import { AUTH_LEVEL_RANK } from './types.js';

export function registerFacade(
  server: McpServer,
  facade: FacadeConfig,
  authPolicy?: () => AuthPolicy,
): void {
  const opNames = facade.ops.map((o) => o.name);

  server.tool(
    facade.name,
    facade.description,
    {
      op: z.string().describe(`Operation: ${opNames.join(' | ')}`),
      params: z.record(z.unknown()).optional().default({}).describe('Operation parameters'),
    },
    async ({ op, params }): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
      const response = await dispatchOp(facade, op, params, authPolicy?.());
      return { content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }] };
    },
  );
}

function checkAuth(
  opName: string,
  opAuth: string,
  facadeName: string,
  policy: AuthPolicy | undefined,
): FacadeResponse | null {
  if (!policy || policy.mode === 'permissive') return null;

  const requiredLevel = policy.overrides?.[opName] ?? (opAuth as keyof typeof AUTH_LEVEL_RANK);
  const callerRank = AUTH_LEVEL_RANK[policy.callerLevel] ?? 0;
  const requiredRank = AUTH_LEVEL_RANK[requiredLevel as keyof typeof AUTH_LEVEL_RANK] ?? 0;

  if (callerRank >= requiredRank) return null;

  const message = `Auth denied: "${opName}" requires ${requiredLevel}, caller has ${policy.callerLevel}`;

  if (policy.mode === 'warn') {
    console.error(`[auth-warn] ${message}`);
    return null; // warn but allow
  }

  // enforce mode — block
  return {
    success: false,
    error: message,
    op: opName,
    facade: facadeName,
  };
}

async function dispatchOp(
  facade: FacadeConfig,
  opName: string,
  params: Record<string, unknown>,
  authPolicy?: AuthPolicy,
): Promise<FacadeResponse> {
  const op = facade.ops.find((o) => o.name === opName);
  if (!op) {
    return {
      success: false,
      error: `Unknown operation "${opName}" on ${facade.name}. Available: ${facade.ops.map((o) => o.name).join(', ')}`,
      op: opName,
      facade: facade.name,
    };
  }

  // Auth check — before validation or execution
  const authResult = checkAuth(opName, op.auth, facade.name, authPolicy);
  if (authResult) return authResult;

  try {
    let validatedParams = params;
    if (op.schema) {
      const result = op.schema.safeParse(params);
      if (!result.success) {
        return {
          success: false,
          error: `Invalid params for ${opName}: ${result.error.message}`,
          op: opName,
          facade: facade.name,
        };
      }
      validatedParams = result.data as Record<string, unknown>;
    }

    const data = await op.handler(validatedParams);
    return { success: true, data, op: opName, facade: facade.name };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message, op: opName, facade: facade.name };
  }
}

export function registerAllFacades(
  server: McpServer,
  facades: FacadeConfig[],
  authPolicy?: () => AuthPolicy,
): void {
  for (const facade of facades) {
    registerFacade(server, facade, authPolicy);
  }
}
