#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { forgeOps } from './facades/forge.facade.js';

async function main(): Promise<void> {
  const server = new McpServer({
    name: 'agent-forge',
    version: '1.0.0',
  });

  // Register the forge tool with op dispatch
  const opNames = forgeOps.map((o) => o.name);

  server.tool(
    'forge',
    `Agent Forge — create new MCP agents from Salvador's architecture.\n\nOperations: ${opNames.join(', ')}\n\nStart by calling 'guide' to get the recommended conversation flow for helping a user create an agent.`,
    {
      op: z.string().describe(`Operation: ${opNames.join(' | ')}`),
      params: z.record(z.unknown()).optional().default({}).describe('Operation parameters'),
    },
    async ({ op, params }) => {
      const opDef = forgeOps.find((o) => o.name === op);
      if (!opDef) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: `Unknown operation "${op}". Available: ${opNames.join(', ')}`,
            }, null, 2),
          }],
        };
      }

      try {
        let validatedParams = params;
        if (opDef.schema) {
          const result = opDef.schema.safeParse(params);
          if (!result.success) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({ success: false, error: result.error.message }, null, 2),
              }],
            };
          }
          validatedParams = result.data as Record<string, unknown>;
        }

        const data = await opDef.handler(validatedParams);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, data }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: err instanceof Error ? err.message : String(err),
            }, null, 2),
          }],
        };
      }
    },
  );

  console.error('[agent-forge] Agent Forge — MCP agent scaffolding tool');
  console.error(`[agent-forge] ${forgeOps.length} operations available`);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[agent-forge] Connected via stdio');
}

main().catch((err) => {
  console.error('[agent-forge] Fatal:', err);
  process.exit(1);
});
