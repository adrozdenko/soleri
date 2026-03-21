import type { Vault } from '../vault/vault.js';
import type { Brain } from '../brain/brain.js';
import type { BrainIntelligence } from '../brain/intelligence.js';
import type { Planner } from '../planning/planner.js';
import type { Curator } from '../curator/curator.js';
import type { Governance } from '../governance/governance.js';
import type { KeyPool } from '../llm/key-pool.js';
import type { LLMClient } from '../llm/llm-client.js';
import type { IdentityManager } from '../control/identity-manager.js';
import type { IntentRouter } from '../control/intent-router.js';
import type { LoopManager } from '../loop/loop-manager.js';
import type { Telemetry } from '../telemetry/telemetry.js';
import type { ProjectRegistry } from '../project/project-registry.js';
import type { TemplateManager } from '../prompts/template-manager.js';
import type { IntakePipeline } from '../intake/intake-pipeline.js';
import type { Logger } from '../logging/logger.js';
import type { LogLevel } from '../logging/types.js';
import type { AuthPolicy } from '../facades/types.js';
import type { FeatureFlags } from './feature-flags.js';
import type { HealthRegistry } from '../health/health-registry.js';
import type { PlaybookExecutor } from '../playbooks/playbook-executor.js';
import type { PluginRegistry } from '../plugins/plugin-registry.js';
import type { PackInstaller } from '../packs/pack-installer.js';
import type { VaultManager } from '../vault/vault-manager.js';
import type { VaultBranching } from '../vault/vault-branching.js';
import type { ContextEngine } from '../context/context-engine.js';
import type { AgencyManager } from '../agency/agency-manager.js';
import type { KnowledgeReview } from '../vault/knowledge-review.js';
import type { LinkManager } from '../vault/linking.js';
import type { LearningRadar } from '../brain/learning-radar.js';
import type { TextIngester } from '../intake/text-ingester.js';
import type { KnowledgeSynthesizer } from '../brain/knowledge-synthesizer.js';
import type { ChainRunner } from '../flows/chain-runner.js';
import type { JobQueue } from '../queue/job-queue.js';
import type { PipelineRunner } from '../queue/pipeline-runner.js';
import type { OperatorProfileStore } from '../operator/operator-profile.js';
import type { ContextHealthMonitor } from './context-health.js';

/**
 * Configuration for creating an agent runtime.
 * Only `agentId` is required — everything else has sensible defaults.
 */
export interface AgentRuntimeConfig {
  /** Agent identifier (kebab-case), e.g. 'my-agent'. Used for paths: ~/.soleri/{agentId}/ */
  agentId: string;
  /** Path to vault database. Default: ~/.soleri/{agentId}/vault.db */
  vaultPath?: string;
  /** Path to plans JSON store. Default: ~/.soleri/{agentId}/plans.json */
  plansPath?: string;
  /** Intelligence data directory to seed vault from. Optional. */
  dataDir?: string;
  /** Path to prompt templates directory. Default: ~/.soleri/{agentId}/templates */
  templatesDir?: string;
  /** Minimum log level. Default: 'info' (or SOLERI_LOG_LEVEL env var). */
  logLevel?: LogLevel;
  /** Path to shared global vault. Default: ~/.soleri/vault.db */
  sharedVaultPath?: string;
  /** Path to the agent's root directory (containing agent.yaml, instructions/, etc.). Optional — set by engine binary. */
  agentDir?: string;
  /** Persona configuration from agent.yaml. If omitted, Italian Craftsperson default is used. */
  persona?: Partial<import('../persona/types.js').PersonaConfig>;
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
  loop: LoopManager;
  identityManager: IdentityManager;
  intentRouter: IntentRouter;
  keyPool: { openai: KeyPool; anthropic: KeyPool };
  llmClient: LLMClient;
  telemetry: Telemetry;
  projectRegistry: ProjectRegistry;
  templateManager: TemplateManager;
  intakePipeline: IntakePipeline;
  /** Mutable auth policy — controls facade dispatch enforcement. */
  authPolicy: AuthPolicy;
  /** Feature flags — file-based + env var + runtime toggles. */
  flags: FeatureFlags;
  /** Centralized health registry — subsystem status tracking. */
  health: HealthRegistry;
  /** Playbook executor — in-memory step-by-step workflow sessions. */
  playbookExecutor: PlaybookExecutor;
  /** Plugin registry — dynamic facade loading without re-scaffold. */
  pluginRegistry: PluginRegistry;
  /** Pack installer — knowledge pack installation and management. */
  packInstaller: PackInstaller;
  /** Vault manager — multi-tier vault orchestration with cascading search. */
  vaultManager: VaultManager;
  /** Vault branching — experiment with knowledge changes before merging. */
  vaultBranching: VaultBranching;
  /** Context engine — entity extraction, knowledge retrieval, confidence scoring. */
  contextEngine: ContextEngine;
  /** Agency manager — proactive file watching, pattern surfacing, warning detection. */
  agencyManager: AgencyManager;
  /** Knowledge review — team review workflows (submit/approve/reject). */
  knowledgeReview: KnowledgeReview;
  /** Link manager — Zettelkasten bidirectional linking with auto-link on ingestion. */
  linkManager: LinkManager;
  /** Learning radar — automatic pattern detection from session signals. */
  learningRadar: LearningRadar;
  /** Text ingester — ingest articles, transcripts, and plain text into vault. */
  textIngester: TextIngester;
  /** Knowledge synthesizer — turn vault knowledge into briefs, outlines, posts. */
  knowledgeSynthesizer: KnowledgeSynthesizer;
  /** Chain runner — composable multi-step workflows with data flow and gates. */
  chainRunner: ChainRunner;
  /** Job queue — SQLite-backed async job processing with DAG dependencies. */
  jobQueue: JobQueue;
  /** Pipeline runner — background polling loop for job execution. */
  pipelineRunner: PipelineRunner;
  /** Operator profile — personality learning, signals, adaptation. */
  operatorProfile: OperatorProfileStore;
  /** Agent persona — defines character, voice, and cultural texture. */
  persona: import('../persona/types.js').PersonaConfig;
  /** Generated persona system instructions for LLM context. */
  personaInstructions: import('../persona/types.js').PersonaSystemInstructions;
  /** Context health monitor — tracks tool call volume and context window fill. */
  contextHealth: ContextHealthMonitor;
  /** Timestamp (ms since epoch) when this runtime was created. */
  createdAt: number;
  /** Close the vault database connection. Call on shutdown. */
  close(): void;
}
