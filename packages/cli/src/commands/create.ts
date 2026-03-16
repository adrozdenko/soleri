import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Command } from 'commander';
import * as p from '@clack/prompts';
import {
  previewScaffold,
  scaffold,
  AgentConfigSchema,
  SETUP_TARGETS,
  type SetupTarget,
  scaffoldFileTree,
} from '@soleri/forge/lib';
import { runCreateWizard } from '../prompts/create-wizard.js';
import { listPacks } from '../hook-packs/registry.js';
import { installPack } from '../hook-packs/installer.js';

function parseSetupTarget(value?: string): SetupTarget | undefined {
  if (!value) return undefined;
  if ((SETUP_TARGETS as readonly string[]).includes(value)) {
    return value as SetupTarget;
  }
  return undefined;
}

function includesClaudeSetup(target: SetupTarget | undefined): boolean {
  const resolved = target ?? 'opencode';
  return resolved === 'claude' || resolved === 'both' || resolved === 'all';
}

export function registerCreate(program: Command): void {
  program
    .command('create')
    .argument('[name]', 'Agent ID (kebab-case)')
    .option('-c, --config <path>', 'Path to JSON config file (skip interactive prompts)')
    .option(
      '--setup-target <target>',
      `Setup target: ${SETUP_TARGETS.join(', ')} (default: claude)`,
    )
    .option('-y, --yes', 'Skip confirmation prompts (use with --config for fully non-interactive)')
    .option('--filetree', 'Create a file-tree agent (v7 — no TypeScript, no build step)')
    .option('--legacy', 'Create a legacy TypeScript agent (v6 — requires npm install + build)')
    .description('Create a new Soleri agent')
    .action(
      async (
        name?: string,
        opts?: {
          config?: string;
          yes?: boolean;
          setupTarget?: string;
          filetree?: boolean;
          legacy?: boolean;
        },
      ) => {
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
            const wizardResult = await runCreateWizard(name);
            if (!wizardResult) {
              p.outro('Cancelled.');
              return;
            }
            const parsed = AgentConfigSchema.safeParse(wizardResult);
            if (!parsed.success) {
              p.log.error(`Invalid config: ${parsed.error.message}`);
              process.exit(1);
            }
            config = parsed.data;
          }

          const setupTarget = parseSetupTarget(opts?.setupTarget);
          if (opts?.setupTarget && !setupTarget) {
            p.log.error(
              `Invalid --setup-target "${opts.setupTarget}". Expected one of: ${SETUP_TARGETS.join(', ')}`,
            );
            process.exit(1);
          }
          if (setupTarget) {
            config = { ...config, setupTarget };
          }
          // ─── File-tree agent (v7) ──────────────────────────────
          // Default to filetree unless --legacy is explicitly passed
          const useFileTree = opts?.filetree || !opts?.legacy;

          if (useFileTree) {
            // Convert to AgentYaml format
            const agentYamlInput = {
              id: config.id,
              name: config.name,
              role: config.role,
              description: config.description,
              domains: config.domains,
              principles: config.principles,
              tone: config.tone,
              greeting: config.greeting,
              setup: {
                target: config.setupTarget,
                model: config.model,
              },
              engine: {
                cognee: config.cognee,
              },
              vaults: config.vaults,
              packs: config.domainPacks?.map((dp) => ({
                name: dp.name,
                package: dp.package,
                version: dp.version,
              })),
            };

            const outputDir = config.outputDir ?? process.cwd();
            const nonInteractive = !!(opts?.yes || opts?.config);

            if (!nonInteractive) {
              p.log.info(
                `Will create file-tree agent "${config.name}" in ${outputDir}/${config.id}`,
              );
              p.log.info(`Domains: ${config.domains.join(', ')}`);
              p.log.info('No build step — agent is ready to use immediately.');

              const confirmed = await p.confirm({ message: 'Create agent?' });
              if (p.isCancel(confirmed) || !confirmed) {
                p.outro('Cancelled.');
                return;
              }
            }

            const s = p.spinner();
            s.start('Creating file-tree agent...');
            const result = scaffoldFileTree(agentYamlInput, outputDir);
            s.stop(result.success ? 'Agent created!' : 'Creation failed');

            if (!result.success) {
              p.log.error(result.summary);
              process.exit(1);
            }

            p.note(result.summary, 'Next steps');
            p.outro('Done!');
            return;
          }

          // ─── Legacy TypeScript agent (v6) ─────────────────────
          const claudeSetup = includesClaudeSetup(config.setupTarget);

          const nonInteractive = !!(opts?.yes || opts?.config);

          // Hook packs — from config file or interactive prompt
          let selectedPacks: string[] = [];
          if (!claudeSetup && config.hookPacks && config.hookPacks.length > 0) {
            p.log.warn(
              'Hook packs are Claude-only. Skipping because setup target excludes Claude.',
            );
          } else if (config.hookPacks && config.hookPacks.length > 0) {
            selectedPacks = config.hookPacks;

            // Validate pack names against registry — warn and skip unknown
            const available = listPacks().map((pk) => pk.name);
            const unknown = selectedPacks.filter((pk) => !available.includes(pk));
            if (unknown.length > 0) {
              for (const packName of unknown) {
                p.log.warn(
                  `Unknown hook pack "${packName}" — skipping. Available: ${available.join(', ')}`,
                );
              }
              selectedPacks = selectedPacks.filter((pk) => available.includes(pk));
            }
          } else if (!nonInteractive && claudeSetup) {
            const packs = listPacks();
            const packChoices = packs.map((pk) => ({
              value: pk.name,
              label: pk.name,
              hint: `${pk.description} (${pk.hooks.length} hooks)`,
            }));

            const chosen = await p.multiselect({
              message: 'Install hook packs? (Claude quality gates for ~/.claude/)',
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
          p.log.info(`Setup target: ${config.setupTarget ?? 'claude'}`);
          if (config.tone) {
            p.log.info(`Tone: ${config.tone}`);
          }
          if (config.skills?.length) {
            p.log.info(`Skills: ${config.skills.length} selected`);
          }
          if (selectedPacks.length > 0) {
            p.log.info(`Hook packs: ${selectedPacks.join(', ')}`);
          }

          if (!nonInteractive) {
            const confirmed = await p.confirm({ message: 'Create agent?' });
            if (p.isCancel(confirmed) || !confirmed) {
              p.outro('Cancelled.');
              return;
            }
          }

          // Scaffold + auto-build
          const s = p.spinner();
          s.start('Scaffolding and building agent...');
          const result = scaffold(config);
          s.stop(result.success ? 'Agent created and built!' : 'Scaffolding failed');

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
      },
    );
}
