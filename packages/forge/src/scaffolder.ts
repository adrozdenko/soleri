import {
  mkdirSync,
  writeFileSync,
  chmodSync,
  existsSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
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
import { generateAgentsMd } from './templates/agents-md.js';
import { generateSkills } from './templates/skills.js';
import { generateExtensionsIndex, generateExampleOp } from './templates/extensions.js';

function getSetupTarget(config: AgentConfig): 'claude' | 'codex' | 'both' {
  return config.setupTarget ?? 'claude';
}

function includesClaudeSetup(config: AgentConfig): boolean {
  const target = getSetupTarget(config);
  return target === 'claude' || target === 'both';
}

function includesCodexSetup(config: AgentConfig): boolean {
  const target = getSetupTarget(config);
  return target === 'codex' || target === 'both';
}

/**
 * Preview what scaffold will create without writing anything.
 */
export function previewScaffold(config: AgentConfig): ScaffoldPreview {
  const agentDir = join(config.outputDir, config.id);
  const claudeSetup = includesClaudeSetup(config);
  const codexSetup = includesCodexSetup(config);
  const setupLabel =
    claudeSetup && codexSetup ? 'Claude Code + Codex' : claudeSetup ? 'Claude Code' : 'Codex';

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
        'Entry point — thin shell using createAgentRuntime() + createSemanticFacades() from @soleri/core',
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
    {
      path: 'src/extensions/',
      description: 'User extension directory — custom ops, facades, middleware, hooks',
    },
    { path: '.mcp.json', description: 'MCP client config for connecting to this agent' },
    {
      path: 'README.md',
      description: `${config.name} documentation — quick start, domains, principles, commands`,
    },
    {
      path: 'scripts/setup.sh',
      description: `Automated setup — Node.js check, build, ${setupLabel} MCP registration`,
    },
    {
      path: 'skills/',
      description: config.skills?.length
        ? `${config.skills.length} selected skills`
        : '17 built-in skills — TDD, debugging, planning, vault, brain, code patrol, retrospective, onboarding',
    },
  ];

  if (codexSetup) {
    files.push({
      path: 'AGENTS.md',
      description: 'Codex project instructions and activation workflow',
    });
  }

  if (claudeSetup && config.hookPacks?.length) {
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
    // 10 semantic facades from createSemanticFacades()
    {
      name: `${config.id}_vault`,
      ops: [
        'search',
        'vault_stats',
        'list_all',
        'export',
        'capture_enriched',
        '...vault-extra',
        '...capture',
        '...intake',
      ],
    },
    {
      name: `${config.id}_plan`,
      ops: [
        'create_plan',
        'get_plan',
        'approve_plan',
        'update_task',
        'complete_plan',
        '...planning-extra',
        '...grading',
      ],
    },
    {
      name: `${config.id}_brain`,
      ops: [
        'record_feedback',
        'brain_feedback',
        'brain_stats',
        'llm_status',
        'brain_strengths',
        '...19 brain ops',
      ],
    },
    {
      name: `${config.id}_memory`,
      ops: [
        'memory_search',
        'memory_capture',
        'memory_list',
        'session_capture',
        '...memory-extra',
        '...cross-project',
      ],
    },
    {
      name: `${config.id}_admin`,
      ops: [
        'llm_rotate',
        'llm_call',
        'render_prompt',
        'list_templates',
        '...admin',
        '...admin-extra',
      ],
    },
    {
      name: `${config.id}_curator`,
      ops: ['curator_status', 'curator_health_audit', '...8 curator ops', '...curator-extra'],
    },
    {
      name: `${config.id}_loop`,
      ops: ['loop_start', 'loop_iterate', 'loop_cancel', '...loop ops'],
    },
    {
      name: `${config.id}_orchestrate`,
      ops: ['register', '...orchestrate', '...project', '...playbook'],
    },
    {
      name: `${config.id}_control`,
      ops: ['get_identity', 'route_intent', 'governance_policy', '...control+governance ops'],
    },
    {
      name: `${config.id}_cognee`,
      ops: ['cognee_status', 'cognee_search', '...cognee ops', '...cognee-sync'],
    },
    // Agent-specific facade
    {
      name: `${config.id}_core`,
      ops: ['health', 'identity', 'activate', 'inject_claude_md', 'setup'],
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
  // Default greeting if not provided
  if (!config.greeting) {
    config = {
      ...config,
      greeting: `Hello! I'm ${config.name}, your AI assistant for ${config.role}.`,
    };
  }
  const claudeSetup = includesClaudeSetup(config);
  const codexSetup = includesCodexSetup(config);
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
    'skills',
    'src',
    'src/intelligence',
    'src/intelligence/data',
    'src/identity',
    'src/activation',
    'src/__tests__',
    'src/extensions',
    'src/extensions/ops',
    'src/extensions/facades',
    'src/extensions/middleware',
  ];

  if (claudeSetup && config.hookPacks?.length) {
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

  if (codexSetup) {
    projectFiles.push(['AGENTS.md', generateAgentsMd(config)]);
  }

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
    ['src/extensions/index.ts', generateExtensionsIndex(config)],
    ['src/extensions/ops/example.ts', generateExampleOp(config)],
  ];

  // Empty intelligence data bundles (domain facades come from @soleri/core at runtime)
  for (const domain of config.domains) {
    sourceFiles.push([`src/intelligence/data/${domain}.json`, generateEmptyBundle(domain)]);
  }

  for (const [path, content] of sourceFiles) {
    writeFileSync(join(agentDir, path), content, 'utf-8');
    filesCreated.push(path);
  }

  // Generate skill files
  const skillFiles = generateSkills(config);
  for (const [path, content] of skillFiles) {
    const skillDir = join(agentDir, dirname(path));
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(agentDir, path), content, 'utf-8');
    filesCreated.push(path);
  }

  const totalOps = config.domains.length * 5 + 214; // 5 per domain + 209 semantic + 5 agent-specific

  // Auto-build: install dependencies and compile before registering MCP
  let buildSuccess = false;
  let buildError: string | undefined;
  try {
    execFileSync('npm', ['install', '--no-fund', '--no-audit'], {
      cwd: agentDir,
      stdio: 'pipe',
      timeout: 120_000,
    });
    execFileSync('npm', ['run', 'build'], {
      cwd: agentDir,
      stdio: 'pipe',
      timeout: 60_000,
    });
    buildSuccess = true;
  } catch (err) {
    buildError = err instanceof Error ? err.message : String(err);
  }

  // Register the agent as an MCP server in selected host configs (only if build succeeded)
  const mcpRegistrations: Array<{ host: 'Claude Code' | 'Codex'; result: RegistrationResult }> = [];
  if (claudeSetup) {
    if (buildSuccess) {
      mcpRegistrations.push({
        host: 'Claude Code',
        result: registerClaudeMcpServer(config.id, agentDir),
      });
    } else {
      mcpRegistrations.push({
        host: 'Claude Code',
        result: {
          registered: false,
          path: join(homedir(), '.claude.json'),
          error: 'Skipped — build failed',
        },
      });
    }
  }
  if (codexSetup) {
    if (buildSuccess) {
      mcpRegistrations.push({
        host: 'Codex',
        result: registerCodexMcpServer(config.id, agentDir),
      });
    } else {
      mcpRegistrations.push({
        host: 'Codex',
        result: {
          registered: false,
          path: join(homedir(), '.codex', 'config.toml'),
          error: 'Skipped — build failed',
        },
      });
    }
  }

  const summaryLines = [
    `Created ${config.name} agent at ${agentDir}`,
    `${config.domains.length + 11} facades with ${totalOps} operations`,
    `${config.domains.length} empty knowledge domains ready for capture`,
    `Intelligence layer (Brain) — TF-IDF scoring, auto-tagging, duplicate detection`,
    `Activation system included — say "Hello, ${config.name}!" to activate`,
    `1 test suite — facades (vault, brain, planner, llm tests provided by @soleri/core)`,
    `${skillFiles.length} built-in skills (TDD, debugging, planning, vault, brain debrief)`,
  ];

  if (buildSuccess) {
    summaryLines.push('Built successfully (npm install + npm run build)');
  } else {
    summaryLines.push(`Warning: Auto-build failed: ${buildError}`);
    summaryLines.push(`  Run manually: cd ${agentDir} && npm install && npm run build`);
  }

  if (claudeSetup && config.hookPacks?.length) {
    summaryLines.push(`${config.hookPacks.length} hook pack(s) bundled in .claude/`);
  }

  for (const registration of mcpRegistrations) {
    if (registration.result.registered) {
      summaryLines.push(
        `${registration.host} MCP server registered in ${registration.result.path}`,
      );
    } else {
      summaryLines.push(
        `Warning: Failed to register ${registration.host} MCP server in ${registration.result.path}: ${registration.result.error}`,
      );
    }
  }

  const nextSteps = ['', 'Next steps:'];
  if (claudeSetup) {
    nextSteps.push('  Restart Claude Code');
  }
  if (codexSetup) {
    nextSteps.push('  Restart Codex');
  }
  nextSteps.push(`  Say "Hello, ${config.name}!" to activate the persona`);
  summaryLines.push(...nextSteps);

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
 * Registration result for host config updates.
 */
interface RegistrationResult {
  registered: boolean;
  path: string;
  error?: string;
}

/**
 * Register the agent as an MCP server in ~/.claude.json (User MCPs).
 * Idempotent — updates existing entry if present.
 */
function registerClaudeMcpServer(agentId: string, agentDir: string): RegistrationResult {
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

/**
 * Register the agent as an MCP server in ~/.codex/config.toml.
 * Idempotent — updates existing section if present.
 */
function registerCodexMcpServer(agentId: string, agentDir: string): RegistrationResult {
  const codexDir = join(homedir(), '.codex');
  const codexConfigPath = join(codexDir, 'config.toml');
  const sectionHeader = `[mcp_servers.${agentId}]`;
  const sectionBlock = `${sectionHeader}
command = "node"
args = ["${join(agentDir, 'dist', 'index.js')}"]
`;

  try {
    mkdirSync(codexDir, { recursive: true });

    let content = existsSync(codexConfigPath) ? readFileSync(codexConfigPath, 'utf-8') : '';
    const start = content.indexOf(sectionHeader);

    if (start === -1) {
      const trimmed = content.trimEnd();
      content = trimmed.length === 0 ? `${sectionBlock}\n` : `${trimmed}\n\n${sectionBlock}\n`;
    } else {
      const afterHeader = start + sectionHeader.length;
      const tail = content.slice(afterHeader);
      const nextSectionOffset = tail.search(/\n\[[^\]]+\]/);
      const end = nextSectionOffset === -1 ? content.length : afterHeader + nextSectionOffset;
      content = `${content.slice(0, start).trimEnd()}\n\n${sectionBlock}\n${content.slice(end).trimStart()}`;
    }

    writeFileSync(codexConfigPath, content.replace(/\n{3,}/g, '\n\n'), 'utf-8');
    return { registered: true, path: codexConfigPath };
  } catch (err) {
    return {
      registered: false,
      path: codexConfigPath,
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
