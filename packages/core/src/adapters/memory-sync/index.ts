/**
 * Memory sync adapter registry — detect host and create the right adapter.
 *
 * Follows the same pattern as enforcement/adapters/index.ts.
 *
 * @module adapters/memory-sync
 */

import { detectHost } from '../../enforcement/adapters/index.js';
import type { MemorySyncAdapter } from './types.js';
import { ClaudeCodeMemorySyncAdapter } from './claude-code-sync.js';
import { OpenCodeMemorySyncAdapter } from './opencode-sync.js';

// Re-exports
export type {
  MemorySyncAdapter,
  MemorySyncEntry,
  MemorySyncConfig,
  MemorySyncResult,
  SyncManifest,
} from './types.js';
export { DEFAULT_SYNC_CONFIG } from './types.js';
export { ClaudeCodeMemorySyncAdapter } from './claude-code-sync.js';
export { OpenCodeMemorySyncAdapter } from './opencode-sync.js';
export { selectEntriesForSync } from './sync-strategy.js';
export type { VaultMemory, VaultEntry } from './sync-strategy.js';

/**
 * Detect which host's memory system to sync to.
 * Reuses enforcement adapter detection.
 */
export function detectSyncHost(): 'claude-code' | 'opencode' {
  const host = detectHost();
  return host === 'opencode' ? 'opencode' : 'claude-code';
}

/**
 * Create a memory sync adapter for the given (or detected) host.
 *
 * @param memoryPath - For Claude Code: the memory directory path.
 *                     For OpenCode: the project directory path.
 * @param host - Override host detection (default: auto-detect).
 */
export function createMemorySyncAdapter(
  memoryPath: string,
  host?: 'claude-code' | 'opencode',
): MemorySyncAdapter {
  const resolvedHost = host ?? detectSyncHost();

  switch (resolvedHost) {
    case 'opencode':
      return new OpenCodeMemorySyncAdapter(memoryPath);
    case 'claude-code':
    default:
      return new ClaudeCodeMemorySyncAdapter(memoryPath);
  }
}
