/**
 * Skill sync — discovers SKILL.md files in agent skills directories
 * and copies them to ~/.claude/commands/ for Claude Code discovery.
 *
 * Called automatically at engine startup and by admin_setup_global.
 */

import { existsSync, readdirSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
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

/**
 * Sync skills from agent directory to ~/.claude/commands/.
 * - New skills are copied
 * - Changed skills are overwritten (compared by mtime)
 * - Missing source skills leave target untouched (other agents may own them)
 */
export function syncSkillsToClaudeCode(skillsDirs: string[]): SyncResult {
  const commandsDir = join(homedir(), '.claude', 'commands');
  const skills = discoverSkills(skillsDirs);
  const result: SyncResult = { installed: [], updated: [], skipped: [], failed: [] };

  if (skills.length === 0) return result;

  // Ensure commands dir exists
  mkdirSync(commandsDir, { recursive: true });

  for (const skill of skills) {
    const targetPath = join(commandsDir, `${skill.name}.md`);
    try {
      if (!existsSync(targetPath)) {
        // New skill — install
        copyFileSync(skill.sourcePath, targetPath);
        result.installed.push(skill.name);
      } else {
        // Existing — compare mtime, overwrite if source is newer
        const sourceMtime = statSync(skill.sourcePath).mtimeMs;
        const targetMtime = statSync(targetPath).mtimeMs;
        if (sourceMtime > targetMtime) {
          copyFileSync(skill.sourcePath, targetPath);
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
