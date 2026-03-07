/**
 * CLAUDE.md composition — generates LLM instructions from agent config and facades.
 *
 * Produces markdown with:
 * 1. Global instructions (priority-sorted)
 * 2. Activation / deactivation
 * 3. Session start protocol
 * 4. Facade reference table (auto-generated from registered facades)
 * 5. Facade behavioral rules (from FacadeInstructions)
 *
 * Wrapped in versioned markers: `<!-- agent:mode v1 -->` / `<!-- /agent:mode -->`
 */

import type { FacadeConfig } from '../facades/types.js';
import type { AgentMeta, FacadeInstructions, GlobalInstruction } from './types.js';

export const FORMAT_VERSION = 1;
export const OPEN_MARKER = `<!-- agent:mode v${FORMAT_VERSION} -->`;
export const CLOSE_MARKER = '<!-- /agent:mode -->';
export const USER_ZONE_OPEN = '<!-- user:custom -->';
export const USER_ZONE_CLOSE = '<!-- /user:custom -->';

function sortByPriority<T extends { priority?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));
}

function renderActivation(agent: AgentMeta): string {
  return [
    `## ${agent.name} Mode`,
    '',
    '### Activation',
    '',
    `- "${agent.activationPhrase}" → \`${agent.activateCommand}\``,
    `- "${agent.deactivationPhrase}" → \`${agent.deactivateCommand}\``,
    '',
    '> Persona details are returned dynamically by the activate response.',
  ].join('\n');
}

function renderSessionStart(agent: AgentMeta): string {
  return [
    '### Session Start Protocol',
    '',
    'On EVERY new session:',
    `1. Register project: \`${agent.id}_core op:register params:{ projectPath: "." }\``,
    '2. Check activation response for `persistence.status`, `vault.connected`',
    `3. Check for plans in \`executing\` state — remind user to reconcile`,
  ].join('\n');
}

function renderFacadeTable(
  facades: FacadeConfig[],
  instructions?: Map<string, FacadeInstructions>,
): string {
  const lines = ['### Essential Tools', '', '| Facade | Key Ops |', '|--------|---------|'];

  for (const facade of facades) {
    const instr = instructions?.get(facade.name);
    const allOps = facade.ops.map((o) => o.name);
    const keyOps = instr?.keyOps ?? allOps.slice(0, 5);
    const display = keyOps.map((o) => `\`${o}\``).join(', ');
    const suffix = allOps.length > keyOps.length ? ', ...' : '';
    lines.push(`| \`${facade.name}\` | ${display}${suffix} |`);
  }

  return lines.join('\n');
}

function renderGlobalInstruction(gi: GlobalInstruction): string {
  return `## ${gi.heading}\n\n${gi.content.trim()}`;
}

function renderFacadeRules(name: string, instr: FacadeInstructions): string {
  const lines: string[] = [`## ${instr.heading}`, ''];

  if (instr.rules?.length) {
    for (const rule of instr.rules) {
      lines.push(`- ${rule}`);
    }
    lines.push('');
  }

  if (instr.templates) {
    for (const [label, template] of Object.entries(instr.templates)) {
      lines.push(`### ${label}`, '', template.trim(), '');
    }
  }

  return lines.join('\n').trimEnd();
}

export interface ComposeOptions {
  /** Per-facade behavioral instructions */
  facadeInstructions?: Map<string, FacadeInstructions>;
  /** Include an empty user-safe zone */
  includeUserZone?: boolean;
}

/**
 * Compose the full CLAUDE.md agent block from metadata and facades.
 * Returns the content wrapped in versioned markers.
 */
export function composeCLAUDEmd(
  agent: AgentMeta,
  facades: FacadeConfig[],
  options?: ComposeOptions,
): string {
  const sections: string[] = [];

  // 1. Global instructions (sorted by priority)
  if (agent.globalInstructions?.length) {
    const sorted = sortByPriority(agent.globalInstructions);
    for (const gi of sorted) {
      sections.push(renderGlobalInstruction(gi));
    }
  }

  // 2. Activation + session start
  sections.push(renderActivation(agent));
  sections.push(renderSessionStart(agent));

  // 3. Facade reference table
  sections.push(renderFacadeTable(facades, options?.facadeInstructions));

  // 4. Facade behavioral rules
  if (options?.facadeInstructions) {
    const entries = [...options.facadeInstructions.entries()].sort(
      ([, a], [, b]) => (a.priority ?? 50) - (b.priority ?? 50),
    );
    for (const [name, instr] of entries) {
      sections.push(renderFacadeRules(name, instr));
    }
  }

  // 5. User-safe zone
  if (options?.includeUserZone) {
    sections.push(`${USER_ZONE_OPEN}\n\n${USER_ZONE_CLOSE}`);
  }

  const body = sections.join('\n\n');
  return `${OPEN_MARKER}\n\n${body}\n\n${CLOSE_MARKER}`;
}
