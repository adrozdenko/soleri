import type { Command } from 'commander';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import * as p from '@clack/prompts';

const require = createRequire(import.meta.url);

function getCurrentVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return (require('../package.json') as { version: string }).version;
  } catch {
    return 'unknown';
  }
}

function getLatestVersion(): string {
  try {
    return execSync('npm view @soleri/cli version', { stdio: ['pipe', 'pipe', 'pipe'] })
      .toString()
      .trim();
  } catch {
    throw new Error('Could not reach npm registry. Check your network connection and try again.');
  }
}

function installLatest(): void {
  execSync('npm install -g soleri@latest', { stdio: 'inherit' });
}

export function registerUpdate(program: Command): void {
  program
    .command('update')
    .description('Update Soleri CLI to the latest version')
    .action(async () => {
      p.intro('Soleri Update');

      const current = getCurrentVersion();
      p.log.info(`Current version: ${current}`);

      const spinner = p.spinner();
      spinner.start('Checking latest version…');

      let latest: string;
      try {
        latest = getLatestVersion();
      } catch (err) {
        spinner.stop('Failed');
        p.log.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }

      spinner.stop(`Latest version: ${latest}`);

      if (current === latest) {
        p.log.success(`Already on latest (${current})`);
        p.outro('Nothing to do.');
        return;
      }

      p.log.info(`Updating ${current} → ${latest}…`);

      try {
        installLatest();
      } catch {
        p.log.error('Update failed. Try manually: npm install -g soleri@latest');
        process.exit(1);
      }

      const installed = getLatestVersion();
      if (installed !== latest) {
        p.log.warn(
          `Installed version (${installed}) does not match expected (${latest}). Verify manually.`,
        );
      } else {
        p.log.success(`Updated ${current} → ${installed}`);
      }

      p.outro('Restart your session to use the new version.');
    });
}
