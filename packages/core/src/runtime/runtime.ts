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
import { syncAllToMarkdown } from '../vault/vault-markdown-sync.js';
import { agentKnowledgeDir as getAgentKnowledgeDir } from '../paths.js';
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
import type { EmbeddingProvider } from '../embeddings/types.js';
import { OpenAIEmbeddingProvider } from '../embeddings/openai-provider.js';
import { EmbeddingPipeline } from '../embeddings/pipeline.js';
import { loadPersona } from '../persona/loader.js';
import { generatePersonaInstructions } from '../persona/prompt-generator.js';
import { OperatorProfileStore } from '../operator/operator-profile.js';
import { ContextHealthMonitor } from './context-health.js';
import { ShutdownRegistry } from './shutdown-registry.js';
import { RuntimeAdapterRegistry } from '../adapters/registry.js';
import { ClaudeCodeRuntimeAdapter } from '../adapters/claude-code-adapter.js';
import { SubagentDispatcher } from '../subagent/dispatcher.js';

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

  // Feature Flags — file-based + env var + runtime toggles (created early so other modules can check)
  const flags = new FeatureFlags(getAgentFlagsPath(agentId));

  // Planner — multi-step task tracking
  const planner = new Planner(plansPath);

  // ─── Embedding Provider (optional) ────────────────────────────────
  // Only initialized when both config.embedding is present AND the
  // 'embedding-enabled' feature flag is on. Brain continues without
  // embeddings when either condition is unmet (vector weight stays 0).
  let embeddingProvider: EmbeddingProvider | undefined;
  let embeddingPipeline: EmbeddingPipeline | undefined;

  if (config.embedding && flags.isEnabled('embedding-enabled')) {
    try {
      const embeddingConfig = config.embedding;
      if (embeddingConfig.provider === 'openai') {
        const openaiPool = new KeyPool(loadKeyPoolConfig(agentId).openai);
        embeddingProvider = new OpenAIEmbeddingProvider(embeddingConfig, openaiPool);
      }
      // Future providers (ollama, etc.) would be added here

      if (embeddingProvider) {
        embeddingPipeline = new EmbeddingPipeline(embeddingProvider, vault.getProvider());
        logger.info(
          `[Embedding] Initialized: ${embeddingProvider.providerName}/${embeddingProvider.model} (${embeddingProvider.dimensions}d)`,
        );
      }
    } catch (err) {
      logger.warn(
        `[Embedding] Failed to initialize: ${err instanceof Error ? err.message : String(err)}`,
      );
      // Graceful degradation — continue without embeddings
    }
  }

  // Brain — intelligence layer (TF-IDF scoring, auto-tagging, dedup)
  // Pass vaultManager so intelligentSearch queries all connected sources (not just agent tier)
  // Pass embeddingProvider for hybrid FTS5+vector search when available
  const brain = new Brain(vault, vaultManager, embeddingProvider);

  // Wire canonical tag config if provided
  if (config.canonicalTags && config.canonicalTags.length > 0) {
    brain.setCanonicalTagConfig({
      canonicalTags: config.canonicalTags,
      tagConstraintMode: config.tagConstraintMode ?? 'suggest',
      metadataTagPrefixes: config.metadataTagPrefixes ?? ['source:'],
    });
  }

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

  // Boot-time markdown sync — catch up entries without .md files (fire-and-forget)
  const knowledgeDir = getAgentKnowledgeDir(agentId);
  syncAllToMarkdown(vault, knowledgeDir).then(
    (result) => {
      if (result.synced > 0) {
        logger.info(`Markdown sync: ${result.synced} entries synced, ${result.skipped} skipped`);
      }
    },
    () => {
      /* best-effort — never block boot */
    },
  );

  // ─── Auto-signal pipeline wiring ───────────────────────────────────
  const learningRadar = new LearningRadar(vault, brain);
  const operatorProfile = new OperatorProfileStore(vault);
  learningRadar.setOperatorProfile(operatorProfile);
  brainIntelligence.setOperatorProfile(operatorProfile);

  // ─── Shutdown Registry ────────────────────────────────────────────
  const shutdownRegistry = new ShutdownRegistry();

  // Build pipeline runner before the runtime object so we can reference it
  const pipelineRunner = (() => {
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
  })();

  // ─── Register cleanup callbacks (LIFO: first registered = last closed) ──
  // Vault manager closes last (other modules may flush to vault during close)
  shutdownRegistry.register('vaultManager', () => vaultManager.close());
  // Pipeline runner — clear its polling interval
  shutdownRegistry.register('pipelineRunner', () => pipelineRunner.stop());
  // Agency manager — close FSWatchers and debounce timers
  shutdownRegistry.register('agencyManager', () => agencyManager.disable());

  shutdownRegistry.register('subagentDispatcher', () => subagentDispatcher.cleanup());
  // Loop manager — clear accumulated state
  shutdownRegistry.register('loopManager', () => {
    if (loop.isActive()) {
      try {
        loop.cancelLoop();
      } catch {
        // Loop may already be inactive
      }
    }
  });

  // Runtime Adapter Registry — dispatch work to different AI CLIs
  const adapterRegistry = new RuntimeAdapterRegistry();
  adapterRegistry.register('claude-code', new ClaudeCodeRuntimeAdapter());
  adapterRegistry.setDefault('claude-code');

  // Subagent Dispatcher — spawn and manage child agent processes
  const subagentDispatcher = new SubagentDispatcher({ adapterRegistry });

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
    flags,
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
    learningRadar,
    knowledgeSynthesizer: new KnowledgeSynthesizer(brain, llmClient),
    chainRunner: new ChainRunner(vault.getProvider()),
    jobQueue: new JobQueue(vault.getProvider()),
    pipelineRunner,
    operatorProfile,
    persona: (() => {
      const p = loadPersona(agentId, config.persona ?? undefined);
      logger.info(`[Persona] Loaded: ${p.name} (${p.template})`);
      return p;
    })(),
    personaInstructions: (() => {
      const p = loadPersona(agentId, config.persona ?? undefined);
      return generatePersonaInstructions(p);
    })(),
    embeddingProvider,
    embeddingPipeline,
    adapterRegistry,
    subagentDispatcher,
    contextHealth: new ContextHealthMonitor(),
    shutdownRegistry,
    createdAt: Date.now(),
    close: () => {
      // Synchronous close — runs all registered callbacks in LIFO order,
      // then closes the vault (registered first, so runs last).
      shutdownRegistry.closeAllSync();
    },
  };
}
