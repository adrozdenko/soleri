/**
 * Agent lifecycle CLI — status, update, diff.
 *
 * `soleri agent status` — health report with version, packs, vault stats.
 * `soleri agent update` — OTA engine upgrade with migration support.
 */

import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import type { Command } from 'commander';
import * as p from '@clack/prompts';
import { PackLockfile, checkNpmVersion, checkVersionCompat } from '@soleri/core';
import { detectAgent } from '../utils/agent-context.js';

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
              packs: packs.map((p) => ({
                id: p.id,
                version: p.version,
                type: p.type,
                source: p.source,
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
}
