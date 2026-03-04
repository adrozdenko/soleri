import type { Command } from 'commander';
import * as p from '@clack/prompts';
import { addDomain } from '@soleri/forge/lib';
import { detectAgent } from '../utils/agent-context.js';

export function registerAddDomain(program: Command): void {
  program
    .command('add-domain')
    .argument('<domain>', 'Domain name in kebab-case (e.g., "security")')
    .option('--no-build', 'Skip the build step after adding the domain')
    .description('Add a new knowledge domain to the agent in the current directory')
    .action(async (domain: string, opts: { build: boolean }) => {
      const ctx = detectAgent();
      if (!ctx) {
        p.log.error('No agent project detected in current directory. Run this from an agent root.');
        process.exit(1);
      }

      const s = p.spinner();
      s.start(`Adding domain "${domain}" to ${ctx.agentId}...`);

      try {
        const result = await addDomain({
          agentPath: ctx.agentPath,
          domain,
          noBuild: !opts.build,
        });

        s.stop(result.success ? result.summary : 'Failed');

        if (result.warnings.length > 0) {
          for (const w of result.warnings) {
            p.log.warn(w);
          }
        }

        if (!result.success) {
          process.exit(1);
        }
      } catch (err) {
        s.stop('Failed');
        p.log.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
