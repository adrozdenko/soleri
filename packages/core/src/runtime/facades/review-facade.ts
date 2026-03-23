/**
 * Review facade — knowledge review workflow.
 */

import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';
import { createReviewOps } from '../review-ops.js';

export function createReviewFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  return [...createReviewOps(runtime)];
}
