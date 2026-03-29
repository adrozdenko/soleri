/**
 * Soleri v7 — CLAUDE.md Composer
 *
 * Auto-generates CLAUDE.md from agent.yaml + instructions/ + workflows/ + skills/.
 * This file is never manually edited. `soleri dev` watches and regenerates on change.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { AgentYamlSchema, type AgentYaml } from './agent-schema.js';
import { ENGINE_MODULE_MANIFEST, CORE_KEY_OPS } from '@soleri/core/module-manifest';

// ─── Types ────────────────────────────────────────────────────────────

export interface ComposedClaudeMd {
  /** The full CLAUDE.md content */
  content: string;
  /** Files that contributed to this composition */
  sources: string[];
}

export interface ToolEntry {
  facade: string;
  ops: string[];
}

// ─── Main Composer ────────────────────────────────────────────────────

/**
 * Compose CLAUDE.md from an agent folder.
 *
 * @param agentDir - Path to the agent folder (containing agent.yaml)
 * @param tools - Registered MCP tools (from engine introspection). Optional —
 *                if not provided, generates a placeholder table.
 */
export function composeClaudeMd(agentDir: string, tools?: ToolEntry[]): ComposedClaudeMd {
  const sources: string[] = [];

  // 1. Read agent.yaml
  const agentYamlPath = join(agentDir, 'agent.yaml');
  const agentYaml = AgentYamlSchema.parse(parseYaml(readFileSync(agentYamlPath, 'utf-8')));
  sources.push(agentYamlPath);

  const sections: string[] = [];

  // 2. Agent identity block
  sections.push(composeIdentityBlock(agentYaml));

  // 3. Activation commands
  sections.push(composeActivation(agentYaml));

  // 4. Session start
  sections.push(composeSessionStart(agentYaml));

  // 5. Essential tools table
  sections.push(composeToolsTable(agentYaml, tools));

  // 6. User custom instructions (instructions/user.md) — priority placement
  //    This file is user-editable and appears BEFORE engine rules and other instructions.
  const userMdPath = join(agentDir, 'instructions', 'user.md');
  if (existsSync(userMdPath)) {
    const userContent = readFileSync(userMdPath, 'utf-8').trim();
    if (userContent) {
      sections.push(userContent);
      sources.push(userMdPath);
    }
  }

  // 7. Engine rules — NOT inlined (they are injected once into ~/.claude/CLAUDE.md
  //    or project CLAUDE.md via `soleri install`). Including them here would
  //    triple-load the rules (~8k tokens duplicated per layer).
  //    We emit a short reference so the agent knows rules exist.
  const enginePath = join(agentDir, 'instructions', '_engine.md');
  if (existsSync(enginePath)) {
    sections.push(
      '<!-- soleri:engine-rules-ref -->\n' +
        '> **Engine rules** are loaded from the global or project-level CLAUDE.md ' +
        '(injected by `soleri install`). See `instructions/_engine.md` for the full rules.\n' +
        '<!-- /soleri:engine-rules-ref -->',
    );
    // Note: _engine.md is still tracked as a source for change detection
    sources.push(enginePath);
  }

  // 8. User instructions (instructions/*.md, excluding _engine.md and user.md)
  const instructionsDir = join(agentDir, 'instructions');
  if (existsSync(instructionsDir)) {
    const files = readdirSync(instructionsDir)
      .filter((f) => f.endsWith('.md') && f !== '_engine.md' && f !== 'user.md')
      .sort();
    for (const file of files) {
      const filePath = join(instructionsDir, file);
      sections.push(readFileSync(filePath, 'utf-8').trim());
      sources.push(filePath);
    }
  }

  // 8. Workflow index
  const workflowsDir = join(agentDir, 'workflows');
  if (existsSync(workflowsDir)) {
    const workflowSection = composeWorkflowIndex(workflowsDir);
    if (workflowSection) {
      sections.push(workflowSection);
      // Add workflow prompt files to sources
      const dirs = readdirSync(workflowsDir, { withFileTypes: true }).filter((d) =>
        d.isDirectory(),
      );
      for (const dir of dirs) {
        const promptPath = join(workflowsDir, dir.name, 'prompt.md');
        if (existsSync(promptPath)) sources.push(promptPath);
      }
    }
  }

  // 9. Skills index
  const skillsDir = join(agentDir, 'skills');
  if (existsSync(skillsDir)) {
    const skillsSection = composeSkillsIndex(skillsDir);
    if (skillsSection) sections.push(skillsSection);
  }

  const content = sections.join('\n\n') + '\n';
  return { content, sources };
}

// ─── Section Composers ────────────────────────────────────────────────

function composeIdentityBlock(agent: AgentYaml): string {
  const lines: string[] = [
    `# ${agent.name} Mode`,
    '',
    `## ${agent.name}`,
    '',
    `**Role:** ${agent.role}`,
    `**Domains:** ${agent.domains.join(', ')}`,
    `**Tone:** ${agent.tone}`,
    '',
    agent.description,
    '',
    '**Principles:**',
    ...agent.principles.map((p) => `- ${p}`),
  ];
  return lines.join('\n');
}

function composeActivation(agent: AgentYaml): string {
  return [
    '## Activation',
    '',
    `**Activate:** "Hello, ${agent.name}!" → \`${agent.id}_core op:activate params:{ projectPath: "." }\``,
    `**Deactivate:** "Goodbye, ${agent.name}!" → \`${agent.id}_core op:activate params:{ deactivate: true }\``,
    '',
    `On activation, adopt the returned persona. Stay in character until deactivated.`,
  ].join('\n');
}

function composeSessionStart(agent: AgentYaml): string {
  return [
    '## Session Start',
    '',
    `On every new session: \`${agent.id}_core op:session_start params:{ projectPath: "." }\``,
  ].join('\n');
}

function composeToolsTable(agent: AgentYaml, tools?: ToolEntry[]): string {
  const lines: string[] = [
    '## Essential Tools',
    '',
    '| Facade | Key Ops |',
    '|--------|---------|',
  ];

  if (tools && tools.length > 0) {
    for (const tool of tools) {
      const opsStr = tool.ops
        .slice(0, 6)
        .map((o) => `\`${o}\``)
        .join(', ');
      const suffix = tool.ops.length > 6 ? ', ...' : '';
      lines.push(`| \`${tool.facade}\` | ${opsStr}${suffix} |`);
    }
  } else {
    // Placeholder generated from ENGINE_MODULE_MANIFEST (single source of truth)
    const coreOpsStr = CORE_KEY_OPS.map((o) => `\`${o}\``).join(', ');
    lines.push(`| \`${agent.id}_core\` | ${coreOpsStr} |`);

    for (const mod of ENGINE_MODULE_MANIFEST) {
      if (mod.conditional) continue;
      const opsStr = mod.keyOps.map((o) => `\`${o}\``).join(', ');
      lines.push(`| \`${agent.id}_${mod.suffix}\` | ${opsStr} |`);
    }

    // Domain facades from packs
    if (agent.packs) {
      for (const pack of agent.packs) {
        lines.push(`| \`${agent.id}_${pack.name}\` | \`get_patterns\`, \`search\`, \`capture\` |`);
      }
    }
    // Domain facades from domains
    for (const domain of agent.domains) {
      lines.push(`| \`${agent.id}_${domain}\` | \`get_patterns\`, \`search\`, \`capture\` |`);
    }
  }

  lines.push('');
  lines.push(`> Full list: \`${agent.id}_admin op:admin_tool_list\``);

  return lines.join('\n');
}

function composeWorkflowIndex(workflowsDir: string): string | null {
  const dirs = readdirSync(workflowsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  if (dirs.length === 0) return null;

  const lines: string[] = [
    '## Available Workflows',
    '',
    '| Workflow | Description |',
    '|----------|-------------|',
  ];

  for (const dir of dirs) {
    const promptPath = join(workflowsDir, dir.name, 'prompt.md');
    let description = dir.name;

    if (existsSync(promptPath)) {
      const content = readFileSync(promptPath, 'utf-8');
      // Extract first non-heading, non-empty line as description
      const descLine = content.split('\n').find((line) => line.trim() && !line.startsWith('#'));
      if (descLine) description = descLine.trim().slice(0, 80);
    }

    lines.push(`| \`${dir.name}\` | ${description} |`);
  }

  return lines.join('\n');
}

/** Skill categories for grouping in the CLAUDE.md index. */
const SKILL_CATEGORIES: Record<string, { label: string; skills: string[] }> = {
  getting_started: {
    label: 'Getting Started',
    skills: ['agent-guide', 'agent-persona', 'onboard-me', 'env-setup', 'context-resume'],
  },
  planning: {
    label: 'Planning & Execution',
    skills: ['brainstorming', 'writing-plans', 'executing-plans', 'parallel-execute'],
  },
  building: {
    label: 'Building & Fixing',
    skills: [
      'test-driven-development',
      'systematic-debugging',
      'fix-and-learn',
      'agent-dev',
      'code-patrol',
    ],
  },
  knowledge: {
    label: 'Knowledge & Learning',
    skills: [
      'vault-capture',
      'vault-navigator',
      'vault-curate',
      'vault-smells',
      'knowledge-harvest',
      'brain-debrief',
    ],
  },
  quality: {
    label: 'Quality & Delivery',
    skills: [
      'verification-before-completion',
      'deep-review',
      'deliver-and-ship',
      'health-check',
      'mcp-doctor',
    ],
  },
  reflection: {
    label: 'Reflection & Research',
    skills: ['retrospective', 'second-opinion'],
  },
};

/**
 * Extract the description from SKILL.md frontmatter.
 * Handles both single-line and multi-line YAML folded scalars (>).
 */
function extractSkillDescription(content: string): string | null {
  // Match the frontmatter block
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;

  const fm = fmMatch[1];

  // Try parsing the description field — handles both inline and folded (>) forms
  const descIdx = fm.indexOf('description:');
  if (descIdx === -1) return null;

  const afterDesc = fm.slice(descIdx + 'description:'.length);
  const restLines = afterDesc.split('\n');

  // Single-line: "description: some text"
  const firstLine = restLines[0].trim();
  if (firstLine && firstLine !== '>' && firstLine !== '|') {
    return firstLine;
  }

  // Multi-line folded scalar (> or |): collect indented continuation lines
  const parts: string[] = [];
  for (let i = 1; i < restLines.length; i++) {
    const line = restLines[i];
    // Stop at next YAML key or end of frontmatter
    if (line.match(/^\S/) || line.trim() === '---') break;
    const trimmed = line.trim();
    if (trimmed) parts.push(trimmed);
  }

  return parts.length > 0 ? parts.join(' ') : null;
}

/**
 * Truncate a skill description to a short trigger phrase.
 * Full descriptions are already loaded by Claude Code from SKILL.md files,
 * so CLAUDE.md only needs enough to match intent.
 */
function truncateSkillDesc(desc: string, maxLen = 80): string {
  // Take up to first " — " dash separator (trigger phrase before the details)
  const dashIdx = desc.indexOf(' — ');
  const candidate = dashIdx > 0 ? desc.slice(0, dashIdx) : desc;
  // Also try first sentence
  const dotIdx = candidate.indexOf('. ');
  const sentence = dotIdx > 0 ? candidate.slice(0, dotIdx) : candidate;
  // Truncate to maxLen
  if (sentence.length <= maxLen) return sentence;
  return sentence.slice(0, maxLen - 1) + '…';
}

function composeSkillsIndex(skillsDir: string): string | null {
  const dirs = readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  if (dirs.length === 0) return null;

  // Collect all available skills with descriptions
  const skillMap = new Map<string, string>();
  for (const dir of dirs) {
    const skillPath = join(skillsDir, dir.name, 'SKILL.md');
    if (existsSync(skillPath)) {
      const content = readFileSync(skillPath, 'utf-8');
      const desc = extractSkillDescription(content) ?? dir.name;
      skillMap.set(dir.name, truncateSkillDesc(desc));
    }
  }

  if (skillMap.size === 0) return null;

  const lines: string[] = [
    '## Available Skills',
    '',
    'Skills activate automatically on matching intent. Full descriptions in each SKILL.md.',
    '',
  ];

  // Group skills into categories — compact table per category
  const categorized = new Set<string>();

  for (const [_key, category] of Object.entries(SKILL_CATEGORIES)) {
    const categorySkills = category.skills.filter((s) => skillMap.has(s));
    if (categorySkills.length === 0) continue;

    lines.push(`**${category.label}:** ${categorySkills.map((s) => `\`${s}\``).join(', ')}`);
    for (const s of categorySkills) categorized.add(s);
  }

  // Any uncategorized skills
  const uncategorized = [...skillMap.keys()].filter((s) => !categorized.has(s)).sort();
  if (uncategorized.length > 0) {
    lines.push(`**Other:** ${uncategorized.map((s) => `\`${s}\``).join(', ')}`);
  }

  return lines.join('\n').trimEnd();
}
