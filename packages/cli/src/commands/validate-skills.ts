/**
 * `soleri validate-skills` — validate user-installed SKILL.md op-call examples
 * against the engine's actual Zod schemas.
 *
 * Scans ~/.claude/skills/ for SKILL.md files, extracts inline op-call examples,
 * and checks each example's params against the corresponding facade schema.
 * Exits with code 1 if any mismatches are found.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Command } from 'commander';
import { validateSkillDocs } from '@soleri/core/skills/validate-skills';
import * as log from '../utils/logger.js';

const DEFAULT_SKILLS_DIR = join(homedir(), '.claude', 'skills');

export function registerValidateSkills(program: Command): void {
  program
    .command('validate-skills')
    .description('Validate SKILL.md op-call examples against engine Zod schemas')
    .option('--skills-dir <path>', 'Path to skills directory', DEFAULT_SKILLS_DIR)
    .action((opts: { skillsDir: string }) => {
      const skillsDir = opts.skillsDir;

      log.heading('Soleri Validate Skills');
      log.dim(`Scanning: ${skillsDir}`);
      console.log();

      const result = validateSkillDocs(skillsDir);

      log.dim(`Schema registry: ${result.registrySize} ops`);
      log.dim(`Skill files:     ${result.totalFiles}`);
      log.dim(`Op examples:     ${result.totalExamples}`);
      console.log();

      if (result.totalFiles === 0) {
        log.warn('No SKILL.md files found', skillsDir);
        return;
      }

      if (result.valid) {
        log.pass('All examples validate against their schemas.');
        return;
      }

      log.fail(`Found ${result.errors.length} validation error(s):`);
      console.log();

      for (const err of result.errors) {
        const location = err.line ? `:${err.line}` : '';
        console.log(`  ERROR ${err.file}${location} — op:${err.op}: ${err.message}`);
      }

      console.log();
      process.exit(1);
    });
}
