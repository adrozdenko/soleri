/**
 * Dream CLI — vault memory consolidation.
 *
 * `soleri dream`                        — run a dream pass immediately
 * `soleri dream schedule [--time HH:MM]` — schedule daily cron
 * `soleri dream unschedule`             — remove cron entry
 * `soleri dream status`                 — show dream status + cron info
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { detectAgent } from '../utils/agent-context.js';
import { pass, fail, info, heading, dim } from '../utils/logger.js';
import { SOLERI_HOME } from '@soleri/core';

function resolveVaultDbPath(agentId: string): string | null {
  const newDbPath = join(SOLERI_HOME, agentId, 'vault.db');
  const legacyDbPath = join(SOLERI_HOME, '..', `.${agentId}`, 'vault.db');
  if (existsSync(newDbPath)) return newDbPath;
  if (existsSync(legacyDbPath)) return legacyDbPath;
  return null;
}

export function registerDream(program: Command): void {
  const dream = program.command('dream').description('Vault memory consolidation');

  // ─── soleri dream (no subcommand) — run immediately ─────────
  dream
    .command('run', { isDefault: true })
    .description('Run a dream pass immediately')
    .action(async () => {
      const agent = detectAgent();
      if (!agent) {
        fail('Not in a Soleri agent project', 'Run from an agent directory');
        process.exit(1);
      }

      const dbPath = resolveVaultDbPath(agent.agentId);
      if (!dbPath) {
        fail('Vault DB not found', 'Run the agent once to initialize its vault database.');
        process.exit(1);
      }

      const { Vault, Curator, DreamEngine, ensureDreamSchema } = await import('@soleri/core');
      const vault = new Vault(dbPath);

      try {
        ensureDreamSchema(vault.getProvider());
        const curator = new Curator(vault);
        const engine = new DreamEngine(vault, curator);

        heading('Dream — Memory Consolidation');
        info('Running dream pass...');
        console.log();

        const report = engine.run();

        pass('Dream pass complete');
        console.log();
        console.log('  Field                  Value');
        console.log('  ─────────────────────  ──────────────');
        dim(`  Duration               ${report.durationMs}ms`);
        dim(`  Duplicates found       ${report.duplicatesFound}`);
        dim(`  Stale archived         ${report.staleArchived}`);
        dim(`  Contradictions found   ${report.contradictionsFound}`);
        dim(`  Total dreams           ${report.totalDreams}`);
        dim(`  Timestamp              ${report.timestamp}`);
        console.log();
      } finally {
        vault.close();
      }
    });

  // ─── soleri dream schedule ──────────────────────────────────
  dream
    .command('schedule')
    .description('Schedule daily dream cron job')
    .option('--time <HH:MM>', 'Time to run (24h format)', '22:00')
    .action(async (opts: { time: string }) => {
      const agent = detectAgent();
      if (!agent) {
        fail('Not in a Soleri agent project', 'Run from an agent directory');
        process.exit(1);
      }

      const { scheduleDream } = await import('@soleri/core');

      const result = scheduleDream(opts.time, agent.agentPath);

      if (!result.isScheduled) {
        fail('Failed to schedule dream cron', 'Check time format (HH:MM) and crontab access.');
        process.exit(1);
      }

      heading('Dream — Scheduled');
      pass(`Daily dream scheduled at ${result.time}`);
      dim(`  Log path: ${result.logPath}`);
      dim(`  Project:  ${result.projectDir}`);
      console.log();
    });

  // ─── soleri dream unschedule ────────────────────────────────
  dream
    .command('unschedule')
    .description('Remove dream cron entry')
    .action(async () => {
      const { unscheduleDream } = await import('@soleri/core');

      unscheduleDream();

      heading('Dream — Unscheduled');
      pass('Dream cron entry removed');
      console.log();
    });

  // ─── soleri dream status ────────────────────────────────────
  dream
    .command('status')
    .description('Show dream status and cron info')
    .action(async () => {
      const agent = detectAgent();
      if (!agent) {
        fail('Not in a Soleri agent project', 'Run from an agent directory');
        process.exit(1);
      }

      const dbPath = resolveVaultDbPath(agent.agentId);

      heading('Dream — Status');

      // Dream engine status (only if vault exists)
      if (dbPath) {
        const { Vault, Curator, DreamEngine, ensureDreamSchema } = await import('@soleri/core');
        const vault = new Vault(dbPath);

        try {
          ensureDreamSchema(vault.getProvider());
          const curator = new Curator(vault);
          const engine = new DreamEngine(vault, curator);
          const status = engine.getStatus();

          console.log('  Field                     Value');
          console.log('  ────────────────────────  ──────────────');
          dim(`  Sessions since last       ${status.sessionsSinceLastDream}`);
          dim(`  Last dream at             ${status.lastDreamAt ?? 'never'}`);
          dim(
            `  Last duration             ${status.lastDreamDurationMs !== null ? `${status.lastDreamDurationMs}ms` : 'n/a'}`,
          );
          dim(`  Total dreams              ${status.totalDreams}`);
          dim(`  Gate eligible             ${status.gateEligible ? 'yes' : 'no'}`);
        } finally {
          vault.close();
        }
      } else {
        info('Vault DB not found — dream engine status unavailable.');
      }

      console.log();

      // Cron schedule status
      const { getDreamSchedule } = await import('@soleri/core');
      const cron = getDreamSchedule();

      if (cron.isScheduled) {
        pass(`Cron scheduled at ${cron.time}`);
        dim(`  Log path: ${cron.logPath}`);
        dim(`  Project:  ${cron.projectDir}`);
      } else {
        info('No cron schedule configured. Run `soleri dream schedule` to set one.');
      }
      console.log();
    });
}
