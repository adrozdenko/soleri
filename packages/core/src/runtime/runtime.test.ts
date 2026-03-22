import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAgentRuntime } from './runtime.js';
import type { AgentRuntime } from './types.js';

// ---------------------------------------------------------------------------
// Heavy mocks — runtime.ts instantiates dozens of modules, we mock them all
// ---------------------------------------------------------------------------

vi.mock('../paths.js', () => ({
  SOLERI_HOME: '/tmp/soleri-test',
  agentVaultPath: vi.fn().mockReturnValue(':memory:'),
  agentPlansPath: vi.fn().mockReturnValue('/tmp/soleri-test/plans.json'),
  agentTemplatesDir: vi.fn().mockReturnValue('/tmp/soleri-test/templates'),
  agentFlagsPath: vi.fn().mockReturnValue('/tmp/soleri-test/flags.json'),
  sharedVaultPath: vi.fn().mockReturnValue(':memory:'),
  agentKnowledgeDir: vi.fn().mockReturnValue('/tmp/soleri-test/knowledge'),
}));

vi.mock('../vault/vault-manager.js', () => ({
  VaultManager: vi.fn().mockImplementation(() => ({
    open: vi.fn().mockReturnValue({
      stats: vi.fn().mockReturnValue({ totalEntries: 0, byDomain: {}, byType: {} }),
      seed: vi.fn(),
      getProvider: vi.fn().mockReturnValue({
        get: vi.fn(),
        all: vi.fn().mockReturnValue([]),
        run: vi.fn(),
      }),
      search: vi.fn().mockReturnValue([]),
      getRecent: vi.fn().mockReturnValue([]),
      setLinkManager: vi.fn(),
      get: vi.fn(),
      list: vi.fn().mockReturnValue([]),
      exportAll: vi.fn().mockReturnValue({ entries: [] }),
    }),
    connect: vi.fn(),
    close: vi.fn(),
  })),
}));

vi.mock('../brain/brain.js', () => ({
  Brain: vi.fn().mockImplementation(() => ({
    getStats: vi.fn().mockReturnValue({ vocabularySize: 0, feedbackCount: 0 }),
    rebuildVocabulary: vi.fn(),
  })),
}));

vi.mock('../brain/intelligence.js', () => ({
  BrainIntelligence: vi.fn().mockImplementation(() => ({
    getStats: vi.fn().mockReturnValue({ strengths: 0, sessions: 0 }),
    setOperatorProfile: vi.fn(),
  })),
}));

vi.mock('../planning/planner.js', () => ({
  Planner: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../curator/curator.js', () => ({
  Curator: vi.fn().mockImplementation(() => ({
    getStatus: vi.fn().mockReturnValue({ initialized: true }),
    normalizeTag: vi.fn(),
    detectDuplicates: vi.fn(),
    detectContradictions: vi.fn().mockReturnValue([]),
    consolidate: vi.fn().mockReturnValue({ staleEntries: [] }),
    enrichMetadata: vi.fn(),
  })),
}));

vi.mock('../governance/governance.js', () => ({
  Governance: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../loop/loop-manager.js', () => ({
  LoopManager: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../control/identity-manager.js', () => ({
  IdentityManager: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../control/intent-router.js', () => ({
  IntentRouter: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../llm/key-pool.js', () => ({
  KeyPool: vi.fn().mockImplementation(() => ({})),
  loadKeyPoolConfig: vi.fn().mockReturnValue({
    openai: { keys: [] },
    anthropic: { keys: [] },
  }),
}));

vi.mock('../llm/oauth-discovery.js', () => ({
  discoverAnthropicToken: vi.fn().mockReturnValue(null),
}));

vi.mock('../llm/llm-client.js', () => ({
  LLMClient: vi.fn().mockImplementation(() => ({
    isAvailable: vi.fn().mockReturnValue({ openai: false, anthropic: false }),
  })),
}));

vi.mock('../intelligence/loader.js', () => ({
  loadIntelligenceData: vi.fn().mockReturnValue([]),
}));

vi.mock('../intake/intake-pipeline.js', () => ({
  IntakePipeline: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../intake/text-ingester.js', () => ({
  TextIngester: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../telemetry/telemetry.js', () => ({
  Telemetry: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../project/project-registry.js', () => ({
  ProjectRegistry: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../prompts/template-manager.js', () => ({
  TemplateManager: vi.fn().mockImplementation(() => ({
    load: vi.fn(),
  })),
}));

vi.mock('../logging/logger.js', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('./feature-flags.js', () => ({
  FeatureFlags: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../health/health-registry.js', () => ({
  HealthRegistry: vi.fn().mockImplementation(() => ({
    register: vi.fn(),
    update: vi.fn(),
  })),
}));

vi.mock('../health/vault-integrity.js', () => ({
  checkVaultIntegrity: vi.fn().mockReturnValue({
    schemaValid: true,
    ftsValid: true,
    errors: [],
  }),
}));

vi.mock('../playbooks/playbook-executor.js', () => ({
  PlaybookExecutor: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../plugins/plugin-registry.js', () => ({
  PluginRegistry: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../packs/pack-installer.js', () => ({
  PackInstaller: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../vault/vault-branching.js', () => ({
  VaultBranching: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../context/context-engine.js', () => ({
  ContextEngine: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../agency/agency-manager.js', () => ({
  AgencyManager: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../vault/knowledge-review.js', () => ({
  KnowledgeReview: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../vault/linking.js', () => ({
  LinkManager: vi.fn().mockImplementation(() => ({
    suggestLinks: vi.fn().mockReturnValue([]),
    addLink: vi.fn(),
  })),
}));

vi.mock('../brain/learning-radar.js', () => ({
  LearningRadar: vi.fn().mockImplementation(() => ({
    setOperatorProfile: vi.fn(),
  })),
}));

vi.mock('../brain/knowledge-synthesizer.js', () => ({
  KnowledgeSynthesizer: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../flows/chain-runner.js', () => ({
  ChainRunner: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../queue/job-queue.js', () => ({
  JobQueue: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../queue/pipeline-runner.js', () => ({
  PipelineRunner: vi.fn().mockImplementation(() => ({
    registerHandler: vi.fn(),
  })),
}));

vi.mock('../curator/quality-gate.js', () => ({
  evaluateQuality: vi.fn(),
}));

vi.mock('../curator/classifier.js', () => ({
  classifyEntry: vi.fn(),
}));

vi.mock('../vault/vault-markdown-sync.js', () => ({
  syncAllToMarkdown: vi.fn().mockResolvedValue({ synced: 0, skipped: 0 }),
}));

vi.mock('../persona/loader.js', () => ({
  loadPersona: vi.fn().mockReturnValue({
    name: 'Test Persona',
    template: 'default',
    voice: {},
  }),
}));

vi.mock('../persona/prompt-generator.js', () => ({
  generatePersonaInstructions: vi.fn().mockReturnValue({
    systemPrompt: 'test',
    behaviorRules: [],
  }),
}));

vi.mock('../operator/operator-profile.js', () => ({
  OperatorProfileStore: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('./context-health.js', () => ({
  ContextHealthMonitor: vi.fn().mockImplementation(() => ({
    check: vi.fn().mockReturnValue({ level: 'green' }),
    track: vi.fn(),
  })),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  statSync: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createAgentRuntime', () => {
  let runtime: AgentRuntime;

  beforeEach(() => {
    runtime = createAgentRuntime({ agentId: 'test-agent' });
  });

  afterEach(() => {
    runtime.close();
  });

  it('returns a runtime with the given agentId', () => {
    expect(runtime.config.agentId).toBe('test-agent');
  });

  it('initializes all core modules', () => {
    expect(runtime.vault).toBeDefined();
    expect(runtime.brain).toBeDefined();
    expect(runtime.brainIntelligence).toBeDefined();
    expect(runtime.planner).toBeDefined();
    expect(runtime.curator).toBeDefined();
    expect(runtime.governance).toBeDefined();
    expect(runtime.loop).toBeDefined();
    expect(runtime.identityManager).toBeDefined();
    expect(runtime.intentRouter).toBeDefined();
  });

  it('initializes infrastructure modules', () => {
    expect(runtime.keyPool).toBeDefined();
    expect(runtime.keyPool.openai).toBeDefined();
    expect(runtime.keyPool.anthropic).toBeDefined();
    expect(runtime.llmClient).toBeDefined();
    expect(runtime.telemetry).toBeDefined();
    expect(runtime.projectRegistry).toBeDefined();
    expect(runtime.templateManager).toBeDefined();
  });

  it('initializes extended modules', () => {
    expect(runtime.intakePipeline).toBeDefined();
    expect(runtime.textIngester).toBeDefined();
    expect(runtime.flags).toBeDefined();
    expect(runtime.health).toBeDefined();
    expect(runtime.playbookExecutor).toBeDefined();
    expect(runtime.pluginRegistry).toBeDefined();
    expect(runtime.packInstaller).toBeDefined();
    expect(runtime.vaultManager).toBeDefined();
    expect(runtime.vaultBranching).toBeDefined();
    expect(runtime.contextEngine).toBeDefined();
    expect(runtime.agencyManager).toBeDefined();
    expect(runtime.knowledgeReview).toBeDefined();
    expect(runtime.linkManager).toBeDefined();
  });

  it('initializes brain-related modules', () => {
    expect(runtime.learningRadar).toBeDefined();
    expect(runtime.knowledgeSynthesizer).toBeDefined();
    expect(runtime.operatorProfile).toBeDefined();
  });

  it('initializes workflow modules', () => {
    expect(runtime.chainRunner).toBeDefined();
    expect(runtime.jobQueue).toBeDefined();
    expect(runtime.pipelineRunner).toBeDefined();
  });

  it('has permissive auth policy by default', () => {
    expect(runtime.authPolicy.mode).toBe('permissive');
    expect(runtime.authPolicy.callerLevel).toBe('admin');
  });

  it('sets createdAt timestamp', () => {
    expect(runtime.createdAt).toBeGreaterThan(0);
    expect(runtime.createdAt).toBeLessThanOrEqual(Date.now());
  });

  it('has a close function', () => {
    expect(typeof runtime.close).toBe('function');
  });

  it('loads persona', () => {
    expect(runtime.persona).toBeDefined();
    expect(runtime.persona.name).toBe('Test Persona');
    expect(runtime.personaInstructions).toBeDefined();
  });

  it('initializes context health monitor', () => {
    expect(runtime.contextHealth).toBeDefined();
  });
});
