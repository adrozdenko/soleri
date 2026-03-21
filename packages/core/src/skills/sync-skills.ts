/**
 * Skill sync — discovers SKILL.md files in agent skills directories
 * and copies them to ~/.claude/commands/ for Claude Code discovery.
 *
 * Injects agent branding so users know which agent owns the skill.
 * Called automatically at engine startup and by admin_setup_global.
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface SkillEntry {
  name: string;
  sourcePath: string;
}

export interface SyncResult {
  installed: string[];
  updated: string[];
  skipped: string[];
  failed: string[];
}

/** Discover skill files (SKILL.md) in skills directories */
export function discoverSkills(skillsDirs: string[]): SkillEntry[] {
  const skills: SkillEntry[] = [];

  for (const dir of skillsDirs) {
    if (!existsSync(dir)) continue;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillPath = join(dir, entry.name, 'SKILL.md');
      if (existsSync(skillPath)) {
        skills.push({ name: entry.name, sourcePath: skillPath });
      }
    }
  }

  return skills;
}

/** Inject agent branding after YAML frontmatter */
function brandSkillContent(content: string, agentName: string): string {
  // Find end of frontmatter (second ---)
  const fmEnd = content.indexOf('---', content.indexOf('---') + 3);
  if (fmEnd === -1) return content;

  const afterFm = fmEnd + 3;
  const before = content.slice(0, afterFm);
  const after = content.slice(afterFm);

  const brandLine = `\n\n> **${agentName}** skill\n`;
  return before + brandLine + after;
}

/**
 * Sync skills from agent directory to ~/.claude/commands/.
 * - New skills are installed with agent branding
 * - Changed skills are overwritten (compared by mtime)
 * - Missing source skills leave target untouched (other agents may own them)
 */
export function syncSkillsToClaudeCode(
  skillsDirs: string[],
  agentName?: string,
): SyncResult {
  const commandsDir = join(homedir(), '.claude', 'commands');
  const skills = discoverSkills(skillsDirs);
  const result: SyncResult = { installed: [], updated: [], skipped: [], failed: [] };

  if (skills.length === 0) return result;

  mkdirSync(commandsDir, { recursive: true });

  for (const skill of skills) {
    const targetPath = join(commandsDir, `${skill.name}.md`);
    try {
      const sourceContent = readFileSync(skill.sourcePath, 'utf-8');
      const branded = agentName ? brandSkillContent(sourceContent, agentName) : sourceContent;

      if (!existsSync(targetPath)) {
        writeFileSync(targetPath, branded);
        result.installed.push(skill.name);
      } else {
        const sourceMtime = statSync(skill.sourcePath).mtimeMs;
        const targetMtime = statSync(targetPath).mtimeMs;
        if (sourceMtime > targetMtime) {
          writeFileSync(targetPath, branded);
          result.updated.push(skill.name);
        } else {
          result.skipped.push(skill.name);
        }
      }
    } catch {
      result.failed.push(skill.name);
    }
  }

  return result;
}
