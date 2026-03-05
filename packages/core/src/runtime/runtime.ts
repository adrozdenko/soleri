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
import { BrainIntelligence } from '../brain/intelligence.js';
import { Planner } from '../planning/planner.js';
import { Curator } from '../curator/curator.js';
import { Governance } from '../governance/governance.js';
import { IdentityManager } from '../control/identity-manager.js';
import { IntentRouter } from '../control/intent-router.js';
import { KeyPool, loadKeyPoolConfig } from '../llm/key-pool.js';
import { loadIntelligenceData } from '../intelligence/loader.js';
import { LLMClient } from '../llm/llm-client.js';
import { createLogger } from '../logging/logger.js';
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

  // Logger — structured output to stderr
  const logger = createLogger({ level: config.logLevel, prefix: `[${agentId}]` });

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

  // Brain Intelligence — pattern strengths, session knowledge, intelligence pipeline
  const brainIntelligence = new BrainIntelligence(vault, brain);

  // Curator — vault self-maintenance (dedup, contradictions, grooming, health)
  const curator = new Curator(vault);

  // Governance — policy engine + proposal tracker for gated knowledge capture
  const governance = new Governance(vault);

  // Identity Manager — agent persona CRUD with versioning/rollback
  const identityManager = new IdentityManager(vault);

  // Intent Router — keyword-based intent classification and mode management
  const intentRouter = new IntentRouter(vault);

  // LLM key pools and client
  const keyPoolFiles = loadKeyPoolConfig(agentId);
  const openaiKeyPool = new KeyPool(keyPoolFiles.openai);
  const anthropicKeyPool = new KeyPool(keyPoolFiles.anthropic);
  const llmClient = new LLMClient(openaiKeyPool, anthropicKeyPool, agentId);

  return {
    config,
    logger,
    vault,
    brain,
    brainIntelligence,
    planner,
    curator,
    governance,
    identityManager,
    intentRouter,
    keyPool: { openai: openaiKeyPool, anthropic: anthropicKeyPool },
    llmClient,
    close: () => vault.close(),
  };
}
