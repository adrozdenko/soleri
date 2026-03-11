import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentConfig } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, '..', 'skills');

/** Skills that use YOUR_AGENT_core placeholder and need agent-specific substitution. */
const AGENT_SPECIFIC_SKILLS = new Set([
  'agent-dev',
  'agent-persona',
  'brain-debrief',
  'brainstorming',
  'code-patrol',
  'context-resume',
  'deliver-and-ship',
  'executing-plans',
  'fix-and-learn',
  'health-check',
  'knowledge-harvest',
  'onboard-me',
  'retrospective',
  'second-opinion',
  'systematic-debugging',
  'test-driven-development',
  'vault-capture',
  'vault-curate',
  'vault-navigator',
  'verification-before-completion',
  'writing-plans',
]);

/**
 * Generate skill files for the scaffolded agent.
 * Returns [relativePath, content] tuples for each skill.
 *
 * - If config.skills is set, only those skills are included.
 * - If config.skills is undefined/empty, all skills are included (backward compat).
 * - Superpowers-adapted skills (MIT): copied as-is
 * - Engine-adapted skills: YOUR_AGENT_core → {config.id}_core
 */
export function generateSkills(config: AgentConfig): Array<[string, string]> {
  const files: Array<[string, string]> = [];
  let skillFiles: string[];

  try {
    skillFiles = readdirSync(SKILLS_DIR).filter((f) => f.endsWith('.md'));
  } catch {
    return files;
  }

  // If skills array is present, filter to only those skills.
  // undefined = include all (backward compat), [] = include none.
  const allowedSkills = config.skills ? new Set(config.skills) : null; // null = include all (backward compat)

  for (const file of skillFiles) {
    const skillName = file.replace('.md', '');

    if (allowedSkills && !allowedSkills.has(skillName)) {
      continue;
    }

    let content = readFileSync(join(SKILLS_DIR, file), 'utf-8');

    if (AGENT_SPECIFIC_SKILLS.has(skillName)) {
      content = content.replace(/YOUR_AGENT_core/g, `${config.id}_core`);
    }

    files.push([`skills/${skillName}/SKILL.md`, content]);
  }

  return files;
}
