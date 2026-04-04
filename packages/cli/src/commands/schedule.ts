/**
 * Schedule CLI — manage autonomous scheduled agent tasks.
 *
 * `soleri schedule create --name X --cron "0 2 * * *" --prompt "run dream"`
 * `soleri schedule list`
 * `soleri schedule delete --id <id>`
 * `soleri schedule pause --id <id>`
 * `soleri schedule resume --id <id>`
 */

import type { Command } from 'commander';
import * as p from '@clack/prompts';
import { detectAgent } from '../utils/agent-context.js';
import * as log from '../utils/logger.js';

export function registerSchedule(program: Command): void {
  const schedule = program
    .command('schedule')
    .description('Manage autonomous scheduled agent tasks');

  // ─── create ────────────────────────────────────────────────────────
  schedule
    .command('create')
    .description('Create a new scheduled task')
    .requiredOption('--name <name>', 'Task name (unique per agent)')
    .requiredOption('--cron <expr>', 'Cron expression (5-field, min 1-hour interval)')
    .requiredOption('--prompt <text>', 'Prompt passed to claude -p when task fires')
    .option('--project-dir <path>', 'Agent project directory (default: current directory)')
    .action(async (opts: { name: string; cron: string; prompt: string; projectDir?: string }) => {
      const agent = detectAgent();
      if (!agent) {
        log.fail('Not in a Soleri agent project', 'Run from an agent directory');
        process.exit(1);
      }

      const { Scheduler, InMemorySchedulerStore, validateCron } = await import('@soleri/core');

      const cronError = validateCron(opts.cron);
      if (cronError) {
        log.fail('Invalid cron expression', cronError);
        process.exit(1);
      }

      const s = p.spinner();
      s.start('Creating scheduled task...');

      try {
        const scheduler = new Scheduler(undefined, new InMemorySchedulerStore());
        const result = await scheduler.create({
          name: opts.name,
          cronExpression: opts.cron,
          prompt: opts.prompt,
          projectPath: opts.projectDir ?? agent.agentPath,
        });

        if ('error' in result) {
          s.stop('Failed');
          log.fail(result.error);
          process.exit(1);
        }

        s.stop('Task created');
        log.pass(`Task "${opts.name}" scheduled`, `ID: ${result.id}`);
        p.log.info(`Cron: ${opts.cron}`);
        p.log.info(`Platform ID: ${result.platformId ?? 'pending'}`);
      } catch (err) {
        s.stop('Failed');
        log.fail(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // ─── list ──────────────────────────────────────────────────────────
  schedule
    .command('list')
    .description('List all scheduled tasks')
    .action(async () => {
      const { Scheduler, InMemorySchedulerStore } = await import('@soleri/core');
      const scheduler = new Scheduler(undefined, new InMemorySchedulerStore());
      const tasks = await scheduler.list();

      if (tasks.length === 0) {
        p.log.info('No scheduled tasks. Use: soleri schedule create');
        return;
      }

      log.heading(`Scheduled Tasks (${tasks.length})`);
      for (const t of tasks) {
        const status = t.enabled ? 'enabled' : 'paused';
        const sync = t.platformSynced ? 'synced' : 'not synced';
        p.log.info(`${t.name}  [${status}] [${sync}]`);
        p.log.info(`  ID: ${t.id}  Cron: ${t.cronExpression}`);
        p.log.info(`  Prompt: ${t.prompt.slice(0, 60)}${t.prompt.length > 60 ? '...' : ''}`);
      }
    });

  // ─── delete ────────────────────────────────────────────────────────
  schedule
    .command('delete')
    .description('Delete a scheduled task')
    .requiredOption('--id <id>', 'Task ID to delete')
    .action(async (opts: { id: string }) => {
      const { Scheduler, InMemorySchedulerStore } = await import('@soleri/core');
      const scheduler = new Scheduler(undefined, new InMemorySchedulerStore());
      const result = await scheduler.delete(opts.id);

      if (!result.deleted) {
        log.fail(result.error ?? 'Delete failed');
        process.exit(1);
      }

      log.pass(`Task ${opts.id} deleted`);
    });

  // ─── pause ─────────────────────────────────────────────────────────
  schedule
    .command('pause')
    .description('Pause a scheduled task without deleting it')
    .requiredOption('--id <id>', 'Task ID to pause')
    .action(async (opts: { id: string }) => {
      const { Scheduler, InMemorySchedulerStore } = await import('@soleri/core');
      const scheduler = new Scheduler(undefined, new InMemorySchedulerStore());
      const result = await scheduler.pause(opts.id);

      if (!result.paused) {
        log.fail(result.error ?? 'Pause failed');
        process.exit(1);
      }

      log.pass(`Task ${opts.id} paused`);
    });

  // ─── resume ────────────────────────────────────────────────────────
  schedule
    .command('resume')
    .description('Resume a paused scheduled task')
    .requiredOption('--id <id>', 'Task ID to resume')
    .action(async (opts: { id: string }) => {
      const { Scheduler, InMemorySchedulerStore } = await import('@soleri/core');
      const scheduler = new Scheduler(undefined, new InMemorySchedulerStore());
      const result = await scheduler.resume(opts.id);

      if (!result.resumed) {
        log.fail(result.error ?? 'Resume failed');
        process.exit(1);
      }

      log.pass(`Task ${opts.id} resumed`);
    });
}
