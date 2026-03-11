/**
 * Unified pack CLI — install, list, remove, info, outdated for all pack types.
 *
 * Replaces separate `hooks add-pack`, `install-knowledge`, `skills install`
 * with a single `soleri pack` command family.
 *
 * Resolution order: local path → built-in → npm registry.
 */

import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import type { Command } from 'commander';
import * as p from '@clack/prompts';
import { PackLockfile, inferPackType, resolvePack, checkNpmVersion } from '@soleri/core';
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

function getBuiltinDirs(agentPath: string): string[] {
  const dirs: string[] = [];
  // Check for bundled packs in node_modules
  const nmPacks = join(agentPath, 'node_modules', '@soleri');
  if (existsSync(nmPacks)) {
    dirs.push(nmPacks);
  }
  return dirs;
}

export function registerPack(program: Command): void {
  const pack = program
    .command('pack')
    .description('Manage extension packs (hooks, skills, knowledge, domains)');

  // ─── list ──────────────────────────────────────────────────
  pack
    .command('list')
    .option('--type <type>', 'Filter by pack type (hooks, skills, knowledge, domain, bundle)')
    .description('List installed packs')
    .action((opts: { type?: string }) => {
      const lockfile = new PackLockfile(getLockfilePath());
      let entries = lockfile.list();

      if (opts.type) {
        entries = entries.filter((e) => e.type === opts.type);
      }

      if (entries.length === 0) {
        p.log.info('No packs installed.');
        return;
      }

      p.log.info(`${entries.length} pack(s) installed:\n`);
      for (const entry of entries) {
        const badge =
          entry.source === 'built-in' ? ' [built-in]' : entry.source === 'npm' ? ' [npm]' : '';
        console.log(`  ${entry.id}@${entry.version}  ${entry.type}${badge}`);
        if (entry.vaultEntries > 0) console.log(`    vault: ${entry.vaultEntries} entries`);
        if (entry.skills.length > 0) console.log(`    skills: ${entry.skills.join(', ')}`);
        if (entry.hooks.length > 0) console.log(`    hooks: ${entry.hooks.join(', ')}`);
      }
    });

  // ─── install ───────────────────────────────────────────────
  pack
    .command('install')
    .argument('<pack>', 'Pack name, path, or npm package')
    .option('--type <type>', 'Expected pack type (hooks, skills, knowledge, domain)')
    .option('--version <ver>', 'Specific version to install')
    .option('--frozen', 'Fail if pack is not in lockfile (CI mode)')
    .description('Install a pack from local path, built-in, or npm')
    .action(
      async (packName: string, opts: { type?: string; version?: string; frozen?: boolean }) => {
        const lockfilePath = getLockfilePath();
        const lockfile = new PackLockfile(lockfilePath);
        const ctx = detectAgent();
        if (!ctx) return;

        // Frozen mode — only install from lockfile
        if (opts.frozen) {
          const entry = lockfile.get(packName);
          if (!entry) {
            p.log.error(`Pack "${packName}" not in lockfile. Cannot install in frozen mode.`);
            process.exit(1);
          }
          p.log.info(`Frozen: ${entry.id}@${entry.version} (${entry.source})`);
          return;
        }

        // Check if already installed
        if (lockfile.has(packName)) {
          p.log.warn(
            `Pack "${packName}" is already installed. Use \`soleri pack update\` to upgrade.`,
          );
          return;
        }

        const s = p.spinner();
        s.start(`Resolving pack: ${packName}...`);

        try {
          const resolved = resolvePack(packName, {
            builtinDirs: getBuiltinDirs(ctx.agentPath),
            version: opts.version,
          });

          s.message(`Installing from ${resolved.source}...`);

          // Read manifest
          const manifestPath = join(resolved.directory, 'soleri-pack.json');
          if (!existsSync(manifestPath)) {
            s.stop('Install failed');
            p.log.error(`No soleri-pack.json found in ${resolved.directory}`);
            process.exit(1);
            return;
          }

          const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
          const packType = inferPackType(manifest);

          // Type check if specified
          if (opts.type && packType !== opts.type && packType !== 'bundle') {
            s.stop('Install failed');
            p.log.error(`Expected pack type "${opts.type}" but got "${packType}"`);
            process.exit(1);
            return;
          }

          // Count contents
          const vaultDir = join(resolved.directory, manifest.vault?.dir ?? 'vault');
          let vaultEntries = 0;
          if (existsSync(vaultDir)) {
            const { loadIntelligenceData } = await import('@soleri/core');
            const entries = loadIntelligenceData(vaultDir);
            vaultEntries = entries.length;
          }

          const skillsDir = join(resolved.directory, manifest.skills?.dir ?? 'skills');
          const skills = existsSync(skillsDir) ? listMdFiles(skillsDir) : [];

          const hooksDir = join(resolved.directory, manifest.hooks?.dir ?? 'hooks');
          const hooks = existsSync(hooksDir) ? listMdFiles(hooksDir) : [];

          // Create lock entry
          const entry: LockEntry = {
            id: manifest.id,
            version: manifest.version,
            type: packType,
            source: resolved.source as PackSource,
            directory: resolved.directory,
            integrity: PackLockfile.computeIntegrity(manifestPath),
            installedAt: new Date().toISOString(),
            vaultEntries,
            skills,
            hooks,
            facadesRegistered: (manifest.facades?.length ?? 0) > 0,
          };

          lockfile.set(entry);
          lockfile.save();

          s.stop(`Installed ${manifest.id}@${manifest.version} (${packType})`);

          const parts: string[] = [];
          if (vaultEntries > 0) parts.push(`${vaultEntries} vault entries`);
          if (skills.length > 0) parts.push(`${skills.length} skills`);
          if (hooks.length > 0) parts.push(`${hooks.length} hooks`);
          if (parts.length > 0) {
            p.log.info(`  Contents: ${parts.join(', ')}`);
          }
        } catch (err) {
          s.stop('Install failed');
          p.log.error(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
      },
    );

  // ─── remove ────────────────────────────────────────────────
  pack
    .command('remove')
    .argument('<packId>', 'Pack ID to remove')
    .description('Remove an installed pack')
    .action((packId: string) => {
      const lockfile = new PackLockfile(getLockfilePath());

      if (!lockfile.has(packId)) {
        p.log.error(`Pack "${packId}" is not installed.`);
        process.exit(1);
      }

      lockfile.remove(packId);
      lockfile.save();
      p.log.success(`Removed ${packId}`);
      p.log.info('Note: Vault entries from this pack are preserved in the knowledge base.');
    });

  // ─── info ──────────────────────────────────────────────────
  pack
    .command('info')
    .argument('<packId>', 'Pack ID')
    .description('Show detailed info about an installed pack')
    .action((packId: string) => {
      const lockfile = new PackLockfile(getLockfilePath());
      const entry = lockfile.get(packId);

      if (!entry) {
        p.log.error(`Pack "${packId}" is not installed.`);
        process.exit(1);
        return;
      }

      console.log(`\n  Pack:      ${entry.id}`);
      console.log(`  Version:   ${entry.version}`);
      console.log(`  Type:      ${entry.type}`);
      console.log(`  Source:    ${entry.source}`);
      console.log(`  Directory: ${entry.directory}`);
      console.log(`  Installed: ${entry.installedAt}`);
      console.log(`  Integrity: ${entry.integrity}`);
      if (entry.vaultEntries > 0) console.log(`  Vault:     ${entry.vaultEntries} entries`);
      if (entry.skills.length > 0) console.log(`  Skills:    ${entry.skills.join(', ')}`);
      if (entry.hooks.length > 0) console.log(`  Hooks:     ${entry.hooks.join(', ')}`);
      console.log('');
    });

  // ─── outdated ──────────────────────────────────────────────
  pack
    .command('outdated')
    .description('Check for packs with available updates on npm')
    .action(() => {
      const lockfile = new PackLockfile(getLockfilePath());
      const entries = lockfile.list().filter((e) => e.source === 'npm');

      if (entries.length === 0) {
        p.log.info('No npm-sourced packs installed.');
        return;
      }

      const s = p.spinner();
      s.start('Checking for updates...');

      const outdated: Array<{ id: string; current: string; latest: string }> = [];
      for (const entry of entries) {
        const npmPkg = entry.id.startsWith('@') ? entry.id : `@soleri/pack-${entry.id}`;
        const latest = checkNpmVersion(npmPkg);
        if (latest && latest !== entry.version) {
          outdated.push({ id: entry.id, current: entry.version, latest });
        }
      }

      s.stop(
        outdated.length > 0 ? `${outdated.length} update(s) available` : 'All packs up to date',
      );

      for (const item of outdated) {
        console.log(`  ${item.id}  ${item.current} → ${item.latest}`);
      }
    });

  // ─── update ─────────────────────────────────────────────────
  pack
    .command('update')
    .argument('[packId]', 'Specific pack to update (or all)')
    .option('--force', 'Force update even if version is incompatible')
    .description('Update installed packs to latest compatible version')
    .action((packId: string | undefined, _opts: { force?: boolean }) => {
      const lockfilePath = getLockfilePath();
      const lockfile = new PackLockfile(lockfilePath);
      const ctx = detectAgent();
      if (!ctx) return;

      let entries = lockfile.list().filter((e) => e.source === 'npm');
      if (packId) {
        entries = entries.filter((e) => e.id === packId);
        if (entries.length === 0) {
          p.log.error(
            lockfile.has(packId)
              ? `Pack "${packId}" is local/built-in and cannot be updated from npm.`
              : `Pack "${packId}" is not installed.`,
          );
          process.exit(1);
        }
      }

      if (entries.length === 0) {
        p.log.info('No npm-sourced packs to update.');
        return;
      }

      const s = p.spinner();
      s.start('Checking for updates...');

      let updated = 0;
      for (const entry of entries) {
        const npmPkg = entry.id.startsWith('@') ? entry.id : `@soleri/pack-${entry.id}`;
        const latest = checkNpmVersion(npmPkg);
        if (!latest || latest === entry.version) continue;

        // Update lockfile entry with new version
        lockfile.set({ ...entry, version: latest, installedAt: new Date().toISOString() });
        updated++;
        p.log.info(`  ${entry.id}: ${entry.version} → ${latest}`);
      }

      if (updated > 0) {
        lockfile.save();
        s.stop(`Updated ${updated} pack(s)`);
      } else {
        s.stop('All packs up to date');
      }
    });

  // ─── search ─────────────────────────────────────────────────
  pack
    .command('search')
    .argument('<query>', 'Search term')
    .option('--type <type>', 'Filter by pack type')
    .description('Search for packs on the npm registry')
    .action((query: string) => {
      const s = p.spinner();
      s.start(`Searching npm for "${query}"...`);

      try {
        const { execFileSync } = require('node:child_process');
        const searchTerm = `soleri-pack-${query}`;
        const result = execFileSync('npm', ['search', searchTerm, '--json'], {
          encoding: 'utf-8',
          timeout: 15_000,
        });

        const packages = JSON.parse(result || '[]');
        const filtered = packages.filter(
          (pkg: { name: string }) =>
            pkg.name.includes('soleri-pack') || pkg.name.startsWith('@soleri/pack-'),
        );

        s.stop(filtered.length > 0 ? `Found ${filtered.length} pack(s)` : 'No packs found');

        for (const pkg of filtered) {
          console.log(`  ${pkg.name}@${pkg.version}  ${pkg.description || ''}`);
        }
      } catch {
        s.stop('Search failed');
        p.log.warn('Could not search npm registry. Check your network connection.');
      }
    });
}

// ─── Helpers ──────────────────────────────────────────────────────────

function listMdFiles(dir: string): string[] {
  try {
    const { readdirSync } = require('node:fs');
    const { basename } = require('node:path');
    return readdirSync(dir)
      .filter((f: string) => f.endsWith('.md'))
      .map((f: string) => basename(f, '.md'));
  } catch {
    return [];
  }
}
