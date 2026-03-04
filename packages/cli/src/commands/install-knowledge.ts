import { resolve } from 'node:path';
import type { Command } from 'commander';
import * as p from '@clack/prompts';
import { installKnowledge } from '@soleri/forge/lib';
import { detectAgent } from '../utils/agent-context.js';

export function registerInstallKnowledge(program: Command): void {
  program
    .command('install-knowledge')
    .argument('<pack>', 'Path to knowledge bundle file or directory')
    .option('--no-facades', 'Skip facade generation for new domains')
    .description('Install knowledge packs into the agent in the current directory')
    .action(async (pack: string, opts: { facades: boolean }) => {
      const ctx = detectAgent();
      if (!ctx) {
        p.log.error('No agent project detected in current directory. Run this from an agent root.');
        process.exit(1);
      }

      const bundlePath = resolve(pack);

      const s = p.spinner();
      s.start(`Installing knowledge from ${bundlePath}...`);

      try {
        const result = await installKnowledge({
          agentPath: ctx.agentPath,
          bundlePath,
          generateFacades: opts.facades,
        });

        s.stop(result.success ? result.summary : 'Installation failed');

        if (result.warnings.length > 0) {
          for (const w of result.warnings) {
            p.log.warn(w);
          }
        }

        if (!result.success) {
          process.exit(1);
        }
      } catch (err) {
        s.stop('Installation failed');
        p.log.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
