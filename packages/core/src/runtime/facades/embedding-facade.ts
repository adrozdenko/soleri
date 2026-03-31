/**
 * Embedding facade — vector embedding management ops.
 */

import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';
import { createEmbeddingOps } from '../embedding-ops.js';

export function createEmbeddingFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  return [...createEmbeddingOps(runtime)];
}
