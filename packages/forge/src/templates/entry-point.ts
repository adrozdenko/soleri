import type { AgentConfig } from '../types.js';

/**
 * Generate the main index.ts entry point for the agent.
 *
 * v5.0: Thin shell — delegates to createAgentRuntime(), createCoreOps(),
 * and createDomainFacades() from @soleri/core. Only agent-specific code
 * (persona, activation) lives here.
 */
export function generateEntryPoint(config: AgentConfig): string {
  const domainsLiteral = JSON.stringify(config.domains);

  return `#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createAgentRuntime,
  createCoreOps,
  createDomainFacades,
  registerAllFacades,
} from '@soleri/core';
import type { OpDefinition } from '@soleri/core';
import { z } from 'zod';
import { PERSONA, getPersonaPrompt } from './identity/persona.js';
import { activateAgent, deactivateAgent } from './activation/activate.js';
import { injectClaudeMd, injectClaudeMdGlobal, hasAgentMarker } from './activation/inject-claude-md.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  // ─── Runtime — vault, brain, planner, curator, LLM, key pools ───
  const runtime = createAgentRuntime({
    agentId: '${config.id}',
    dataDir: join(__dirname, 'intelligence', 'data'),
  });

  const tag = PERSONA.name.toLowerCase();
  const stats = runtime.vault.stats();
  console.error(\`[\${tag}] Vault: \${stats.totalEntries} entries, Brain: \${runtime.brain.getVocabularySize()} terms\`);

  const llmAvail = runtime.llmClient.isAvailable();
  console.error(\`[\${tag}] LLM: OpenAI \${llmAvail.openai ? 'available' : 'not configured'}, Anthropic \${llmAvail.anthropic ? 'available' : 'not configured'}\`);

  // ─── Agent-specific ops (reference persona + activation) ────────
  const agentOps: OpDefinition[] = [
    {
      name: 'health',
      description: 'Health check — vault status and agent info.',
      auth: 'read',
      handler: async () => {
        const s = runtime.vault.stats();
        return {
          status: 'ok',
          agent: { name: PERSONA.name, role: PERSONA.role },
          vault: { entries: s.totalEntries, domains: Object.keys(s.byDomain) },
        };
      },
    },
    {
      name: 'identity',
      description: 'Get agent identity — name, role, principles.',
      auth: 'read',
      handler: async () => PERSONA,
    },
    {
      name: 'activate',
      description: 'Activate agent persona — returns full context for Claude to adopt. Say "Hello, ${config.name}!" to trigger.',
      auth: 'read',
      schema: z.object({
        projectPath: z.string().optional().default('.'),
        deactivate: z.boolean().optional(),
      }),
      handler: async (params) => {
        if (params.deactivate) {
          return deactivateAgent();
        }
        return activateAgent(runtime.vault, (params.projectPath as string) ?? '.', runtime.planner);
      },
    },
    {
      name: 'inject_claude_md',
      description: 'Inject agent sections into CLAUDE.md — project-level or global (~/.claude/CLAUDE.md). Idempotent.',
      auth: 'write',
      schema: z.object({
        projectPath: z.string().optional().default('.'),
        global: z.boolean().optional().describe('If true, inject into ~/.claude/CLAUDE.md instead of project-level'),
      }),
      handler: async (params) => {
        if (params.global) {
          return injectClaudeMdGlobal();
        }
        return injectClaudeMd((params.projectPath as string) ?? '.');
      },
    },
    {
      name: 'setup',
      description: 'Check setup status — CLAUDE.md configured? Vault has entries? What to do next?',
      auth: 'read',
      schema: z.object({
        projectPath: z.string().optional().default('.'),
      }),
      handler: async (params) => {
        const { existsSync } = await import('node:fs');
        const { join: joinPath } = await import('node:path');
        const { homedir } = await import('node:os');
        const projectPath = (params.projectPath as string) ?? '.';

        const projectClaudeMd = joinPath(projectPath, 'CLAUDE.md');
        const globalClaudeMd = joinPath(homedir(), '.claude', 'CLAUDE.md');

        const projectExists = existsSync(projectClaudeMd);
        const projectHasAgent = hasAgentMarker(projectClaudeMd);
        const globalExists = existsSync(globalClaudeMd);
        const globalHasAgent = hasAgentMarker(globalClaudeMd);

        const s = runtime.vault.stats();

        const recommendations: string[] = [];
        if (!globalHasAgent && !projectHasAgent) {
          recommendations.push('No CLAUDE.md configured — run inject_claude_md with global: true for all projects, or without for this project');
        } else if (!globalHasAgent) {
          recommendations.push('Global ~/.claude/CLAUDE.md not configured — run inject_claude_md with global: true to enable in all projects');
        }
        if (s.totalEntries === 0) {
          recommendations.push('Vault is empty — add intelligence data or capture knowledge via domain facades');
        }
        if (recommendations.length === 0) {
          recommendations.push('${config.name} is fully set up and ready!');
        }

        return {
          agent: { name: PERSONA.name, role: PERSONA.role },
          claude_md: {
            project: { exists: projectExists, has_agent_section: projectHasAgent },
            global: { exists: globalExists, has_agent_section: globalHasAgent },
          },
          vault: { entries: s.totalEntries, domains: Object.keys(s.byDomain) },
          recommendations,
        };
      },
    },
  ];

  // ─── Assemble facades ──────────────────────────────────────────
  const coreOps = createCoreOps(runtime);
  const coreFacade = {
    name: '${config.id}_core',
    description: 'Core operations — vault stats, cross-domain search, health check, identity, and activation system.',
    ops: [...coreOps, ...agentOps],
  };

  const domainFacades = createDomainFacades(runtime, '${config.id}', ${domainsLiteral});

  // ─── MCP server ────────────────────────────────────────────────
  const server = new McpServer({
    name: '${config.id}-mcp',
    version: '1.0.0',
  });

  server.prompt('persona', 'Get agent persona and principles', async () => ({
    messages: [{ role: 'assistant' as const, content: { type: 'text' as const, text: getPersonaPrompt() } }],
  }));

  const facades = [coreFacade, ...domainFacades];
  registerAllFacades(server, facades);

  console.error(\`[\${tag}] \${PERSONA.name} — \${PERSONA.role}\`);
  console.error(\`[\${tag}] Registered \${facades.length} facades with \${facades.reduce((sum, f) => sum + f.ops.length, 0)} operations\`);

  // ─── Transport + shutdown ──────────────────────────────────────
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(\`[\${tag}] Connected via stdio transport\`);
  console.error(\`[\${tag}] Say "Hello, \${PERSONA.name}!" to activate\`);

  const shutdown = async (): Promise<void> => {
    console.error(\`[\${tag}] Shutting down...\`);
    runtime.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[${config.id}] Fatal error:', err);
  process.exit(1);
});
`;
}
