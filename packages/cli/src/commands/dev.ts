import { spawn } from 'node:child_process';
import { existsSync, watch, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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

      if (ctx.format === 'filetree') {
        // v7: File-tree agent — watch files and regenerate CLAUDE.md
        runFileTreeDev(ctx.agentPath, ctx.agentId);
      } else {
        // Legacy: TypeScript agent — run via tsx
        runLegacyDev(ctx.agentPath, ctx.agentId);
      }
    });
}

async function runFileTreeDev(agentPath: string, agentId: string): Promise<void> {
  p.log.info(`Starting ${agentId} in file-tree dev mode...`);
  p.log.info('Starting Knowledge Engine + watching for file changes.');
  p.log.info('CLAUDE.md will be regenerated automatically on changes.');
  p.log.info('Press Ctrl+C to stop.\n');

  await regenerateClaudeMd(agentPath);

  // Start the engine server
  let engineBin: string;
  try {
    const candidate = join(
      agentPath,
      'node_modules',
      '@soleri',
      'core',
      'dist',
      'engine',
      'bin',
      'soleri-engine.js',
    );
    if (!existsSync(candidate)) throw new Error('Engine not found at ' + candidate);
    engineBin = candidate;
  } catch {
    p.log.error('Engine not found. Run: npm install @soleri/core');
    process.exit(1);
  }

  const engine = spawn('node', [engineBin, '--agent', join(agentPath, 'agent.yaml')], {
    stdio: ['pipe', 'inherit', 'inherit'],
    env: { ...process.env },
  });

  engine.on('error', (err) => {
    p.log.error(`Engine failed to start: ${err.message}`);
    p.log.info('Make sure @soleri/core is built: cd packages/core && npm run build');
  });

  // Watch directories for changes
  const watchPaths = [
    join(agentPath, 'agent.yaml'),
    join(agentPath, 'instructions'),
    join(agentPath, 'workflows'),
    join(agentPath, 'skills'),
  ];

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  for (const watchPath of watchPaths) {
    try {
      watch(watchPath, { recursive: true }, (_event, filename) => {
        // Ignore CLAUDE.md changes (we generate it)
        if (filename === 'CLAUDE.md' || filename === 'AGENTS.md') return;
        // Ignore _engine.md changes (we generate it)
        if (filename === '_engine.md') return;

        // Debounce — regenerate at most once per 200ms
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          const changedFile = filename ? ` (${filename})` : '';
          p.log.info(`Change detected${changedFile} — regenerating CLAUDE.md`);
          await regenerateClaudeMd(agentPath);
        }, 200);
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('ENOENT')) {
        p.log.warn(`File watch stopped: ${msg}. Restart soleri dev if changes stop updating.`);
      }
    }
  }

  // Graceful shutdown — kill engine too
  const shutdown = () => {
    p.log.info('\nStopping dev mode...');
    engine.kill();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  engine.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      p.log.error(`Engine exited with code ${code}`);
      process.exit(1);
    }
  });
}

async function regenerateClaudeMd(agentPath: string): Promise<void> {
  try {
    // Dynamic import to avoid loading forge at CLI startup
    const { composeClaudeMd } = await import('@soleri/forge/lib');
    const { content } = composeClaudeMd(agentPath);
    writeFileSync(join(agentPath, 'CLAUDE.md'), content, 'utf-8');
    p.log.success('CLAUDE.md regenerated');
  } catch (err) {
    p.log.error(
      `Failed to regenerate CLAUDE.md: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function runLegacyDev(agentPath: string, agentId: string): void {
  p.log.info(`Starting ${agentId} in dev mode...`);

  const child = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: agentPath,
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
}
