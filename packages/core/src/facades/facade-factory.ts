import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { FacadeConfig, FacadeResponse, AuthPolicy, OpDefinition } from './types.js';
import { AUTH_LEVEL_RANK } from './types.js';

export function registerFacade(
  server: McpServer,
  facade: FacadeConfig,
  authPolicy?: () => AuthPolicy,
): void {
  const opNames = facade.ops.map((o) => o.name);

  const facadeSchema = {
    op: z.string().describe(`Operation: ${opNames.join(' | ')}`),
    params: z
      .record(z.string(), z.unknown())
      .optional()
      .default({})
      .describe('Operation parameters'),
  };

  // @ts-ignore -- MCP SDK Zod type inference hits TS depth limit; runtime is correct
  server.tool(
    facade.name,
    facade.description,
    facadeSchema,
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

/**
 * Register a single hot op as a standalone MCP tool with full schema discovery.
 * The op remains in its facade too — this is additive, not a move.
 */
function registerHotOp(
  server: McpServer,
  agentId: string,
  facadeName: string,
  op: OpDefinition,
  authPolicy?: () => AuthPolicy,
): void {
  const toolName = `${agentId}_${op.name}`;
  const rawSchema = op.schema as z.ZodType | undefined;
  const schema = rawSchema
    ? (rawSchema as z.ZodObject<z.ZodRawShape>).shape
      ? (rawSchema as z.ZodObject<z.ZodRawShape>)
      : z.object({ params: rawSchema })
    : z.object({});

  server.tool(
    toolName,
    op.description,
    schema instanceof z.ZodObject ? schema.shape : {},
    async (params): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
      const policy = authPolicy?.();
      const authResult = checkAuth(op.name, op.auth, facadeName, policy);
      if (authResult) {
        return { content: [{ type: 'text' as const, text: JSON.stringify(authResult, null, 2) }] };
      }

      try {
        let validatedParams = params as Record<string, unknown>;
        if (op.schema) {
          const result = op.schema.safeParse(params);
          if (!result.success) {
            const response: FacadeResponse = {
              success: false,
              error: `Invalid params: ${result.error.message}`,
              op: op.name,
              facade: facadeName,
            };
            return {
              content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }],
            };
          }
          validatedParams = result.data as Record<string, unknown>;
        }

        const data = await op.handler(validatedParams);
        const response: FacadeResponse = { success: true, data, op: op.name, facade: facadeName };
        return { content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const response: FacadeResponse = {
          success: false,
          error: message,
          op: op.name,
          facade: facadeName,
        };
        return { content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }] };
      }
    },
  );
}

export interface RegisterOptions {
  authPolicy?: () => AuthPolicy;
  /** Agent ID prefix for hot op tool names */
  agentId?: string;
  /** Op names to promote to standalone MCP tools (requires agentId) */
  hotOps?: Set<string> | string[];
}

export function registerAllFacades(
  server: McpServer,
  facades: FacadeConfig[],
  authPolicyOrOptions?: (() => AuthPolicy) | RegisterOptions,
): void {
  // Support both legacy signature and new options
  const opts: RegisterOptions =
    typeof authPolicyOrOptions === 'function'
      ? { authPolicy: authPolicyOrOptions }
      : (authPolicyOrOptions ?? {});

  const hotSet = opts.hotOps instanceof Set ? opts.hotOps : new Set(opts.hotOps ?? []);

  for (const facade of facades) {
    registerFacade(server, facade, opts.authPolicy);

    // Promote hot ops to standalone tools
    if (opts.agentId) {
      for (const op of facade.ops) {
        if (op.hot || hotSet.has(op.name)) {
          registerHotOp(server, opts.agentId, facade.name, op, opts.authPolicy);
        }
      }
    }
  }
}
