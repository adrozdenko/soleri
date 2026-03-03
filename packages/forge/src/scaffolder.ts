import { mkdirSync, writeFileSync, chmodSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { AgentConfig, ScaffoldResult, ScaffoldPreview, AgentInfo } from './types.js';

import { generatePackageJson } from './templates/package-json.js';
import { generateTsconfig } from './templates/tsconfig.js';
import { generateVitestConfig } from './templates/vitest-config.js';
import { generateFacadeTypes } from './templates/facade-types.js';
import { generateFacadeFactory } from './templates/facade-factory.js';
import { generateVault } from './templates/vault.js';
import { generateIntelligenceTypes } from './templates/intelligence-types.js';
import { generateIntelligenceLoader } from './templates/intelligence-loader.js';
import { generatePersona } from './templates/persona.js';
import { generateDomainFacade } from './templates/domain-facade.js';
import { generateCoreFacade } from './templates/core-facade.js';
import { generateEntryPoint } from './templates/entry-point.js';
import { generateVaultTest } from './templates/test-vault.js';
import { generateLoaderTest } from './templates/test-loader.js';
import { generateFacadesTest } from './templates/test-facades.js';
import { generateClaudeMdTemplate } from './templates/claude-md-template.js';
import { generateInjectClaudeMd } from './templates/inject-claude-md.js';
import { generateActivate } from './templates/activate.js';
import { generateReadme } from './templates/readme.js';
import { generateSetupScript } from './templates/setup-script.js';
import { generatePlanner } from './templates/planner.js';
import { generatePlannerTest } from './templates/test-planner.js';
import { generateBrain } from './templates/brain.js';
import { generateBrainTest } from './templates/test-brain.js';
import { generateLLMTypes } from './templates/llm-types.js';
import { generateLLMUtils } from './templates/llm-utils.js';
import { generateLLMKeyPool } from './templates/llm-key-pool.js';
import { generateLLMClient } from './templates/llm-client.js';
import { generateLLMTest } from './templates/test-llm.js';

/**
 * Preview what scaffold will create without writing anything.
 */
export function previewScaffold(config: AgentConfig): ScaffoldPreview {
  const agentDir = join(config.outputDir, config.id);

  const files = [
    { path: 'package.json', description: 'NPM package with MCP SDK, SQLite, Zod dependencies' },
    { path: 'tsconfig.json', description: 'TypeScript config (ES2022, NodeNext, strict)' },
    { path: 'vitest.config.ts', description: 'Test config (vitest, forks pool, coverage)' },
    { path: '.gitignore', description: 'Git ignore (node_modules, dist, coverage)' },
    { path: 'scripts/copy-assets.js', description: 'Build script to copy intelligence data to dist' },
    { path: 'src/index.ts', description: 'Entry point — initializes vault, planner, brain, registers facades, starts stdio' },
    { path: 'src/planning/planner.ts', description: 'Plan state machine — draft → approved → executing → completed' },
    { path: 'src/brain/brain.ts', description: 'Intelligence layer — TF-IDF scoring, auto-tagging, duplicate detection, adaptive weights' },
    { path: 'src/llm/types.ts', description: 'LLM types — SecretString, LLMError, call options/result, circuit breaker, key pool, routing' },
    { path: 'src/llm/utils.ts', description: 'LLM utilities — CircuitBreaker, retry with backoff+jitter, rate limit header parser' },
    { path: 'src/llm/key-pool.ts', description: 'Key pool — multi-key rotation with per-key circuit breakers, preemptive quota rotation' },
    { path: 'src/llm/llm-client.ts', description: 'LLM client — unified OpenAI/Anthropic caller with model routing (optional, needs API keys)' },
    { path: 'src/facades/types.ts', description: 'Facade type system (OpHandler, FacadeConfig)' },
    { path: 'src/facades/facade-factory.ts', description: 'Registers facades as MCP tools with op dispatch' },
    { path: 'src/facades/core.facade.ts', description: 'Core facade — search, vault stats, health, identity' },
    ...config.domains.map((d) => ({
      path: `src/facades/${d}.facade.ts`,
      description: `${d} facade — search, get_patterns, capture, remove`,
    })),
    { path: 'src/vault/vault.ts', description: 'SQLite vault with FTS5 full-text search (BM25 ranking)' },
    { path: 'src/intelligence/types.ts', description: 'IntelligenceEntry and IntelligenceBundle types' },
    { path: 'src/intelligence/loader.ts', description: 'Loads and validates JSON intelligence data files' },
    ...config.domains.map((d) => ({
      path: `src/intelligence/data/${d}.json`,
      description: `Empty ${d} intelligence bundle — ready for knowledge capture`,
    })),
    { path: 'src/identity/persona.ts', description: `${config.name} persona — name, role, principles, greeting` },
    { path: 'src/activation/claude-md-content.ts', description: `${config.name} CLAUDE.md content with activation triggers and facades table` },
    { path: 'src/activation/inject-claude-md.ts', description: 'Idempotent CLAUDE.md injection — project-level or global (~/.claude/CLAUDE.md)' },
    { path: 'src/activation/activate.ts', description: `${config.name} activation system — persona adoption, setup status, tool recommendations` },
    { path: 'src/__tests__/vault.test.ts', description: 'Vault tests — CRUD, FTS5 search, stats, project registration (32 tests)' },
    { path: 'src/__tests__/loader.test.ts', description: 'Intelligence loader tests — valid/invalid JSON, edge cases (9 tests)' },
    { path: 'src/__tests__/facades.test.ts', description: `Facade integration tests — all ${config.domains.length + 1} facades` },
    { path: 'src/__tests__/planner.test.ts', description: 'Planner tests — state machine, task lifecycle, persistence (~20 tests)' },
    { path: 'src/__tests__/brain.test.ts', description: 'Brain tests — TF-IDF scoring, auto-tagging, duplicate detection, adaptive weights (~38 tests)' },
    { path: 'src/__tests__/llm.test.ts', description: 'LLM tests — SecretString, CircuitBreaker, retry, rate limits, KeyPool, ModelRouter (~30 tests)' },
    { path: '.mcp.json', description: 'MCP client config for connecting to this agent' },
    { path: 'README.md', description: `${config.name} documentation — quick start, domains, principles, commands` },
    { path: 'scripts/setup.sh', description: 'Automated setup — Node.js check, build, Claude Code MCP registration' },
  ];

  const facades = [
    ...config.domains.map((d) => ({
      name: `${config.id}_${d.replace(/-/g, '_')}`,
      ops: ['get_patterns', 'search', 'get_entry', 'capture', 'remove'],
    })),
    {
      name: `${config.id}_core`,
      ops: [
        'search', 'vault_stats', 'list_all', 'health', 'identity', 'activate', 'inject_claude_md', 'setup', 'register',
        'memory_search', 'memory_capture', 'memory_list', 'session_capture', 'export',
        'create_plan', 'get_plan', 'approve_plan', 'update_task', 'complete_plan',
        'record_feedback', 'rebuild_vocabulary', 'brain_stats', 'llm_status',
      ],
    },
  ];

  return {
    agentDir,
    files,
    facades,
    domains: config.domains,
    persona: { name: config.name, role: config.role },
  };
}

/**
 * Scaffold a complete MCP agent project.
 */
export function scaffold(config: AgentConfig): ScaffoldResult {
  const agentDir = join(config.outputDir, config.id);
  const filesCreated: string[] = [];

  if (existsSync(agentDir)) {
    return {
      success: false,
      agentDir,
      filesCreated: [],
      domains: config.domains,
      summary: `Directory already exists: ${agentDir}. Choose a different ID or remove the existing directory.`,
    };
  }

  // Create directory structure
  const dirs = [
    '',
    'scripts',
    'src',
    'src/facades',
    'src/vault',
    'src/intelligence',
    'src/intelligence/data',
    'src/identity',
    'src/activation',
    'src/planning',
    'src/brain',
    'src/llm',
    'src/__tests__',
  ];

  for (const dir of dirs) {
    mkdirSync(join(agentDir, dir), { recursive: true });
  }

  // Write project config files
  const projectFiles: Array<[string, string]> = [
    ['package.json', generatePackageJson(config)],
    ['tsconfig.json', generateTsconfig()],
    ['vitest.config.ts', generateVitestConfig()],
    ['.gitignore', 'node_modules/\ndist/\ncoverage/\n*.tsbuildinfo\n.env\n.DS_Store\n*.log\n'],
    ['.mcp.json', JSON.stringify({ mcpServers: { [config.id]: { command: 'node', args: ['dist/index.js'], cwd: '.' } } }, null, 2)],
    ['scripts/copy-assets.js', generateCopyAssetsScript()],
    ['README.md', generateReadme(config)],
    ['scripts/setup.sh', generateSetupScript(config)],
  ];

  for (const [path, content] of projectFiles) {
    writeFileSync(join(agentDir, path), content, 'utf-8');
    filesCreated.push(path);
  }

  // Make setup script executable
  chmodSync(join(agentDir, 'scripts', 'setup.sh'), 0o755);

  // Write source files
  const sourceFiles: Array<[string, string]> = [
    ['src/facades/types.ts', generateFacadeTypes()],
    ['src/facades/facade-factory.ts', generateFacadeFactory()],
    ['src/facades/core.facade.ts', generateCoreFacade(config)],
    ['src/vault/vault.ts', generateVault()],
    ['src/intelligence/types.ts', generateIntelligenceTypes()],
    ['src/intelligence/loader.ts', generateIntelligenceLoader()],
    ['src/identity/persona.ts', generatePersona(config)],
    ['src/activation/claude-md-content.ts', generateClaudeMdTemplate(config)],
    ['src/activation/inject-claude-md.ts', generateInjectClaudeMd(config)],
    ['src/activation/activate.ts', generateActivate(config)],
    ['src/index.ts', generateEntryPoint(config)],
    ['src/planning/planner.ts', generatePlanner()],
    ['src/brain/brain.ts', generateBrain()],
    ['src/llm/types.ts', generateLLMTypes()],
    ['src/llm/utils.ts', generateLLMUtils()],
    ['src/llm/key-pool.ts', generateLLMKeyPool(config)],
    ['src/llm/llm-client.ts', generateLLMClient(config)],
    ['src/__tests__/vault.test.ts', generateVaultTest()],
    ['src/__tests__/loader.test.ts', generateLoaderTest()],
    ['src/__tests__/facades.test.ts', generateFacadesTest(config)],
    ['src/__tests__/planner.test.ts', generatePlannerTest()],
    ['src/__tests__/brain.test.ts', generateBrainTest()],
    ['src/__tests__/llm.test.ts', generateLLMTest(config)],
  ];

  // Domain facades and empty data files
  for (const domain of config.domains) {
    sourceFiles.push([
      `src/facades/${domain}.facade.ts`,
      generateDomainFacade(config.id, domain),
    ]);
    sourceFiles.push([
      `src/intelligence/data/${domain}.json`,
      generateEmptyBundle(domain),
    ]);
  }

  for (const [path, content] of sourceFiles) {
    writeFileSync(join(agentDir, path), content, 'utf-8');
    filesCreated.push(path);
  }

  const totalOps = config.domains.length * 5 + 24; // 5 per domain + 24 core (activation, registration, memory, session, export, planning, brain, llm)

  // Register the agent as an MCP server in ~/.claude.json
  const mcpReg = registerMcpServer(config.id, agentDir);

  const summaryLines = [
    `Created ${config.name} agent at ${agentDir}`,
    `${config.domains.length + 1} facades with ${totalOps} operations`,
    `${config.domains.length} empty knowledge domains ready for capture`,
    `Intelligence layer (Brain) — TF-IDF scoring, auto-tagging, duplicate detection`,
    `Activation system included — say "Hello, ${config.name}!" to activate`,
    `6 test suites — vault, loader, facades, planner, brain, llm`,
  ];

  if (mcpReg.registered) {
    summaryLines.push(`MCP server registered in ${mcpReg.path}`);
  } else {
    summaryLines.push(`Warning: Failed to register MCP server in ${mcpReg.path}: ${mcpReg.error}`);
  }

  summaryLines.push(
    '',
    'Next steps:',
    `  cd ${agentDir}`,
    '  npm install && npm run build',
    '  npm test              # verify all tests pass',
    '  Restart Claude Code',
    `  Say "Hello, ${config.name}!" to activate the persona`,
  );

  return {
    success: true,
    agentDir,
    filesCreated,
    domains: config.domains,
    summary: summaryLines.join('\n'),
  };
}

/**
 * List agents in a directory.
 */
export function listAgents(parentDir: string): AgentInfo[] {
  if (!existsSync(parentDir)) return [];

  const agents: AgentInfo[] = [];
  let entries: string[];
  try {
    entries = readdirSync(parentDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }

  for (const name of entries) {
    const dir = join(parentDir, name);
    const pkgPath = join(dir, 'package.json');
    if (!existsSync(pkgPath)) continue;

    try {
      const pkg = JSON.parse(
        readFileSync(pkgPath, 'utf-8'),
      );
      if (!pkg.name?.endsWith('-mcp')) continue;

      const dataDir = join(dir, 'src', 'intelligence', 'data');
      let domains: string[] = [];
      try {
        domains = readdirSync(dataDir)
          .filter((f) => f.endsWith('.json'))
          .map((f) => f.replace('.json', ''));
      } catch { /* empty */ }

      agents.push({
        id: name,
        name: pkg.name.replace('-mcp', ''),
        role: pkg.description || '',
        path: dir,
        domains,
        hasNodeModules: existsSync(join(dir, 'node_modules')),
        hasDistDir: existsSync(join(dir, 'dist')),
      });
    } catch { /* skip non-agent directories */ }
  }

  return agents;
}

/**
 * Register the agent as an MCP server in ~/.claude.json (User MCPs).
 * Idempotent — updates existing entry if present.
 */
function registerMcpServer(agentId: string, agentDir: string): { registered: boolean; path: string; error?: string } {
  const claudeJsonPath = join(homedir(), '.claude.json');

  try {
    let config: Record<string, unknown> = {};

    if (existsSync(claudeJsonPath)) {
      config = JSON.parse(readFileSync(claudeJsonPath, 'utf-8'));
    }

    if (!config.mcpServers || typeof config.mcpServers !== 'object') {
      config.mcpServers = {};
    }

    const servers = config.mcpServers as Record<string, unknown>;
    servers[agentId] = {
      type: 'stdio',
      command: 'node',
      args: [join(agentDir, 'dist', 'index.js')],
      env: {},
    };

    writeFileSync(claudeJsonPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    return { registered: true, path: claudeJsonPath };
  } catch (err) {
    return {
      registered: false,
      path: claudeJsonPath,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function generateEmptyBundle(domain: string): string {
  return JSON.stringify(
    {
      domain,
      version: '1.0.0',
      entries: [],
    },
    null,
    2,
  );
}

function generateCopyAssetsScript(): string {
  return [
    "import { cpSync, existsSync, mkdirSync } from 'node:fs';",
    "import { join, dirname } from 'node:path';",
    "import { fileURLToPath } from 'node:url';",
    "",
    "const __dirname = dirname(fileURLToPath(import.meta.url));",
    "const root = join(__dirname, '..');",
    "const dist = join(root, 'dist');",
    "const dataSource = join(root, 'src', 'intelligence', 'data');",
    "const dataDest = join(dist, 'intelligence', 'data');",
    "",
    "if (existsSync(dataSource)) {",
    "  mkdirSync(dataDest, { recursive: true });",
    "  cpSync(dataSource, dataDest, { recursive: true });",
    "  console.log('Copied intelligence data to dist/');",
    "}",
  ].join('\n');
}
