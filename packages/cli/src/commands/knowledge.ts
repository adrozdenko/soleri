/**
 * Knowledge CLI — export vault entries as portable knowledge bundle JSON files.
 *
 * `soleri knowledge export --domain <name>`  — export single domain to knowledge/<name>/patterns.json
 * `soleri knowledge export --all`            — export all domains
 * `soleri knowledge export --min-score 0.5`  — filter low-quality entries
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Command } from 'commander';
import * as log from '../utils/logger.js';
import { detectAgent } from '../utils/agent-context.js';
import { resolveVaultDbPath } from '../utils/vault-db.js';

interface ExportOpts {
  domain?: string;
  all?: boolean;
  minScore?: string;
  output?: string;
}

export function registerKnowledge(program: Command): void {
  const knowledge = program.command('knowledge').description('Knowledge bundle management');

  knowledge
    .command('export')
    .description('Export vault entries to portable knowledge bundle JSON files')
    .option('--domain <name>', 'Export a specific domain')
    .option('--all', 'Export all domains')
    .option('--min-score <number>', 'Minimum quality score threshold (0-1)', '0')
    .option('--output <dir>', 'Output directory (default: ./knowledge/)')
    .action(async (opts: ExportOpts) => {
      const agent = detectAgent();
      if (!agent) {
        log.fail('Not in a Soleri agent project', 'Run from an agent directory');
        process.exit(1);
      }

      if (!opts.domain && !opts.all) {
        log.fail('Specify --domain <name> or --all');
        process.exit(1);
      }

      const vaultDbPath = resolveVaultDbPath(agent.agentId);
      if (!vaultDbPath) {
        log.fail('Vault DB not found', 'Run the agent once to initialize its vault database.');
        process.exit(1);
      }

      const minScore = parseFloat(opts.minScore ?? '0');
      const outputDir = opts.output ? resolve(opts.output) : resolve('knowledge');

      const { Vault } = await import('@soleri/core');
      const vault = new Vault(vaultDbPath);

      try {
        log.heading('Knowledge Export');

        const domainsToExport: string[] = [];

        if (opts.all) {
          const all = vault.list({ limit: 50_000 });
          const domainSet = new Set<string>();
          for (const e of all) {
            if (e.domain) domainSet.add(e.domain);
          }
          domainsToExport.push(...domainSet);
        } else if (opts.domain) {
          domainsToExport.push(opts.domain);
        }

        if (domainsToExport.length === 0) {
          log.warn('No domains found in vault');
          return;
        }

        let totalExported = 0;

        for (const domain of domainsToExport) {
          const entries = vault.list({ domain, limit: 10_000 });

          // Filter by score if provided (vault entries may have a score/severity field)
          const filtered = entries.filter((e) => {
            if (minScore <= 0) return true;
            // Use tags count as a rough quality proxy when no explicit score exists
            const tagScore = (e.tags?.length ?? 0) / 10 + (e.description ? 0.5 : 0);
            return tagScore >= minScore;
          });

          if (filtered.length === 0) {
            log.warn(`Domain "${domain}": no entries passed min-score filter`);
            continue;
          }

          // Format entries into knowledge bundle schema
          const bundleEntries = filtered.map((e) => ({
            id: e.id,
            type: e.type,
            domain: e.domain,
            title: e.title,
            description: e.description,
            ...(e.severity ? { severity: e.severity } : {}),
            ...(e.tags?.length ? { tags: e.tags } : {}),
          }));

          const domainDir = join(outputDir, domain);
          mkdirSync(domainDir, { recursive: true });
          const outPath = join(domainDir, 'patterns.json');
          writeFileSync(outPath, JSON.stringify(bundleEntries, null, 2) + '\n', 'utf-8');

          log.pass(`${domain}: exported ${filtered.length} entries`, outPath);
          totalExported += filtered.length;
        }

        log.pass(
          `Total: ${totalExported} entries across ${domainsToExport.length} domain(s)`,
          outputDir,
        );
      } finally {
        vault.close();
      }
    });
}
