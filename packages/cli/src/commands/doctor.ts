import type { Command } from 'commander';
import { runAllChecks } from '../utils/checks.js';
import * as log from '../utils/logger.js';

export function registerDoctor(program: Command): void {
  program
    .command('doctor')
    .description('Check system health and agent project status')
    .action(() => {
      log.heading('Soleri Doctor');

      const results = runAllChecks();
      let hasFailures = false;

      for (const r of results) {
        if (r.status === 'pass') log.pass(r.label, r.detail);
        else if (r.status === 'warn') log.warn(r.label, r.detail);
        else {
          log.fail(r.label, r.detail);
          hasFailures = true;
        }
      }

      console.log();

      if (hasFailures) {
        log.info('Some checks failed. Fix the issues above and run soleri doctor again.');
        process.exit(1);
      } else {
        log.info('All checks passed!');
      }
    });
}
