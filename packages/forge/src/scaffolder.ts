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
import { generateSkills } from './templates/skills.js';

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
    {
      path: 'skills/',
      description:
        '17 built-in skills — TDD, debugging, planning, vault, brain, code patrol, retrospective, onboarding',
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
        // From createCoreOps() — 150 generic ops
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
        'brain_feedback',
        'brain_feedback_stats',
        'rebuild_vocabulary',
        'brain_stats',
        'llm_status',
        'brain_session_context',
        'brain_strengths',
        'brain_global_patterns',
        'brain_recommend',
        'brain_build_intelligence',
        'brain_export',
        'brain_import',
        'brain_extract_knowledge',
        'brain_archive_sessions',
        'brain_promote_proposals',
        'brain_lifecycle',
        'brain_reset_extracted',
        // Cognee ops — 5
        'cognee_status',
        'cognee_search',
        'cognee_add',
        'cognee_cognify',
        'cognee_config',
        // LLM ops — 2
        'llm_rotate',
        'llm_call',
        // Prompt ops — 2
        'render_prompt',
        'list_templates',
        'curator_status',
        'curator_detect_duplicates',
        'curator_contradictions',
        'curator_resolve_contradiction',
        'curator_groom',
        'curator_groom_all',
        'curator_consolidate',
        'curator_health_audit',
        'get_identity',
        'update_identity',
        'add_guideline',
        'remove_guideline',
        'rollback_identity',
        'route_intent',
        'morph',
        'get_behavior_rules',
        // Governance ops — 5
        'governance_policy',
        'governance_proposals',
        'governance_stats',
        'governance_expire',
        'governance_dashboard',
        // Planning Extra ops — 22
        'plan_iterate',
        'plan_split',
        'plan_reconcile',
        'plan_complete_lifecycle',
        'plan_dispatch',
        'plan_review',
        'plan_archive',
        'plan_list_tasks',
        'plan_stats',
        // Planning evidence (#148)
        'plan_submit_evidence',
        'plan_verify_task',
        'plan_verify_plan',
        // Subagent dispatch (#149)
        'plan_review_spec',
        'plan_review_quality',
        'plan_review_outcome',
        // Brainstorm (#150)
        'plan_brainstorm',
        // Auto-reconcile (#151)
        'plan_auto_reconcile',
        // Validate plan (#152)
        'plan_validate',
        // Execution metrics + deliverables (#80, #83)
        'plan_execution_metrics',
        'plan_record_task_metrics',
        'plan_submit_deliverable',
        'plan_verify_deliverables',
        // Memory Extra ops — 8
        'memory_delete',
        'memory_stats',
        'memory_export',
        'memory_import',
        'memory_prune',
        'memory_deduplicate',
        'memory_topics',
        'memory_by_project',
        // Vault Extra ops — 12
        'vault_get',
        'vault_update',
        'vault_remove',
        'vault_bulk_add',
        'vault_bulk_remove',
        'vault_tags',
        'vault_domains',
        'vault_recent',
        'vault_import',
        'vault_seed',
        'vault_backup',
        'vault_age_report',
        // Vault extra — seed canonical + knowledge lifecycle (5)
        'vault_seed_canonical',
        'knowledge_audit',
        'knowledge_health',
        'knowledge_merge',
        'knowledge_reorganize',
        // Admin ops — 8
        'admin_health',
        'admin_tool_list',
        'admin_config',
        'admin_vault_size',
        'admin_uptime',
        'admin_version',
        'admin_reset_cache',
        'admin_diagnostic',
        // Loop ops — 9
        'loop_start',
        'loop_iterate',
        'loop_iterate_gate',
        'loop_status',
        'loop_cancel',
        'loop_history',
        'loop_is_active',
        'loop_complete',
        'loop_anomaly_check',
        // Orchestrate ops — 5
        'orchestrate_plan',
        'orchestrate_execute',
        'orchestrate_complete',
        'orchestrate_status',
        'orchestrate_quick_capture',
        // Grading ops — 5
        'plan_grade',
        'plan_check_history',
        'plan_latest_check',
        'plan_meets_grade',
        'plan_auto_improve',
        // Capture ops — 4
        'capture_knowledge',
        'capture_quick',
        'search_intelligent',
        'search_feedback',
        // Enriched capture (#154) — 1
        'capture_enriched',
        // Cognee graph (#156) — 3
        'cognee_get_node',
        'cognee_graph_stats',
        'cognee_export_status',
        // Admin Extra ops — 23
        'admin_telemetry',
        'admin_telemetry_recent',
        'admin_telemetry_reset',
        'admin_permissions',
        'admin_vault_analytics',
        'admin_search_insights',
        'admin_module_status',
        'admin_env',
        'admin_gc',
        'admin_export_config',
        // Admin key pool (#157)
        'admin_key_pool_status',
        'admin_create_token',
        'admin_revoke_token',
        'admin_list_tokens',
        // Admin accounts (#158)
        'admin_add_account',
        'admin_remove_account',
        'admin_rotate_account',
        'admin_list_accounts',
        'admin_account_status',
        // Admin plugins (#159)
        'admin_list_plugins',
        'admin_plugin_status',
        // Admin instruction validation (#160)
        'admin_validate_instructions',
        // Hot reload (#63)
        'admin_hot_reload',
        // Curator Extra ops — 4
        'curator_entry_history',
        'curator_record_snapshot',
        'curator_queue_stats',
        'curator_enrich',
        // Project ops — 12
        'project_get',
        'project_list',
        'project_unregister',
        'project_get_rules',
        'project_list_rules',
        'project_add_rule',
        'project_remove_rule',
        'project_link',
        'project_unlink',
        'project_get_links',
        'project_linked_projects',
        'project_touch',
        // Cross-project memory ops — 3
        'memory_promote_to_global',
        'memory_configure',
        'memory_cross_project_search',
        // Playbook ops — 5
        'playbook_list',
        'playbook_get',
        'playbook_create',
        'playbook_match',
        'playbook_seed',
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
    'skills',
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

  // Generate skill files
  const skillFiles = generateSkills(config);
  for (const [path, content] of skillFiles) {
    const skillDir = join(agentDir, dirname(path));
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(agentDir, path), content, 'utf-8');
    filesCreated.push(path);
  }

  const totalOps = config.domains.length * 5 + 61; // 5 per domain + 56 core (from createCoreOps) + 5 agent-specific

  // Register the agent as an MCP server in ~/.claude.json
  const mcpReg = registerMcpServer(config.id, agentDir);

  const summaryLines = [
    `Created ${config.name} agent at ${agentDir}`,
    `${config.domains.length + 1} facades with ${totalOps} operations`,
    `${config.domains.length} empty knowledge domains ready for capture`,
    `Intelligence layer (Brain) — TF-IDF scoring, auto-tagging, duplicate detection`,
    `Activation system included — say "Hello, ${config.name}!" to activate`,
    `1 test suite — facades (vault, brain, planner, llm tests provided by @soleri/core)`,
    `${skillFiles.length} built-in skills (TDD, debugging, planning, vault, brain debrief)`,
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
