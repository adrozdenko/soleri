/**
 * Soleri v7 — File-Tree Agent Scaffolder
 *
 * Generates a folder tree with plain files (YAML, Markdown, JSON).
 * No TypeScript, no package.json, no build step.
 *
 * Replaces the old scaffold() that generated TypeScript projects.
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { stringify as yamlStringify } from 'yaml';
import type { AgentYaml, AgentYamlInput } from './agent-schema.js';
import { AgentYamlSchema } from './agent-schema.js';
import { getEngineRulesContent } from './templates/shared-rules.js';
import { composeClaudeMd } from './compose-claude-md.js';

// ─── Types ────────────────────────────────────────────────────────────

export interface FileTreeScaffoldResult {
  success: boolean;
  agentDir: string;
  filesCreated: string[];
  summary: string;
}

// ─── Built-in Workflows ───────────────────────────────────────────────

interface WorkflowTemplate {
  name: string;
  prompt: string;
  gates: string;
  tools: string;
}

const BUILTIN_WORKFLOWS: WorkflowTemplate[] = [
  {
    name: 'feature-dev',
    prompt: `# Feature Development

## When to Use
When building a new feature, adding functionality, or creating components.

## Steps

### 1. Understand
- Search vault for existing patterns: \`op:search_intelligent\`
- Read relevant source code
- Clarify requirements with user if ambiguous

### 2. Plan
- Create structured plan: \`op:orchestrate_plan\`
- Present plan to user, wait for approval
- Do NOT write code before approval

### 3. Test First
- Write failing tests that define expected behavior
- Run tests to confirm they fail (RED)

### 4. Implement
- Write minimum code to pass tests (GREEN)
- Follow vault patterns, avoid known anti-patterns
- Use semantic tokens, not hardcoded values

### 5. Refactor
- Clean up without changing behavior
- Extract reusable patterns
- Ensure all tests still pass

### 6. Capture & Ship
- Capture learned patterns: \`op:capture_knowledge\`
- Link new entries to related knowledge: \`op:link_entries\`
- Complete orchestration: \`op:orchestrate_complete\`
`,
    gates: `gates:
  - phase: brainstorming
    requirement: Requirements are clear and user has approved the approach
    check: user-approval

  - phase: pre-execution
    requirement: Plan created via orchestrator and approved by user
    check: plan-approved

  - phase: post-task
    requirement: All tests pass and code compiles
    check: tests-pass

  - phase: completion
    requirement: Knowledge captured to vault with links
    check: knowledge-captured
`,
    tools: `tools:
  - soleri_vault op:search_intelligent
  - soleri_vault op:capture_knowledge
  - soleri_vault op:link_entries
  - soleri_planner op:create_plan
  - soleri_planner op:approve_plan
  - soleri_brain op:recommend
`,
  },
  {
    name: 'bug-fix',
    prompt: `# Bug Fix

## When to Use
When fixing bugs, resolving errors, or addressing regressions.

## Steps

### 1. Reproduce
- Understand the reported issue
- Search vault for similar past bugs: \`op:search_intelligent\`
- Identify the root cause, not just the symptom

### 2. Plan Fix
- Create a plan: \`op:orchestrate_plan\`
- Identify affected files and potential side effects
- Wait for user approval

### 3. Write Regression Test
- Write a test that reproduces the bug (RED)
- Confirm it fails for the right reason

### 4. Fix
- Apply the minimal fix
- Run the regression test — must pass (GREEN)
- Run full test suite — no new failures

### 5. Capture
- If the bug reveals a pattern or anti-pattern, capture it: \`op:capture_knowledge\`
- Complete orchestration: \`op:orchestrate_complete\`
`,
    gates: `gates:
  - phase: pre-execution
    requirement: Root cause identified and fix plan approved
    check: plan-approved

  - phase: post-task
    requirement: Regression test passes and no new failures
    check: tests-pass

  - phase: completion
    requirement: Anti-pattern captured if applicable
    check: knowledge-captured
`,
    tools: `tools:
  - soleri_vault op:search_intelligent
  - soleri_vault op:capture_knowledge
  - soleri_planner op:create_plan
  - soleri_brain op:recommend
`,
  },
  {
    name: 'code-review',
    prompt: `# Code Review

## When to Use
When reviewing code, auditing quality, or checking for issues.

## Steps

### 1. Context
- Search vault for relevant patterns and anti-patterns: \`op:search_intelligent\`
- Understand the intent of the changes

### 2. Review
- Check for correctness, readability, and maintainability
- Verify test coverage
- Check for security issues
- Validate accessibility if applicable

### 3. Feedback
- Provide actionable, specific feedback
- Reference vault patterns where applicable
- Distinguish blocking issues from suggestions

### 4. Capture
- If review reveals new patterns or anti-patterns, capture them: \`op:capture_knowledge\`
`,
    gates: `gates:
  - phase: completion
    requirement: All blocking issues addressed
    check: issues-resolved
`,
    tools: `tools:
  - soleri_vault op:search_intelligent
  - soleri_vault op:capture_knowledge
  - soleri_brain op:recommend
`,
  },
];

// ─── Main Scaffolder ──────────────────────────────────────────────────

/**
 * Scaffold a file-tree agent.
 *
 * Creates a folder with agent.yaml, .mcp.json, instructions/, workflows/,
 * and auto-generates CLAUDE.md. No TypeScript, no build step.
 */
export function scaffoldFileTree(input: AgentYamlInput, outputDir: string): FileTreeScaffoldResult {
  // Validate config
  const parseResult = AgentYamlSchema.safeParse(input);
  if (!parseResult.success) {
    return {
      success: false,
      agentDir: join(outputDir, input.id ?? 'unknown'),
      filesCreated: [],
      summary: `Invalid config: ${parseResult.error.message}`,
    };
  }

  const config = parseResult.data;
  const agentDir = join(outputDir, config.id);
  const filesCreated: string[] = [];

  // Check for existing directory
  if (existsSync(agentDir)) {
    return {
      success: false,
      agentDir,
      filesCreated: [],
      summary: `Directory already exists: ${agentDir}. Choose a different ID or remove it.`,
    };
  }

  // ─── 1. Create directory structure ──────────────────────────
  const dirs = ['', 'instructions', 'workflows', 'knowledge', 'skills', 'hooks', 'data'];

  // Add workflow subdirectories
  for (const wf of BUILTIN_WORKFLOWS) {
    dirs.push(`workflows/${wf.name}`);
  }

  for (const dir of dirs) {
    mkdirSync(join(agentDir, dir), { recursive: true });
  }

  // ─── 2. Write agent.yaml ────────────────────────────────────
  const agentYamlContent = yamlStringify(buildAgentYaml(config), {
    lineWidth: 100,
    singleQuote: true,
  });
  writeFile(agentDir, 'agent.yaml', agentYamlContent, filesCreated);

  // ─── 3. Write .mcp.json ─────────────────────────────────────
  const mcpJson = {
    mcpServers: {
      'soleri-engine': {
        command: 'npx',
        args: ['@soleri/engine', '--agent', './agent.yaml'],
      },
    },
  };
  writeFile(agentDir, '.mcp.json', JSON.stringify(mcpJson, null, 2) + '\n', filesCreated);

  // ─── 3b. Write .opencode.json (OpenCode uses "mcp" not "mcpServers", type "local" not "stdio", command as array) ──
  const opencodeJson = {
    $schema: 'https://opencode.ai/config.json',
    instructions: ['CLAUDE.md'],
    mcp: {
      'soleri-engine': {
        type: 'local',
        command: ['npx', '-y', '@soleri/engine', '--agent', './agent.yaml'],
      },
    },
  };
  writeFile(agentDir, 'opencode.json', JSON.stringify(opencodeJson, null, 2) + '\n', filesCreated);

  // ─── 4. Write .gitignore ────────────────────────────────────
  writeFile(
    agentDir,
    '.gitignore',
    [
      '# Auto-generated — do not commit',
      'CLAUDE.md',
      'AGENTS.md',
      'instructions/_engine.md',
      '',
    ].join('\n'),
    filesCreated,
  );

  // ─── 5. Write engine rules ──────────────────────────────────
  writeFile(agentDir, 'instructions/_engine.md', getEngineRulesContent(), filesCreated);

  // ─── 6. Write user instruction files ────────────────────────
  // Generate domain-specific instruction file if agent has specialized domains
  if (config.domains.length > 0) {
    const domainLines = [
      '# Domain Knowledge',
      '',
      `This agent specializes in: ${config.domains.join(', ')}.`,
      '',
      '## Principles',
      '',
      ...config.principles.map((p) => `- ${p}`),
      '',
    ];
    writeFile(agentDir, 'instructions/domain.md', domainLines.join('\n'), filesCreated);
  }

  // ─── 7. Write workflows ─────────────────────────────────────
  for (const wf of BUILTIN_WORKFLOWS) {
    writeFile(agentDir, `workflows/${wf.name}/prompt.md`, wf.prompt, filesCreated);
    writeFile(agentDir, `workflows/${wf.name}/gates.yaml`, wf.gates, filesCreated);
    writeFile(agentDir, `workflows/${wf.name}/tools.yaml`, wf.tools, filesCreated);
  }

  // ─── 8. Write empty knowledge bundle ────────────────────────
  for (const domain of config.domains) {
    const bundle = {
      domain,
      version: '1.0.0',
      entries: [],
    };
    writeFile(
      agentDir,
      `knowledge/${domain}.json`,
      JSON.stringify(bundle, null, 2) + '\n',
      filesCreated,
    );
  }

  // ─── 9. Generate CLAUDE.md ──────────────────────────────────
  const { content: claudeMd } = composeClaudeMd(agentDir);
  writeFile(agentDir, 'CLAUDE.md', claudeMd, filesCreated);

  // ─── 10. Summary ────────────────────────────────────────────
  const summary = [
    `Agent "${config.name}" scaffolded at ${agentDir}`,
    '',
    `  Files: ${filesCreated.length}`,
    `  Domains: ${config.domains.join(', ')}`,
    `  Workflows: ${BUILTIN_WORKFLOWS.map((w) => w.name).join(', ')}`,
    '',
    'Next steps:',
    `  1. cd ${config.id}`,
    '  2. Review agent.yaml and customize instructions/',
    '  3. Run: soleri install   (registers MCP server)',
    '  4. Run: soleri dev       (watches files, auto-regenerates CLAUDE.md)',
    '',
    'No build step needed — this agent is ready to use.',
  ].join('\n');

  return {
    success: true,
    agentDir,
    filesCreated,
    summary,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────

function writeFile(
  agentDir: string,
  relativePath: string,
  content: string,
  filesCreated: string[],
): void {
  const fullPath = join(agentDir, relativePath);
  const dir = join(
    agentDir,
    relativePath.includes('/') ? relativePath.split('/').slice(0, -1).join('/') : '',
  );
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(fullPath, content, 'utf-8');
  filesCreated.push(relativePath);
}

/**
 * Build a clean agent.yaml object for serialization.
 * Strips defaults and empty optionals for cleaner output.
 */
function buildAgentYaml(config: AgentYaml): Record<string, unknown> {
  const yaml: Record<string, unknown> = {
    id: config.id,
    name: config.name,
    role: config.role,
    description: config.description,
    domains: config.domains,
    principles: config.principles,
  };

  if (config.tone && config.tone !== 'pragmatic') {
    yaml.tone = config.tone;
  }

  if (config.greeting) {
    yaml.greeting = config.greeting;
  }

  // Engine config — only include non-defaults
  const engine: Record<string, unknown> = {};
  if (config.engine?.vault) engine.vault = config.engine.vault;
  if (config.engine?.learning === false) engine.learning = false;
  if (config.engine?.cognee === true) engine.cognee = true;
  if (Object.keys(engine).length > 0) yaml.engine = engine;

  // Vaults
  if (config.vaults && config.vaults.length > 0) {
    yaml.vaults = config.vaults;
  }

  // Setup — only include non-defaults
  const setup: Record<string, unknown> = {};
  if (config.setup?.target && config.setup.target !== 'claude') setup.target = config.setup.target;
  if (config.setup?.model && config.setup.model !== 'claude-code-sonnet-4')
    setup.model = config.setup.model;
  if (Object.keys(setup).length > 0) yaml.setup = setup;

  // Packs
  if (config.packs && config.packs.length > 0) {
    yaml.packs = config.packs;
  }

  return yaml;
}
