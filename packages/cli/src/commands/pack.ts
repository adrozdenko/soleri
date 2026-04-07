/**
 * Unified pack CLI — install, list, remove, info, outdated for all pack types.
 *
 * Replaces separate `hooks add-pack`, `install-knowledge`, `skills install`
 * with a single `soleri pack` command family.
 *
 * Resolution order: local path → built-in → npm registry.
 */

import { join, resolve as pathResolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import type { Command } from 'commander';
import * as p from '@clack/prompts';
import {
  PackLockfile,
  inferPackType,
  resolvePack,
  checkNpmVersion,
  getBuiltinKnowledgePacksDirs,
  LLMClient,
  KeyPool,
  loadKeyPoolConfig,
  Vault,
  SOLERI_HOME,
} from '@soleri/core';
import type { LockEntry, PackSource } from '@soleri/core';
import { resolveVaultDbPath } from '../utils/vault-db.js';

// ─── Tier display helpers ────────────────────────────────────────────

const TIER_BADGES: Record<string, string> = {
  default: '[default]',
  community: '[community]',
  premium: '[premium]',
};

function tierBadge(tier?: string): string {
  return TIER_BADGES[tier ?? 'community'] ?? '[community]';
}
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
    .option('--tier <tier>', 'Filter by tier (default, community, premium)')
    .description('List installed packs')
    .action((opts: { type?: string; tier?: string }) => {
      const lockfile = new PackLockfile(getLockfilePath());
      let entries = lockfile.list();

      if (opts.type) {
        entries = entries.filter((e) => e.type === opts.type);
      }
      if (opts.tier) {
        entries = entries.filter((e) => (e.tier ?? 'community') === opts.tier);
      }

      if (entries.length === 0) {
        p.log.info('No packs installed.');
        return;
      }

      p.log.info(`${entries.length} pack(s) installed:\n`);
      for (const entry of entries) {
        const source =
          entry.source === 'built-in' ? ' [built-in]' : entry.source === 'npm' ? ' [npm]' : '';
        const tier = ` ${tierBadge(entry.tier)}`;
        console.log(`  ${entry.id}@${entry.version}  ${entry.type}${tier}${source}`);
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
            tier: manifest.tier ?? 'community',
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

      const tierLabel = entry.tier ?? 'community';
      const tierNote =
        tierLabel === 'premium' ? ' (currently unlocked — premium platform coming soon)' : '';

      console.log(`\n  Pack:      ${entry.id}`);
      console.log(`  Version:   ${entry.version}`);
      console.log(`  Type:      ${entry.type}`);
      console.log(`  Tier:      ${tierLabel}${tierNote}`);
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
    .option('--check', 'Show outdated packs without updating (dry run)')
    .option('--force', 'Force update even if version is incompatible')
    .description('Update installed packs to latest compatible version')
    .action((packId: string | undefined, opts: { check?: boolean; force?: boolean }) => {
      const lockfilePath = getLockfilePath();
      const lockfile = new PackLockfile(lockfilePath);
      const ctx = detectAgent();
      if (!ctx) return;

      const allEntries = lockfile.list();

      if (allEntries.length === 0) {
        p.log.info('No packs installed.');
        return;
      }

      let entries = allEntries.filter((e) => e.source === 'npm');
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

      // Note any local/built-in packs that are skipped
      const skippedLocal = allEntries.filter((e) => e.source !== 'npm');
      if (!packId && skippedLocal.length > 0) {
        for (const entry of skippedLocal) {
          p.log.info(`Skipping ${entry.id} (${entry.source} pack, not updatable from npm)`);
        }
      }

      if (entries.length === 0) {
        p.log.info('No npm-sourced packs to update.');
        return;
      }

      const s = p.spinner();
      s.start('Checking for updates...');

      const outdated: Array<{ id: string; current: string; latest: string }> = [];
      const errors: Array<{ id: string; error: string }> = [];

      for (const entry of entries) {
        const npmPkg = entry.id.startsWith('@') ? entry.id : `@soleri/pack-${entry.id}`;
        try {
          const latest = checkNpmVersion(npmPkg);
          if (!latest) {
            errors.push({ id: entry.id, error: 'could not reach registry' });
            continue;
          }
          if (latest !== entry.version) {
            outdated.push({ id: entry.id, current: entry.version, latest });
          }
        } catch {
          errors.push({ id: entry.id, error: 'registry check failed' });
        }
      }

      s.stop(outdated.length > 0 ? `${outdated.length} update(s) available` : 'Check complete');

      // Show errors for packs we couldn't reach
      for (const err of errors) {
        p.log.warn(`${err.id}: ${err.error}`);
      }

      if (outdated.length === 0) {
        p.log.success('All packs are up to date.');
        return;
      }

      // Display table
      const nameWidth = Math.max(4, ...outdated.map((o) => o.id.length));
      const curWidth = Math.max(7, ...outdated.map((o) => o.current.length));
      const latWidth = Math.max(6, ...outdated.map((o) => o.latest.length));

      console.log('');
      console.log(
        `  ${'Pack'.padEnd(nameWidth)}  ${'Current'.padEnd(curWidth)}  ${'Latest'.padEnd(latWidth)}`,
      );
      for (const item of outdated) {
        console.log(
          `  ${item.id.padEnd(nameWidth)}  ${item.current.padEnd(curWidth)}  ${item.latest.padEnd(latWidth)}`,
        );
      }
      console.log('');

      if (opts.check) {
        p.log.info(`${outdated.length} pack(s) outdated. Run without --check to update.`);
        return;
      }

      // Perform the actual update
      let updated = 0;
      for (const item of outdated) {
        const entry = lockfile.get(item.id);
        if (!entry) continue;
        lockfile.set({
          ...entry,
          version: item.latest,
          installedAt: new Date().toISOString(),
        });
        updated++;
      }

      if (updated > 0) {
        lockfile.save();
        p.log.success(`Updated ${updated} pack(s).`);
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
          ...getBuiltinKnowledgePacksDirs(),
        ];
        const seen = new Set<string>();
        for (const c of candidates) {
          if (existsSync(c) && !seen.has(c)) {
            searchDirs.push(c);
            seen.add(c);
          }
        }
      }

      if (searchDirs.length === 0) {
        p.log.info('No knowledge-packs directory found. Use --dir to specify a path.');
        return;
      }

      // Collect all packs with their tier
      const allPacks: Array<{
        id: string;
        version: string;
        description: string;
        domains: string;
        tier: string;
        category: string;
      }> = [];

      for (const baseDir of searchDirs) {
        const categories = readdirSync(baseDir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name);

        for (const category of categories) {
          const categoryDir = join(baseDir, category);
          const packs = readdirSync(categoryDir, { withFileTypes: true }).filter(
            (d) => d.isDirectory() && existsSync(join(categoryDir, d.name, 'soleri-pack.json')),
          );

          for (const pk of packs) {
            try {
              const manifest = JSON.parse(
                readFileSync(join(categoryDir, pk.name, 'soleri-pack.json'), 'utf-8'),
              );
              allPacks.push({
                id: manifest.id,
                version: manifest.version,
                description: manifest.description || '',
                domains: (manifest.domains as string[])?.join(', ') || '—',
                tier: manifest.tier ?? 'community',
                category,
              });
            } catch {
              // skip malformed packs
            }
          }
        }
      }

      if (allPacks.length === 0) {
        p.log.info('No packs found.');
        return;
      }

      // Group by tier and display
      const tierOrder: Array<{ key: string; label: string }> = [
        { key: 'default', label: 'Default (included with Soleri)' },
        { key: 'community', label: 'Community (free)' },
        { key: 'premium', label: 'Premium (included — premium platform coming soon)' },
      ];

      for (const { key, label } of tierOrder) {
        const tierPacks = allPacks.filter((pk) => pk.tier === key);
        if (tierPacks.length === 0) continue;

        console.log(`\n  ${label}`);
        console.log(`  ${'─'.repeat(label.length)}`);
        for (const pk of tierPacks) {
          console.log(`    ${pk.id}@${pk.version}  ${pk.description}`);
          console.log(`      domains: ${pk.domains}`);
        }
      }

      console.log(`\n  ${allPacks.length} pack(s) available.\n`);
    });

  // ─── registry ──────────────────────────────────────────────
  pack
    .command('registry')
    .description('List packs from the Soleri pack registry')
    .option('--type <type>', 'Filter by pack type (domain, knowledge, hooks, skills)')
    .action((opts: { type?: string }) => {
      let registryPath = join(import.meta.dirname ?? '.', '..', '..', 'data', 'pack-registry.json');

      if (!existsSync(registryPath)) {
        // Fallback: try from dist/
        registryPath = join(import.meta.dirname ?? '.', '..', 'data', 'pack-registry.json');
      }

      if (!existsSync(registryPath)) {
        p.log.error('Pack registry not found.');
        return;
      }

      try {
        const registry = JSON.parse(readFileSync(registryPath, 'utf-8'));
        let packs = registry.packs ?? [];

        if (opts.type) {
          packs = packs.filter((pk: { type?: string }) => pk.type === opts.type);
        }

        if (packs.length === 0) {
          p.log.info('No packs found in registry.');
          return;
        }

        console.log(`\n  Soleri Pack Registry (${packs.length} packs)\n`);
        for (const pk of packs) {
          console.log(`  ${pk.package}@${pk.version}  [${pk.type}]`);
          console.log(`    ${pk.description}`);
          if (pk.repo) console.log(`    ${pk.repo}`);
          console.log();
        }

        console.log(`  Install: npm install <package-name>\n`);
      } catch {
        p.log.error('Failed to read pack registry.');
      }
    });

  // ─── add ──────────────────────────────────────────────────
  pack
    .command('add')
    .argument('<name>', 'Pack name from registry (e.g., domain-design)')
    .description('Install a pack from the registry (convenience for npm install)')
    .action((name: string) => {
      let registryPath = join(import.meta.dirname ?? '.', '..', '..', 'data', 'pack-registry.json');
      if (!existsSync(registryPath)) {
        registryPath = join(import.meta.dirname ?? '.', '..', 'data', 'pack-registry.json');
      }

      let npmPackage = name;

      if (existsSync(registryPath)) {
        try {
          const registry = JSON.parse(readFileSync(registryPath, 'utf-8'));
          const entry = (registry.packs ?? []).find(
            (pk: { name: string; package: string }) => pk.name === name || pk.package === name,
          );
          if (entry) {
            npmPackage = entry.package;
          }
        } catch {
          // Fall through — use name as-is
        }
      }

      const s = p.spinner();
      s.start(`Installing ${npmPackage}...`);

      try {
        const { execFileSync } = require('node:child_process');
        execFileSync('npm', ['install', npmPackage], {
          encoding: 'utf-8',
          timeout: 60_000,
          stdio: 'pipe',
        });
        s.stop(`Installed ${npmPackage}`);
        p.log.success(`Add to your agent.yaml packs: section to activate.`);
      } catch (err) {
        s.stop('Installation failed');
        p.log.error(
          `Could not install ${npmPackage}. ${err instanceof Error ? err.message : String(err)}`,
        );
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

      const tier = await p.select({
        message: 'Pack tier:',
        options: [
          { value: 'community', label: 'Community — free, published to npm' },
          {
            value: 'premium',
            label: 'Premium — requires Soleri platform account (coming soon)',
          },
        ],
      });
      if (p.isCancel(tier)) return;

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
        tier: tier || 'community',
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

  // ─── Seed ─────────────────────────────────────────────────────────────
  pack
    .command('seed')
    .argument('<domain>', 'Domain to generate knowledge entries for (e.g. typescript, react)')
    .option('--entries <count>', 'Number of entries to generate', '15')
    .option('--dry-run', 'Preview generated entries without seeding vault')
    .option('--output <path>', 'Save entries as pack files instead of seeding vault')
    .option('--yes', 'Skip confirmation prompt')
    .description('Generate domain knowledge entries using LLM and seed them into the vault')
    .action(
      async (
        domain: string,
        opts: { entries?: string; dryRun?: boolean; output?: string; yes?: boolean },
      ) => {
        const ctx = detectAgent();
        if (!ctx) {
          p.log.error('No agent project detected in current directory.');
          process.exit(1);
        }

        const entryCount = Math.min(Math.max(parseInt(opts.entries ?? '15', 10) || 15, 5), 30);

        // ─── LLM client setup ──────────────────────────────────────
        const keyConfig = loadKeyPoolConfig(ctx.agentId);
        const openaiPool = new KeyPool(keyConfig.openai);
        const anthropicPool = new KeyPool(keyConfig.anthropic);
        const llm = new LLMClient(openaiPool, anthropicPool, ctx.agentId);
        const available = llm.isAvailable();

        if (!available.openai && !available.anthropic) {
          p.log.error(
            'No LLM API key configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY, ' +
              `or add keys to ${join(SOLERI_HOME, ctx.agentId, 'keys.json')}.`,
          );
          process.exit(1);
        }

        // ─── Generate entries ──────────────────────────────────────
        const s = p.spinner();
        s.start(`Generating ${entryCount} knowledge entries for domain "${domain}"...`);

        const provider = available.anthropic ? 'anthropic' : 'openai';
        const model = available.anthropic ? 'claude-haiku-4-5-20251001' : 'gpt-4o-mini';

        const systemPrompt = `You are a knowledge engineering expert. Generate structured knowledge entries for developer vaults.
Each entry must be valid JSON matching this schema:
{
  "id": "string (kebab-case, domain-prefixed, unique)",
  "type": "pattern" | "anti-pattern" | "rule" | "playbook",
  "domain": "string",
  "title": "string (concise, searchable)",
  "severity": "critical" | "warning" | "suggestion",
  "description": "string (2-3 sentences, actionable)",
  "why": "string (1-2 sentences explaining the reasoning)",
  "tags": ["array", "of", "keywords"],
  "context": "string (optional — when this applies)"
}

Return ONLY a JSON array of entries, no prose, no markdown fences.`;

        const userPrompt = `Generate exactly ${entryCount} high-quality knowledge vault entries for the "${domain}" domain.
Focus on: patterns that prevent bugs, common anti-patterns, best practices, and rules experienced developers follow.
Make entries concrete and actionable — not generic platitudes.
Return a JSON array of ${entryCount} entries.`;

        let generatedEntries: SeedEntry[] = [];

        try {
          const result = await llm.complete({
            caller: 'pack-seed',
            systemPrompt,
            userPrompt,
            provider,
            model,
            maxTokens: 8000,
            temperature: 0.4,
          });

          s.stop('Generation complete');

          // Parse JSON from response
          const text = result.text.trim();
          const jsonStart = text.indexOf('[');
          const jsonEnd = text.lastIndexOf(']');
          if (jsonStart === -1 || jsonEnd === -1) {
            p.log.error('LLM did not return a valid JSON array');
            process.exit(1);
          }

          const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as unknown[];
          generatedEntries = parsed
            .filter(
              (e): e is SeedEntry =>
                typeof e === 'object' &&
                e !== null &&
                'id' in e &&
                'title' in e &&
                'description' in e,
            )
            .map((e) => ({
              ...e,
              domain: domain,
              tags: Array.isArray(e.tags) ? e.tags : [],
            }));
        } catch (err) {
          s.stop('Generation failed');
          p.log.error(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }

        if (generatedEntries.length === 0) {
          p.log.error('No valid entries generated.');
          process.exit(1);
        }

        // ─── Dedup check ───────────────────────────────────────────
        const vaultDbPath = resolveVaultDbPath(ctx.agentId);
        let dedupedEntries = generatedEntries;

        if (vaultDbPath) {
          const vault = new Vault(vaultDbPath);
          const existing = new Set(vault.list({ domain, limit: 1000 }).map((e) => e.id));
          vault.close();
          const before = dedupedEntries.length;
          dedupedEntries = dedupedEntries.filter((e) => !existing.has(e.id));
          const skipped = before - dedupedEntries.length;
          if (skipped > 0) {
            p.log.info(`Skipped ${skipped} duplicate entries (already in vault)`);
          }
        }

        if (dedupedEntries.length === 0) {
          p.log.success(`All generated entries already exist in vault for domain "${domain}".`);
          return;
        }

        // ─── Preview table ─────────────────────────────────────────
        console.log('');
        console.log(`  Generated ${dedupedEntries.length} entries for "${domain}":`);
        console.log('');
        const idWidth = Math.max(2, ...dedupedEntries.map((e) => e.id.length));
        const titleWidth = Math.max(5, ...dedupedEntries.map((e) => e.title.length));
        console.log(
          `  ${'ID'.padEnd(idWidth)}  ${'Title'.padEnd(titleWidth)}  Type         Severity`,
        );
        console.log(`  ${'-'.repeat(idWidth)}  ${'-'.repeat(titleWidth)}  -----------  --------`);
        for (const entry of dedupedEntries) {
          console.log(
            `  ${entry.id.padEnd(idWidth)}  ${entry.title.padEnd(titleWidth)}  ${(entry.type ?? 'pattern').padEnd(11)}  ${entry.severity ?? 'suggestion'}`,
          );
        }
        console.log('');

        if (opts.dryRun) {
          p.log.info(`Dry run — ${dedupedEntries.length} entries generated, vault not modified.`);
          return;
        }

        // ─── Output to files ───────────────────────────────────────
        if (opts.output) {
          const outDir = pathResolve(opts.output);
          mkdirSync(outDir, { recursive: true });
          const outPath = join(outDir, `${domain}.json`);
          writeFileSync(outPath, JSON.stringify({ domain, entries: dedupedEntries }, null, 2));
          p.log.success(`Saved ${dedupedEntries.length} entries to ${outPath}`);
          return;
        }

        // ─── Confirm + seed vault ──────────────────────────────────
        if (!opts.yes) {
          const confirm = await p.confirm({
            message: `Seed ${dedupedEntries.length} entries into vault for domain "${domain}"?`,
          });
          if (p.isCancel(confirm) || !confirm) {
            p.log.info('Cancelled — vault not modified.');
            return;
          }
        }

        if (!vaultDbPath) {
          p.log.error('Vault not initialized. Run `soleri install` first.');
          process.exit(1);
        }

        const vault = new Vault(vaultDbPath);
        const seeded = vault.seed(
          dedupedEntries.map((e) => ({
            ...e,
            id: e.id,
            type: (e.type ?? 'pattern') as 'pattern' | 'anti-pattern' | 'rule' | 'playbook',
            severity: (e.severity ?? 'suggestion') as 'critical' | 'warning' | 'suggestion',
            tags: e.tags ?? [],
          })),
        );
        vault.close();

        p.log.success(`Seeded ${seeded} knowledge entries for domain "${domain}" into vault.`);
      },
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────

interface SeedEntry {
  id: string;
  type?: string;
  domain: string;
  title: string;
  severity?: string;
  description: string;
  why?: string;
  tags: string[];
  context?: string;
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
