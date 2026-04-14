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
import type {
  AgentConfig,
  SetupTarget,
  ScaffoldResult,
  ScaffoldPreview,
  AgentInfo,
} from './types.js';

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
import { generateCleanWorktreesScript } from './templates/clean-worktrees.js';
import { generateAgentsMd } from './templates/agents-md.js';
import { generateSkills } from './templates/skills.js';
import { generateExtensionsIndex, generateExampleOp } from './templates/extensions.js';
import { generateTelegramBot } from './templates/telegram-bot.js';
import { generateTelegramConfig } from './templates/telegram-config.js';
import { generateTelegramAgent } from './templates/telegram-agent.js';
import { generateTelegramSupervisor } from './templates/telegram-supervisor.js';
import { detectInstalledDomainPacks } from './utils/detect-domain-packs.js';
import { syncSkillsToClaudeCode } from '@soleri/core';

function getSetupTarget(config: AgentConfig): SetupTarget {
  return config.setupTarget ?? 'claude';
}

function includesClaudeSetup(config: AgentConfig): boolean {
  const target = getSetupTarget(config);
  return target === 'claude' || target === 'both' || target === 'all';
}

function includesCodexSetup(config: AgentConfig): boolean {
  const target = getSetupTarget(config);
  return target === 'codex' || target === 'both' || target === 'all';
}

function includesOpencodeSetup(config: AgentConfig): boolean {
  const target = getSetupTarget(config);
  return target === 'opencode' || target === 'all';
}

/**
 * Preview what scaffold will create without writing anything.
 */
export function previewScaffold(config: AgentConfig): ScaffoldPreview {
  // Auto-detect domain packs if not explicitly configured
  if (!config.domainPacks || config.domainPacks.length === 0) {
    const detected = detectInstalledDomainPacks(config.outputDir);
    if (detected.length > 0) {
      config = { ...config, domainPacks: detected };
    }
  }

  const agentDir = join(config.outputDir, config.id);
  const claudeSetup = includesClaudeSetup(config);
  const codexSetup = includesCodexSetup(config);
  const opencodeSetup = includesOpencodeSetup(config);
  const setupParts = [
    ...(claudeSetup ? ['Claude Code'] : []),
    ...(codexSetup ? ['Codex'] : []),
    ...(opencodeSetup ? ['OpenCode'] : []),
  ];
  const setupLabel = setupParts.join(' + ');

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

  if (opencodeSetup) {
    files.push({
      path: '.opencode.json',
      description: 'OpenCode MCP server config for connecting to this agent',
    });
  }

  if (codexSetup || opencodeSetup) {
    const hosts = [...(codexSetup ? ['Codex'] : []), ...(opencodeSetup ? ['OpenCode'] : [])].join(
      ' + ',
    );
    files.push({
      path: 'AGENTS.md',
      description: `${hosts} project instructions and activation workflow`,
    });
  }

  if (claudeSetup && config.hookPacks?.length) {
    files.push({
      path: '.claude/',
      description: `Hook pack files (${config.hookPacks.join(', ')})`,
    });
  }

  if (opencodeSetup && config.hookPacks?.length) {
    files.push({
      path: '.opencode/plugins/',
      description: `OpenCode enforcement plugin (${config.hookPacks.join(', ')})`,
    });
  }

  if (config.telegram) {
    files.push(
      {
        path: 'src/telegram-bot.ts',
        description: 'Telegram bot entry point with Grammy middleware',
      },
      { path: 'src/telegram-config.ts', description: 'Telegram config loading (env + file)' },
      { path: 'src/telegram-agent.ts', description: 'Agent loop wired to MCP tools' },
      {
        path: 'src/telegram-supervisor.ts',
        description: 'Process supervisor with restart and logging',
      },
    );
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

  // Auto-detect domain packs if not explicitly configured
  if (!config.domainPacks || config.domainPacks.length === 0) {
    const detected = detectInstalledDomainPacks(config.outputDir);
    if (detected.length > 0) {
      config = { ...config, domainPacks: detected };
      console.error(
        `[forge] Auto-detected ${detected.length} domain pack(s): ${detected.map((d) => d.package).join(', ')}`,
      );
    }
  }

  const claudeSetup = includesClaudeSetup(config);
  const codexSetup = includesCodexSetup(config);
  const opencodeSetup = includesOpencodeSetup(config);
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

  if (opencodeSetup && config.hookPacks?.length) {
    dirs.push('.opencode/plugins');
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
    ['scripts/clean-worktrees.sh', generateCleanWorktreesScript()],
  ];

  if (opencodeSetup) {
    projectFiles.push([
      '.opencode.json',
      JSON.stringify(
        {
          $schema: 'https://opencode.ai/config.json',
          title: config.name,
          tui: { theme: 'soleri' },
          mcpServers: {
            [config.id]: {
              type: 'stdio',
              command: 'node',
              args: ['dist/index.js'],
            },
          },
          agents: {
            coder: { model: config.model ?? 'claude-code-sonnet-4' },
            summarizer: { model: 'claude-code-3.5-haiku' },
            task: { model: 'claude-code-3.5-haiku' },
            title: { model: 'claude-code-3.5-haiku' },
          },
          contextPaths: ['AGENTS.md'],
        },
        null,
        2,
      ),
    ]);
  }

  if (codexSetup || opencodeSetup) {
    projectFiles.push(['AGENTS.md', generateAgentsMd(config)]);
  }

  for (const [path, content] of projectFiles) {
    writeFileSync(join(agentDir, path), content, 'utf-8');
    filesCreated.push(path);
  }

  // Make scripts executable (skip on Windows — no POSIX permissions)
  if (process.platform !== 'win32') {
    chmodSync(join(agentDir, 'scripts', 'setup.sh'), 0o755);
    chmodSync(join(agentDir, 'scripts', 'clean-worktrees.sh'), 0o755);
  }

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

  // Telegram transport files (optional)
  if (config.telegram) {
    sourceFiles.push(
      ['src/telegram-bot.ts', generateTelegramBot(config)],
      ['src/telegram-config.ts', generateTelegramConfig(config)],
      ['src/telegram-agent.ts', generateTelegramAgent(config)],
      ['src/telegram-supervisor.ts', generateTelegramSupervisor(config)],
    );
  }

  // Empty intelligence data bundles (domain facades come from @soleri/core at runtime)
  for (const domain of config.domains) {
    sourceFiles.push([`src/intelligence/data/${domain}.json`, generateEmptyBundle(domain)]);
  }

  for (const [path, content] of sourceFiles) {
    writeFileSync(join(agentDir, path), content, 'utf-8');
    filesCreated.push(path);
  }

  // Generate skill files (including custom skills discovered in existing agent dir)
  const agentSkillsDirForDiscovery = join(agentDir, 'skills');
  const skillFiles = generateSkills({
    ...config,
    targetDir: existsSync(agentSkillsDirForDiscovery) ? agentSkillsDirForDiscovery : undefined,
  });
  for (const [path, content] of skillFiles) {
    const skillDir = join(agentDir, dirname(path));
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(agentDir, path), content, 'utf-8');
    filesCreated.push(path);
  }

  // Sync generated skills into .claude/skills/ for immediate Claude Code discovery
  try {
    const agentSkillsDir = join(agentDir, 'skills');
    syncSkillsToClaudeCode([agentSkillsDir], config.name, { projectRoot: agentDir });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[forge] Warning: Failed to sync skills to .claude/skills/: ${msg}`);
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

  // Install OpenCode CLI if needed and not already available
  const opencodeInstallResult = opencodeSetup ? ensureOpencodeInstalled() : undefined;

  // Create launcher script so typing the agent name starts OpenCode
  if (opencodeSetup && buildSuccess) {
    const launcherResult = createOpencodeLauncher(config.id, agentDir);
    if (launcherResult.created) {
      // Launcher details added to summary below
    }
  }

  // Register the agent as an MCP server in selected host configs (only if build succeeded)
  const mcpRegistrations: Array<{
    host: 'Claude Code' | 'Codex' | 'OpenCode';
    result: RegistrationResult;
  }> = [];
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
  if (opencodeSetup) {
    if (buildSuccess) {
      mcpRegistrations.push({
        host: 'OpenCode',
        result: registerOpencodeMcpServer(config.id, agentDir),
      });
    } else {
      mcpRegistrations.push({
        host: 'OpenCode',
        result: {
          registered: false,
          path: join(homedir(), '.opencode.json'),
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
    `Persistent identity — ${config.name} is active from the start`,
    `1 test suite — facades (vault, brain, planner, llm tests provided by @soleri/core)`,
    `${skillFiles.length} built-in skills (TDD, debugging, planning, vault, brain debrief)`,
  ];

  if (buildSuccess) {
    summaryLines.push('Built successfully (npm install + npm run build)');
  } else {
    summaryLines.push(`Warning: Auto-build failed: ${buildError}`);
    summaryLines.push(`  Run manually: cd ${agentDir} && npm install && npm run build`);
  }

  if (opencodeInstallResult) {
    if (opencodeInstallResult.installed) {
      summaryLines.push(`OpenCode CLI installed (${opencodeInstallResult.method})`);
    } else if (!opencodeInstallResult.alreadyPresent && opencodeInstallResult.error) {
      summaryLines.push('Warning: Failed to install OpenCode CLI');
      summaryLines.push('  Install manually: npm install -g opencode-ai');
    }
  }

  // Report launcher status
  if (opencodeSetup && buildSuccess) {
    const launcherPath = join('/usr', 'local', 'bin', config.id);
    if (existsSync(launcherPath)) {
      summaryLines.push(`Launcher created: type "${config.id}" in terminal to start OpenCode`);
    }
  }

  if (claudeSetup && config.hookPacks?.length) {
    summaryLines.push(`${config.hookPacks.length} hook pack(s) bundled in .claude/`);
  }

  if (opencodeSetup && config.hookPacks?.length) {
    summaryLines.push(
      `${config.hookPacks.length} hook pack(s) bundled as OpenCode plugin in .opencode/plugins/`,
    );
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
  if (opencodeSetup) {
    nextSteps.push('  Restart OpenCode');
  }
  nextSteps.push(`  ${config.name} identity is active from the start — no activation needed`);
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

    // File-tree (v7) agents have agent.yaml
    const agentYamlPath = join(dir, 'agent.yaml');
    if (existsSync(agentYamlPath)) {
      try {
        const yamlContent = readFileSync(agentYamlPath, 'utf-8');
        // Simple YAML parsing for id/name/role — avoid adding a dependency
        const idMatch = yamlContent.match(/^id:\s*(.+)$/m);
        const nameMatch = yamlContent.match(/^name:\s*(.+)$/m);
        const roleMatch = yamlContent.match(/^role:\s*(.+)$/m);

        const knowledgeDir = join(dir, 'knowledge');
        let domains: string[] = [];
        try {
          domains = readdirSync(knowledgeDir)
            .filter((f) => f.endsWith('.json'))
            .map((f) => f.replace('.json', ''));
        } catch {
          /* no knowledge dir */
        }

        agents.push({
          id: idMatch?.[1]?.trim() ?? name,
          name: nameMatch?.[1]?.trim() ?? name,
          role: roleMatch?.[1]?.trim() ?? '',
          path: dir,
          domains,
          hasNodeModules: false,
          hasDistDir: false,
        });
        continue;
      } catch {
        /* skip malformed agent.yaml */
      }
    }

    // Legacy (v6) agents have package.json
    const pkgPath = join(dir, 'package.json');
    if (!existsSync(pkgPath)) continue;

    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      // Accept both old format (name-mcp) and new format (name)
      const hasMcpSuffix = pkg.name?.endsWith('-mcp');
      const hasIntelligenceDir = existsSync(join(dir, 'src', 'intelligence', 'data'));
      if (!hasMcpSuffix && !hasIntelligenceDir) continue;

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
        name: hasMcpSuffix ? pkg.name.replace('-mcp', '') : pkg.name,
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

/**
 * Create a launcher script at /usr/local/bin/<agentId> that starts OpenCode
 * in the agent's project directory. Typing the agent name in terminal → OpenCode starts.
 */
function createOpencodeLauncher(
  agentId: string,
  agentDir: string,
): { created: boolean; path: string; error?: string } {
  // Launcher scripts and symlinks to /usr/local/bin are Unix-only
  if (process.platform === 'win32') {
    return { created: false, path: '', error: 'Launcher scripts are not supported on Windows' };
  }

  const launcherPath = join('/usr', 'local', 'bin', agentId);
  const script = [
    '#!/usr/bin/env bash',
    `# Soleri agent launcher — starts OpenCode with ${agentId} MCP agent`,
    `# Set terminal title to agent name`,
    `printf '\\033]0;${agentId}\\007'`,
    `cd "${agentDir}" || exit 1`,
    'exec opencode "$@"',
    '',
  ].join('\n');

  try {
    writeFileSync(launcherPath, script, { mode: 0o755 });
    return { created: true, path: launcherPath };
  } catch {
    // /usr/local/bin may need sudo — try via agent's scripts/ directory instead
    const localLauncher = join(agentDir, 'scripts', agentId);
    try {
      writeFileSync(localLauncher, script, { mode: 0o755 });
      // Try to symlink to /usr/local/bin
      try {
        const { symlinkSync, unlinkSync } = require('node:fs') as typeof import('node:fs');
        if (existsSync(launcherPath)) unlinkSync(launcherPath);
        symlinkSync(localLauncher, launcherPath);
        return { created: true, path: launcherPath };
      } catch {
        return { created: true, path: localLauncher };
      }
    } catch (err) {
      return {
        created: false,
        path: launcherPath,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

/**
 * Ensure OpenCode CLI is installed (Soleri fork with title branding support).
 * Tries `go install` from the fork first, falls back to upstream npm package.
 */
function ensureOpencodeInstalled(): {
  alreadyPresent: boolean;
  installed: boolean;
  method?: string;
  error?: string;
} {
  // Check if already available
  try {
    execFileSync('opencode', ['--version'], { stdio: 'pipe', timeout: 10_000 });
    return { alreadyPresent: true, installed: false };
  } catch {
    // Not installed — proceed to install
  }

  // Try Go install from Soleri fork (supports title branding)
  try {
    execFileSync('go', ['version'], { stdio: 'pipe', timeout: 5_000 });
    execFileSync('go', ['install', 'github.com/adrozdenko/opencode@latest'], {
      stdio: 'pipe',
      timeout: 120_000,
    });
    return {
      alreadyPresent: false,
      installed: true,
      method: 'go install github.com/adrozdenko/opencode@latest',
    };
  } catch {
    // Go not available or install failed — fall back to npm
  }

  // Fallback: upstream npm package (no title branding)
  try {
    execFileSync('npm', ['install', '-g', 'opencode-ai'], {
      stdio: 'pipe',
      timeout: 60_000,
    });
    return {
      alreadyPresent: false,
      installed: true,
      method: 'npm install -g opencode-ai (upstream — title branding requires Go)',
    };
  } catch (err) {
    return {
      alreadyPresent: false,
      installed: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Register the agent as an MCP server in ~/.opencode.json.
 * Idempotent — updates existing entry if present.
 */
function registerOpencodeMcpServer(agentId: string, agentDir: string): RegistrationResult {
  const opencodeConfigPath = join(homedir(), '.opencode.json');

  try {
    let config: Record<string, unknown> = {};

    if (existsSync(opencodeConfigPath)) {
      // Strip single-line comments before parsing (JSONC support)
      const raw = readFileSync(opencodeConfigPath, 'utf-8');
      const stripped = raw.replace(/^\s*\/\/.*$/gm, '');
      try {
        config = JSON.parse(stripped);
      } catch {
        config = {};
      }
    }

    if (!config.mcpServers || typeof config.mcpServers !== 'object') {
      config.mcpServers = {};
    }

    const servers = config.mcpServers as Record<string, unknown>;
    servers[agentId] = {
      type: 'stdio',
      command: 'node',
      args: [join(agentDir, 'dist', 'index.js')],
    };

    writeFileSync(opencodeConfigPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    return { registered: true, path: opencodeConfigPath };
  } catch (err) {
    return {
      registered: false,
      path: opencodeConfigPath,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function generateEmptyBundle(domain: string): string {
  return JSON.stringify(
    {
      domain,
      version: '1.0.0',
      entries: [
        {
          id: `${domain}-seed`,
          type: 'pattern',
          domain,
          title: `${domain.replace(/-/g, ' ')} domain seed`,
          severity: 'suggestion',
          description: `Seed entry for the ${domain.replace(/-/g, ' ')} domain. Replace or remove once real knowledge is captured.`,
          tags: [domain, 'seed'],
        },
      ],
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
