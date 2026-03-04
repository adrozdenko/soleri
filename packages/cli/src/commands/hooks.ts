import type { Command } from 'commander';
import { SUPPORTED_EDITORS, type EditorId } from '../hooks/templates.js';
import { installHooks, removeHooks, detectInstalledHooks } from '../hooks/generator.js';
import { detectAgent } from '../utils/agent-context.js';
import * as log from '../utils/logger.js';

export function registerHooks(program: Command): void {
  const hooks = program.command('hooks').description('Manage editor hooks for this agent');

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
}

function isValidEditor(editor: string): editor is EditorId {
  return (SUPPORTED_EDITORS as readonly string[]).includes(editor);
}
