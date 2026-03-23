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

  // 6. Engine rules (from instructions/_engine.md)
  const enginePath = join(agentDir, 'instructions', '_engine.md');
  if (existsSync(enginePath)) {
    sections.push(readFileSync(enginePath, 'utf-8').trim());
    sources.push(enginePath);
  }

  // 7. User instructions (instructions/*.md, excluding _engine.md)
  const instructionsDir = join(agentDir, 'instructions');
  if (existsSync(instructionsDir)) {
    const files = readdirSync(instructionsDir)
      .filter((f) => f.endsWith('.md') && f !== '_engine.md')
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

function composeSkillsIndex(skillsDir: string): string | null {
  const dirs = readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  if (dirs.length === 0) return null;

  const lines: string[] = ['## Available Skills', ''];

  for (const dir of dirs) {
    const skillPath = join(skillsDir, dir.name, 'SKILL.md');
    if (existsSync(skillPath)) {
      const content = readFileSync(skillPath, 'utf-8');
      // Extract description from frontmatter if present
      const descMatch = content.match(/^description:\s*(.+)$/m);
      const desc = descMatch ? descMatch[1].trim() : dir.name;
      lines.push(`- **${dir.name}**: ${desc}`);
    }
  }

  return lines.join('\n');
}
