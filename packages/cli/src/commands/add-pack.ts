// @ts-nocheck — TODO: rewrite for v7 file-tree agents (uses removed @soleri/core APIs)
import type { Command } from 'commander';
import * as p from '@clack/prompts';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { detectAgent } from '../utils/agent-context.js';

export function registerAddPack(program: Command): void {
  program
    .command('add-pack')
    .argument('<package>', 'npm package name (e.g., "@soleri/domain-design")')
    .option('--no-install', 'Skip npm install (assume already installed)')
    .option('--no-inject', 'Skip forge inject (CLAUDE.md, entry-point regeneration)')
    .option('--force', 'Overwrite existing skills')
    .description('Add a domain pack to the agent in the current directory')
    .action(
      async (packageName: string, opts: { install: boolean; inject: boolean; force: boolean }) => {
        const ctx = detectAgent();
        if (!ctx) {
          p.log.error(
            'No agent project detected in current directory. Run this from an agent root.',
          );
          process.exit(1);
        }

        const s = p.spinner();

        // Step 1: npm install
        if (opts.install) {
          s.start(`Installing ${packageName}...`);
          try {
            execFileSync('npm', ['install', packageName], {
              cwd: ctx.agentPath,
              stdio: 'pipe',
            });
            s.stop(`Installed ${packageName}`);
          } catch (err) {
            s.stop('npm install failed');
            p.log.error(err instanceof Error ? err.message : String(err));
            process.exit(1);
          }
        }

        // Step 2: Validate it's a DomainPack
        s.start('Validating domain pack...');
        let pack;
        try {
          const { loadDomainPack } = await import('@soleri/core');
          pack = await loadDomainPack(packageName);
          s.stop(
            `Validated: ${pack.name} v${pack.version} (${pack.ops.length} ops, ${pack.domains.length} domains${pack.facades?.length ? `, ${pack.facades.length} facades` : ''})`,
          );
        } catch (err) {
          s.stop('Validation failed');
          p.log.error(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }

        // Step 3: Update agent-config.json
        s.start('Updating agent config...');
        const configPath = join(ctx.agentPath, 'agent-config.json');
        if (existsSync(configPath)) {
          try {
            const config = JSON.parse(readFileSync(configPath, 'utf-8'));
            if (!config.domainPacks) config.domainPacks = [];

            const existing = config.domainPacks.find(
              (ref: { package: string }) => ref.package === packageName,
            );
            if (existing) {
              existing.version = pack.version;
              s.stop('Updated existing pack reference in config');
            } else {
              config.domainPacks.push({
                name: pack.name,
                package: packageName,
                version: pack.version,
              });
              s.stop('Added pack reference to config');
            }

            writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
          } catch (err) {
            s.stop('Config update failed');
            p.log.error(err instanceof Error ? err.message : String(err));
            process.exit(1);
          }
        } else {
          s.stop('No agent-config.json found — skipped config update');
        }

        // Step 4: Install knowledge (tiered)
        s.start('Installing knowledge...');
        try {
          const { installKnowledge, createAgentRuntime } = await import('@soleri/core');
          const runtime = createAgentRuntime({
            agentId: ctx.agentId,
            vaultPath: join(ctx.agentPath, '.vault', 'vault.db'),
          });
          const resolvedDir = join(ctx.agentPath, 'node_modules', packageName);
          const knowledgeResult = await installKnowledge(pack, runtime, resolvedDir);
          runtime.close();
          const total =
            knowledgeResult.canonical + knowledgeResult.curated + knowledgeResult.captured;
          s.stop(
            total > 0
              ? `Installed ${total} knowledge entries (${knowledgeResult.canonical} canonical, ${knowledgeResult.curated} curated, ${knowledgeResult.captured} captured)`
              : 'No knowledge to install',
          );
        } catch (err) {
          s.stop('Knowledge install skipped (non-fatal)');
          p.log.warn(err instanceof Error ? err.message : String(err));
        }

        // Step 5: Install skills
        s.start('Installing skills...');
        try {
          const { installSkills } = await import('@soleri/core');
          const resolvedDir = join(ctx.agentPath, 'node_modules', packageName);
          const skillsDir = join(ctx.agentPath, 'skills');
          const skillsResult = installSkills(pack, skillsDir, resolvedDir, opts.force);
          s.stop(
            skillsResult.installed > 0
              ? `Installed ${skillsResult.installed} skills (${skillsResult.skipped} skipped)`
              : 'No skills to install',
          );
        } catch (err) {
          s.stop('Skills install skipped (non-fatal)');
          p.log.warn(err instanceof Error ? err.message : String(err));
        }

        // Step 6: Inject CLAUDE.md domain rules
        if (pack.rules) {
          s.start('Injecting CLAUDE.md domain rules...');
          try {
            const { injectDomainRules } = await import('@soleri/core');
            const claudeMdPath = join(ctx.agentPath, 'CLAUDE.md');
            injectDomainRules(claudeMdPath, pack.name, pack.rules);
            s.stop('Injected domain rules into CLAUDE.md');
          } catch (err) {
            s.stop('CLAUDE.md injection skipped (non-fatal)');
            p.log.warn(err instanceof Error ? err.message : String(err));
          }
        }

        // Step 7: Run forge inject (regenerate entry-point, tests)
        if (opts.inject) {
          s.start('Regenerating agent code...');
          try {
            execFileSync('npx', ['soleri', 'agent', 'refresh'], {
              cwd: ctx.agentPath,
              stdio: 'pipe',
            });
            s.stop('Regenerated entry-point, tests, and CLAUDE.md');
          } catch {
            s.stop('Forge inject skipped — run `soleri agent refresh` manually');
          }
        }

        // Summary
        p.log.success(`\nDomain pack "${pack.name}" added to ${ctx.agentId}`);
        p.log.info(`  Domains: ${pack.domains.join(', ')}`);
        p.log.info(`  Ops: ${pack.ops.length} custom operations`);
        if (pack.facades?.length) {
          p.log.info(`  Facades: ${pack.facades.map((f) => f.name).join(', ')}`);
        }
      },
    );
}
