import type { Command } from 'commander';
import { SUPPORTED_EDITORS, type EditorId } from '../hooks/templates.js';
import { installHooks, removeHooks, detectInstalledHooks } from '../hooks/generator.js';
import { detectAgent } from '../utils/agent-context.js';
import { listPacks, getPack } from '../hook-packs/registry.js';
import { installPack, removePack, isPackInstalled } from '../hook-packs/installer.js';
import * as log from '../utils/logger.js';

export function registerHooks(program: Command): void {
  const hooks = program.command('hooks').description('Manage editor hooks and hook packs');

  hooks.command('add').argument('<editor>', `Editor: ${SUPPORTED_EDITORS.join(', ')}`).description('Generate editor hooks/config files').action((editor: string) => {
    if (!isValidEditor(editor)) { log.fail(`Unknown editor "${editor}". Supported: ${SUPPORTED_EDITORS.join(', ')}`); process.exit(1); }
    const ctx = detectAgent();
    if (!ctx) { log.fail('No agent project detected in current directory.'); process.exit(1); }
    const files = installHooks(editor, ctx.agentPath);
    for (const f of files) { log.pass(`Created ${f}`); }
    log.info(`${editor} hooks installed for ${ctx.agentId}`);
  });

  hooks.command('remove').argument('<editor>', `Editor: ${SUPPORTED_EDITORS.join(', ')}`).description('Remove editor hooks/config files').action((editor: string) => {
    if (!isValidEditor(editor)) { log.fail(`Unknown editor "${editor}". Supported: ${SUPPORTED_EDITORS.join(', ')}`); process.exit(1); }
    const ctx = detectAgent();
    if (!ctx) { log.fail('No agent project detected in current directory.'); process.exit(1); }
    const removed = removeHooks(editor, ctx.agentPath);
    if (removed.length === 0) { log.info(`No ${editor} hooks found to remove.`); } else {
      for (const f of removed) { log.warn(`Removed ${f}`); }
      log.info(`${editor} hooks removed from ${ctx.agentId}`);
    }
  });

  hooks.command('list').description('Show which editor hooks are installed').action(() => {
    const ctx = detectAgent();
    if (!ctx) { log.fail('No agent project detected in current directory.'); process.exit(1); }
    const installed = detectInstalledHooks(ctx.agentPath);
    log.heading(`Editor hooks for ${ctx.agentId}`);
    for (const editor of SUPPORTED_EDITORS) {
      if (installed.includes(editor)) { log.pass(editor, 'installed'); } else { log.dim(`  ${editor} — not installed`); }
    }
  });

  hooks.command('add-pack').argument('<pack>', 'Hook pack name').option('--project', 'Install to project .claude/ instead of global ~/.claude/').description('Install a hook pack globally (~/.claude/) or per-project (--project)').action((packName: string, opts: { project?: boolean }) => {
    const pack = getPack(packName);
    if (!pack) { const available = listPacks().map((p) => p.name); log.fail(`Unknown pack "${packName}". Available: ${available.join(', ')}`); process.exit(1); }
    const projectDir = opts.project ? process.cwd() : undefined;
    const target = opts.project ? '.claude/' : '~/.claude/';
    const { installed, skipped, scripts, lifecycleHooks } = installPack(packName, { projectDir });
    for (const hook of installed) { log.pass(`Installed hookify.${hook}.local.md → ${target}`); }
    for (const hook of skipped) { log.dim(`  hookify.${hook}.local.md — already exists, skipped`); }
    for (const script of scripts) { log.pass(`Installed ${script} → ${target}`); }
    for (const lc of lifecycleHooks) { log.pass(`Registered lifecycle hook: ${lc}`); }
    const totalInstalled = installed.length + scripts.length + lifecycleHooks.length;
    if (totalInstalled > 0) { log.info(`Pack "${packName}" installed (${totalInstalled} items) → ${target}`); } else { log.info(`Pack "${packName}" — all hooks already installed`); }
  });

  hooks.command('remove-pack').argument('<pack>', 'Hook pack name').option('--project', 'Remove from project .claude/ instead of global ~/.claude/').description('Remove a hook pack').action((packName: string, opts: { project?: boolean }) => {
    const pack = getPack(packName);
    if (!pack) { const available = listPacks().map((p) => p.name); log.fail(`Unknown pack "${packName}". Available: ${available.join(', ')}`); process.exit(1); }
    const projectDir = opts.project ? process.cwd() : undefined;
    const { removed, scripts, lifecycleHooks } = removePack(packName, { projectDir });
    const totalRemoved = removed.length + scripts.length + lifecycleHooks.length;
    if (totalRemoved === 0) { log.info(`No hooks from pack "${packName}" found to remove.`); } else {
      for (const hook of removed) { log.warn(`Removed hookify.${hook}.local.md`); }
      for (const script of scripts) { log.warn(`Removed ${script}`); }
      for (const lc of lifecycleHooks) { log.warn(`Removed lifecycle hook: ${lc}`); }
      log.info(`Pack "${packName}" removed (${totalRemoved} items)`);
    }
  });

  hooks.command('list-packs').description('Show available hook packs and their status').action(() => {
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
      if (status === true) { log.pass(`${pack.name}${versionLabel}${sourceLabel}`, `${pack.description} (${itemLabel})`); }
      else if (status === 'partial') { log.warn(`${pack.name}${versionLabel}${sourceLabel}`, `${pack.description} (${itemLabel}) — partial`); }
      else { log.dim(`  ${pack.name}${versionLabel}${sourceLabel} — ${pack.description} (${itemLabel})`); }
    }
  });

  hooks.command('upgrade-pack').argument('<pack>', 'Hook pack name').option('--project', 'Upgrade in project .claude/ instead of global ~/.claude/').description('Upgrade a hook pack to the latest version (overwrites existing files)').action((packName: string, opts: { project?: boolean }) => {
    const pack = getPack(packName);
    if (!pack) { const available = listPacks().map((p) => p.name); log.fail(`Unknown pack "${packName}". Available: ${available.join(', ')}`); process.exit(1); }
    const projectDir = opts.project ? process.cwd() : undefined;
    const packVersion = pack.manifest.version ?? 'unknown';
    removePack(packName, { projectDir });
    const { installed, scripts, lifecycleHooks } = installPack(packName, { projectDir });
    for (const hook of installed) { log.pass(`hookify.${hook}.local.md → v${packVersion}`); }
    for (const script of scripts) { log.pass(`${script} → v${packVersion}`); }
    for (const lc of lifecycleHooks) { log.pass(`lifecycle hook ${lc} → v${packVersion}`); }
    const total = installed.length + scripts.length + lifecycleHooks.length;
    log.info(`Pack "${packName}" upgraded to v${packVersion} (${total} items)`);
  });
}

function isValidEditor(editor: string): editor is EditorId {
  return (SUPPORTED_EDITORS as readonly string[]).includes(editor);
}
