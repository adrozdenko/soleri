/**
 * Agent runtime factory — one call to initialize all modules.
 *
 * ```ts
 * const runtime = createAgentRuntime({ agentId: 'my-agent' });
 * // runtime.vault, runtime.brain, runtime.planner, etc. all ready
 * ```
 */

import { join } from 'node:path';
import { homedir } from 'node:os';
import { Vault } from '../vault/vault.js';
import { Brain } from '../brain/brain.js';
import { Planner } from '../planning/planner.js';
import { Curator } from '../curator/curator.js';
import { KeyPool, loadKeyPoolConfig } from '../llm/key-pool.js';
import { loadIntelligenceData } from '../intelligence/loader.js';
import { LLMClient } from '../llm/llm-client.js';
import type { AgentRuntimeConfig, AgentRuntime } from './types.js';

/**
 * Create a fully initialized agent runtime.
 *
 * All modules (vault, brain, planner, curator, key pools, LLM client)
 * are initialized and wired together. New modules added to core in
 * future versions will be included automatically — existing agents
 * just `npm update @soleri/core`.
 */
export function createAgentRuntime(config: AgentRuntimeConfig): AgentRuntime {
  const { agentId } = config;
  const agentHome = join(homedir(), `.${agentId}`);
  const vaultPath = config.vaultPath ?? join(agentHome, 'vault.db');
  const plansPath = config.plansPath ?? join(agentHome, 'plans.json');

  // Vault — persistent SQLite knowledge store
  const vault = new Vault(vaultPath);

  // Seed intelligence data if dataDir provided
  if (config.dataDir) {
    const entries = loadIntelligenceData(config.dataDir);
    if (entries.length > 0) {
      vault.seed(entries);
    }
  }

  // Planner — multi-step task tracking
  const planner = new Planner(plansPath);

  // Brain — intelligence layer (TF-IDF scoring, auto-tagging, dedup)
  const brain = new Brain(vault);

  // Curator — vault self-maintenance (dedup, contradictions, grooming, health)
  const curator = new Curator(vault);

  // LLM key pools and client
  const keyPoolFiles = loadKeyPoolConfig(agentId);
  const openaiKeyPool = new KeyPool(keyPoolFiles.openai);
  const anthropicKeyPool = new KeyPool(keyPoolFiles.anthropic);
  const llmClient = new LLMClient(openaiKeyPool, anthropicKeyPool, agentId);

  return {
    config,
    vault,
    brain,
    planner,
    curator,
    keyPool: { openai: openaiKeyPool, anthropic: anthropicKeyPool },
    llmClient,
    close: () => vault.close(),
  };
}
