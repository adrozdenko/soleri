import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import type { Command } from 'commander';
import { listAgents } from '@soleri/forge/lib';
import type { AgentInfo } from '@soleri/forge/lib';
import * as log from '../utils/logger.js';

function pad(s: string, len: number): string {
  return s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length);
}

function printAgentTable(agents: AgentInfo[]): void {
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
}

export function registerList(program: Command): void {
  program
    .command('list')
    .argument('[dir]', 'Directory to scan for agents')
    .description('List all Soleri agents in a directory (scans common locations if none given)')
    .action((dir?: string) => {
      if (dir) {
        // Explicit directory — scan only that
        const targetDir = resolve(dir);
        const agents = listAgents(targetDir);

        if (agents.length === 0) {
          log.info(`No agents found in ${targetDir}`);
          return;
        }

        log.heading(`Agents in ${targetDir}`);
        printAgentTable(agents);
        console.log(`\n  ${agents.length} agent(s) found`);
        return;
      }

      // No directory given — scan common locations
      const home = homedir();
      const scanDirs = [
        process.cwd(),
        home,
        resolve(home, 'agents'),
        resolve(home, 'projects'),
      ].filter((d, i, arr) => existsSync(d) && arr.indexOf(d) === i);

      const allAgents: AgentInfo[] = [];
      for (const d of scanDirs) {
        allAgents.push(...listAgents(d));
      }

      // Deduplicate by path
      const seen = new Set<string>();
      const unique = allAgents.filter((a) => {
        if (seen.has(a.path)) return false;
        seen.add(a.path);
        return true;
      });

      if (unique.length === 0) {
        log.info('No agents found. Create one with: soleri create');
        return;
      }

      log.heading('Soleri Agents');
      printAgentTable(unique);
      console.log(`\n  ${unique.length} agent(s) found`);
    });
}
