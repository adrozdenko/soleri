/**
 * Unified pack CLI — install, list, remove, info, outdated for all pack types.
 *
 * Replaces separate `hooks add-pack`, `install-knowledge`, `skills install`
 * with a single `soleri pack` command family.
 *
 * Resolution order: local path → built-in → npm registry.
 */

import { join, resolve as pathResolve } from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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

  // ─── available ─────────────────────────────────────────────
  pack
    .command('available')
    .option('--dir <path>', 'Custom packs directory to scan')
    .description('List available knowledge packs (built-in starter and community)')
    .action((opts: { dir?: string }) => {
      const searchDirs: string[] = [];
      if (opts.dir) {
        searchDirs.push(pathResolve(opts.dir));
      } else {
        const candidates = [
          join(process.cwd(), 'knowledge-packs'),
          pathResolve(import.meta.dirname ?? '.', '..', '..', '..', '..', '..', 'knowledge-packs'),
        ];
        for (const c of candidates) {
          if (existsSync(c)) searchDirs.push(c);
        }
      }

      if (searchDirs.length === 0) {
        p.log.info('No knowledge-packs directory found. Use --dir to specify a path.');
        return;
      }

      let total = 0;
      for (const baseDir of searchDirs) {
        const categories = readdirSync(baseDir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name);

        for (const category of categories) {
          const categoryDir = join(baseDir, category);
          const packs = readdirSync(categoryDir, { withFileTypes: true }).filter(
            (d) => d.isDirectory() && existsSync(join(categoryDir, d.name, 'soleri-pack.json')),
          );

          if (packs.length === 0) continue;

          console.log(`\n  ${category}/`);
          for (const pk of packs) {
            try {
              const manifest = JSON.parse(
                readFileSync(join(categoryDir, pk.name, 'soleri-pack.json'), 'utf-8'),
              );
              const domains = (manifest.domains as string[])?.join(', ') || '—';
              console.log(`    ${manifest.id}@${manifest.version}  ${manifest.description || ''}`);
              console.log(`      domains: ${domains}`);
              total++;
            } catch {
              // skip malformed packs
            }
          }
        }
      }

      if (total === 0) {
        p.log.info('No packs found.');
      } else {
        console.log(`\n  ${total} pack(s) available.\n`);
      }
    });

  // ─── create ─────────────────────────────────────────────────
  pack
    .command('create')
    .description('Scaffold a new pack project')
    .action(async () => {
      const name = await p.text({ message: 'Pack name:', placeholder: 'my-react-patterns' });
      if (p.isCancel(name) || !name) return;

      const packType = await p.select({
        message: 'Pack type:',
        options: [
          { value: 'knowledge', label: 'Knowledge — vault entries, patterns, anti-patterns' },
          { value: 'skills', label: 'Skills — workflow skill files' },
          { value: 'hooks', label: 'Hooks — editor hook files' },
          { value: 'bundle', label: 'Bundle — multiple content types' },
        ],
      });
      if (p.isCancel(packType)) return;

      const description = await p.text({
        message: 'Description:',
        placeholder: 'Patterns for React hooks and state management',
      });
      if (p.isCancel(description)) return;

      const author = await p.text({ message: 'Author:', placeholder: '@username' });
      if (p.isCancel(author)) return;

      const dir = join(process.cwd(), String(name));
      const { mkdirSync, writeFileSync } = require('node:fs');

      mkdirSync(dir, { recursive: true });

      // Scaffold manifest
      const manifest: Record<string, unknown> = {
        id: name,
        version: '1.0.0',
        description: description || '',
        author: author || '',
        license: 'MIT',
        soleri: '>=2.0.0',
      };

      // Scaffold content directories based on type
      if (packType === 'knowledge' || packType === 'bundle') {
        const vaultDir = join(dir, 'vault');
        mkdirSync(vaultDir, { recursive: true });
        writeFileSync(join(vaultDir, 'patterns.json'), JSON.stringify([], null, 2) + '\n', 'utf-8');
        manifest.vault = { dir: 'vault' };
      }

      if (packType === 'skills' || packType === 'bundle') {
        const skillsDir = join(dir, 'skills');
        mkdirSync(skillsDir, { recursive: true });
        writeFileSync(
          join(skillsDir, 'example.md'),
          `# Example Skill\n\nReplace this with your skill content.\n`,
          'utf-8',
        );
        manifest.skills = { dir: 'skills' };
      }

      if (packType === 'hooks' || packType === 'bundle') {
        const hooksDir = join(dir, 'hooks');
        mkdirSync(hooksDir, { recursive: true });
        writeFileSync(
          join(hooksDir, 'example.md'),
          `# Example Hook\n\nReplace this with your hook content.\n`,
          'utf-8',
        );
        manifest.hooks = { dir: 'hooks' };
      }

      writeFileSync(
        join(dir, 'soleri-pack.json'),
        JSON.stringify(manifest, null, 2) + '\n',
        'utf-8',
      );

      p.log.success(`Created ${name}/`);
      p.log.info(`  soleri-pack.json`);
      if (manifest.vault) p.log.info(`  vault/patterns.json`);
      if (manifest.skills) p.log.info(`  skills/example.md`);
      if (manifest.hooks) p.log.info(`  hooks/example.md`);
      p.log.info(`\nNext: edit content, then \`soleri pack validate ${name}/\``);
    });

  // ─── validate ───────────────────────────────────────────────
  pack
    .command('validate')
    .argument('<path>', 'Path to pack directory')
    .description('Validate a pack before publishing')
    .action((packPath: string) => {
      const { resolve } = require('node:path');
      const dir = resolve(packPath);
      const errors: string[] = [];
      const warnings: string[] = [];

      // Check manifest exists
      const manifestPath = join(dir, 'soleri-pack.json');
      if (!existsSync(manifestPath)) {
        p.log.error(`No soleri-pack.json found at ${dir}`);
        process.exit(1);
      }

      let manifest: Record<string, unknown>;
      try {
        manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      } catch {
        p.log.error('Invalid JSON in soleri-pack.json');
        process.exit(1);
        return;
      }

      // Required fields
      if (!manifest.id || typeof manifest.id !== 'string')
        errors.push('Missing or invalid "id" field');
      if (!manifest.version || typeof manifest.version !== 'string')
        errors.push('Missing or invalid "version" field');
      if (manifest.version && !/^\d+\.\d+\.\d+/.test(manifest.version as string))
        errors.push('Version must be valid semver (e.g., 1.0.0)');
      if (!manifest.soleri) warnings.push('Missing "soleri" compatibility range');

      // Naming convention
      const id = manifest.id as string;
      if (id && !id.match(/^[@a-z0-9][\w./-]*$/i)) {
        errors.push(`Pack id "${id}" contains invalid characters`);
      }

      // Content directories exist
      const packType = inferPackType(
        manifest as { vault?: unknown; skills?: unknown; hooks?: unknown },
      );
      if (manifest.vault) {
        const vaultDir = join(dir, (manifest.vault as { dir?: string }).dir || 'vault');
        if (!existsSync(vaultDir)) errors.push(`Vault directory not found: ${vaultDir}`);
      }
      if (manifest.skills) {
        const skillsDir = join(dir, (manifest.skills as { dir?: string }).dir || 'skills');
        if (!existsSync(skillsDir)) errors.push(`Skills directory not found: ${skillsDir}`);
      }
      if (manifest.hooks) {
        const hooksDir = join(dir, (manifest.hooks as { dir?: string }).dir || 'hooks');
        if (!existsSync(hooksDir)) errors.push(`Hooks directory not found: ${hooksDir}`);
      }

      // Report
      if (errors.length > 0) {
        p.log.error(`Validation failed (${errors.length} error(s)):`);
        for (const err of errors) console.log(`  ✗ ${err}`);
        if (warnings.length > 0) {
          for (const warn of warnings) console.log(`  ⚠ ${warn}`);
        }
        process.exit(1);
      }

      if (warnings.length > 0) {
        for (const warn of warnings) p.log.warn(warn);
      }

      p.log.success(`Pack "${id}" v${manifest.version} (${packType}) is valid`);
    });

  // ─── publish ────────────────────────────────────────────────
  pack
    .command('publish')
    .argument('[path]', 'Path to pack directory', '.')
    .option('--dry-run', 'Show what would be published without publishing')
    .description('Publish pack to npm registry')
    .action((packPath: string, opts: { dryRun?: boolean }) => {
      const { resolve } = require('node:path');
      const { execFileSync } = require('node:child_process');
      const dir = resolve(packPath);

      // Validate first
      const manifestPath = join(dir, 'soleri-pack.json');
      if (!existsSync(manifestPath)) {
        p.log.error(`No soleri-pack.json found at ${dir}`);
        process.exit(1);
      }

      // Check for package.json (needed for npm publish)
      const pkgPath = join(dir, 'package.json');
      if (!existsSync(pkgPath)) {
        // Auto-generate from manifest
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        const pkg = {
          name: manifest.id.startsWith('@') ? manifest.id : `soleri-pack-${manifest.id}`,
          version: manifest.version,
          description: manifest.description || '',
          keywords: ['soleri', 'soleri-pack', manifest.type || 'knowledge'].filter(Boolean),
          files: ['soleri-pack.json', 'vault', 'skills', 'hooks'].filter((f) =>
            existsSync(join(dir, f)),
          ),
        };
        const { writeFileSync } = require('node:fs');
        writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
        p.log.info('Generated package.json from manifest');
      }

      const s = p.spinner();
      s.start(opts.dryRun ? 'Dry run...' : 'Publishing to npm...');

      try {
        const args = ['publish', dir, '--access', 'public'];
        if (opts.dryRun) args.push('--dry-run');
        execFileSync('npm', args, { stdio: 'pipe', timeout: 60_000 });
        s.stop(opts.dryRun ? 'Dry run complete' : 'Published successfully');
      } catch (err) {
        s.stop('Publish failed');
        p.log.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
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
