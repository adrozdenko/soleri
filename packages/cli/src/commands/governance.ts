import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Command } from 'commander';
import { detectAgent } from '../utils/agent-context.js';
import * as log from '../utils/logger.js';

const VALID_PRESETS = ['strict', 'moderate', 'permissive'] as const;

export function registerGovernance(program: Command): void {
  program
    .command('governance')
    .description('Manage vault governance policy for an agent')
    .option('--preset <name>', 'Apply preset (strict|moderate|permissive)')
    .option('--show', 'Show current policy and quota status')
    .action(async (opts: { preset?: string; show?: boolean }) => {
      const agent = detectAgent();
      if (!agent) {
        log.fail('Not in a Soleri agent project', 'Run from an agent directory');
        process.exit(1);
      }

      const dbPath = join(homedir(), `.${agent.agentId}`, 'vault.db');
      if (!existsSync(dbPath)) {
        log.fail('Vault DB not found', `Expected ${dbPath}`);
        log.info('Run the agent once to initialize its vault database.');
        process.exit(1);
      }

      // Dynamic import to avoid loading better-sqlite3 unless needed
      const { Vault, Governance } = await import('@soleri/core');
      const vault = new Vault(dbPath);

      try {
        const governance = new Governance(vault);

        if (opts.preset) {
          if (!VALID_PRESETS.includes(opts.preset as (typeof VALID_PRESETS)[number])) {
            log.fail('Invalid preset', `Must be one of: ${VALID_PRESETS.join(', ')}`);
            process.exit(1);
          }

          governance.applyPreset(
            agent.agentId,
            opts.preset as 'strict' | 'moderate' | 'permissive',
            'soleri-cli',
          );
          log.heading('Governance — Preset Applied');
          log.pass(`Preset "${opts.preset}" applied to ${agent.agentId}`);
          console.log();
          showPolicy(governance, agent.agentId);
        } else {
          // Default: --show
          log.heading('Governance — Current Policy');
          showPolicy(governance, agent.agentId);
          console.log();
          showQuotaStatus(governance, agent.agentId);
        }
      } finally {
        vault.close();
      }
    });
}

function showPolicy(
  governance: InstanceType<typeof import('@soleri/core').Governance>,
  agentId: string,
): void {
  const policy = governance.getPolicy(agentId);

  log.info('Quotas:');
  log.dim(`  Max entries total:        ${policy.quotas.maxEntriesTotal}`);
  log.dim(`  Max entries per category: ${policy.quotas.maxEntriesPerCategory}`);
  log.dim(`  Max entries per type:     ${policy.quotas.maxEntriesPerType}`);
  log.dim(`  Warn at:                  ${policy.quotas.warnAtPercent}%`);

  console.log();
  log.info('Retention:');
  log.dim(`  Archive after:            ${policy.retention.archiveAfterDays} days`);
  log.dim(`  Min hits to keep:         ${policy.retention.minHitsToKeep}`);
  log.dim(`  Delete archived after:    ${policy.retention.deleteArchivedAfterDays} days`);

  console.log();
  log.info('Auto-capture:');
  log.dim(`  Enabled:                  ${policy.autoCapture.enabled}`);
  log.dim(`  Require review:           ${policy.autoCapture.requireReview}`);
  log.dim(`  Max pending proposals:    ${policy.autoCapture.maxPendingProposals}`);
  log.dim(`  Auto-expire:              ${policy.autoCapture.autoExpireDays} days`);
}

function showQuotaStatus(
  governance: InstanceType<typeof import('@soleri/core').Governance>,
  agentId: string,
): void {
  const status = governance.getQuotaStatus(agentId);

  log.info(`Quota usage: ${status.total} / ${status.maxTotal}`);

  if (status.isWarning) {
    log.warn(
      'Approaching quota limit',
      `${Math.round((status.total / status.maxTotal) * 100)}% used`,
    );
  } else {
    log.pass('Within quota', `${Math.round((status.total / status.maxTotal) * 100)}% used`);
  }

  if (Object.keys(status.byType).length > 0) {
    console.log();
    log.info('By type:');
    for (const [type, count] of Object.entries(status.byType)) {
      log.dim(`  ${type}: ${count}`);
    }
  }

  if (Object.keys(status.byCategory).length > 0) {
    console.log();
    log.info('By category:');
    for (const [cat, count] of Object.entries(status.byCategory)) {
      log.dim(`  ${cat}: ${count}`);
    }
  }
}
