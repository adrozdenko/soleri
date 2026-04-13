import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import * as p from '@clack/prompts';
import { parse as parseYaml } from 'yaml';
import { AgentYamlSchema } from '@soleri/forge/lib';
import { detectAgent } from '../utils/agent-context.js';

/**
 * Run validation checks for a file-tree agent (no vitest needed).
 * Returns the process exit code (0 = all passed, 1 = failures).
 */
function runFiletreeChecks(agentPath: string, _agentId: string): number {
  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  // ── 1. agent.yaml validation ───────────────────────
  const yamlPath = join(agentPath, 'agent.yaml');
  try {
    const raw = readFileSync(yamlPath, 'utf-8');
    const parsed = parseYaml(raw);
    const result = AgentYamlSchema.safeParse(parsed);
    if (result.success) {
      p.log.success('agent.yaml — valid');
      passed++;
    } else {
      const issues = result.error.issues
        .map((i: { path: PropertyKey[]; message: string }) => `  ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      p.log.error(`agent.yaml — validation failed\n${issues}`);
      failures.push('agent.yaml validation');
      failed++;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    p.log.error(`agent.yaml — could not read or parse: ${msg}`);
    failures.push('agent.yaml read/parse');
    failed++;
  }

  // ── 2. Skills syntax check ─────────────────────────
  const skillsDir = join(agentPath, 'skills');
  if (existsSync(skillsDir)) {
    let validSkills = 0;
    let invalidSkills = 0;
    const invalidNames: string[] = [];

    try {
      const entries = readdirSync(skillsDir, { withFileTypes: true });
      const skillDirs = entries.filter((e) => e.isDirectory());

      for (const dir of skillDirs) {
        const skillMd = join(skillsDir, dir.name, 'SKILL.md');
        if (!existsSync(skillMd)) {
          invalidSkills++;
          invalidNames.push(`${dir.name}: missing SKILL.md`);
          continue;
        }

        try {
          const content = readFileSync(skillMd, 'utf-8');
          const hasFrontmatter = content.startsWith('---');
          const hasName = /^name:/m.test(content);
          const hasDescription = /^description:/m.test(content);

          if (hasFrontmatter && hasName && hasDescription) {
            validSkills++;
          } else {
            invalidSkills++;
            const missing: string[] = [];
            if (!hasFrontmatter) missing.push('frontmatter (---)');
            if (!hasName) missing.push('name:');
            if (!hasDescription) missing.push('description:');
            invalidNames.push(`${dir.name}: missing ${missing.join(', ')}`);
          }
        } catch {
          invalidSkills++;
          invalidNames.push(`${dir.name}: could not read SKILL.md`);
        }
      }

      if (invalidSkills === 0) {
        p.log.success(`skills — ${validSkills} valid, 0 invalid`);
        passed++;
      } else {
        const details = invalidNames.map((n) => `  ${n}`).join('\n');
        p.log.error(`skills — ${validSkills} valid, ${invalidSkills} invalid\n${details}`);
        failures.push('skills syntax');
        failed++;
      }
    } catch {
      p.log.warn('skills — could not read skills/ directory');
      // Not a failure — directory exists but unreadable is unusual, warn only
    }
  } else {
    p.log.info('skills — no skills/ directory (skipped)');
  }

  // ── 3. Instructions check ──────────────────────────
  const instructionsDir = join(agentPath, 'instructions');
  if (existsSync(instructionsDir)) {
    try {
      const files = readdirSync(instructionsDir).filter((f) => f.endsWith('.md'));
      if (files.length > 0) {
        p.log.success(`instructions — ${files.length} .md file(s) found`);
        passed++;
      } else {
        p.log.error('instructions — directory exists but contains no .md files');
        failures.push('instructions empty');
        failed++;
      }
    } catch {
      p.log.error('instructions — could not read directory');
      failures.push('instructions read');
      failed++;
    }
  } else {
    p.log.error('instructions — directory not found');
    failures.push('instructions missing');
    failed++;
  }

  // ── Summary ────────────────────────────────────────
  if (failed === 0) {
    p.log.success(`\n${passed} check(s) passed, 0 failed`);
  } else {
    p.log.error(
      `\n${passed} check(s) passed, ${failed} failed:\n${failures.map((f) => `  - ${f}`).join('\n')}`,
    );
  }

  return failed > 0 ? 1 : 0;
}

export function registerTest(program: Command): void {
  program
    .command('test')
    .description('Run agent tests via vitest')
    .option('-w, --watch', 'Run in watch mode')
    .option('--coverage', 'Run with coverage')
    .allowUnknownOption(true)
    .action((opts: { watch?: boolean; coverage?: boolean }, cmd) => {
      const ctx = detectAgent();
      if (!ctx) {
        p.log.error('No agent project detected in current directory. Run this from an agent root.');
        process.exit(1);
      }

      p.log.info(`Running tests for ${ctx.agentId}...`);

      // ── File-tree agents: run validation checks (no vitest) ──
      if (ctx.format === 'filetree') {
        const code = runFiletreeChecks(ctx.agentPath, ctx.agentId);
        process.exit(code);
        return;
      }

      // ── TypeScript agents: spawn vitest as before ──
      const args: string[] = [];
      if (opts.watch) {
        // vitest (no "run") enables watch mode
        args.push('vitest');
      } else {
        args.push('vitest', 'run');
      }
      if (opts.coverage) args.push('--coverage');

      // Forward any extra args the user passed
      const extra = cmd.args as string[];
      if (extra.length > 0) args.push(...extra);

      const child = spawn('npx', args, {
        cwd: ctx.agentPath,
        stdio: 'inherit',
        env: { ...process.env },
      });

      child.on('error', (err) => {
        p.log.error(`Failed to start: ${err.message}`);
        p.log.info('Make sure vitest is available: npm install -D vitest');
        process.exit(1);
      });

      child.on('exit', (code, signal) => {
        if (signal) {
          p.log.warn(`Process terminated by signal ${signal}`);
          process.exit(1);
        }
        process.exit(code ?? 0);
      });
    });
}
