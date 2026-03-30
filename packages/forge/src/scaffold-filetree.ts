/**
 * Soleri v7 — File-Tree Agent Scaffolder
 *
 * Generates a folder tree with plain files (YAML, Markdown, JSON).
 * No TypeScript, no package.json, no build step.
 *
 * Replaces the old scaffold() that generated TypeScript projects.
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify as yamlStringify } from 'yaml';
import type { AgentYaml, AgentYamlInput } from './agent-schema.js';
import { AgentYamlSchema } from './agent-schema.js';
import { getModularEngineRules } from './templates/shared-rules.js';
import type { EngineFeature } from './templates/shared-rules.js';
import { composeClaudeMd } from './compose-claude-md.js';
import { generateSkills } from './templates/skills.js';
import type { AgentConfig } from './types.js';

// ─── Skills Registry ─────────────────────────────────────────────────

/**
 * Skills classified as essential (always scaffolded by default) or optional
 * (installed on demand via `soleri skills install`).
 */
export const SKILLS_REGISTRY: Record<string, 'essential' | 'optional'> = {
  'agent-guide': 'essential',
  'agent-persona': 'essential',
  'vault-navigator': 'essential',
  'vault-capture': 'essential',
  'systematic-debugging': 'essential',
  'writing-plans': 'essential',
  'context-resume': 'essential',
  // ─── Optional (installed on demand) ────────────
  'agent-dev': 'optional',
  'agent-issues': 'optional',
  'brain-debrief': 'optional',
  brainstorming: 'optional',
  'code-patrol': 'optional',
  'deep-review': 'optional',
  'deliver-and-ship': 'optional',
  'discovery-phase': 'optional',
  'env-setup': 'optional',
  'executing-plans': 'optional',
  'finishing-a-development-branch': 'optional',
  'fix-and-learn': 'optional',
  'health-check': 'optional',
  'knowledge-harvest': 'optional',
  'mcp-doctor': 'optional',
  'onboard-me': 'optional',
  'parallel-execute': 'optional',
  retrospective: 'optional',
  'second-opinion': 'optional',
  'subagent-driven-development': 'optional',
  'test-driven-development': 'optional',
  'using-git-worktrees': 'optional',
  'vault-curate': 'optional',
  'vault-smells': 'optional',
  'verification-before-completion': 'optional',
  'yolo-mode': 'optional',
};

/** Names of essential skills (always scaffolded when skillsFilter is 'essential'). */
export const ESSENTIAL_SKILLS = Object.entries(SKILLS_REGISTRY)
  .filter(([, tier]) => tier === 'essential')
  .map(([name]) => name);

/**
 * Resolve the skill names to scaffold based on the skillsFilter config value.
 * Returns null when all skills should be included (no filtering).
 */
export function resolveSkillsFilter(skillsFilter: 'all' | 'essential' | string[]): string[] | null {
  if (skillsFilter === 'all') return null; // null = include all
  if (skillsFilter === 'essential') return ESSENTIAL_SKILLS;
  return skillsFilter; // explicit list
}

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
    gates: `# Workflow gates — engine reads these and enforces them during plan execution.
# Format: phase (brainstorming|pre-execution|post-task|completion), requirement, check
gates:
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
    tools: `# Workflow tools — engine merges these into plan steps.
# Format: list of operation strings (agentId_facade op:operation_name)
tools:
  - soleri_vault op:search_intelligent
  - soleri_vault op:capture_knowledge
  - soleri_links op:link_entries
  - soleri_plan op:create_plan
  - soleri_plan op:approve_plan
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
    gates: `# Workflow gates — engine reads these and enforces them during plan execution.
# Format: phase (brainstorming|pre-execution|post-task|completion), requirement, check
gates:
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
    tools: `# Workflow tools — engine merges these into plan steps.
# Format: list of operation strings (agentId_facade op:operation_name)
tools:
  - soleri_vault op:search_intelligent
  - soleri_vault op:capture_knowledge
  - soleri_plan op:create_plan
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
    gates: `# Workflow gates — engine reads these and enforces them during plan execution.
# Format: phase (brainstorming|pre-execution|post-task|completion), requirement, check
gates:
  - phase: completion
    requirement: All blocking issues addressed
    check: issues-resolved
`,
    tools: `# Workflow tools — engine merges these into plan steps.
# Format: list of operation strings (agentId_facade op:operation_name)
tools:
  - soleri_vault op:search_intelligent
  - soleri_vault op:capture_knowledge
  - soleri_brain op:recommend
`,
  },
  {
    name: 'context-handoff',
    prompt: `# Context Handoff

## When to Use
Before crossing a context window boundary — \`/clear\`, context compaction, or switching tasks mid-plan.

## Steps

### 1. Generate Handoff
- Call \`op:handoff_generate\` to produce a structured markdown document
- The document captures: active plan state, recent decisions, pending tasks, session context

### 2. Capture Session (if not auto-captured)
- Call \`op:session_capture\` to persist session summary to memory
- The handoff document is ephemeral — session capture provides durable persistence

### 3. Transition
- Share the handoff markdown with the new context window
- The new session can reference plan IDs, task status, and decisions from the handoff

### 4. Resume
- On restart, read the handoff document
- Use plan IDs to look up active plans: \`op:orchestrate_status\`
- Continue from where the handoff left off
`,
    gates: `# Workflow gates — engine reads these and enforces them during plan execution.
# Format: phase (brainstorming|pre-execution|post-task|completion), requirement, check
gates:
  - phase: pre-transition
    requirement: Handoff document generated with current state
    check: handoff-generated

  - phase: post-transition
    requirement: New context has loaded handoff and can reference active plans
    check: context-restored
`,
    tools: `# Workflow tools — engine merges these into plan steps.
# Format: list of operation strings (agentId_facade op:operation_name)
tools:
  - soleri_memory op:handoff_generate
  - soleri_memory op:session_capture
  - soleri_orchestrate op:orchestrate_status
  - soleri_plan op:create_plan
`,
  },
];

// ─── Example Instruction Files ───────────────────────────────────────

const INSTRUCTIONS_CONVENTIONS = `# Conventions

<!-- Customize this file with your project's naming conventions, coding standards, and rules. -->
<!-- This file is composed into CLAUDE.md automatically — your agent will follow these rules. -->

## Naming Conventions

- Use \`kebab-case\` for file and directory names
- Use \`camelCase\` for variables and functions
- Use \`PascalCase\` for classes, types, and interfaces
- Prefix private helpers with \`_\` (e.g., \`_validateInput\`)

## File Organization

- Source code goes in \`src/\`
- Tests live next to the code they test (\`*.test.ts\`)
- Shared utilities go in \`src/utils/\`
- Types and interfaces go in \`src/types/\`

## Code Standards

- Every function must have a JSDoc comment explaining its purpose
- Prefer \`const\` over \`let\`; never use \`var\`
- Maximum file length: 300 lines — split if larger
- No default exports — use named exports only

## What to Avoid

- Do not add new npm dependencies without approval
- Do not use \`any\` type — use \`unknown\` and narrow
- Do not commit commented-out code
- Do not use hardcoded values — extract to constants or config
`;

const INSTRUCTIONS_GETTING_STARTED = `# Getting Started with Instructions

This folder contains your agent's custom behavioral rules. Every \`.md\` file here
is automatically composed into \`CLAUDE.md\` when you run \`soleri dev\`.

## How It Works

1. Create a new \`.md\` file in this folder (e.g., \`api-guidelines.md\`)
2. Write your rules, conventions, or guidelines in Markdown
3. Run \`soleri dev\` — it watches for changes and regenerates \`CLAUDE.md\`
4. Your agent now follows these rules in every conversation

## File Naming

- Files are included in **alphabetical order** (prefix with numbers to control order)
- \`_engine.md\` is auto-generated by Soleri — **do not edit it manually**
- \`domain.md\` was generated from your agent's domain config

## Tips

- Keep each file focused on one topic (conventions, workflows, constraints)
- Use clear headings — your agent reads these as instructions
- Add "What to Avoid" sections — agents benefit from explicit anti-patterns
- See the [Soleri docs](https://soleri.ai/docs) for more examples
`;

// ─── Workspace & Routing Seeds ───────────────────────────────────────

/** Default workspaces seeded based on agent domains. */
const DOMAIN_WORKSPACE_SEEDS: Record<string, { id: string; name: string; description: string }[]> =
  {
    // Design-related domains
    design: [
      {
        id: 'design',
        name: 'Design',
        description: 'Design system patterns, tokens, and components',
      },
      { id: 'review', name: 'Review', description: 'Design review and accessibility audits' },
    ],
    'ui-design': [
      { id: 'design', name: 'Design', description: 'UI design patterns, tokens, and components' },
      { id: 'review', name: 'Review', description: 'Design review and accessibility audits' },
    ],
    accessibility: [
      { id: 'design', name: 'Design', description: 'Accessible design patterns and tokens' },
      { id: 'review', name: 'Review', description: 'Accessibility audits and compliance checks' },
    ],
    // Dev-related domains
    architecture: [
      {
        id: 'planning',
        name: 'Planning',
        description: 'Architecture decisions and technical planning',
      },
      { id: 'src', name: 'Source', description: 'Implementation code and modules' },
      { id: 'docs', name: 'Documentation', description: 'Technical documentation and ADRs' },
    ],
    backend: [
      { id: 'planning', name: 'Planning', description: 'Backend architecture and API design' },
      { id: 'src', name: 'Source', description: 'Implementation code and modules' },
      { id: 'docs', name: 'Documentation', description: 'API documentation and guides' },
    ],
    frontend: [
      {
        id: 'planning',
        name: 'Planning',
        description: 'Frontend architecture and component design',
      },
      { id: 'src', name: 'Source', description: 'Implementation code and components' },
      {
        id: 'docs',
        name: 'Documentation',
        description: 'Component documentation and style guides',
      },
    ],
    security: [
      {
        id: 'planning',
        name: 'Planning',
        description: 'Security architecture and threat modeling',
      },
      { id: 'src', name: 'Source', description: 'Security implementations and policies' },
      { id: 'docs', name: 'Documentation', description: 'Security documentation and runbooks' },
    ],
  };

/** Default routing entries seeded based on agent domains. */
const DOMAIN_ROUTING_SEEDS: Record<
  string,
  { pattern: string; workspace: string; skills: string[] }[]
> = {
  design: [
    { pattern: 'design component', workspace: 'design', skills: ['vault-navigator'] },
    { pattern: 'review design', workspace: 'review', skills: ['deep-review'] },
  ],
  'ui-design': [
    { pattern: 'design component', workspace: 'design', skills: ['vault-navigator'] },
    { pattern: 'review design', workspace: 'review', skills: ['deep-review'] },
  ],
  architecture: [
    { pattern: 'plan architecture', workspace: 'planning', skills: ['writing-plans'] },
    { pattern: 'implement feature', workspace: 'src', skills: ['test-driven-development'] },
    { pattern: 'write documentation', workspace: 'docs', skills: ['vault-capture'] },
  ],
  backend: [
    { pattern: 'plan API', workspace: 'planning', skills: ['writing-plans'] },
    { pattern: 'implement endpoint', workspace: 'src', skills: ['test-driven-development'] },
    { pattern: 'write docs', workspace: 'docs', skills: ['vault-capture'] },
  ],
  frontend: [
    { pattern: 'plan component', workspace: 'planning', skills: ['writing-plans'] },
    { pattern: 'implement component', workspace: 'src', skills: ['test-driven-development'] },
    { pattern: 'write docs', workspace: 'docs', skills: ['vault-capture'] },
  ],
  security: [
    { pattern: 'threat model', workspace: 'planning', skills: ['writing-plans'] },
    { pattern: 'implement policy', workspace: 'src', skills: ['test-driven-development'] },
    { pattern: 'write runbook', workspace: 'docs', skills: ['vault-capture'] },
  ],
};

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
  // Scaffold uses npx as portable fallback. `soleri install` overwrites
  // with resolved absolute path for instant startup (no npm resolution).
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
      '# OS',
      '.DS_Store',
      '',
      '# Editor / IDE state',
      '.obsidian/',
      '.opencode/',
      '',
    ].join('\n'),
    filesCreated,
  );

  // ─── 5. Write engine rules (modular — respects engine.features) ─────
  const engineFeatures = config.engine?.features as EngineFeature[] | undefined;
  writeFile(
    agentDir,
    'instructions/_engine.md',
    getModularEngineRules(engineFeatures),
    filesCreated,
  );

  // ─── 6. Write user instruction files ────────────────────────
  // Generate user.md — user-editable file with priority placement in CLAUDE.md
  const userMdContent = [
    '# Your Custom Rules',
    '',
    'Add your agent-specific rules, constraints, and preferences here.',
    'This file gets priority placement in CLAUDE.md — it appears before engine rules.',
    '',
    '## Examples of what to put here:',
    '- Project-specific conventions',
    '- Communication preferences',
    '- Domain expertise to emphasize',
    '- Things to always/never do',
    '',
    'Delete these instructions and replace with your own content.',
    '',
  ].join('\n');
  writeFile(agentDir, 'instructions/user.md', userMdContent, filesCreated);

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

  // ─── 6b. Write example instruction files ─────────────────────
  writeFile(agentDir, 'instructions/conventions.md', INSTRUCTIONS_CONVENTIONS, filesCreated);
  writeFile(
    agentDir,
    'instructions/getting-started.md',
    INSTRUCTIONS_GETTING_STARTED,
    filesCreated,
  );

  // ─── 7. Write workflows ─────────────────────────────────────
  for (const wf of BUILTIN_WORKFLOWS) {
    writeFile(agentDir, `workflows/${wf.name}/prompt.md`, wf.prompt, filesCreated);
    writeFile(agentDir, `workflows/${wf.name}/gates.yaml`, wf.gates, filesCreated);
    writeFile(agentDir, `workflows/${wf.name}/tools.yaml`, wf.tools, filesCreated);
  }

  // ─── 8. Copy bundled skills (with placeholder substitution) ─
  const resolvedSkills = resolveSkillsFilter(config.skillsFilter);
  const skills = generateSkills({
    id: config.id,
    skills: resolvedSkills ?? undefined,
  } as AgentConfig);
  for (const [relativePath, content] of skills) {
    mkdirSync(join(agentDir, dirname(relativePath)), { recursive: true });
    writeFile(agentDir, relativePath, content, filesCreated);
  }

  // ─── 9. Write knowledge bundles (seed from starter packs if available) ──
  const starterPacksDir = resolveStarterPacksDir();
  let totalSeeded = 0;

  for (const domain of config.domains) {
    const starterEntries = loadStarterEntries(starterPacksDir, domain);
    const bundle = {
      domain,
      version: '1.0.0',
      entries: starterEntries,
    };
    writeFile(
      agentDir,
      `knowledge/${domain}.json`,
      JSON.stringify(bundle, null, 2) + '\n',
      filesCreated,
    );
    totalSeeded += starterEntries.length;
  }

  // ─── 9b. Create workspace directories with CONTEXT.md ──────
  // Resolve workspaces: use explicit config or seed from domains
  const resolvedWorkspaces = resolveWorkspaces(config);
  if (resolvedWorkspaces.length > 0) {
    for (const ws of resolvedWorkspaces) {
      const wsDir = join(agentDir, 'workspaces', ws.id);
      mkdirSync(wsDir, { recursive: true });
      const contextContent = [
        `# ${ws.name}`,
        '',
        ws.description,
        '',
        '## Instructions',
        '',
        `<!-- Add workspace-specific instructions here for the "${ws.name}" context. -->`,
        '',
      ].join('\n');
      writeFile(
        agentDir,
        `workspaces/${ws.id}/${ws.contextFile ?? 'CONTEXT.md'}`,
        contextContent,
        filesCreated,
      );
    }
  }

  // ─── 10. Generate CLAUDE.md ──────────────────────────────────
  const { content: claudeMd } = composeClaudeMd(agentDir);
  writeFile(agentDir, 'CLAUDE.md', claudeMd, filesCreated);

  // ─── 10. Summary ────────────────────────────────────────────
  const summary = [
    `Agent "${config.name}" scaffolded at ${agentDir}`,
    '',
    `  Files: ${filesCreated.length}`,
    `  Domains: ${config.domains.join(', ')}`,
    `  Knowledge: ${totalSeeded} starter entries seeded`,
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

  // Persona config — include if present
  if (config.persona && Object.keys(config.persona).length > 0) {
    yaml.persona = config.persona;
  }

  // Engine config — only include non-defaults
  const engine: Record<string, unknown> = {};
  if (config.engine?.vault) engine.vault = config.engine.vault;
  if (config.engine?.learning === false) engine.learning = false;
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

  // Skills filter — only include if not the default ('essential')
  if (config.skillsFilter && config.skillsFilter !== 'essential') {
    yaml.skillsFilter = config.skillsFilter;
  }

  // Workspaces
  const resolvedWs = resolveWorkspaces(config);
  if (resolvedWs.length > 0) {
    yaml.workspaces = resolvedWs.map((ws) =>
      Object.assign(
        { id: ws.id, name: ws.name, description: ws.description },
        ws.contextFile !== `CONTEXT.md` ? { contextFile: ws.contextFile } : {},
      ),
    );
  }

  // Routing
  const resolvedRouting = resolveRouting(config);
  if (resolvedRouting.length > 0) {
    yaml.routing = resolvedRouting.map((r) =>
      Object.assign(
        { pattern: r.pattern, workspace: r.workspace },
        r.context.length > 0 ? { context: r.context } : {},
        r.skills.length > 0 ? { skills: r.skills } : {},
      ),
    );
  }

  // Packs
  if (config.packs && config.packs.length > 0) {
    yaml.packs = config.packs;
  }

  return yaml;
}

// ─── Workspace & Routing Helpers ─────────────────────────────────────

/**
 * Resolve workspaces: use explicit config or seed from domains.
 * Deduplicates by workspace id.
 */
function resolveWorkspaces(
  config: AgentYaml,
): { id: string; name: string; description: string; contextFile: string }[] {
  // If explicitly defined, use those
  if (config.workspaces && config.workspaces.length > 0) {
    return config.workspaces.map((ws) => ({
      id: ws.id,
      name: ws.name,
      description: ws.description,
      contextFile: ws.contextFile ?? 'CONTEXT.md',
    }));
  }

  // Otherwise, seed from domains
  const seen = new Set<string>();
  const workspaces: { id: string; name: string; description: string; contextFile: string }[] = [];

  for (const domain of config.domains) {
    const seeds = DOMAIN_WORKSPACE_SEEDS[domain];
    if (!seeds) continue;
    for (const seed of seeds) {
      if (seen.has(seed.id)) continue;
      seen.add(seed.id);
      workspaces.push({ ...seed, contextFile: 'CONTEXT.md' });
    }
  }

  return workspaces;
}

/**
 * Resolve routing entries: use explicit config or seed from domains.
 * Deduplicates by pattern string.
 */
function resolveRouting(
  config: AgentYaml,
): { pattern: string; workspace: string; context: string[]; skills: string[] }[] {
  // If explicitly defined, use those
  if (config.routing && config.routing.length > 0) {
    return config.routing.map((r) => ({
      pattern: r.pattern,
      workspace: r.workspace,
      context: r.context ?? [],
      skills: r.skills ?? [],
    }));
  }

  // Otherwise, seed from domains
  const seen = new Set<string>();
  const routes: { pattern: string; workspace: string; context: string[]; skills: string[] }[] = [];

  for (const domain of config.domains) {
    const seeds = DOMAIN_ROUTING_SEEDS[domain];
    if (!seeds) continue;
    for (const seed of seeds) {
      if (seen.has(seed.pattern)) continue;
      seen.add(seed.pattern);
      routes.push({ ...seed, context: [] });
    }
  }

  return routes;
}

// ─── Starter Pack Helpers ────────────────────────────────────────────

/** Domain aliases — map agent domains to starter pack directories. */
const DOMAIN_TO_STARTER: Record<string, string> = {
  // design starter
  frontend: 'design',
  design: 'design',
  'ui-design': 'design',
  accessibility: 'design',
  styling: 'design',
  react: 'design',
  'component-patterns': 'design',
  'responsive-design': 'design',
  // security starter
  security: 'security',
  auth: 'security',
  authentication: 'security',
  // architecture starter
  architecture: 'architecture',
  'api-design': 'architecture',
  database: 'architecture',
  backend: 'architecture',
  infrastructure: 'architecture',
};

function resolveStarterPacksDir(): string | null {
  // Try repo-relative path (monorepo development)
  const forgeDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(forgeDir, '..', '..', '..', 'knowledge-packs', 'starter'),
    join(forgeDir, '..', '..', 'knowledge-packs', 'starter'),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return null;
}

function loadStarterEntries(starterDir: string | null, domain: string): unknown[] {
  if (!starterDir) return [];

  const packName = DOMAIN_TO_STARTER[domain];
  if (!packName) return [];

  const vaultDir = join(starterDir, packName, 'vault');
  if (!existsSync(vaultDir)) return [];

  const entries: unknown[] = [];
  try {
    const files = readdirSync(vaultDir).filter((f: string) => f.endsWith('.json'));
    for (const file of files) {
      const data = JSON.parse(readFileSync(join(vaultDir, file), 'utf-8'));
      if (Array.isArray(data)) {
        entries.push(...data);
      } else if (data.entries && Array.isArray(data.entries)) {
        entries.push(...data.entries);
      }
    }
  } catch {
    // Starter pack unavailable — return empty
  }
  return entries;
}
