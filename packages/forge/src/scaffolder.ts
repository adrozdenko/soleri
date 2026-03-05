import {
  mkdirSync,
  writeFileSync,
  chmodSync,
  existsSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { AgentConfig, ScaffoldResult, ScaffoldPreview, AgentInfo } from './types.js';

import { generatePackageJson } from './templates/package-json.js';
import { generateTsconfig } from './templates/tsconfig.js';
import { generateVitestConfig } from './templates/vitest-config.js';
import { generatePersona } from './templates/persona.js';
import { generateEntryPoint } from './templates/entry-point.js';
import { generateFacadesTest } from './templates/test-facades.js';
import { generateClaudeMdTemplate } from './templates/claude-md-template.js';
import { generateInjectClaudeMd } from './templates/inject-claude-md.js';
import { generateActivate } from './templates/activate.js';
import { generateReadme } from './templates/readme.js';
import { generateSetupScript } from './templates/setup-script.js';

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
    {
      path: 'scripts/copy-assets.js',
      description: 'Build script to copy intelligence data to dist',
    },
    {
      path: 'src/index.ts',
      description:
        'Entry point — thin shell using createAgentRuntime() + createCoreOps() from @soleri/core',
    },
    ...config.domains.map((d) => ({
      path: `src/intelligence/data/${d}.json`,
      description: `Empty ${d} intelligence bundle — ready for knowledge capture`,
    })),
    {
      path: 'src/identity/persona.ts',
      description: `${config.name} persona — name, role, principles, greeting`,
    },
    {
      path: 'src/activation/claude-md-content.ts',
      description: `${config.name} CLAUDE.md content with activation triggers and facades table`,
    },
    {
      path: 'src/activation/inject-claude-md.ts',
      description: 'Idempotent CLAUDE.md injection — project-level or global (~/.claude/CLAUDE.md)',
    },
    {
      path: 'src/activation/activate.ts',
      description: `${config.name} activation system — persona adoption, setup status, tool recommendations`,
    },
    {
      path: 'src/__tests__/facades.test.ts',
      description: `Facade integration tests — all ${config.domains.length + 1} facades`,
    },
    { path: '.mcp.json', description: 'MCP client config for connecting to this agent' },
    {
      path: 'README.md',
      description: `${config.name} documentation — quick start, domains, principles, commands`,
    },
    {
      path: 'scripts/setup.sh',
      description: 'Automated setup — Node.js check, build, Claude Code MCP registration',
    },
  ];

  if (config.hookPacks?.length) {
    files.push({
      path: '.claude/',
      description: `Hook pack files (${config.hookPacks.join(', ')})`,
    });
  }

  const facades = [
    ...config.domains.map((d) => ({
      name: `${config.id}_${d.replace(/-/g, '_')}`,
      ops: ['get_patterns', 'search', 'get_entry', 'capture', 'remove'],
    })),
    {
      name: `${config.id}_core`,
      ops: [
        // From createCoreOps() — 26 generic ops
        'search',
        'vault_stats',
        'list_all',
        'register',
        'memory_search',
        'memory_capture',
        'memory_list',
        'session_capture',
        'export',
        'create_plan',
        'get_plan',
        'approve_plan',
        'update_task',
        'complete_plan',
        'record_feedback',
        'rebuild_vocabulary',
        'brain_stats',
        'llm_status',
        'curator_status',
        'curator_detect_duplicates',
        'curator_contradictions',
        'curator_resolve_contradiction',
        'curator_groom',
        'curator_groom_all',
        'curator_consolidate',
        'curator_health_audit',
        // Agent-specific ops — 5
        'health',
        'identity',
        'activate',
        'inject_claude_md',
        'setup',
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
    'src/intelligence',
    'src/intelligence/data',
    'src/identity',
    'src/activation',
    'src/__tests__',
  ];

  if (config.hookPacks?.length) {
    dirs.push('.claude');
  }

  for (const dir of dirs) {
    mkdirSync(join(agentDir, dir), { recursive: true });
  }

  // Write project config files
  const projectFiles: Array<[string, string]> = [
    ['package.json', generatePackageJson(config)],
    ['tsconfig.json', generateTsconfig()],
    ['vitest.config.ts', generateVitestConfig()],
    ['.gitignore', 'node_modules/\ndist/\ncoverage/\n*.tsbuildinfo\n.env\n.DS_Store\n*.log\n'],
    [
      '.mcp.json',
      JSON.stringify(
        { mcpServers: { [config.id]: { command: 'node', args: ['dist/index.js'], cwd: '.' } } },
        null,
        2,
      ),
    ],
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
    ['src/identity/persona.ts', generatePersona(config)],
    ['src/activation/claude-md-content.ts', generateClaudeMdTemplate(config)],
    ['src/activation/inject-claude-md.ts', generateInjectClaudeMd(config)],
    ['src/activation/activate.ts', generateActivate(config)],
    ['src/index.ts', generateEntryPoint(config)],
    ['src/__tests__/facades.test.ts', generateFacadesTest(config)],
  ];

  // Empty intelligence data bundles (domain facades come from @soleri/core at runtime)
  for (const domain of config.domains) {
    sourceFiles.push([`src/intelligence/data/${domain}.json`, generateEmptyBundle(domain)]);
  }

  for (const [path, content] of sourceFiles) {
    writeFileSync(join(agentDir, path), content, 'utf-8');
    filesCreated.push(path);
  }

  const totalOps = config.domains.length * 5 + 31; // 5 per domain + 26 core (from createCoreOps) + 5 agent-specific

  // Register the agent as an MCP server in ~/.claude.json
  const mcpReg = registerMcpServer(config.id, agentDir);

  const summaryLines = [
    `Created ${config.name} agent at ${agentDir}`,
    `${config.domains.length + 1} facades with ${totalOps} operations`,
    `${config.domains.length} empty knowledge domains ready for capture`,
    `Intelligence layer (Brain) — TF-IDF scoring, auto-tagging, duplicate detection`,
    `Activation system included — say "Hello, ${config.name}!" to activate`,
    `1 test suite — facades (vault, brain, planner, llm tests provided by @soleri/core)`,
  ];

  if (config.hookPacks?.length) {
    summaryLines.push(`${config.hookPacks.length} hook pack(s) bundled in .claude/`);
  }

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
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (!pkg.name?.endsWith('-mcp')) continue;

      const dataDir = join(dir, 'src', 'intelligence', 'data');
      let domains: string[] = [];
      try {
        domains = readdirSync(dataDir)
          .filter((f) => f.endsWith('.json'))
          .map((f) => f.replace('.json', ''));
      } catch {
        /* empty */
      }

      agents.push({
        id: name,
        name: pkg.name.replace('-mcp', ''),
        role: pkg.description || '',
        path: dir,
        domains,
        hasNodeModules: existsSync(join(dir, 'node_modules')),
        hasDistDir: existsSync(join(dir, 'dist')),
      });
    } catch {
      /* skip non-agent directories */
    }
  }

  return agents;
}

/**
 * Register the agent as an MCP server in ~/.claude.json (User MCPs).
 * Idempotent — updates existing entry if present.
 */
function registerMcpServer(
  agentId: string,
  agentDir: string,
): { registered: boolean; path: string; error?: string } {
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
    '',
    'const __dirname = dirname(fileURLToPath(import.meta.url));',
    "const root = join(__dirname, '..');",
    "const dist = join(root, 'dist');",
    "const dataSource = join(root, 'src', 'intelligence', 'data');",
    "const dataDest = join(dist, 'intelligence', 'data');",
    '',
    'if (existsSync(dataSource)) {',
    '  mkdirSync(dataDest, { recursive: true });',
    '  cpSync(dataSource, dataDest, { recursive: true });',
    "  console.log('Copied intelligence data to dist/');",
    '}',
  ].join('\n');
}
