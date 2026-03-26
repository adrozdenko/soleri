import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentConfig } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, '..', 'skills');

/** Placeholder token in skill templates that gets replaced with agent-specific tool name. */
const AGENT_PLACEHOLDER = 'YOUR_AGENT_core';

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
  let entries: string[];

  try {
    entries = readdirSync(SKILLS_DIR);
  } catch {
    return files;
  }

  // If skills array is present, filter to only those skills.
  // undefined = include all (backward compat), [] = include none.
  const allowedSkills = config.skills ? new Set(config.skills) : null; // null = include all (backward compat)

  for (const entry of entries) {
    const entryPath = join(SKILLS_DIR, entry);

    // Support both layouts:
    // - Directory: skills/{name}/SKILL.md (current)
    // - Flat file: skills/{name}.md (legacy)
    let skillName: string;
    let contentPath: string;

    if (statSync(entryPath).isDirectory()) {
      const skillMd = join(entryPath, 'SKILL.md');
      if (!existsSync(skillMd)) continue;
      skillName = entry;
      contentPath = skillMd;
    } else if (entry.endsWith('.md')) {
      skillName = entry.replace('.md', '');
      contentPath = entryPath;
    } else {
      continue;
    }

    if (allowedSkills && !allowedSkills.has(skillName)) {
      continue;
    }

    let content = readFileSync(contentPath, 'utf-8');

    if (content.includes(AGENT_PLACEHOLDER)) {
      content = content.replace(/YOUR_AGENT_core/g, `${config.id}_core`);
    }

    files.push([`skills/${skillName}/SKILL.md`, content]);
  }

  return files;
}
