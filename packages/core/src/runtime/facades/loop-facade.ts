/**
 * Loop facade — iterative validation loops.
 * start, iterate, cancel, complete, history.
 */

import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';
import { createLoopOps } from '../loop-ops.js';

export function createLoopFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  return createLoopOps(runtime);
}
