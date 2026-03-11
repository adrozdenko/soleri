/**
 * Skills CLI — convenience aliases for `soleri pack --type skills`.
 *
 * Provides `soleri skills list|install|remove|info` as thin wrappers
 * around the unified pack system.
 */

import { join } from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import type { Command } from 'commander';
import * as p from '@clack/prompts';
import { PackLockfile, inferPackType, resolvePack } from '@soleri/core';
import type { LockEntry, PackSource } from '@soleri/core';
import { detectAgent } from '../utils/agent-context.js';

const LOCKFILE_NAME = 'soleri.lock';

function getLockfilePath(): string {
  const ctx = detectAgent();
  if (!ctx) {
    p.log.error('No agent project detected in current directory.');
    process.exit(1);
  }
  return join(ctx.agentPath, LOCKFILE_NAME);
}

export function registerSkills(program: Command): void {
  const skills = program
    .command('skills')
    .description('Manage skill packs (alias for pack --type skills)');

  // ─── list ──────────────────────────────────────────────────
  skills
    .command('list')
    .description('List installed skill packs')
    .action(() => {
      const lockfile = new PackLockfile(getLockfilePath());
      const entries = lockfile.list().filter((e) => e.type === 'skills' || e.type === 'bundle');

      if (entries.length === 0) {
        p.log.info('No skill packs installed.');
        return;
      }

      p.log.info(`${entries.length} skill pack(s) installed:\n`);
      for (const entry of entries) {
        const badge =
          entry.source === 'built-in' ? ' [built-in]' : entry.source === 'npm' ? ' [npm]' : '';
        console.log(`  ${entry.id}@${entry.version}${badge}`);
        if (entry.skills.length > 0) console.log(`    skills: ${entry.skills.join(', ')}`);
      }
    });

  // ─── install ───────────────────────────────────────────────
  skills
    .command('install')
    .argument('<pack>', 'Skill pack name, path, or npm package')
    .option('--version <ver>', 'Specific version to install')
    .description('Install a skill pack')
    .action(async (packName: string, opts: { version?: string }) => {
      const lockfilePath = getLockfilePath();
      const lockfile = new PackLockfile(lockfilePath);
      const ctx = detectAgent();
      if (!ctx) return;

      if (lockfile.has(packName)) {
        p.log.warn(`Pack "${packName}" is already installed.`);
        return;
      }

      const s = p.spinner();
      s.start(`Resolving skill pack: ${packName}...`);

      try {
        const resolved = resolvePack(packName, {
          builtinDirs: getBuiltinDirs(ctx.agentPath),
          version: opts.version,
        });

        const manifestPath = join(resolved.directory, 'soleri-pack.json');
        if (!existsSync(manifestPath)) {
          s.stop('Install failed');
          p.log.error(`No soleri-pack.json found in ${resolved.directory}`);
          process.exit(1);
          return;
        }

        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        const packType = inferPackType(manifest);

        if (packType !== 'skills' && packType !== 'bundle') {
          s.stop('Install failed');
          p.log.error(`Pack "${packName}" is type "${packType}", not a skill pack.`);
          process.exit(1);
          return;
        }

        const skillsDir = join(resolved.directory, manifest.skills?.dir ?? 'skills');
        const skillsList = existsSync(skillsDir) ? listMdFiles(skillsDir) : [];

        const entry: LockEntry = {
          id: manifest.id,
          version: manifest.version,
          type: packType,
          source: resolved.source as PackSource,
          directory: resolved.directory,
          integrity: PackLockfile.computeIntegrity(manifestPath),
          installedAt: new Date().toISOString(),
          vaultEntries: 0,
          skills: skillsList,
          hooks: [],
          facadesRegistered: false,
        };

        lockfile.set(entry);
        lockfile.save();

        s.stop(`Installed ${manifest.id}@${manifest.version}`);
        if (skillsList.length > 0) {
          p.log.info(`  Skills: ${skillsList.join(', ')}`);
        }
      } catch (err) {
        s.stop('Install failed');
        p.log.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // ─── remove ────────────────────────────────────────────────
  skills
    .command('remove')
    .argument('<packId>', 'Skill pack ID to remove')
    .description('Remove a skill pack')
    .action((packId: string) => {
      const lockfile = new PackLockfile(getLockfilePath());

      if (!lockfile.has(packId)) {
        p.log.error(`Skill pack "${packId}" is not installed.`);
        process.exit(1);
      }

      lockfile.remove(packId);
      lockfile.save();
      p.log.success(`Removed ${packId}`);
    });

  // ─── info ──────────────────────────────────────────────────
  skills
    .command('info')
    .argument('<packId>', 'Skill pack ID')
    .description('Show info about a skill pack')
    .action((packId: string) => {
      const lockfile = new PackLockfile(getLockfilePath());
      const entry = lockfile.get(packId);

      if (!entry) {
        p.log.error(`Skill pack "${packId}" is not installed.`);
        process.exit(1);
        return;
      }

      console.log(`\n  Pack:      ${entry.id}`);
      console.log(`  Version:   ${entry.version}`);
      console.log(`  Source:    ${entry.source}`);
      console.log(`  Installed: ${entry.installedAt}`);
      if (entry.skills.length > 0) console.log(`  Skills:    ${entry.skills.join(', ')}`);
      console.log('');
    });
}

// ─── Helpers ──────────────────────────────────────────────────────────

function getBuiltinDirs(agentPath: string): string[] {
  const dirs: string[] = [];
  const nmPacks = join(agentPath, 'node_modules', '@soleri');
  if (existsSync(nmPacks)) {
    dirs.push(nmPacks);
  }
  return dirs;
}

function listMdFiles(dir: string): string[] {
  try {
    const { basename } = require('node:path');
    return readdirSync(dir)
      .filter((f: string) => f.endsWith('.md'))
      .map((f: string) => basename(f, '.md'));
  } catch {
    return [];
  }
}
