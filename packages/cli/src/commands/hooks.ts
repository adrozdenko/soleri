import type { Command } from 'commander';
import { mkdirSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { SUPPORTED_EDITORS, type EditorId } from '../hooks/templates.js';
import { installHooks, removeHooks, detectInstalledHooks } from '../hooks/generator.js';
import { detectAgent } from '../utils/agent-context.js';
import { listPacks, getPack } from '../hook-packs/registry.js';
import { installPack, removePack, isPackInstalled } from '../hook-packs/installer.js';
import { promotePack, demotePack } from '../hook-packs/graduation.js';
import {
  generateHookScript,
  generateManifest,
  HOOK_EVENTS,
  ACTION_LEVELS,
} from '../hook-packs/converter/template.js';
import type {
  HookEvent,
  ActionLevel,
  HookConversionConfig,
} from '../hook-packs/converter/template.js';
import { generateFixtures, validateHookScript } from '../hook-packs/validator.js';
import * as log from '../utils/logger.js';

export function registerHooks(program: Command): void {
  const hooks = program.command('hooks').description('Manage editor hooks and hook packs');

  hooks
    .command('add')
    .argument('<editor>', `Editor: ${SUPPORTED_EDITORS.join(', ')}`)
    .description('Generate editor hooks/config files')
    .action((editor: string) => {
      if (!isValidEditor(editor)) {
        log.fail(`Unknown editor "${editor}". Supported: ${SUPPORTED_EDITORS.join(', ')}`);
        process.exit(1);
      }
      const ctx = detectAgent();
      if (!ctx) {
        log.fail('No agent project detected in current directory.');
        process.exit(1);
      }
      const files = installHooks(editor, ctx.agentPath);
      for (const f of files) {
        log.pass(`Created ${f}`);
      }
      log.info(`${editor} hooks installed for ${ctx.agentId}`);
    });

  hooks
    .command('remove')
    .argument('<editor>', `Editor: ${SUPPORTED_EDITORS.join(', ')}`)
    .description('Remove editor hooks/config files')
    .action((editor: string) => {
      if (!isValidEditor(editor)) {
        log.fail(`Unknown editor "${editor}". Supported: ${SUPPORTED_EDITORS.join(', ')}`);
        process.exit(1);
      }
      const ctx = detectAgent();
      if (!ctx) {
        log.fail('No agent project detected in current directory.');
        process.exit(1);
      }
      const removed = removeHooks(editor, ctx.agentPath);
      if (removed.length === 0) {
        log.info(`No ${editor} hooks found to remove.`);
      } else {
        for (const f of removed) {
          log.warn(`Removed ${f}`);
        }
        log.info(`${editor} hooks removed from ${ctx.agentId}`);
      }
    });

  hooks
    .command('list')
    .description('Show which editor hooks are installed')
    .action(() => {
      const ctx = detectAgent();
      if (!ctx) {
        log.fail('No agent project detected in current directory.');
        process.exit(1);
      }
      const installed = detectInstalledHooks(ctx.agentPath);
      log.heading(`Editor hooks for ${ctx.agentId}`);
      for (const editor of SUPPORTED_EDITORS) {
        if (installed.includes(editor)) {
          log.pass(editor, 'installed');
        } else {
          log.dim(`  ${editor} — not installed`);
        }
      }
    });

  hooks
    .command('add-pack')
    .argument('<pack>', 'Hook pack name')
    .option('--project', 'Install to project .claude/ instead of global ~/.claude/')
    .description('Install a hook pack globally (~/.claude/) or per-project (--project)')
    .action((packName: string, opts: { project?: boolean }) => {
      const pack = getPack(packName);
      if (!pack) {
        const available = listPacks().map((p) => p.name);
        log.fail(`Unknown pack "${packName}". Available: ${available.join(', ')}`);
        process.exit(1);
      }
      const projectDir = opts.project ? process.cwd() : undefined;
      const target = opts.project ? '.claude/' : '~/.claude/';
      const { installed, skipped, scripts, lifecycleHooks } = installPack(packName, { projectDir });
      for (const hook of installed) {
        log.pass(`Installed hookify.${hook}.local.md → ${target}`);
      }
      for (const hook of skipped) {
        log.dim(`  hookify.${hook}.local.md — already exists, skipped`);
      }
      for (const script of scripts) {
        log.pass(`Installed ${script} → ${target}`);
      }
      for (const lc of lifecycleHooks) {
        log.pass(`Registered lifecycle hook: ${lc}`);
      }
      const totalInstalled = installed.length + scripts.length + lifecycleHooks.length;
      if (totalInstalled > 0) {
        log.info(`Pack "${packName}" installed (${totalInstalled} items) → ${target}`);
      } else {
        log.info(`Pack "${packName}" — all hooks already installed`);
      }
    });

  hooks
    .command('remove-pack')
    .argument('<pack>', 'Hook pack name')
    .option('--project', 'Remove from project .claude/ instead of global ~/.claude/')
    .description('Remove a hook pack')
    .action((packName: string, opts: { project?: boolean }) => {
      const pack = getPack(packName);
      if (!pack) {
        const available = listPacks().map((p) => p.name);
        log.fail(`Unknown pack "${packName}". Available: ${available.join(', ')}`);
        process.exit(1);
      }
      const projectDir = opts.project ? process.cwd() : undefined;
      const { removed, scripts, lifecycleHooks } = removePack(packName, { projectDir });
      const totalRemoved = removed.length + scripts.length + lifecycleHooks.length;
      if (totalRemoved === 0) {
        log.info(`No hooks from pack "${packName}" found to remove.`);
      } else {
        for (const hook of removed) {
          log.warn(`Removed hookify.${hook}.local.md`);
        }
        for (const script of scripts) {
          log.warn(`Removed ${script}`);
        }
        for (const lc of lifecycleHooks) {
          log.warn(`Removed lifecycle hook: ${lc}`);
        }
        log.info(`Pack "${packName}" removed (${totalRemoved} items)`);
      }
    });

  hooks
    .command('list-packs')
    .description('Show available hook packs and their status')
    .action(() => {
      const packs = listPacks();
      log.heading('Hook Packs');
      for (const pack of packs) {
        const status = isPackInstalled(pack.name);
        const versionLabel = pack.version ? ` v${pack.version}` : '';
        const sourceLabel = pack.source === 'local' ? ' [local]' : '';
        const hookCount = pack.hooks.length;
        const scriptCount = pack.scripts?.length ?? 0;
        const itemCount = hookCount + scriptCount;
        const itemLabel = itemCount === 1 ? '1 item' : `${itemCount} items`;
        if (status === true) {
          log.pass(
            `${pack.name}${versionLabel}${sourceLabel}`,
            `${pack.description} (${itemLabel})`,
          );
        } else if (status === 'partial') {
          log.warn(
            `${pack.name}${versionLabel}${sourceLabel}`,
            `${pack.description} (${itemLabel}) — partial`,
          );
        } else {
          log.dim(
            `  ${pack.name}${versionLabel}${sourceLabel} — ${pack.description} (${itemLabel})`,
          );
        }
      }
    });

  hooks
    .command('upgrade-pack')
    .argument('<pack>', 'Hook pack name')
    .option('--project', 'Upgrade in project .claude/ instead of global ~/.claude/')
    .description('Upgrade a hook pack to the latest version (overwrites existing files)')
    .action((packName: string, opts: { project?: boolean }) => {
      const pack = getPack(packName);
      if (!pack) {
        const available = listPacks().map((p) => p.name);
        log.fail(`Unknown pack "${packName}". Available: ${available.join(', ')}`);
        process.exit(1);
      }
      const projectDir = opts.project ? process.cwd() : undefined;
      const packVersion = pack.manifest.version ?? 'unknown';
      removePack(packName, { projectDir });
      const { installed, scripts, lifecycleHooks } = installPack(packName, { projectDir });
      for (const hook of installed) {
        log.pass(`hookify.${hook}.local.md → v${packVersion}`);
      }
      for (const script of scripts) {
        log.pass(`${script} → v${packVersion}`);
      }
      for (const lc of lifecycleHooks) {
        log.pass(`lifecycle hook ${lc} → v${packVersion}`);
      }
      const total = installed.length + scripts.length + lifecycleHooks.length;
      log.info(`Pack "${packName}" upgraded to v${packVersion} (${total} items)`);
    });

  hooks
    .command('convert')
    .argument('<name>', 'Name for the converted hook pack (kebab-case)')
    .requiredOption(
      '--event <event>',
      'Hook event: PreToolUse, PostToolUse, PreCompact, Notification, Stop',
    )
    .option(
      '--matcher <tools>',
      'Tool name matcher (e.g., "Write|Edit") — for PreToolUse/PostToolUse',
    )
    .option('--pattern <globs...>', 'File glob patterns to match (e.g., "**/marketing/**")')
    .option('--action <level>', 'Action level: remind (default), warn, block', 'remind')
    .requiredOption('--message <text>', 'Context message when hook fires')
    .option('--project', 'Output to .soleri/hook-packs/ instead of built-in packs dir')
    .description('Convert a skill into an automated hook pack')
    .action(
      (
        name: string,
        opts: {
          event: string;
          matcher?: string;
          pattern?: string[];
          action: string;
          message: string;
          project?: boolean;
        },
      ) => {
        if (!HOOK_EVENTS.includes(opts.event as HookEvent)) {
          log.fail(`Invalid event "${opts.event}". Must be one of: ${HOOK_EVENTS.join(', ')}`);
          process.exit(1);
        }

        if (!ACTION_LEVELS.includes(opts.action as ActionLevel)) {
          log.fail(`Invalid action "${opts.action}". Must be one of: ${ACTION_LEVELS.join(', ')}`);
          process.exit(1);
        }

        const config: HookConversionConfig = {
          name,
          event: opts.event as HookEvent,
          toolMatcher: opts.matcher,
          filePatterns: opts.pattern,
          action: opts.action as ActionLevel,
          message: opts.message,
        };

        const script = generateHookScript(config);
        const manifest = generateManifest(config);

        const baseDir = opts.project
          ? join(process.cwd(), '.soleri', 'hook-packs', name)
          : join(process.cwd(), 'packages', 'cli', 'src', 'hook-packs', name);

        const scriptsDir = join(baseDir, 'scripts');
        mkdirSync(scriptsDir, { recursive: true });

        const manifestPath = join(baseDir, 'manifest.json');
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
        log.pass(`Created ${manifestPath}`);

        const scriptPath = join(scriptsDir, `${name}.sh`);
        writeFileSync(scriptPath, script);
        if (process.platform !== 'win32') {
          chmodSync(scriptPath, 0o755);
        }
        log.pass(`Created ${scriptPath}`);

        log.info(`Hook pack "${name}" generated (event: ${opts.event}, action: ${opts.action})`);
      },
    );
  hooks
    .command('promote')
    .argument('<pack>', 'Hook pack name')
    .description('Promote hook action level: remind → warn → block')
    .action((packName: string) => {
      try {
        const result = promotePack(packName);
        log.pass(`${packName}: ${result.previousLevel} → ${result.newLevel}`);
      } catch (err: unknown) {
        log.fail((err as Error).message);
        process.exit(1);
      }
    });

  hooks
    .command('demote')
    .argument('<pack>', 'Hook pack name')
    .description('Demote hook action level: block → warn → remind')
    .action((packName: string) => {
      try {
        const result = demotePack(packName);
        log.pass(`${packName}: ${result.previousLevel} → ${result.newLevel}`);
      } catch (err: unknown) {
        log.fail((err as Error).message);
        process.exit(1);
      }
    });

  hooks
    .command('test')
    .argument('<pack>', 'Hook pack name to test')
    .description('Run validation tests against a hook pack')
    .action((packName: string) => {
      const pack = getPack(packName);
      if (!pack) {
        log.fail(`Unknown pack "${packName}"`);
        process.exit(1);
      }

      // Find the script
      const scripts = pack.manifest.scripts;
      if (!scripts || scripts.length === 0) {
        log.fail(`Pack "${packName}" has no scripts to test`);
        process.exit(1);
      }

      const scriptFile = scripts[0].file;
      // Resolve script path from pack directory
      const scriptPath = join(pack.dir, 'scripts', scriptFile);

      if (!existsSync(scriptPath)) {
        log.fail(`Script not found: ${scriptPath}`);
        process.exit(1);
      }

      // Determine event and matcher from lifecycle hooks
      const lc = pack.manifest.lifecycleHooks?.[0];
      const event = (lc?.event ?? 'PreToolUse') as HookEvent;
      const toolMatcher = lc?.matcher;

      // Generate fixtures and run
      const fixtures = generateFixtures(event, toolMatcher);
      log.heading(`Testing ${packName} (${fixtures.length} fixtures)`);

      const report = validateHookScript(scriptPath, fixtures);
      log.info(`Results: ${report.passed}/${report.total} passed`);

      if (report.falsePositives.length > 0) {
        log.fail(`False positives: ${report.falsePositives.length}`);
        for (const fp of report.falsePositives) {
          log.warn(`  ${fp.fixture.name}: expected no match, got output`);
        }
      }

      if (report.falseNegatives.length > 0) {
        log.warn(`False negatives: ${report.falseNegatives.length}`);
        for (const fn of report.falseNegatives) {
          log.warn(`  ${fn.fixture.name}: expected match, got no output`);
        }
      }

      if (report.falsePositives.length === 0 && report.falseNegatives.length === 0) {
        log.pass('All fixtures passed — zero false positives');
      }
    });
}

function isValidEditor(editor: string): editor is EditorId {
  return (SUPPORTED_EDITORS as readonly string[]).includes(editor);
}
