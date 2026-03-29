/**
 * Vault CLI — export vault entries as browsable markdown files.
 *
 * `soleri vault export`                     — export to ./knowledge/vault/
 * `soleri vault export --path ~/obsidian`   — export to custom directory
 * `soleri vault export --domain arch`       — filter by domain
 */

import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { detectAgent } from '../utils/agent-context.js';
import * as log from '../utils/logger.js';
import { SOLERI_HOME } from '@soleri/core';

export function registerVault(program: Command): void {
  const vault = program.command('vault').description('Vault knowledge management');

  vault
    .command('export')
    .description('Export vault entries as browsable markdown files')
    .option('--path <dir>', 'Output directory (default: ./knowledge/)')
    .option('--domain <name>', 'Filter by domain')
    .action(async (opts: { path?: string; domain?: string }) => {
      const agent = detectAgent();
      if (!agent) {
        log.fail('Not in a Soleri agent project', 'Run from an agent directory');
        process.exit(1);
      }

      const outputDir = opts.path ? resolve(opts.path) : resolve('knowledge');

      // Find vault DB — check new path first, then legacy
      const newDbPath = join(SOLERI_HOME, agent.agentId, 'vault.db');
      const legacyDbPath = join(SOLERI_HOME, '..', `.${agent.agentId}`, 'vault.db');
      const vaultDbPath = existsSync(newDbPath)
        ? newDbPath
        : existsSync(legacyDbPath)
          ? legacyDbPath
          : null;

      if (!vaultDbPath) {
        log.fail('Vault DB not found', 'Run the agent once to initialize its vault database.');
        process.exit(1);
      }

      // Dynamic import to avoid loading better-sqlite3 unless needed
      const { Vault } = await import('@soleri/core');
      const vaultInstance = new Vault(vaultDbPath);

      try {
        log.heading('Vault Export');

        if (opts.domain) {
          const { syncEntryToMarkdown } = await import('@soleri/core');
          const entries = vaultInstance.list({ limit: 10000, domain: opts.domain });
          let synced = 0;
          for (const entry of entries) {
            await syncEntryToMarkdown(entry, outputDir);
            synced++;
          }
          log.pass(
            `Exported ${synced} entries from domain "${opts.domain}"`,
            `${outputDir}/vault/`,
          );
        } else {
          const { syncAllToMarkdown } = await import('@soleri/core');
          const result = await syncAllToMarkdown(vaultInstance, outputDir);
          log.pass(
            `Exported ${result.synced} entries (${result.skipped} unchanged)`,
            `${outputDir}/vault/`,
          );
        }
      } finally {
        vaultInstance.close();
      }
    });
}
