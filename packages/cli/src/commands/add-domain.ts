import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import * as p from '@clack/prompts';
import { addDomain } from '@soleri/forge/lib';
import { detectAgent } from '../utils/agent-context.js';
import { resolveVaultDbPath } from '../utils/vault-db.js';

export function registerAddDomain(program: Command): void {
  program
    .command('add-domain')
    .argument('<domain>', 'Domain name in kebab-case (e.g., "security")')
    .option('--no-build', 'Skip the build step after adding the domain')
    .option('--yes', 'Auto-seed vault entries into the knowledge bundle without prompting')
    .description('Add a new knowledge domain to the agent in the current directory')
    .action(async (domain: string, opts: { build: boolean; yes?: boolean }) => {
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
          format: ctx.format,
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

        // ── Vault auto-seed ────────────────────────────────────────────────
        await trySeedFromVault(ctx.agentId, ctx.agentPath, domain, opts.yes ?? false);
      } catch (err) {
        s.stop('Failed');
        p.log.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

/**
 * Query the agent's vault for entries matching the domain.
 * If found, prompt the user (or auto-seed with --yes) to populate the bundle.
 */
async function trySeedFromVault(
  agentId: string,
  agentPath: string,
  domain: string,
  autoYes: boolean,
): Promise<void> {
  const vaultDbPath = resolveVaultDbPath(agentId);
  if (!vaultDbPath) return; // Vault not initialized yet — skip silently

  try {
    const { Vault } = await import('@soleri/core');
    const vault = new Vault(vaultDbPath);

    let entries: Array<{
      id: string;
      type: string;
      domain?: string;
      title: string;
      description: string;
      tags?: string[];
      severity?: string;
    }>;
    try {
      entries = vault.list({ domain, limit: 200 });
    } finally {
      vault.close();
    }

    if (entries.length === 0) return; // No matching entries

    // Ask user (or auto-seed)
    let shouldSeed = autoYes;
    if (!autoYes) {
      const answer = await p.confirm({
        message: `Found ${entries.length} vault entries for domain "${domain}". Seed into knowledge bundle?`,
        initialValue: true,
      });
      if (p.isCancel(answer)) return;
      shouldSeed = answer;
    }

    if (!shouldSeed) return;

    // Populate knowledge/{domain}.json
    const bundlePath = join(agentPath, 'knowledge', `${domain}.json`);
    const bundleEntries = entries.map((e) => ({
      id: e.id,
      type: e.type,
      domain: e.domain,
      title: e.title,
      description: e.description,
      ...(e.severity ? { severity: e.severity } : {}),
      ...(e.tags?.length ? { tags: e.tags } : {}),
    }));

    try {
      const existing = JSON.parse(readFileSync(bundlePath, 'utf-8')) as {
        domain: string;
        entries: unknown[];
      };
      existing.entries = bundleEntries;
      writeFileSync(bundlePath, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
    } catch {
      // File not readable — write fresh
      writeFileSync(
        bundlePath,
        JSON.stringify({ domain, entries: bundleEntries }, null, 2) + '\n',
        'utf-8',
      );
    }

    p.log.success(`Seeded ${entries.length} entries into knowledge/${domain}.json`);
  } catch {
    // Vault query failed — don't block the domain addition
  }
}
