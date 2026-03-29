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
import { runCreateWizard, type WizardGitConfig } from '../prompts/create-wizard.js';
import { listPacks } from '../hook-packs/registry.js';
import { installPack } from '../hook-packs/installer.js';
import {
  isGitInstalled,
  gitInit,
  gitInitialCommit,
  gitAddRemote,
  gitPush,
  ghCreateRepo,
} from '../utils/git.js';

function parseSetupTarget(value?: string): SetupTarget | undefined {
  if (!value) return undefined;
  if ((SETUP_TARGETS as readonly string[]).includes(value)) {
    return value as SetupTarget;
  }
  return undefined;
}

function includesClaudeSetup(target: SetupTarget | string | undefined): boolean {
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
    .option('--dir <path>', `Parent directory for the agent (default: current directory)`)
    .option('--filetree', 'Create a file-tree agent (v7 — no TypeScript, no build step)')
    .option('--legacy', 'Create a legacy TypeScript agent (v6 — requires npm install + build)')
    .option('--no-git', 'Skip git repository initialization (git init is on by default)')
    .description('Create a new Soleri agent')
    .action(
      async (
        name?: string,
        opts?: {
          config?: string;
          yes?: boolean;
          dir?: string;
          setupTarget?: string;
          filetree?: boolean;
          legacy?: boolean;
          git?: boolean;
        },
      ) => {
        try {
          let config;

          let gitConfig: WizardGitConfig | undefined;
          const skipGit = opts?.git === false; // Commander sets git=false when --no-git is passed

          if (name && opts?.yes && !opts?.config) {
            // Quick non-interactive: name + --yes = Italian Craftsperson defaults
            const id = name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '');
            config = AgentConfigSchema.parse({
              id,
              name,
              role: 'Your universal second brain — learns, remembers, improves',
              description:
                'A universal assistant that learns from your projects, captures knowledge, and gets smarter with every session.',
              domains: [],
              principles: [],
              tone: 'mentor',
              greeting: `Ciao! I'm ${name}. Ready to build something beautiful today?`,
            });
            // Non-interactive default: git init yes, no remote
            if (!skipGit) {
              gitConfig = { init: true };
            }
          } else if (opts?.config) {
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
            const parsed = AgentConfigSchema.safeParse(wizardResult.config);
            if (!parsed.success) {
              p.log.error(`Invalid config: ${parsed.error.message}`);
              process.exit(1);
            }
            config = parsed.data;
            if (!skipGit) {
              gitConfig = wizardResult.git;
            }
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
            // Cast to Record to access fields that may exist on the parsed config
            // but aren't in the strict AgentConfig type (model, cognee, vaults, domainPacks)
            const raw = config as Record<string, unknown>;
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
                model: (raw.model as string) ?? 'claude-code-sonnet-4',
              },
              engine: {},
              persona: raw.persona as Record<string, unknown> | undefined,
              vaults: raw.vaults as
                | Array<{ name: string; path: string; priority?: number }>
                | undefined,
              packs: (
                raw.domainPacks as
                  | Array<{ name: string; package: string; version?: string }>
                  | undefined
              )?.map((dp) => ({
                name: dp.name,
                package: dp.package,
                version: dp.version,
              })),
            };

            const outputDir = opts?.dir ? resolve(opts.dir) : (config.outputDir ?? process.cwd());
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

            // ─── Git initialization ──────────────────────────────
            if (gitConfig?.init) {
              const hasGit = await isGitInstalled();
              if (!hasGit) {
                p.log.warn(
                  'git is not installed — skipping repository initialization. Install git from https://git-scm.com/',
                );
              } else {
                const agentDir = result.agentDir;
                s.start('Initializing git repository...');

                const initResult = await gitInit(agentDir);
                if (!initResult.ok) {
                  s.stop('git init failed');
                  p.log.warn(`git init failed: ${initResult.error}`);
                } else {
                  const commitResult = await gitInitialCommit(
                    agentDir,
                    `feat: scaffold agent "${config.name}"`,
                  );
                  if (!commitResult.ok) {
                    s.stop('Initial commit failed');
                    p.log.warn(`Initial commit failed: ${commitResult.error}`);
                  } else {
                    s.stop('Git repository initialized with initial commit');
                  }

                  // Remote setup
                  if (gitConfig.remote && initResult.ok && commitResult.ok) {
                    if (gitConfig.remote.type === 'gh') {
                      s.start('Creating GitHub repository...');
                      const ghResult = await ghCreateRepo(config.id, {
                        visibility: gitConfig.remote.visibility ?? 'private',
                        dir: agentDir,
                      });
                      if (!ghResult.ok) {
                        s.stop('GitHub repo creation failed');
                        p.log.warn(`gh repo create failed: ${ghResult.error}`);
                      } else {
                        s.stop(`Pushed to ${ghResult.url ?? 'GitHub'}`);
                      }
                    } else if (gitConfig.remote.type === 'manual' && gitConfig.remote.url) {
                      s.start('Setting up remote...');
                      const remoteResult = await gitAddRemote(agentDir, gitConfig.remote.url);
                      if (!remoteResult.ok) {
                        s.stop('Failed to add remote');
                        p.log.warn(`git remote add failed: ${remoteResult.error}`);
                      } else {
                        const pushResult = await gitPush(agentDir);
                        if (!pushResult.ok) {
                          s.stop('Push failed');
                          p.log.warn(`git push failed: ${pushResult.error}`);
                        } else {
                          s.stop('Pushed to remote');
                        }
                      }
                    }
                  }
                }
              }
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
            const packs = listPacks().filter((pk) => pk.scaffoldDefault !== false);
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
