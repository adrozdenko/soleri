/**
 * Tier facade — multi-vault tier and named source operations.
 */

import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';
import { createTierOps } from '../tier-ops.js';

export function createTierFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  return [...createTierOps(runtime)];
}
