import type { Vault } from '../vault/vault.js';
import type { Brain } from '../brain/brain.js';
import type { Planner } from '../planning/planner.js';
import type { Curator } from '../curator/curator.js';
import type { KeyPool } from '../llm/key-pool.js';
import type { LLMClient } from '../llm/llm-client.js';

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
}

/**
 * Fully initialized agent runtime — all modules ready.
 * Created by `createAgentRuntime(config)`.
 */
export interface AgentRuntime {
  config: AgentRuntimeConfig;
  vault: Vault;
  brain: Brain;
  planner: Planner;
  curator: Curator;
  keyPool: { openai: KeyPool; anthropic: KeyPool };
  llmClient: LLMClient;
  /** Close the vault database connection. Call on shutdown. */
  close(): void;
}
