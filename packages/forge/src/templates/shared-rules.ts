/**
 * Shared Soleri engine rules — agent-agnostic.
 *
 * These rules are injected ONCE into global ~/.claude/CLAUDE.md under
 * the `<!-- soleri:engine-rules -->` marker. They describe behavioral
 * rules WITHOUT tool prefixes. The active agent's facade table (in its
 * own `<!-- agent-id:mode -->` block) maps op names to actual tools.
 *
 * Uses op:name syntax — the active agent provides the tool prefix.
 *
 * Rules are organized into capability-based modules:
 *   - rules-core.ts     — always included (response integrity, formatting, commits, etc.)
 *   - rules-vault.ts    — vault, knowledge capture, tool advocacy
 *   - rules-planning.ts — planning, task routing, validation loop, verification
 *   - rules-brain.ts    — brain, model routing, cross-project memory
 *   - rules-advanced.ts — YOLO, workflows, subagents, overlay, session, CLI, persona
 */

import { getRulesCore } from './rules-core.js';
import { getRulesVault } from './rules-vault.js';
import { getRulesPlanning } from './rules-planning.js';
import { getRulesBrain } from './rules-brain.js';
import { getRulesAdvanced } from './rules-advanced.js';

const ENGINE_MARKER = 'soleri:engine-rules';

export function getEngineMarker(): string {
  return ENGINE_MARKER;
}

/** Map of feature keys to their rule-module getters. */
const FEATURE_MODULES: Record<string, () => string> = {
  vault: getRulesVault,
  planning: getRulesPlanning,
  brain: getRulesBrain,
  advanced: getRulesAdvanced,
};

/**
 * Returns the full engine rules markdown content (with markers).
 * Backward compatible — returns ALL modules concatenated.
 */
export function getEngineRulesContent(): string {
  return getModularEngineRules();
}

/**
 * Returns engine rules selectively based on feature flags.
 *
 * - No features specified or empty array = ALL modules (backward compatible).
 * - features: ['vault', 'planning'] = core + vault + planning.
 * - Core is ALWAYS included regardless of features.
 *
 * Valid feature keys: 'vault', 'planning', 'brain', 'advanced'.
 */
export function getModularEngineRules(features?: string[]): string {
  const includeAll = !features || features.length === 0;

  const sections: string[] = [
    `<!-- ${ENGINE_MARKER} -->`,
    '',
    '# Soleri Engine Rules',
    '',
    "Shared behavioral rules for all Soleri agents. The active agent's facade table provides tool names.",
    '',
    getRulesCore(),
  ];

  for (const [key, getter] of Object.entries(FEATURE_MODULES)) {
    if (includeAll || features!.includes(key)) {
      sections.push('', getter());
    }
  }

  sections.push('', `<!-- /${ENGINE_MARKER} -->`);

  return sections.join('\n');
}
