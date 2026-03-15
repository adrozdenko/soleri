/**
 * Skills installer for domain packs.
 *
 * Copies skill .md files from the pack to the agent's skills directory.
 * Does not overwrite existing skills unless force flag is set.
 */

import { existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { DomainPack } from './types.js';

export interface SkillsInstallResult {
  installed: number;
  skipped: number;
}

/**
 * Install skills from a domain pack.
 *
 * @param pack - The domain pack with skills
 * @param targetDir - Agent's skills directory
 * @param rootDir - Absolute path to the pack's root directory
 * @param force - Overwrite existing skills if true
 */
export function installSkills(
  pack: DomainPack,
  targetDir: string,
  rootDir: string,
  force = false,
): SkillsInstallResult {
  const result: SkillsInstallResult = { installed: 0, skipped: 0 };

  if (!pack.skills || pack.skills.length === 0) return result;

  mkdirSync(targetDir, { recursive: true });

  for (const skill of pack.skills) {
    const sourcePath = resolve(rootDir, skill.path);
    const targetPath = join(targetDir, `${skill.name}.md`);

    if (!existsSync(sourcePath)) {
      result.skipped++;
      continue;
    }

    if (existsSync(targetPath) && !force) {
      result.skipped++;
      continue;
    }

    copyFileSync(sourcePath, targetPath);
    result.installed++;
  }

  return result;
}
