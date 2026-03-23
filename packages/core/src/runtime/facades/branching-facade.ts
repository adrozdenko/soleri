/**
 * Branching facade — vault branch lifecycle operations.
 */

import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';
import { createBranchingOps } from '../branching-ops.js';

export function createBranchingFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  return [...createBranchingOps(runtime)];
}
