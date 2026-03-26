import { spawn } from 'node:child_process';
import type { Command } from 'commander';
import { isPackInstalled, installPack } from '../hook-packs/installer.js';
import { getPack } from '../hook-packs/registry.js';
import * as log from '../utils/logger.js';

const YOLO_PACK = 'yolo-safety';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';

export function registerYolo(program: Command): void {
  program
    .command('yolo')
    .description('Launch Claude Code in YOLO mode with safety guardrails')
    .option('--dry-run', 'Show what would happen without launching Claude')
    .option('--project', 'Install safety hooks to project .claude/ instead of global ~/.claude/')
    .action((opts: { dryRun?: boolean; project?: boolean }) => {
      runYolo(opts);
    });
}

function runYolo(opts: { dryRun?: boolean; project?: boolean }): void {
  // 1. Verify the yolo-safety pack exists in registry
  const pack = getPack(YOLO_PACK);
  if (!pack) {
    log.fail(`Hook pack "${YOLO_PACK}" not found in registry. Is @soleri/cli up to date?`);
    process.exit(1);
  }

  // 2. Check if already installed, install if not
  const projectDir = opts.project ? process.cwd() : undefined;
  const installed = isPackInstalled(YOLO_PACK, { projectDir });

  if (installed === true) {
    log.pass(`${YOLO_PACK} hook pack already installed`);
  } else {
    if (installed === 'partial') {
      log.warn(`${YOLO_PACK} hook pack partially installed — reinstalling`);
    }
    const result = installPack(YOLO_PACK, { projectDir });
    const target = opts.project ? '.claude/' : '~/.claude/';
    for (const script of result.scripts) {
      log.pass(`Installed ${script} → ${target}`);
    }
    for (const lc of result.lifecycleHooks) {
      log.pass(`Registered lifecycle hook: ${lc}`);
    }
    const totalInstalled =
      result.installed.length + result.scripts.length + result.lifecycleHooks.length;
    if (totalInstalled > 0) {
      log.pass(`${YOLO_PACK} hook pack installed (${totalInstalled} items)`);
    }
  }

  // 3. Print safety warning
  console.log();
  console.log(`  ${RED}${BOLD}⚡ YOLO MODE${RESET}`);
  console.log();
  console.log(
    `  ${YELLOW}Approval gates skipped — Claude will execute commands without asking.${RESET}`,
  );
  console.log(
    `  ${YELLOW}Safety hooks active — destructive commands (rm, git push --force,${RESET}`,
  );
  console.log(`  ${YELLOW}git reset --hard, drop table, docker rm) are intercepted.${RESET}`);
  console.log();

  if (opts.dryRun) {
    log.info('Dry run — would launch:');
    log.dim('  claude --dangerously-skip-permissions');
    return;
  }

  // 4. Launch Claude Code with permissions skipped
  log.info('Launching Claude Code in YOLO mode...');
  console.log();

  const child = spawn('claude', ['--dangerously-skip-permissions'], {
    stdio: 'inherit',
    env: { ...process.env },
  });

  child.on('error', (err) => {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      log.fail(
        'Claude CLI not found. Install it first: https://docs.anthropic.com/en/docs/claude-code',
      );
    } else {
      log.fail(`Failed to launch Claude: ${err.message}`);
    }
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.exit(1);
    }
    process.exit(code ?? 0);
  });
}
