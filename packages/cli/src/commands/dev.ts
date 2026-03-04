import { spawn } from 'node:child_process';
import type { Command } from 'commander';
import * as p from '@clack/prompts';
import { detectAgent } from '../utils/agent-context.js';

export function registerDev(program: Command): void {
  program
    .command('dev')
    .description('Run the agent in development mode (stdio MCP server)')
    .action(() => {
      const ctx = detectAgent();
      if (!ctx) {
        p.log.error('No agent project detected in current directory. Run this from an agent root.');
        process.exit(1);
      }

      p.log.info(`Starting ${ctx.agentId} in dev mode...`);

      const child = spawn('npx', ['tsx', 'src/index.ts'], {
        cwd: ctx.agentPath,
        stdio: 'inherit',
        env: { ...process.env },
      });

      child.on('error', (err) => {
        p.log.error(`Failed to start: ${err.message}`);
        p.log.info('Make sure tsx is available: npm install -g tsx');
        process.exit(1);
      });

      child.on('exit', (code, signal) => {
        if (signal) {
          p.log.warn(`Process terminated by signal ${signal}`);
          process.exit(1);
        }
        process.exit(code ?? 0);
      });
    });
}
