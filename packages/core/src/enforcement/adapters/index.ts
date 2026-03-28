import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { HostAdapter } from '../types.js';
import { ClaudeCodeAdapter } from './claude-code.js';
import { OpenCodeAdapter } from './opencode.js';

export { ClaudeCodeAdapter } from './claude-code.js';
export { OpenCodeAdapter } from './opencode.js';

export type DetectedHost = 'claude-code' | 'opencode' | 'unknown';

/**
 * Detect which AI coding host is running.
 *
 * Checks environment variables and well-known config paths.
 * Defaults to 'claude-code' for backward compatibility when
 * both or neither host is detected.
 */
export function detectHost(): DetectedHost {
  const home = homedir();

  // Check for OpenCode
  const isOpenCode =
    !!process.env.OPENCODE ||
    !!process.env.OPENCODE_SESSION ||
    existsSync(join(home, '.config', 'opencode', 'opencode.json'));

  // Check for Claude Code
  const isClaudeCode = !!process.env.CLAUDE_CODE || existsSync(join(home, '.claude'));

  if (isOpenCode && !isClaudeCode) return 'opencode';
  if (isOpenCode && isClaudeCode) return 'claude-code'; // both → default
  if (!isOpenCode && !isClaudeCode) return 'claude-code'; // neither → default

  return 'claude-code';
}

/**
 * Create the appropriate host adapter for the detected environment.
 */
export function createHostAdapter(): HostAdapter {
  const host = detectHost();
  if (host === 'opencode') return new OpenCodeAdapter();
  return new ClaudeCodeAdapter();
}
