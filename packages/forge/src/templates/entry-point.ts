import type { AgentConfig } from '../types.js';

/**
 * Generate the main index.ts entry point for the agent.
 *
 * v5.0: Thin shell — delegates to createAgentRuntime(), createSemanticFacades(),
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
  createSemanticFacades,
  createDomainFacades,
  registerAllFacades,
  seedDefaultPlaybooks,
  wrapWithMiddleware,
} from '@soleri/core';
import type { OpDefinition, AgentExtensions } from '@soleri/core';
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

  // Seed built-in playbooks (idempotent)
  const seedResult = seedDefaultPlaybooks(runtime.vault);
  if (seedResult.seeded > 0) {
    console.error(\`[\${tag}] Seeded \${seedResult.seeded} built-in playbooks\`);
  }

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
      description: 'Get agent identity — name, role, principles. Uses IdentityManager with PERSONA fallback.',
      auth: 'read',
      handler: async () => {
        const identity = runtime.identityManager.getIdentity('${config.id}');
        if (identity) return identity;
        return PERSONA;
      },
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
        // Seed identity from PERSONA on first activation
        if (!runtime.identityManager.getIdentity('${config.id}')) {
          runtime.identityManager.setIdentity('${config.id}', {
            name: PERSONA.name,
            role: PERSONA.role,
            description: PERSONA.description ?? '',
            personality: PERSONA.principles ?? [],
            changedBy: 'system',
            changeReason: 'Initial identity seeded from PERSONA',
          });
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

        // Check hook status
        const { readdirSync } = await import('node:fs');
        const agentClaudeDir = joinPath(__dirname, '..', '.claude');
        const globalClaudeDir = joinPath(homedir(), '.claude');

        const hookStatus = { agent: [] as string[], global: [] as string[], missing: [] as string[] };

        if (existsSync(agentClaudeDir)) {
          try {
            const agentHooks = readdirSync(agentClaudeDir)
              .filter((f: string) => f.startsWith('hookify.') && f.endsWith('.local.md'))
              .map((f: string) => f.replace('hookify.', '').replace('.local.md', ''));
            hookStatus.agent = agentHooks;

            for (const hook of agentHooks) {
              if (existsSync(joinPath(globalClaudeDir, \`hookify.\${hook}.local.md\`))) {
                hookStatus.global.push(hook);
              } else {
                hookStatus.missing.push(hook);
              }
            }
          } catch {
            // ignore read errors
          }
        }

        if (hookStatus.missing.length > 0) {
          recommendations.push(\`\${hookStatus.missing.length} hook(s) not installed globally — run scripts/setup.sh\`);
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
          hooks: hookStatus,
          recommendations,
        };
      },
    },
  ];

  // ─── Assemble facades ──────────────────────────────────────────
  const semanticFacades = createSemanticFacades(runtime, '${config.id}');
  const agentFacade = {
    name: '${config.id}_core',
    description: 'Agent-specific operations — health, identity, activation, CLAUDE.md injection, setup.',
    ops: agentOps,
  };

  const domainFacades = createDomainFacades(runtime, '${config.id}', ${domainsLiteral});

  // ─── User extensions (auto-discovered from src/extensions/) ────
  let extensions: AgentExtensions = {};
  try {
    const ext = await import('./extensions/index.js');
    const loader = ext.default ?? (ext as Record<string, unknown>).loadExtensions;
    if (typeof loader === 'function') {
      extensions = loader(runtime);
    } else if (typeof loader === 'object') {
      extensions = loader;
    }
    if (extensions.ops?.length || extensions.facades?.length || extensions.middleware?.length) {
      console.error(\`[\${tag}] Extensions loaded: \${extensions.ops?.length ?? 0} ops, \${extensions.facades?.length ?? 0} facades, \${extensions.middleware?.length ?? 0} middleware\`);
    }
  } catch {
    // No extensions directory or load error — run vanilla
  }

  // Merge user ops into agent facade
  if (extensions.ops?.length) {
    agentFacade.ops.push(...extensions.ops);
  }

  // Collect user facades
  const userFacades = extensions.facades ?? [];

  // Apply middleware to all facades
  const allFacades = [...semanticFacades, agentFacade, ...domainFacades, ...userFacades];
  if (extensions.middleware?.length) {
    wrapWithMiddleware(allFacades, extensions.middleware);
  }

  // Lifecycle: onStartup
  if (extensions.hooks?.onStartup) {
    await extensions.hooks.onStartup(runtime);
  }

  // ─── MCP server ────────────────────────────────────────────────
  const server = new McpServer({
    name: '${config.id}-mcp',
    version: '1.0.0',
  });

  server.prompt('persona', 'Get agent persona and principles', async () => ({
    messages: [{ role: 'assistant' as const, content: { type: 'text' as const, text: getPersonaPrompt() } }],
  }));

  // Hot ops — promoted to standalone MCP tools with full schema discovery
  const hotOps = new Set([
    'search_intelligent',
    'capture_knowledge',
    'orchestrate_plan',
    'orchestrate_execute',
    'orchestrate_complete',
  ]);

  registerAllFacades(server, allFacades, {
    agentId: '${config.id}',
    hotOps,
    authPolicy: () => runtime.authPolicy,
  });

  console.error(\`[\${tag}] \${PERSONA.name} — \${PERSONA.role}\`);
  console.error(\`[\${tag}] Registered \${allFacades.length} facades with \${allFacades.reduce((sum, f) => sum + f.ops.length, 0)} operations (\${hotOps.size} hot)\`);

  // ─── Transport + shutdown ──────────────────────────────────────
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(\`[\${tag}] Connected via stdio transport\`);
  console.error(\`[\${tag}] Say "Hello, \${PERSONA.name}!" to activate\`);

  const shutdown = async (): Promise<void> => {
    console.error(\`[\${tag}] Shutting down...\`);
    if (extensions.hooks?.onShutdown) {
      try {
        await extensions.hooks.onShutdown(runtime);
      } catch (err) {
        console.error(\`[\${tag}] Extension shutdown error:\`, err);
      }
    }
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
