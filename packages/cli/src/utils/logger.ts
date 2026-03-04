/**
 * Simple colored output helpers for the CLI.
 * Uses ANSI codes directly — no chalk dependency needed.
 */

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

export function pass(label: string, detail?: string): void {
  const suffix = detail ? ` ${DIM}${detail}${RESET}` : '';
  console.log(`  ${GREEN}✓${RESET} ${label}${suffix}`);
}

export function fail(label: string, detail?: string): void {
  const suffix = detail ? ` ${DIM}${detail}${RESET}` : '';
  console.log(`  ${RED}✗${RESET} ${label}${suffix}`);
}

export function warn(label: string, detail?: string): void {
  const suffix = detail ? ` ${DIM}${detail}${RESET}` : '';
  console.log(`  ${YELLOW}!${RESET} ${label}${suffix}`);
}

export function info(message: string): void {
  console.log(`  ${CYAN}ℹ${RESET} ${message}`);
}

export function heading(title: string): void {
  console.log(`\n${BOLD}${title}${RESET}\n`);
}

export function dim(message: string): void {
  console.log(`  ${DIM}${message}${RESET}`);
}
