import { resolve } from 'node:path';
import type { Command } from 'commander';
import { listAgents } from '@soleri/forge/lib';
import * as log from '../utils/logger.js';

function pad(s: string, len: number): string {
  return s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length);
}

export function registerList(program: Command): void {
  program
    .command('list')
    .argument('[dir]', 'Directory to scan for agents', process.cwd())
    .description('List all Soleri agents in a directory')
    .action((dir: string) => {
      const targetDir = resolve(dir);
      const agents = listAgents(targetDir);

      if (agents.length === 0) {
        log.info(`No agents found in ${targetDir}`);
        return;
      }

      log.heading(`Agents in ${targetDir}`);

      // Table header
      console.log(`  ${pad('ID', 16)}${pad('Domains', 26)}${pad('Built', 8)}${pad('Deps', 8)}Path`);
      console.log('  ' + '-'.repeat(80));

      for (const agent of agents) {
        const built = agent.hasDistDir ? '✓' : '✗';
        const deps = agent.hasNodeModules ? '✓' : '✗';
        const domains = agent.domains.join(', ') || '(none)';
        const truncDomains = domains.length > 25 ? domains.slice(0, 22) + '...' : domains;
        console.log(
          `  ${pad(agent.id, 16)}${pad(truncDomains, 26)}${pad(built, 8)}${pad(deps, 8)}${agent.path}`,
        );
      }

      console.log(`\n  ${agents.length} agent(s) found`);
    });
}
