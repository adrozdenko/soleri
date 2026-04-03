/**
 * Brain CLI — brain session management.
 *
 * `soleri brain close-orphans`              — close orphaned sessions (default: --max-age 1h)
 * `soleri brain close-orphans --max-age 2h` — close sessions older than 2h
 */

import type { Command } from 'commander';
import { detectAgent } from '../utils/agent-context.js';
import { pass, fail, info, heading } from '../utils/logger.js';
import { resolveVaultDbPath } from '../utils/vault-db.js';

function parseMaxAge(value: string): number {
  const match = value.match(/^(\d+)(h|m|s)$/);
  if (!match) throw new Error(`Invalid --max-age format "${value}". Use e.g. 1h, 30m, 90s`);
  const n = parseInt(match[1], 10);
  const unit = match[2];
  if (unit === 'h') return n * 60 * 60 * 1000;
  if (unit === 'm') return n * 60 * 1000;
  return n * 1000;
}

export function registerBrain(program: Command): void {
  const brain = program.command('brain').description('Brain session management');

  brain
    .command('close-orphans')
    .description('Close orphaned brain sessions that were never completed')
    .option('--max-age <duration>', 'Close sessions older than this age (e.g. 1h, 30m)', '1h')
    .action(async (opts: { maxAge: string }) => {
      const agent = detectAgent();
      if (!agent) {
        fail('Not in a Soleri agent project', 'Run from an agent directory');
        process.exit(1);
      }

      const dbPath = resolveVaultDbPath(agent.agentId);
      if (!dbPath) {
        info('Vault DB not found — no sessions to close.');
        process.exit(0);
      }

      let maxAgeMs: number;
      try {
        maxAgeMs = parseMaxAge(opts.maxAge);
      } catch (e: unknown) {
        fail(
          e instanceof Error ? e.message : String(e),
          'Example: soleri brain close-orphans --max-age 1h',
        );
        process.exit(1);
      }

      const { Vault, Brain, BrainIntelligence } = await import('@soleri/core');
      const vault = new Vault(dbPath);

      try {
        const brainInstance = new Brain(vault);
        const intelligence = new BrainIntelligence(vault, brainInstance);

        const cutoff = new Date(Date.now() - maxAgeMs).toISOString().replace('T', ' ').slice(0, 19);
        const activeSessions = intelligence.listSessions({ active: true, limit: 1000 });
        const orphans = activeSessions.filter((s) => s.startedAt < cutoff);

        if (orphans.length === 0) {
          info(`No orphaned sessions older than ${opts.maxAge}.`);
          process.exit(0);
        }

        heading('Brain — Close Orphans');

        let closed = 0;
        for (const s of orphans) {
          try {
            intelligence.lifecycle({
              action: 'end',
              sessionId: s.id,
              planOutcome: 'abandoned',
              context: `auto-closed via CLI: no completion after ${opts.maxAge}`,
            });
            closed++;
          } catch {
            // best-effort — never block on failures
          }
        }

        pass(`Closed ${closed} orphaned session${closed === 1 ? '' : 's'}`);
        process.exit(0);
      } finally {
        vault.close();
      }
    });
}
