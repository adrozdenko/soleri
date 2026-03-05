import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Command } from 'commander';
import * as p from '@clack/prompts';
import { previewScaffold, scaffold, AgentConfigSchema } from '@soleri/forge/lib';
import { runCreateWizard } from '../prompts/create-wizard.js';
import { listPacks } from '../hook-packs/registry.js';
import { installPack } from '../hook-packs/installer.js';

export function registerCreate(program: Command): void {
  program
    .command('create')
    .argument('[name]', 'Agent ID (kebab-case)')
    .option('-c, --config <path>', 'Path to JSON config file (skip interactive prompts)')
    .description('Create a new Soleri agent')
    .action(async (name?: string, opts?: { config?: string }) => {
      try {
        let config;

        if (opts?.config) {
          // Non-interactive: read from config file
          const configPath = resolve(opts.config);
          if (!existsSync(configPath)) {
            p.log.error(`Config file not found: ${configPath}`);
            process.exit(1);
          }
          const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
          const parsed = AgentConfigSchema.safeParse(raw);
          if (!parsed.success) {
            p.log.error(`Invalid config: ${parsed.error.message}`);
            process.exit(1);
          }
          config = parsed.data;
        } else {
          // Interactive wizard
          config = await runCreateWizard(name);
          if (!config) {
            p.outro('Cancelled.');
            return;
          }
        }

        // Hook packs — from config file or interactive prompt
        let selectedPacks: string[] = [];
        if (config.hookPacks && config.hookPacks.length > 0) {
          selectedPacks = config.hookPacks;
        } else if (!opts?.config) {
          const packs = listPacks();
          const packChoices = packs.map((pk) => ({
            value: pk.name,
            label: pk.name,
            hint: `${pk.description} (${pk.hooks.length} hooks)`,
          }));

          const chosen = await p.multiselect({
            message: 'Install hook packs? (quality gates for ~/.claude/)',
            options: packChoices,
            required: false,
          });

          if (!p.isCancel(chosen)) {
            selectedPacks = chosen as string[];
          }
        }

        // Preview
        const preview = previewScaffold(config);

        p.log.info(`Will create ${preview.files.length} files in ${preview.agentDir}`);
        p.log.info(`Facades: ${preview.facades.map((f) => f.name).join(', ')}`);
        p.log.info(`Domains: ${preview.domains.join(', ')}`);
        if (selectedPacks.length > 0) {
          p.log.info(`Hook packs: ${selectedPacks.join(', ')}`);
        }

        const confirmed = await p.confirm({ message: 'Create agent?' });
        if (p.isCancel(confirmed) || !confirmed) {
          p.outro('Cancelled.');
          return;
        }

        // Scaffold
        const s = p.spinner();
        s.start('Scaffolding agent...');
        const result = scaffold(config);
        s.stop(result.success ? 'Agent created!' : 'Scaffolding failed');

        if (!result.success) {
          p.log.error(result.summary);
          process.exit(1);
        }

        // Install selected hook packs
        if (selectedPacks.length > 0) {
          for (const packName of selectedPacks) {
            const { installed } = installPack(packName, { projectDir: result.agentDir });
            if (installed.length > 0) {
              p.log.success(`Hook pack "${packName}" installed (${installed.length} hooks)`);
            } else {
              p.log.info(`Hook pack "${packName}" — all hooks already present`);
            }
          }
        }

        if (result.success) {
          p.note(result.summary, 'Next steps');
        }

        p.outro('Done!');
      } catch (err) {
        p.log.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
