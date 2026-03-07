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
import { CogneeClient } from '../cognee/client.js';
import { LoopManager } from '../loop/loop-manager.js';
import { IdentityManager } from '../control/identity-manager.js';
import { IntentRouter } from '../control/intent-router.js';
import { KeyPool, loadKeyPoolConfig } from '../llm/key-pool.js';
import { loadIntelligenceData } from '../intelligence/loader.js';
import { LLMClient } from '../llm/llm-client.js';
import { CogneeSyncManager } from '../cognee/sync-manager.js';
import { IntakePipeline } from '../intake/intake-pipeline.js';
import { Telemetry } from '../telemetry/telemetry.js';
import { ProjectRegistry } from '../project/project-registry.js';
import { TemplateManager } from '../prompts/template-manager.js';
import { existsSync } from 'node:fs';
import { createLogger } from '../logging/logger.js';
import { FeatureFlags } from './feature-flags.js';
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

  // Cognee — vector search client (graceful degradation if Cognee is down)
  const cogneePartial: Partial<import('../cognee/types.js').CogneeConfig> = { dataset: agentId };
  if (process.env.COGNEE_BASE_URL) cogneePartial.baseUrl = process.env.COGNEE_BASE_URL;
  if (process.env.COGNEE_API_TOKEN) cogneePartial.apiToken = process.env.COGNEE_API_TOKEN;
  if (process.env.COGNEE_DATASET) cogneePartial.dataset = process.env.COGNEE_DATASET;
  const cognee = new CogneeClient(cogneePartial);

  // Brain — intelligence layer (TF-IDF scoring, auto-tagging, dedup)
  const brain = new Brain(vault, cognee);

  // Brain Intelligence — pattern strengths, session knowledge, intelligence pipeline
  const brainIntelligence = new BrainIntelligence(vault, brain);

  // Curator — vault self-maintenance (dedup, contradictions, grooming, health)
  const curator = new Curator(vault, cognee);

  // Governance — policy engine + proposal tracker for gated knowledge capture
  const governance = new Governance(vault);

  // Loop Manager — iterative validation loop tracking (in-memory, session-scoped)
  const loop = new LoopManager();

  // Identity Manager — agent persona CRUD with versioning/rollback
  const identityManager = new IdentityManager(vault);

  // Intent Router — keyword-based intent classification and mode management
  const intentRouter = new IntentRouter(vault);

  // Telemetry — in-memory facade call tracking
  const telemetry = new Telemetry();

  // Project Registry — multi-project tracking with rules and links
  const projectRegistry = new ProjectRegistry(vault.getProvider());

  // Template Manager — prompt templates with variable substitution
  const templatesDir = config.templatesDir ?? join(agentHome, 'templates');
  const templateManager = new TemplateManager(templatesDir);
  if (existsSync(templatesDir)) {
    templateManager.load();
  }

  // LLM key pools and client
  const keyPoolFiles = loadKeyPoolConfig(agentId);
  const openaiKeyPool = new KeyPool(keyPoolFiles.openai);
  const anthropicKeyPool = new KeyPool(keyPoolFiles.anthropic);
  const llmClient = new LLMClient(openaiKeyPool, anthropicKeyPool, agentId);

  // Cognee Sync Manager — queue-based dirty tracking with offline resilience
  const syncManager = new CogneeSyncManager(
    vault.getProvider(),
    cognee,
    cogneePartial.dataset ?? agentId,
  );
  vault.setSyncManager(syncManager);

  // Intake Pipeline — PDF/book ingestion with LLM classification
  const intakePipeline = new IntakePipeline(vault.getProvider(), vault, llmClient);

  return {
    config,
    logger,
    vault,
    brain,
    brainIntelligence,
    planner,
    curator,
    governance,
    cognee,
    loop,
    identityManager,
    intentRouter,
    keyPool: { openai: openaiKeyPool, anthropic: anthropicKeyPool },
    llmClient,
    telemetry,
    projectRegistry,
    templateManager,
    syncManager,
    intakePipeline,
    authPolicy: { mode: 'permissive', callerLevel: 'admin' },
    flags: new FeatureFlags(join(agentHome, 'flags.json')),
    createdAt: Date.now(),
    close: () => {
      syncManager.close();
      cognee.resetPendingCognify();
      vault.close();
    },
  };
}
