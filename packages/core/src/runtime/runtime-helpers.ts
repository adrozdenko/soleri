/**
 * Shared runtime helper utilities.
 */

import type { AgentRuntime } from './types.js';

export interface CacheRebuildResult {
  reloaded: string[];
  brainTerms: number;
  templateCount: number;
}

/**
 * Rebuild all runtime caches — brain vocabulary, vault FTS index, and prompt templates.
 * Each step is wrapped in try/catch for graceful degradation.
 */
export function rebuildRuntimeCaches(runtime: AgentRuntime): CacheRebuildResult {
  const reloaded: string[] = [];
  let brainTerms = 0;
  let templateCount = 0;

  try {
    runtime.brain.rebuildVocabulary();
    brainTerms = runtime.brain.getStats().vocabularySize;
    reloaded.push('brain');
  } catch {
    // Graceful degradation
  }

  try {
    runtime.vault.rebuildFtsIndex();
    reloaded.push('vault_fts');
  } catch {
    // Graceful degradation
  }

  try {
    runtime.templateManager.load();
    templateCount = runtime.templateManager.listTemplates().length;
    reloaded.push('templates');
  } catch {
    // Graceful degradation
  }

  return { reloaded, brainTerms, templateCount };
}
