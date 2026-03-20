/**
 * Agent runtime factory — one call to initialize all modules.
 *
 * ```ts
 * const runtime = createAgentRuntime({ agentId: 'my-agent' });
 * // runtime.vault, runtime.brain, runtime.planner, etc. all ready
 * ```
 */

import {
  SOLERI_HOME,
  agentVaultPath as getAgentVaultPath,
  agentPlansPath as getAgentPlansPath,
  agentTemplatesDir as getAgentTemplatesDir,
  agentFlagsPath as getAgentFlagsPath,
  sharedVaultPath as getSharedVaultPath,
} from '../paths.js';
import { Brain } from '../brain/brain.js';
import { BrainIntelligence } from '../brain/intelligence.js';
import { Planner } from '../planning/planner.js';
import { Curator } from '../curator/curator.js';
import { Governance } from '../governance/governance.js';
import { LoopManager } from '../loop/loop-manager.js';
import { IdentityManager } from '../control/identity-manager.js';
import { IntentRouter } from '../control/intent-router.js';
import { KeyPool, loadKeyPoolConfig } from '../llm/key-pool.js';
import { discoverAnthropicToken } from '../llm/oauth-discovery.js';
import { loadIntelligenceData } from '../intelligence/loader.js';
import { LLMClient } from '../llm/llm-client.js';
import { IntakePipeline } from '../intake/intake-pipeline.js';
import { TextIngester } from '../intake/text-ingester.js';
import { Telemetry } from '../telemetry/telemetry.js';
import { ProjectRegistry } from '../project/project-registry.js';
import { TemplateManager } from '../prompts/template-manager.js';
import { existsSync, mkdirSync } from 'node:fs';
import { createLogger } from '../logging/logger.js';
import { FeatureFlags } from './feature-flags.js';
import { HealthRegistry } from '../health/health-registry.js';
import { checkVaultIntegrity } from '../health/vault-integrity.js';
import { PlaybookExecutor } from '../playbooks/playbook-executor.js';
import { PluginRegistry } from '../plugins/plugin-registry.js';
import { PackInstaller } from '../packs/pack-installer.js';
import { VaultManager } from '../vault/vault-manager.js';
import { VaultBranching } from '../vault/vault-branching.js';
import { ContextEngine } from '../context/context-engine.js';
import { AgencyManager } from '../agency/agency-manager.js';
import { KnowledgeReview } from '../vault/knowledge-review.js';
import { LinkManager } from '../vault/linking.js';
import { LearningRadar } from '../brain/learning-radar.js';
import { KnowledgeSynthesizer } from '../brain/knowledge-synthesizer.js';
import { ChainRunner } from '../flows/chain-runner.js';
import { JobQueue } from '../queue/job-queue.js';
import { PipelineRunner } from '../queue/pipeline-runner.js';
import { evaluateQuality } from '../curator/quality-gate.js';
import { classifyEntry } from '../curator/classifier.js';
import type { AgentRuntimeConfig, AgentRuntime } from './types.js';
import { loadPersona } from '../persona/loader.js';
import { generatePersonaInstructions } from '../persona/prompt-generator.js';

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
  const vaultPath = config.vaultPath ?? getAgentVaultPath(agentId);
  const plansPath = config.plansPath ?? getAgentPlansPath(agentId);

  // Logger — structured output to stderr
  const logger = createLogger({ level: config.logLevel, prefix: `[${agentId}]` });

  // Vault Manager — multi-tier vault orchestration
  const vaultManager = new VaultManager({ agentId });

  // Vault — persistent SQLite knowledge store (agent tier)
  const vault = vaultManager.open('agent', vaultPath);

  // Shared vault — cross-agent intelligence (lower priority than agent vault)
  try {
    mkdirSync(SOLERI_HOME, { recursive: true });
    const sharedPath = config.sharedVaultPath ?? getSharedVaultPath();
    vaultManager.connect('shared', sharedPath, 0.6);
  } catch (err) {
    logger.warn(`Shared vault unavailable: ${err instanceof Error ? err.message : String(err)}`);
  }

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
  // Pass vaultManager so intelligentSearch queries all connected sources (not just agent tier)
  const brain = new Brain(vault, vaultManager);

  // Brain Intelligence — pattern strengths, session knowledge, intelligence pipeline
  const brainIntelligence = new BrainIntelligence(vault, brain);

  // Curator — vault self-maintenance (dedup, contradictions, grooming, health)
  const curator = new Curator(vault);

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
  const templatesDir = config.templatesDir ?? getAgentTemplatesDir(agentId);
  const templateManager = new TemplateManager(templatesDir);
  if (existsSync(templatesDir)) {
    templateManager.load();
  }

  // LLM key pools and client
  // Try OAuth token discovery for Anthropic (Claude Code subscription → free API access)
  const keyPoolFiles = loadKeyPoolConfig(agentId);
  const oauthToken = discoverAnthropicToken();
  const anthropicConfig = keyPoolFiles.anthropic;
  if (oauthToken && anthropicConfig.keys.length === 0) {
    anthropicConfig.keys.push(oauthToken);
  }
  const openaiKeyPool = new KeyPool(keyPoolFiles.openai);
  const anthropicKeyPool = new KeyPool(anthropicConfig);
  const llmClient = new LLMClient(openaiKeyPool, anthropicKeyPool, agentId);

  // Link Manager — Zettelkasten auto-linking on vault ingestion
  const linkManager = new LinkManager(vault.getProvider());
  vault.setLinkManager(linkManager, { enabled: true, maxLinks: 3 });

  // Intake Pipeline — PDF/book ingestion with LLM classification
  const intakePipeline = new IntakePipeline(vault.getProvider(), vault, llmClient);
  const textIngester = new TextIngester(vault, llmClient);

  // Playbook Executor — in-memory step-by-step workflow sessions
  const playbookExecutor = new PlaybookExecutor();

  // Plugin Registry — dynamic facade loading
  const pluginRegistry = new PluginRegistry();

  // Pack Installer — knowledge pack management
  const packInstaller = new PackInstaller(vault, pluginRegistry);

  // Vault Branching — experiment with knowledge changes before merging
  const vaultBranching = new VaultBranching(vault);

  // Context Engine — entity extraction, knowledge retrieval, confidence scoring
  const contextEngine = new ContextEngine(vault, brain, brainIntelligence);

  // Agency Manager — proactive file watching, pattern surfacing (disabled by default)
  const agencyManager = new AgencyManager(vault);

  // Knowledge Review — team review workflows (submit/approve/reject)
  const knowledgeReview = new KnowledgeReview(vault.getProvider());

  // Health Registry — centralized subsystem status tracking
  const health = new HealthRegistry();
  health.register('vault', 'healthy');
  health.register('brain', 'healthy');
  health.register(
    'llm',
    llmClient.isAvailable().openai || llmClient.isAvailable().anthropic ? 'healthy' : 'degraded',
  );
  health.register('planner', 'healthy');

  // Vault integrity check on startup (non-fatal)
  try {
    const integrity = checkVaultIntegrity(vault.getProvider());
    if (!integrity.schemaValid || !integrity.ftsValid) {
      health.update('vault', 'degraded', integrity.errors.join('; '));
      if (integrity.ftsRebuilt) {
        logger.info('Vault FTS index rebuilt automatically');
      }
    }
  } catch {
    // Integrity check itself failed — vault may still work
  }

  return {
    config,
    logger,
    vault,
    brain,
    brainIntelligence,
    planner,
    curator,
    governance,
    loop,
    identityManager,
    intentRouter,
    keyPool: { openai: openaiKeyPool, anthropic: anthropicKeyPool },
    llmClient,
    telemetry,
    projectRegistry,
    templateManager,
    intakePipeline,
    textIngester,
    authPolicy: { mode: 'permissive', callerLevel: 'admin' },
    flags: new FeatureFlags(getAgentFlagsPath(agentId)),
    health,
    playbookExecutor,
    pluginRegistry,
    packInstaller,
    vaultManager,
    vaultBranching,
    contextEngine,
    agencyManager,
    knowledgeReview,
    linkManager,
    learningRadar: new LearningRadar(vault, brain),
    knowledgeSynthesizer: new KnowledgeSynthesizer(brain, llmClient),
    chainRunner: new ChainRunner(vault.getProvider()),
    jobQueue: new JobQueue(vault.getProvider()),
    pipelineRunner: (() => {
      const jq = new JobQueue(vault.getProvider());
      const pr = new PipelineRunner(jq);
      // Register default job handlers for curator pipeline
      pr.registerHandler('tag-normalize', async (job) => {
        const entry = vault.get(job.entryId ?? '');
        if (!entry) return { skipped: true, reason: 'entry not found' };
        const result = curator.normalizeTag(entry.tags[0] ?? '');
        return result;
      });
      pr.registerHandler('dedup-check', async (job) => {
        const entry = vault.get(job.entryId ?? '');
        if (!entry) return { skipped: true, reason: 'entry not found' };
        return curator.detectDuplicates(entry.id);
      });
      pr.registerHandler('auto-link', async (job) => {
        if (linkManager) {
          const suggestions = linkManager.suggestLinks(job.entryId ?? '', 3);
          for (const s of suggestions) {
            linkManager.addLink(
              job.entryId ?? '',
              s.entryId,
              s.suggestedType,
              `pipeline: ${s.reason}`,
            );
          }
          return { linked: suggestions.length };
        }
        return { skipped: true, reason: 'link manager not available' };
      });
      pr.registerHandler('quality-gate', async (job) => {
        const entry = vault.get(job.entryId ?? '');
        if (!entry) return { skipped: true, reason: 'entry not found' };
        return evaluateQuality(entry, llmClient);
      });
      pr.registerHandler('classify', async (job) => {
        const entry = vault.get(job.entryId ?? '');
        if (!entry) return { skipped: true, reason: 'entry not found' };
        return classifyEntry(entry, llmClient);
      });

      // ─── 9 additional handlers for full Salvador parity (#216) ────
      pr.registerHandler('enrich-frontmatter', async (job) => {
        const entry = vault.get(job.entryId ?? '');
        if (!entry) return { skipped: true, reason: 'entry not found' };
        return curator.enrichMetadata(entry.id);
      });
      pr.registerHandler('detect-staleness', async (job) => {
        const entry = vault.get(job.entryId ?? '');
        if (!entry) return { skipped: true, reason: 'entry not found' };
        // Check if entry is older than 90 days (using validFrom or fallback to 0)
        const entryTimestamp = (entry.validFrom ?? 0) * 1000 || Date.now();
        const ageMs = Date.now() - entryTimestamp;
        const staleDays = 90;
        const isStale = ageMs > staleDays * 86400000;
        return { stale: isStale, ageDays: Math.floor(ageMs / 86400000), entryId: entry.id };
      });
      pr.registerHandler('detect-duplicate', async (job) => {
        const entry = vault.get(job.entryId ?? '');
        if (!entry) return { skipped: true, reason: 'entry not found' };
        return curator.detectDuplicates(entry.id);
      });
      pr.registerHandler('detect-contradiction', async (job) => {
        const entry = vault.get(job.entryId ?? '');
        if (!entry) return { skipped: true, reason: 'entry not found' };
        const contradictions = curator.detectContradictions(0.4);
        const relevant = contradictions.filter(
          (c) => c.patternId === job.entryId || c.antipatternId === job.entryId,
        );
        return { found: relevant.length, contradictions: relevant };
      });
      pr.registerHandler('consolidate-duplicates', async (_job) => {
        return curator.consolidate({ dryRun: false, staleDaysThreshold: 90 });
      });
      pr.registerHandler('archive-stale', async (_job) => {
        // Run consolidation with stale detection
        const result = curator.consolidate({ dryRun: false, staleDaysThreshold: 90 });
        return { archived: result.staleEntries.length, result };
      });
      pr.registerHandler('verify-searchable', async (job) => {
        const entry = vault.get(job.entryId ?? '');
        if (!entry) return { skipped: true, reason: 'entry not found' };
        const searchResults = vault.search(entry.title, { limit: 1 });
        const found = searchResults.some((r) => r.entry.id === entry.id);
        return { searchable: found, entryId: entry.id };
      });
      return pr;
    })(),
    persona: (() => {
      const p = loadPersona(agentId, config.persona ?? undefined);
      logger.info(`[Persona] Loaded: ${p.name} (${p.template})`);
      return p;
    })(),
    personaInstructions: (() => {
      const p = loadPersona(agentId, config.persona ?? undefined);
      return generatePersonaInstructions(p);
    })(),
    createdAt: Date.now(),
    close: () => {
      vaultManager.close();
    },
  };
}
