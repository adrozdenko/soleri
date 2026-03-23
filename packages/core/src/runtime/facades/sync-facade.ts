/**
 * Sync facade — git, Obsidian, and pack sync operations.
 */

import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';
import { createSyncOps } from '../sync-ops.js';

export function createSyncFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  return [...createSyncOps(runtime)];
}
