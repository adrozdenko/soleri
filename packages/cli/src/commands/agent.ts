/**
 * Agent lifecycle CLI — status, update, diff.
 *
 * `soleri agent status` — health report with version, packs, vault stats.
 * `soleri agent update` — OTA engine upgrade with migration support.
 */

import { join, dirname } from 'node:path';
import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  cpSync,
  rmSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import type { Command } from 'commander';
import * as p from '@clack/prompts';
import { PackLockfile, checkNpmVersion, checkVersionCompat, SOLERI_HOME } from '@soleri/core';
import {
  generateClaudeMdTemplate,
  generateInjectClaudeMd,
  generateSkills,
} from '@soleri/forge/lib';
import type { AgentConfig } from '@soleri/forge/lib';
import { detectAgent } from '../utils/agent-context.js';
import { installClaude } from './install.js';

export function registerAgent(program: Command): void {
  const agent = program.command('agent').description('Agent lifecycle management');

  // ─── status ─────────────────────────────────────────────────
  agent
    .command('status')
    .option('--json', 'Output as JSON')
    .description('Show agent health: version, packs, vault, and update availability')
    .action((opts: { json?: boolean }) => {
      const ctx = detectAgent();
      if (!ctx) {
        p.log.error('No agent project detected in current directory.');
        process.exit(1);
        return;
      }

      // Read agent package.json
      const pkgPath = join(ctx.agentPath, 'package.json');
      const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf-8')) : {};
      const agentName = pkg.name || 'unknown';
      const agentVersion = pkg.version || '0.0.0';

      // Read @soleri/core version
      const corePkgPath = join(ctx.agentPath, 'node_modules', '@soleri', 'core', 'package.json');
      const coreVersion = existsSync(corePkgPath)
        ? JSON.parse(readFileSync(corePkgPath, 'utf-8')).version || 'unknown'
        : pkg.dependencies?.['@soleri/core'] || 'not installed';

      // Check for core update
      const latestCore = checkNpmVersion('@soleri/core');

      // Read lockfile
      const lockfilePath = join(ctx.agentPath, 'soleri.lock');
      const lockfile = new PackLockfile(lockfilePath);
      const packs = lockfile.list();

      // Count vault entries if db exists
      const dbPath = join(ctx.agentPath, 'data', 'vault.db');
      const hasVault = existsSync(dbPath);

      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              agent: agentName,
              version: agentVersion,
              engine: coreVersion,
              engineLatest: latestCore,
              packs: packs.map((pk) => ({
                id: pk.id,
                version: pk.version,
                type: pk.type,
                source: pk.source,
              })),
              vault: { exists: hasVault },
            },
            null,
            2,
          ),
        );
        return;
      }

      console.log(`\n  Agent: ${agentName} v${agentVersion}`);
      console.log(
        `  Engine: @soleri/core ${coreVersion}${latestCore && latestCore !== coreVersion ? ` (update available: ${latestCore})` : ''}`,
      );

      if (packs.length > 0) {
        console.log(`\n  Packs (${packs.length} installed):`);
        for (const pack of packs) {
          const badge =
            pack.source === 'npm' ? ' [npm]' : pack.source === 'built-in' ? ' [built-in]' : '';
          console.log(`    ${pack.id}@${pack.version}  ${pack.type}${badge}`);
        }
      } else {
        console.log('\n  Packs: none installed');
      }

      console.log(`\n  Vault: ${hasVault ? 'initialized' : 'not initialized'}`);
      console.log('');
    });

  // ─── update ─────────────────────────────────────────────────
  agent
    .command('update')
    .option('--check', 'Show what would change without updating')
    .option('--dry-run', 'Preview migration steps')
    .description('Update agent engine to latest compatible version')
    .action((opts: { check?: boolean; dryRun?: boolean }) => {
      const ctx = detectAgent();
      if (!ctx) {
        p.log.error('No agent project detected in current directory.');
        process.exit(1);
        return;
      }

      const pkgPath = join(ctx.agentPath, 'package.json');
      if (!existsSync(pkgPath)) {
        p.log.error('No package.json found in agent directory.');
        process.exit(1);
        return;
      }

      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const currentRange = pkg.dependencies?.['@soleri/core'] || '';
      const latestCore = checkNpmVersion('@soleri/core');

      if (!latestCore) {
        p.log.error('Could not check npm for latest @soleri/core version.');
        process.exit(1);
        return;
      }

      // Check compatibility
      const compatible = checkVersionCompat(latestCore, currentRange);

      if (opts.check) {
        console.log(`\n  Current: @soleri/core ${currentRange}`);
        console.log(`  Latest:  @soleri/core ${latestCore}`);
        console.log(`  Compatible: ${compatible ? 'yes' : 'no (range: ' + currentRange + ')'}`);
        console.log('');
        return;
      }

      if (opts.dryRun) {
        p.log.info(`Would update @soleri/core to ${latestCore}`);
        p.log.info('Would run: npm install @soleri/core@' + latestCore);
        return;
      }

      const s = p.spinner();
      s.start(`Updating @soleri/core to ${latestCore}...`);

      try {
        execFileSync('npm', ['install', `@soleri/core@${latestCore}`], {
          cwd: ctx.agentPath,
          stdio: 'pipe',
          timeout: 120_000,
        });

        s.stop(`Updated to @soleri/core@${latestCore}`);
        p.log.info('Run `soleri test` to verify the update.');
      } catch (err) {
        s.stop('Update failed');
        p.log.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // ─── refresh ────────────────────────────────────────────────
  agent
    .command('refresh')
    .option('--dry-run', 'Preview what would change without writing')
    .option('--skip-skills', 'Skip skill sync (only regenerate activation files)')
    .description('Regenerate activation files and sync skills from latest forge templates')
    .action((opts: { dryRun?: boolean; skipSkills?: boolean }) => {
      const ctx = detectAgent();
      if (!ctx) {
        p.log.error('No agent project detected in current directory.');
        process.exit(1);
        return;
      }

      // Reconstruct AgentConfig from the existing agent
      const config = readAgentConfig(ctx.agentPath, ctx.agentId);
      if (!config) {
        p.log.error('Could not read agent config from persona.ts and entry point.');
        process.exit(1);
        return;
      }

      const contentPath = join(ctx.agentPath, 'src', 'activation', 'claude-md-content.ts');
      const injectPath = join(ctx.agentPath, 'src', 'activation', 'inject-claude-md.ts');
      const newContent = generateClaudeMdTemplate(config);
      const newInject = generateInjectClaudeMd(config);

      // Generate skills from latest forge templates
      const skillFiles = opts.skipSkills ? [] : generateSkills(config);

      if (opts.dryRun) {
        p.log.info(`Would regenerate: ${contentPath}`);
        p.log.info(`Would regenerate: ${injectPath}`);
        p.log.info(`Agent: ${config.name} (${config.domains.length} domains)`);
        p.log.info(`Domains: ${config.domains.join(', ')}`);
        if (skillFiles.length > 0) {
          // Check which skills are new vs existing
          const newSkills = skillFiles.filter(
            ([relPath]) => !existsSync(join(ctx.agentPath, relPath)),
          );
          const updatedSkills = skillFiles.filter(([relPath]) =>
            existsSync(join(ctx.agentPath, relPath)),
          );
          p.log.info(
            `Skills: ${skillFiles.length} total (${newSkills.length} new, ${updatedSkills.length} updated)`,
          );
          for (const [relPath] of newSkills) {
            p.log.info(`  + ${relPath}`);
          }
        }
        return;
      }

      // Write activation files
      writeFileSync(contentPath, newContent, 'utf-8');
      writeFileSync(injectPath, newInject, 'utf-8');
      p.log.success(`Regenerated ${contentPath}`);
      p.log.success(`Regenerated ${injectPath}`);

      // Sync skills
      if (skillFiles.length > 0) {
        let newCount = 0;
        let updatedCount = 0;
        for (const [relPath, content] of skillFiles) {
          const fullPath = join(ctx.agentPath, relPath);
          const dirPath = join(fullPath, '..');
          const isNew = !existsSync(fullPath);
          mkdirSync(dirPath, { recursive: true });
          writeFileSync(fullPath, content, 'utf-8');
          if (isNew) newCount++;
          else updatedCount++;
        }
        p.log.success(
          `Synced ${skillFiles.length} skills (${newCount} new, ${updatedCount} updated)`,
        );
      }

      p.log.info('Run `npm run build` to compile, then re-inject CLAUDE.md.');
    });

  // ─── diff ───────────────────────────────────────────────────
  agent
    .command('diff')
    .description('Show drift between agent templates and latest engine templates')
    .action(() => {
      const ctx = detectAgent();
      if (!ctx) {
        p.log.error('No agent project detected in current directory.');
        process.exit(1);
        return;
      }

      p.log.info('Template diff is available after `soleri agent update --check`.');
      p.log.info('Full template comparison will be added in a future release.');
    });

  // ─── capabilities ──────────────────────────────────────────
  agent
    .command('capabilities')
    .description('List all capabilities declared by installed packs')
    .action(() => {
      const ctx = detectAgent();
      if (!ctx) {
        p.log.error('No agent project detected in current directory.');
        process.exit(1);
        return;
      }

      const lockfilePath = join(ctx.agentPath, 'soleri.lock');
      const lockfile = new PackLockfile(lockfilePath);
      const packs = lockfile.list();

      if (packs.length === 0) {
        console.log('\n  No packs installed.\n');
        return;
      }

      let totalCapabilities = 0;
      let packsWithCaps = 0;

      for (const pack of packs) {
        // Read soleri-pack.json from the installed pack directory
        const manifestPath = join(pack.directory, 'soleri-pack.json');
        if (!existsSync(manifestPath)) continue;

        let manifest: { capabilities?: Array<{ id: string; description: string }> };
        try {
          manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        } catch {
          continue;
        }

        const caps = manifest.capabilities ?? [];
        if (caps.length === 0) continue;

        packsWithCaps++;
        totalCapabilities += caps.length;

        console.log(`\n  ${pack.id} (${caps.length}):`);
        // Group by domain (first segment of capability ID)
        const grouped = new Map<string, string[]>();
        for (const cap of caps) {
          const domain = cap.id.split('.')[0];
          const list = grouped.get(domain) ?? [];
          list.push(cap.id);
          grouped.set(domain, list);
        }
        for (const [, ids] of grouped) {
          console.log(`    ${ids.join(', ')}`);
        }
      }

      if (totalCapabilities === 0) {
        console.log('\n  No capabilities declared by any installed pack.\n');
      } else {
        console.log(
          `\n  Total: ${totalCapabilities} capabilities across ${packsWithCaps} pack(s)\n`,
        );
      }
    });

  // ─── migrate ──────────────────────────────────────────────
  // Temporary command — moves agent data from ~/.{agentId}/ to ~/.soleri/{agentId}/.
  // Will be removed in the next major version after all users migrate.
  agent
    .command('migrate')
    .argument('<agentId>', 'Agent ID to migrate (e.g. ernesto, salvador)')
    .option('--dry-run', 'Preview what would be moved without executing')
    .description('Move agent data from ~/.{agentId}/ to ~/.soleri/{agentId}/ (one-time migration)')
    .action((agentId: string, opts: { dryRun?: boolean }) => {
      const legacyHome = join(homedir(), `.${agentId}`);
      const newHome = join(SOLERI_HOME, agentId);

      // Data files to migrate (relative to agent home)
      const dataFiles = [
        'vault.db',
        'vault.db-shm',
        'vault.db-wal',
        'plans.json',
        'keys.json',
        'flags.json',
      ];
      const dataDirs = ['templates'];

      // Check if legacy data exists
      if (!existsSync(legacyHome)) {
        p.log.info(`No legacy data found at ${legacyHome} — nothing to migrate.`);
        return;
      }

      // Check if already migrated
      if (existsSync(join(newHome, 'vault.db'))) {
        p.log.warn(`Data already exists at ${newHome}/vault.db — migration may have already run.`);
        p.log.info('If you want to force re-migration, remove the new directory first.');
        return;
      }

      // Discover what to move
      const toMove: Array<{ src: string; dst: string; type: 'file' | 'dir' }> = [];

      for (const file of dataFiles) {
        const src = join(legacyHome, file);
        if (existsSync(src)) {
          toMove.push({ src, dst: join(newHome, file), type: 'file' });
        }
      }

      for (const dir of dataDirs) {
        const src = join(legacyHome, dir);
        if (existsSync(src)) {
          toMove.push({ src, dst: join(newHome, dir), type: 'dir' });
        }
      }

      if (toMove.length === 0) {
        p.log.info(`No data files found in ${legacyHome} — nothing to migrate.`);
        return;
      }

      // Preview
      console.log(`\n  Migration: ${legacyHome} → ${newHome}\n`);
      for (const item of toMove) {
        const label = item.type === 'dir' ? '(dir) ' : '';
        console.log(`  ${label}${item.src} → ${item.dst}`);
      }
      console.log('');

      if (opts.dryRun) {
        p.log.info(
          `Dry run — ${toMove.length} items would be moved. Run without --dry-run to execute.`,
        );
        return;
      }

      // Execute migration
      const s = p.spinner();
      s.start('Migrating agent data...');

      try {
        // Create new home directory
        mkdirSync(newHome, { recursive: true });

        let moved = 0;
        for (const item of toMove) {
          mkdirSync(dirname(item.dst), { recursive: true });
          try {
            // Try atomic rename first (same filesystem)
            renameSync(item.src, item.dst);
          } catch {
            // Cross-filesystem: copy then remove
            if (item.type === 'dir') {
              cpSync(item.src, item.dst, { recursive: true });
              rmSync(item.src, { recursive: true });
            } else {
              cpSync(item.src, item.dst);
              rmSync(item.src);
            }
          }
          moved++;
        }

        s.stop(`Migrated ${moved} items to ${newHome}`);

        // Detect agent definition (agent.yaml) to re-register MCP
        const agentYaml = join(newHome, 'agent.yaml');
        const legacyAgentYaml = join(legacyHome, 'agent.yaml');

        if (existsSync(agentYaml) || existsSync(legacyAgentYaml)) {
          // If agent.yaml is still in legacy dir, move it too
          if (!existsSync(agentYaml) && existsSync(legacyAgentYaml)) {
            p.log.info(
              'Note: agent.yaml is still at the old location. Move the entire agent folder if needed.',
            );
          }
        }

        // Re-register MCP pointing to new location
        const agentDir = existsSync(agentYaml) ? newHome : legacyHome;
        if (existsSync(join(agentDir, 'agent.yaml'))) {
          installClaude(agentId, agentDir, true);
          p.log.success('MCP registration updated to new path.');
        }

        p.log.info(
          `Legacy directory preserved at ${legacyHome} (safe to remove manually after verifying).`,
        );
      } catch (err) {
        s.stop('Migration failed');
        p.log.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // ─── validate ──────────────────────────────────────────────
  agent
    .command('validate')
    .description('Validate flow capability requirements against installed packs')
    .action(() => {
      const ctx = detectAgent();
      if (!ctx) {
        p.log.error('No agent project detected in current directory.');
        process.exit(1);
        return;
      }

      // Collect all capability IDs from installed packs
      const lockfilePath = join(ctx.agentPath, 'soleri.lock');
      const lockfile = new PackLockfile(lockfilePath);
      const packs = lockfile.list();
      const installedCapabilities = new Set<string>();

      for (const pack of packs) {
        const manifestPath = join(pack.directory, 'soleri-pack.json');
        if (!existsSync(manifestPath)) continue;

        let manifest: { capabilities?: Array<{ id: string }> };
        try {
          manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        } catch {
          continue;
        }

        for (const cap of manifest.capabilities ?? []) {
          installedCapabilities.add(cap.id);
        }
      }

      // Load flow YAML files from the agent's data/flows/ directory
      const flowsDir = join(ctx.agentPath, 'data', 'flows');
      if (!existsSync(flowsDir)) {
        console.log('\n  No data/flows/ directory found.\n');
        return;
      }

      const flowFiles = readdirSync(flowsDir).filter((f: string) => f.endsWith('.flow.yaml'));

      if (flowFiles.length === 0) {
        console.log('\n  No flow files found in data/flows/.\n');
        return;
      }

      let fullyAvailable = 0;
      let degradedCount = 0;

      console.log('');

      for (const file of flowFiles) {
        const content = readFileSync(join(flowsDir, file), 'utf-8');
        // Simple YAML parsing for needs: fields
        const needed = new Set<string>();
        const lines = content.split('\n');
        let inNeeds = false;
        for (const line of lines) {
          if (/^\s+needs:\s*$/.test(line)) {
            inNeeds = true;
            continue;
          }
          if (inNeeds) {
            const match = line.match(/^\s+-\s+(.+)$/);
            if (match) {
              needed.add(match[1].trim().replace(/^['"]|['"]$/g, ''));
            } else {
              inNeeds = false;
            }
          }
          // Inline array format: needs: [a, b, c]
          const inlineMatch = line.match(/^\s+needs:\s*\[([^\]]+)\]/);
          if (inlineMatch) {
            for (const cap of inlineMatch[1].split(',')) {
              needed.add(cap.trim().replace(/^['"]|['"]$/g, ''));
            }
          }
        }

        // Extract flow id from file content
        const idMatch = content.match(/^id:\s*(.+)$/m);
        const flowName = idMatch ? idMatch[1].trim() : file.replace('.flow.yaml', '');

        if (needed.size === 0) {
          console.log(`  ${flowName}:  (no capabilities declared)`);
          continue;
        }

        const missing = [...needed].filter((cap) => !installedCapabilities.has(cap));

        if (missing.length === 0) {
          console.log(`  ${flowName}:  \u2713 all ${needed.size} capabilities available`);
          fullyAvailable++;
        } else {
          console.log(`  ${flowName}:  \u26A0 ${missing.length} missing (${missing.join(', ')})`);
          degradedCount++;
        }
      }

      console.log(
        `\n  ${flowFiles.length} flows checked: ${fullyAvailable} fully satisfied, ${degradedCount} degraded\n`,
      );
    });
}

/**
 * Reconstruct an AgentConfig from an existing scaffolded agent.
 *
 * Reads persona from src/activation/persona.ts (PERSONA constant)
 * and domains from src/index.ts (createDomainFacades call).
 */
function readAgentConfig(agentPath: string, agentId: string): AgentConfig | null {
  // Read persona.ts source to extract PERSONA fields
  // Try both locations: v6+ (src/identity/) and v5 (src/activation/)
  const personaCandidates = [
    join(agentPath, 'src', 'identity', 'persona.ts'),
    join(agentPath, 'src', 'activation', 'persona.ts'),
  ];
  const personaPath = personaCandidates.find((candidate) => existsSync(candidate));
  if (!personaPath) return null;
  const personaSrc = readFileSync(personaPath, 'utf-8');

  const name = extractStringField(personaSrc, 'name') ?? agentId;
  const role = extractStringField(personaSrc, 'role') ?? '';
  const description = extractStringField(personaSrc, 'description') ?? '';
  const tone =
    (extractStringField(personaSrc, 'tone') as 'precise' | 'mentor' | 'pragmatic') ?? 'pragmatic';
  const greeting = extractStringField(personaSrc, 'greeting') ?? `Hello! I'm ${name}.`;
  const principles = extractArrayField(personaSrc, 'principles');

  // Read domains from entry point
  const indexPath = join(agentPath, 'src', 'index.ts');
  const domains = existsSync(indexPath) ? extractDomains(readFileSync(indexPath, 'utf-8')) : [];

  // Read hookPacks from .claude/ if present
  const hookPacks: string[] = [];

  // Read package.json for outputDir
  const pkg = JSON.parse(readFileSync(join(agentPath, 'package.json'), 'utf-8'));

  return {
    id: agentId,
    name,
    role,
    description,
    domains,
    principles,
    tone,
    greeting,
    outputDir: agentPath,
    hookPacks,
    setupTarget: pkg.soleri?.setupTarget ?? 'claude',
    telegram: pkg.soleri?.telegram ?? false,
  } as AgentConfig;
}

function extractStringField(src: string, field: string): string | undefined {
  const re = new RegExp(`${field}:\\s*'([^']*)'`);
  const m = src.match(re);
  return m ? m[1].replace(/\\'/g, "'") : undefined;
}

function extractArrayField(src: string, field: string): string[] {
  const re = new RegExp(`${field}:\\s*\\[([\\s\\S]*?)\\]`);
  const m = src.match(re);
  if (!m) return [];
  return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
}

function extractDomains(indexSrc: string): string[] {
  const m = indexSrc.match(/createDomainFacades\(runtime,\s*['"][^'"]+['"]\s*,\s*\[([\s\S]*?)\]\)/);
  if (!m) return [];
  // Match both single and double quoted strings
  return [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
}
