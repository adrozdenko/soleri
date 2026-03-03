import type { AgentConfig } from '../types.js';

/**
 * Generate the main index.ts entry point for the agent.
 */
export function generateEntryPoint(config: AgentConfig): string {
  const facadeImports = config.domains
    .map((d) => {
      const fn = `create${pascalCase(d)}Facade`;
      const file = `${d}.facade.js`;
      return `import { ${fn} } from './facades/${file}';`;
    })
    .join('\n');

  const facadeCreations = config.domains
    .map((d) => `    create${pascalCase(d)}Facade(vault, brain),`)
    .join('\n');

  return `#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

import { registerAllFacades } from './facades/facade-factory.js';
${facadeImports}
import { createCoreFacade } from './facades/core.facade.js';
import { loadIntelligenceData } from './intelligence/loader.js';
import { Vault } from './vault/vault.js';
import { Planner } from './planning/planner.js';
import { Brain } from './brain/brain.js';
import { LLMClient } from './llm/llm-client.js';
import { KeyPool, loadKeyPoolConfig } from './llm/key-pool.js';
import { PERSONA, getPersonaPrompt } from './identity/persona.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  // Initialize persistent vault at ~/.${config.id}/vault.db
  const vaultPath = join(homedir(), '.${config.id}', 'vault.db');
  const vault = new Vault(vaultPath);
  console.error(\`[\${PERSONA.name.toLowerCase()}] Vault: \${vaultPath}\`);

  // Load and seed intelligence data
  const dataDir = join(__dirname, 'intelligence', 'data');
  const entries = loadIntelligenceData(dataDir);
  if (entries.length > 0) {
    const seeded = vault.seed(entries);
    console.error(\`[\${PERSONA.name.toLowerCase()}] Seeded vault with \${seeded} intelligence entries\`);
  } else {
    console.error(\`[\${PERSONA.name.toLowerCase()}] Vault is empty — ready for knowledge capture\`);
  }

  // Initialize planner at ~/.${config.id}/plans.json
  const plansPath = join(homedir(), '.${config.id}', 'plans.json');
  const planner = new Planner(plansPath);
  console.error(\`[\${PERSONA.name.toLowerCase()}] Planner: \${plansPath}\`);

  // Initialize brain — intelligence layer for ranked search, auto-tagging, dedup
  const brain = new Brain(vault);
  console.error(\`[\${PERSONA.name.toLowerCase()}] Brain: vocabulary \${brain.getVocabularySize()} terms\`);

  // Initialize LLM client (optional — works without API keys)
  const keyPoolFiles = loadKeyPoolConfig();
  const openaiKeyPool = new KeyPool(keyPoolFiles.openai);
  const anthropicKeyPool = new KeyPool(keyPoolFiles.anthropic);
  const llmClient = new LLMClient(openaiKeyPool, anthropicKeyPool);
  const llmAvail = llmClient.isAvailable();
  console.error(\`[\${PERSONA.name.toLowerCase()}] LLM: OpenAI \${llmAvail.openai ? 'available' : 'not configured'}, Anthropic \${llmAvail.anthropic ? 'available' : 'not configured'}\`);

  // Create MCP server
  const server = new McpServer({
    name: '${config.id}-mcp',
    version: '1.0.0',
  });

  // Register persona prompt
  server.prompt('persona', 'Get agent persona and principles', async () => ({
    messages: [{ role: 'assistant' as const, content: { type: 'text' as const, text: getPersonaPrompt() } }],
  }));

  // Create and register facades
  const facades = [
${facadeCreations}
    createCoreFacade(vault, planner, brain, llmClient, openaiKeyPool, anthropicKeyPool),
  ];

  registerAllFacades(server, facades);

  const stats = vault.stats();
  console.error(\`[\${PERSONA.name.toLowerCase()}] \${PERSONA.name} — \${PERSONA.role}\`);
  console.error(\`[\${PERSONA.name.toLowerCase()}] Vault: \${stats.totalEntries} entries across \${Object.keys(stats.byDomain).length} domains\`);
  console.error(\`[\${PERSONA.name.toLowerCase()}] Registered \${facades.length} facades with \${facades.reduce((sum, f) => sum + f.ops.length, 0)} operations\`);

  // Stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(\`[\${PERSONA.name.toLowerCase()}] Connected via stdio transport\`);
  console.error(\`[\${PERSONA.name.toLowerCase()}] Say "Hello, \${PERSONA.name}!" to activate\`);

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    console.error(\`[\${PERSONA.name.toLowerCase()}] Shutting down...\`);
    vault.close();
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

function pascalCase(s: string): string {
  return s
    .split(/[-_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}
