/**
 * Policy Resolver — three-level merge for compaction policies.
 *
 * Merge order (highest to lowest priority):
 *   1. Agent config (agent.yaml → engine.compactionPolicy)
 *   2. Adapter defaults (runtime adapter may provide defaults)
 *   3. Engine defaults (hardcoded fallback)
 *
 * Individual fields override — not whole-object replacement.
 */

import type { CompactionPolicy } from './compaction-policy.js';
import { ENGINE_DEFAULTS } from './compaction-policy.js';

/**
 * Resolve a final CompactionPolicy by merging three levels.
 *
 * Each level can provide partial overrides. Fields from higher-priority
 * levels win over lower-priority ones. Missing fields fall through to
 * the next level, bottoming out at ENGINE_DEFAULTS.
 */
export function resolvePolicy(
  agentConfig?: Partial<CompactionPolicy>,
  adapterDefaults?: Partial<CompactionPolicy>,
): Required<CompactionPolicy> {
  return {
    maxRuns: agentConfig?.maxRuns ?? adapterDefaults?.maxRuns ?? ENGINE_DEFAULTS.maxRuns,
    maxInputTokens:
      agentConfig?.maxInputTokens ??
      adapterDefaults?.maxInputTokens ??
      ENGINE_DEFAULTS.maxInputTokens,
    maxAge: agentConfig?.maxAge ?? adapterDefaults?.maxAge ?? ENGINE_DEFAULTS.maxAge,
  };
}
