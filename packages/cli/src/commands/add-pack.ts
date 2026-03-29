import type { Command } from 'commander';
import * as p from '@clack/prompts';

export function registerAddPack(program: Command): void {
  program
    .command('add-pack')
    .argument('<pack>', 'Pack name')
    .description('[DEPRECATED] Use "soleri pack install" or "soleri hooks add-pack" instead')
    .action(async () => {
      p.log.warn(
        'The "add-pack" command is deprecated.\n\n' +
          'Use these commands instead:\n' +
          '  • soleri pack install <pack>    — install knowledge/domain packs\n' +
          '  • soleri hooks add-pack <pack>  — install hook packs\n',
      );
    });
}
