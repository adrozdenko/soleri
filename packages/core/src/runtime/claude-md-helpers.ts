/**
 * CLAUDE.md injection helpers — marker-based, idempotent section management.
 *
 * Supports injecting agent sections into existing CLAUDE.md files
 * (project-level or global ~/.claude/CLAUDE.md) using HTML comment markers.
 *
 * Marker format: <!-- agent:{agentId}:mode --> ... <!-- /agent:{agentId}:mode -->
 * This allows multiple Soleri agents to coexist in the same CLAUDE.md.
 */

import type { AgentRuntimeConfig } from './types.js';

// ─── Types ────────────────────────────────────────────────────────────

export interface AgentSection {
  agentId: string;
  content: string;
}

export type InjectionPosition = 'start' | 'end' | 'after-title';

interface FacadeSummary {
  name: string;
  ops: string[];
}

// ─── Marker Helpers ───────────────────────────────────────────────────

function startMarker(agentId: string): string {
  return `<!-- agent:${agentId}:mode -->`;
}

function endMarker(agentId: string): string {
  return `<!-- /agent:${agentId}:mode -->`;
}

/**
 * Check if content already has sections for this agent.
 */
export function hasSections(content: string, agentId: string): boolean {
  return content.includes(startMarker(agentId)) && content.includes(endMarker(agentId));
}

/**
 * Remove existing agent sections from content.
 */
export function removeSections(content: string, agentId: string): string {
  const start = startMarker(agentId);
  const end = endMarker(agentId);

  const startIdx = content.indexOf(start);
  const endIdx = content.indexOf(end);

  if (startIdx === -1 || endIdx === -1) return content;

  const before = content.slice(0, startIdx).trimEnd();
  const after = content.slice(endIdx + end.length).trimStart();

  return before + (after ? '\n\n' + after : '\n');
}

/**
 * Inject a section into content at the specified position.
 */
export function injectAtPosition(
  content: string,
  section: string,
  position: InjectionPosition,
): string {
  switch (position) {
    case 'start':
      return section + '\n\n' + content;

    case 'end':
      return content.trimEnd() + '\n\n' + section + '\n';

    case 'after-title': {
      const lines = content.split('\n');
      // Find first # heading
      const titleIdx = lines.findIndex((line) => /^#\s/.test(line));
      if (titleIdx === -1) {
        // No title found — prepend
        return section + '\n\n' + content;
      }
      // Insert after title line (and any blank line following it)
      let insertIdx = titleIdx + 1;
      while (insertIdx < lines.length && lines[insertIdx].trim() === '') {
        insertIdx++;
      }
      lines.splice(insertIdx, 0, '', section, '');
      return lines.join('\n');
    }
  }
}

/**
 * Wrap content in agent markers.
 */
export function wrapInMarkers(agentId: string, content: string): string {
  return `${startMarker(agentId)}\n${content}\n${endMarker(agentId)}`;
}

// ─── Content Composition ──────────────────────────────────────────────

/**
 * Compose agent mode section from runtime config.
 */
export function composeAgentModeSection(config: AgentRuntimeConfig): string {
  const { agentId } = config;
  const name = agentId.charAt(0).toUpperCase() + agentId.slice(1);

  return [
    `## ${name} Mode`,
    '',
    `**Activate:** "Hello, ${name}!" → \`${agentId}_core op:activate params:{ projectPath: "." }\``,
    `**Deactivate:** "Goodbye, ${name}!" → \`${agentId}_core op:activate params:{ deactivate: true }\``,
    '',
    `On activation, adopt the returned persona. Stay in character until deactivated.`,
  ].join('\n');
}

/**
 * Compose integration section with tools table and session protocol.
 */
export function composeIntegrationSection(
  config: AgentRuntimeConfig,
  facades?: FacadeSummary[],
): string {
  const { agentId } = config;
  const name = agentId.charAt(0).toUpperCase() + agentId.slice(1);

  const lines: string[] = [
    `## ${name} Integration`,
    '',
    `On session start: \`${agentId}_core op:session_start params:{ projectPath: "." }\``,
    '',
    '### Essential Tools',
    '',
    '| Facade | Key Ops |',
    '|--------|---------|',
  ];

  if (facades && facades.length > 0) {
    for (const f of facades) {
      const opsStr = f.ops
        .slice(0, 5)
        .map((o) => `\`${o}\``)
        .join(', ');
      const suffix = f.ops.length > 5 ? ', ...' : '';
      lines.push(`| \`${f.name}\` | ${opsStr}${suffix} |`);
    }
  } else {
    // Default facade table
    lines.push(
      `| \`${agentId}_vault\` | \`search_intelligent\`, \`capture_knowledge\`, \`capture_quick\` |`,
    );
    lines.push(
      `| \`${agentId}_plan\` | \`create_plan\`, \`approve_plan\`, \`plan_split\`, \`plan_reconcile\` |`,
    );
    lines.push(`| \`${agentId}_brain\` | \`recommend\`, \`strengths\`, \`feedback\` |`);
    lines.push(`| \`${agentId}_memory\` | \`memory_search\`, \`session_capture\` |`);
    lines.push(
      `| \`${agentId}_admin\` | \`admin_health\`, \`admin_tool_list\`, \`admin_setup_global\` |`,
    );
    lines.push(`| \`${agentId}_curator\` | \`curator_groom\`, \`curator_status\` |`);
  }

  lines.push('');
  lines.push(`> Full list: \`${agentId}_admin op:admin_tool_list\``);

  return lines.join('\n');
}

/**
 * Build full injection content (mode + integration, wrapped in markers).
 */
export function buildInjectionContent(
  config: AgentRuntimeConfig,
  options: { includeIntegration?: boolean; facades?: FacadeSummary[] } = {},
): string {
  const { includeIntegration = true, facades } = options;

  const sections = [composeAgentModeSection(config)];

  if (includeIntegration) {
    sections.push(composeIntegrationSection(config, facades));
  }

  return wrapInMarkers(config.agentId, sections.join('\n\n'));
}

// ─── Engine Rules ────────────────────────────────────────────────────

const ENGINE_RULES_START = '<!-- soleri:engine-rules -->';
const ENGINE_RULES_END = '<!-- /soleri:engine-rules -->';

/**
 * Check if engine rules are present in content.
 */
function hasEngineRules(content: string): boolean {
  return content.includes(ENGINE_RULES_START) && content.includes(ENGINE_RULES_END);
}

/**
 * Inject or update engine rules in content.
 */
export function injectEngineRulesBlock(content: string, engineRulesContent: string): string {
  if (hasEngineRules(content)) {
    // Replace existing
    const startIdx = content.indexOf(ENGINE_RULES_START);
    const endIdx = content.indexOf(ENGINE_RULES_END);
    const before = content.slice(0, startIdx);
    const after = content.slice(endIdx + ENGINE_RULES_END.length);
    return before + engineRulesContent + after;
  }
  // Append
  return content.trimEnd() + '\n\n' + engineRulesContent + '\n';
}

/**
 * Remove engine rules block from content.
 * Used during self-healing to strip engine rules from global CLAUDE.md
 * when they were incorrectly injected there (they belong in _engine.md).
 *
 * Returns the content without the engine rules block, or unchanged if no block found.
 */
export function removeEngineRulesFromGlobal(content: string): {
  cleaned: string;
  removed: boolean;
} {
  if (!hasEngineRules(content)) {
    return { cleaned: content, removed: false };
  }

  const startIdx = content.indexOf(ENGINE_RULES_START);
  const endIdx = content.indexOf(ENGINE_RULES_END);

  const before = content.slice(0, startIdx).trimEnd();
  const after = content.slice(endIdx + ENGINE_RULES_END.length).trimStart();

  const cleaned = before + (before && after ? '\n\n' : '') + after;
  return { cleaned: cleaned || '\n', removed: true };
}
