import type { Vault } from '../vault/vault.js';
import type { Brain } from '../brain/brain.js';
import type { BrainIntelligence } from '../brain/intelligence.js';
import type { Planner } from '../planning/planner.js';
import type { Curator } from '../curator/curator.js';
import type { Governance } from '../governance/governance.js';
import type { CogneeClient } from '../cognee/client.js';
import type { KeyPool } from '../llm/key-pool.js';
import type { LLMClient } from '../llm/llm-client.js';
import type { IdentityManager } from '../control/identity-manager.js';
import type { IntentRouter } from '../control/intent-router.js';
import type { LoopManager } from '../loop/loop-manager.js';
import type { Telemetry } from '../telemetry/telemetry.js';
import type { ProjectRegistry } from '../project/project-registry.js';
import type { TemplateManager } from '../prompts/template-manager.js';
import type { CogneeSyncManager } from '../cognee/sync-manager.js';
import type { IntakePipeline } from '../intake/intake-pipeline.js';
import type { Logger } from '../logging/logger.js';
import type { LogLevel } from '../logging/types.js';
import type { AuthPolicy } from '../facades/types.js';
import type { FeatureFlags } from './feature-flags.js';
import type { HealthRegistry } from '../health/health-registry.js';

/**
 * Configuration for creating an agent runtime.
 * Only `agentId` is required — everything else has sensible defaults.
 */
export interface AgentRuntimeConfig {
  /** Agent identifier (kebab-case), e.g. 'my-agent'. Used for paths: ~/.{agentId}/ */
  agentId: string;
  /** Path to vault database. Default: ~/.{agentId}/vault.db */
  vaultPath?: string;
  /** Path to plans JSON store. Default: ~/.{agentId}/plans.json */
  plansPath?: string;
  /** Intelligence data directory to seed vault from. Optional. */
  dataDir?: string;
  /** Path to prompt templates directory. Default: ~/.{agentId}/templates */
  templatesDir?: string;
  /** Minimum log level. Default: 'info' (or SOLERI_LOG_LEVEL env var). */
  logLevel?: LogLevel;
}

/**
 * Fully initialized agent runtime — all modules ready.
 * Created by `createAgentRuntime(config)`.
 */
export interface AgentRuntime {
  config: AgentRuntimeConfig;
  logger: Logger;
  vault: Vault;
  brain: Brain;
  brainIntelligence: BrainIntelligence;
  planner: Planner;
  curator: Curator;
  governance: Governance;
  cognee: CogneeClient;
  loop: LoopManager;
  identityManager: IdentityManager;
  intentRouter: IntentRouter;
  keyPool: { openai: KeyPool; anthropic: KeyPool };
  llmClient: LLMClient;
  telemetry: Telemetry;
  projectRegistry: ProjectRegistry;
  templateManager: TemplateManager;
  syncManager: CogneeSyncManager;
  intakePipeline: IntakePipeline;
  /** Mutable auth policy — controls facade dispatch enforcement. */
  authPolicy: AuthPolicy;
  /** Feature flags — file-based + env var + runtime toggles. */
  flags: FeatureFlags;
  /** Centralized health registry — subsystem status tracking. */
  health: HealthRegistry;
  /** Timestamp (ms since epoch) when this runtime was created. */
  createdAt: number;
  /** Close the vault database connection. Call on shutdown. */
  close(): void;
}
