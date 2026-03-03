export function generateFacadeFactory(): string {
  return `import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { FacadeConfig, FacadeResponse } from './types.js';

export function registerFacade(server: McpServer, facade: FacadeConfig): void {
  const opNames = facade.ops.map((o) => o.name);

  server.tool(
    facade.name,
    \`\${facade.description}\\n\\nOperations: \${opNames.join(', ')}\`,
    {
      op: z.string().describe(\`Operation: \${opNames.join(' | ')}\`),
      params: z.record(z.unknown()).optional().default({}).describe('Operation parameters'),
    },
    async ({ op, params }): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
      const response = await dispatchOp(facade, op, params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }] };
    },
  );
}

async function dispatchOp(
  facade: FacadeConfig,
  opName: string,
  params: Record<string, unknown>,
): Promise<FacadeResponse> {
  const op = facade.ops.find((o) => o.name === opName);
  if (!op) {
    return {
      success: false,
      error: \`Unknown operation "\${opName}" on \${facade.name}. Available: \${facade.ops.map((o) => o.name).join(', ')}\`,
      op: opName,
      facade: facade.name,
    };
  }

  try {
    let validatedParams = params;
    if (op.schema) {
      const result = op.schema.safeParse(params);
      if (!result.success) {
        return { success: false, error: \`Invalid params for \${opName}: \${result.error.message}\`, op: opName, facade: facade.name };
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

export function registerAllFacades(server: McpServer, facades: FacadeConfig[]): void {
  for (const facade of facades) {
    registerFacade(server, facade);
  }
}
`;
}
