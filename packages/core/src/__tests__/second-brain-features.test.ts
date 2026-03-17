/**
 * E2E tests for Second Brain features (#39 milestone).
 *
 * Tests all 8 features end-to-end using a real in-memory vault + brain:
 *   1. Two-pass vault retrieval (scan → load)
 *   2. Session briefing
 *   3. Evidence-based reconciliation
 *   4. Routing feedback loop
 *   5. Ambient learning radar
 *   6. External knowledge ingestion (text)
 *   7. Content synthesis
 *   8. Composable skill chains
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { Vault } from '../vault/vault.js';
import { Brain } from '../brain/brain.js';
import { BrainIntelligence } from '../brain/intelligence.js';
import { Planner } from '../planning/planner.js';
import { Curator } from '../curator/curator.js';
import { IntentRouter } from '../control/intent-router.js';
import { LearningRadar } from '../brain/learning-radar.js';
import { KnowledgeSynthesizer } from '../brain/knowledge-synthesizer.js';
import { ChainRunner } from '../flows/chain-runner.js';
import { TextIngester } from '../intake/text-ingester.js';
import { collectGitEvidence } from '../planning/evidence-collector.js';
import type { IntelligenceEntry } from '../intelligence/types.js';

// ─── Shared Setup ────────────────────────────────────────────────────

let vault: Vault;
let brain: Brain;
let brainIntelligence: BrainIntelligence;
let planner: Planner;
let curator: Curator;
let intentRouter: IntentRouter;
let learningRadar: LearningRadar;
let synthesizer: KnowledgeSynthesizer;
let chainRunner: ChainRunner;
let textIngester: TextIngester;
let tempDir: string;

const SEED: IntelligenceEntry[] = [
  {
    id: 'pattern-retry',
    type: 'pattern',
    domain: 'architecture',
    title: 'Retry with Exponential Backoff',
    severity: 'critical',
    description: 'Always use exponential backoff when retrying failed network requests.',
    tags: ['networking', 'retry', 'resilience'],
    context: 'HTTP clients, API gateways.',
    why: 'Prevents thundering herd on service recovery.',
  },
  {
    id: 'anti-pattern-polling',
    type: 'anti-pattern',
    domain: 'architecture',
    title: 'Polling Without Timeout',
    severity: 'critical',
    description: 'Never poll an external service without a maximum timeout.',
    tags: ['networking', 'polling', 'timeout'],
  },
  {
    id: 'pattern-semantic-tokens',
    type: 'pattern',
    domain: 'design',
    title: 'Semantic Token Priority',
    severity: 'warning',
    description: 'Use semantic tokens over primitive tokens for maintainability.',
    tags: ['tokens', 'design-system', 'css'],
  },
  {
    id: 'pattern-fts5',
    type: 'pattern',
    domain: 'architecture',
    title: 'FTS5 Full-Text Search',
    severity: 'suggestion',
    description: 'Use SQLite FTS5 with porter tokenizer for text search in the vault.',
    tags: ['search', 'sqlite', 'fts5'],
  },
  {
    id: 'pattern-tdd',
    type: 'pattern',
    domain: 'testing',
    title: 'Test-Driven Development',
    severity: 'warning',
    description: 'Write tests before implementation. RED → GREEN → REFACTOR cycle.',
    tags: ['testing', 'tdd', 'quality'],
    why: 'Catches design issues early and produces better APIs.',
  },
];

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'soleri-brain-test-'));
  vault = new Vault(':memory:');
  vault.seed(SEED);
  brain = new Brain(vault);
  brainIntelligence = new BrainIntelligence(vault, brain);
  planner = new Planner(join(tempDir, 'plans.json'));
  curator = new Curator(vault);
  intentRouter = new IntentRouter(vault);
  learningRadar = new LearningRadar(vault, brain);
  synthesizer = new KnowledgeSynthesizer(brain, null); // No LLM — tests raw fallback
  chainRunner = new ChainRunner(vault.getProvider());
  textIngester = new TextIngester(vault, null); // No LLM — tests graceful degradation
});

afterAll(() => {
  vault.close();
  try {
    rmSync(tempDir, { recursive: true });
  } catch {
    /* cleanup best-effort */
  }
});

// ─── 1. Two-Pass Vault Retrieval ─────────────────────────────────────

describe('Two-pass vault retrieval (#205)', () => {
  it('scanSearch returns lightweight results without full entry body', async () => {
    const results = await brain.scanSearch('retry network');
    expect(results.length).toBeGreaterThan(0);

    const first = results[0];
    expect(first.id).toBeDefined();
    expect(first.title).toBeDefined();
    expect(first.score).toBeGreaterThan(0);
    expect(first.snippet).toBeDefined();
    expect(first.tokenEstimate).toBeGreaterThan(0);
    // Scan results should NOT have full entry fields
    expect((first as Record<string, unknown>).description).toBeUndefined();
    expect((first as Record<string, unknown>).context).toBeUndefined();
  });

  it('loadEntries returns full entries by ID', () => {
    const entries = brain.loadEntries(['pattern-retry', 'pattern-fts5']);
    expect(entries.length).toBe(2);
    expect(entries[0].description).toBeDefined();
    expect(entries[0].tags).toBeDefined();
  });

  it('loadEntries skips unknown IDs gracefully', () => {
    const entries = brain.loadEntries(['pattern-retry', 'nonexistent-id']);
    expect(entries.length).toBe(1);
    expect(entries[0].id).toBe('pattern-retry');
  });

  it('scanSearch snippet is truncated to 120 chars', async () => {
    const results = await brain.scanSearch('retry');
    for (const r of results) {
      expect(r.snippet.length).toBeLessThanOrEqual(123); // 120 + '...'
    }
  });
});

// ─── 2. Session Briefing ─────────────────────────────────────────────

describe('Session briefing (#202)', () => {
  // Session briefing is an op — tested via the module imports directly
  it('brainIntelligence.listSessions returns sessions', () => {
    const sessions = brainIntelligence.listSessions({ limit: 5 });
    // May be empty in a fresh vault, but shouldn't throw
    expect(Array.isArray(sessions)).toBe(true);
  });

  it('planner.list returns plans array', () => {
    const plans = planner.list();
    expect(Array.isArray(plans)).toBe(true);
  });

  it('vault.getRecent returns recent entries', () => {
    const recent = vault.getRecent(5);
    expect(recent.length).toBeGreaterThan(0);
    expect(recent[0].title).toBeDefined();
  });

  it('curator.healthAudit returns a score', () => {
    const audit = curator.healthAudit();
    expect(audit.score).toBeGreaterThanOrEqual(0);
    expect(audit.score).toBeLessThanOrEqual(100);
  });
});

// ─── 3. Evidence-Based Reconciliation ────────────────────────────────

describe('Evidence-based reconciliation (#206)', () => {
  it('collectGitEvidence handles non-git directory gracefully', () => {
    const plan = planner.create({
      objective: 'Test plan',
      scope: 'test',
      decisions: [],
      tasks: [{ title: 'Add retry logic', description: 'Implement retry' }],
    });
    planner.approve(plan.id);
    planner.startExecution(plan.id);

    // /tmp is not a git repo — should return empty evidence, not crash
    const evidence = collectGitEvidence(plan, '/tmp');
    expect(evidence.planId).toBe(plan.id);
    expect(evidence.accuracy).toBeDefined();
    expect(Array.isArray(evidence.taskEvidence)).toBe(true);
    expect(Array.isArray(evidence.unplannedChanges)).toBe(true);
  });

  it('reports MISSING verdict when no git changes match tasks', () => {
    const plan = planner.create({
      objective: 'Another test',
      scope: 'test',
      decisions: [],
      tasks: [
        { title: 'Create FooWidget component', description: 'New widget' },
        { title: 'Add unit tests for FooWidget', description: 'Tests' },
      ],
    });
    planner.approve(plan.id);
    planner.startExecution(plan.id);

    const evidence = collectGitEvidence(plan, '/tmp');
    // No git changes in /tmp → all tasks should be MISSING
    for (const te of evidence.taskEvidence) {
      expect(['MISSING', 'SKIPPED']).toContain(te.verdict);
    }
  });
});

// ─── 4. Routing Feedback Loop ────────────────────────────────────────

describe('Routing feedback loop (#209)', () => {
  it('records routing feedback', () => {
    const result = intentRouter.recordRoutingFeedback({
      initialIntent: 'build',
      actualIntent: 'fix',
      confidence: 0.72,
      correction: true,
    });
    expect(result.recorded).toBe(true);
    expect(result.id).toBeGreaterThan(0);
  });

  it('records correct routing feedback', () => {
    intentRouter.recordRoutingFeedback({
      initialIntent: 'build',
      actualIntent: 'build',
      confidence: 0.85,
      correction: false,
    });
    intentRouter.recordRoutingFeedback({
      initialIntent: 'fix',
      actualIntent: 'fix',
      confidence: 0.9,
      correction: false,
    });
  });

  it('getRoutingAccuracy returns accuracy report', () => {
    const report = intentRouter.getRoutingAccuracy(30);
    expect(report.total).toBeGreaterThanOrEqual(3);
    expect(report.accuracy).toBeGreaterThanOrEqual(0);
    expect(report.accuracy).toBeLessThanOrEqual(100);
    expect(report.corrections).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(report.commonMisroutes)).toBe(true);
    expect(typeof report.confidenceCalibration).toBe('object');
  });

  it('tracks common misroutes', () => {
    const report = intentRouter.getRoutingAccuracy(30);
    const misroute = report.commonMisroutes.find((m) => m.from === 'build' && m.to === 'fix');
    expect(misroute).toBeDefined();
    expect(misroute!.count).toBeGreaterThanOrEqual(1);
  });
});

// ─── 5. Ambient Learning Radar ───────────────────────────────────────

describe('Ambient learning radar (#208)', () => {
  it('analyze with high confidence auto-captures', () => {
    const result = learningRadar.analyze({
      type: 'explicit_capture',
      title: 'Always validate inputs',
      description: 'User explicitly asked to remember this validation pattern.',
      confidence: 0.95,
    });
    expect(result).not.toBeNull();
    expect(result!.status).toBe('captured');
  });

  it('analyze with medium confidence queues as pending', () => {
    const result = learningRadar.analyze({
      type: 'correction',
      title: 'Use execFileSync not execSync',
      description: 'User corrected shell execution to avoid injection.',
    });
    expect(result).not.toBeNull();
    // Default correction confidence is 0.75 → pending
    expect(result!.status).toBe('pending');
  });

  it('analyze with low confidence logs only', () => {
    const result = learningRadar.analyze({
      type: 'pattern_success',
      title: 'FTS5 search worked',
      description: 'Vault search returned good results.',
      confidence: 0.3,
    });
    expect(result).not.toBeNull();
    expect(result!.status).toBe('logged');
  });

  it('getCandidates returns pending candidates', () => {
    const candidates = learningRadar.getCandidates();
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0].status).toBe('pending');
  });

  it('approve captures a pending candidate', () => {
    const candidates = learningRadar.getCandidates();
    const pending = candidates[0];
    const result = learningRadar.approve(pending.id);
    expect(result.captured).toBe(true);
    expect(result.entryId).toBeDefined();
  });

  it('dismiss marks candidate as dismissed', () => {
    // Create another pending
    learningRadar.analyze({
      type: 'workaround',
      title: 'Workaround for stale cache',
      description: 'Clear cache before rebuilding.',
    });
    const candidates = learningRadar.getCandidates();
    const pending = candidates.find((c) => c.title.includes('stale cache'));
    expect(pending).toBeDefined();
    const result = learningRadar.dismiss(pending!.id);
    expect(result.dismissed).toBe(true);
  });

  it('getStats returns radar statistics', () => {
    const stats = learningRadar.getStats();
    expect(stats.totalAnalyzed).toBeGreaterThanOrEqual(3);
    expect(stats.autoCaptured).toBeGreaterThanOrEqual(1);
    expect(stats.dismissed).toBeGreaterThanOrEqual(1);
  });

  it('flush captures pending candidates above threshold', () => {
    // Add a high-confidence pending
    learningRadar.analyze({
      type: 'search_miss',
      title: 'No vault entry for caching patterns',
      description: 'Repeated search for caching returned 0 results.',
      confidence: 0.85,
    });
    const result = learningRadar.flush(0.8);
    expect(result.captured).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.capturedIds)).toBe(true);
  });
});

// ─── 6. External Knowledge Ingestion ─────────────────────────────────

describe('External knowledge ingestion (#203)', () => {
  it('ingestText returns graceful empty result without LLM', async () => {
    const result = await textIngester.ingestText(
      'This is a test article about software architecture patterns.',
      { type: 'article', title: 'Test Article' },
      { domain: 'architecture' },
    );
    // No LLM → 0 ingested (graceful degradation)
    expect(result.ingested).toBe(0);
    expect(result.source.title).toBe('Test Article');
    expect(result.source.type).toBe('article');
  });

  it('ingestUrl returns graceful empty result without LLM', async () => {
    const result = await textIngester.ingestUrl('https://example.com');
    expect(result.ingested).toBe(0);
    expect(result.source.type).toBe('article');
  });

  it('ingestBatch processes multiple items', async () => {
    const results = await textIngester.ingestBatch([
      { text: 'Item 1', source: { type: 'notes', title: 'Note 1' } },
      { text: 'Item 2', source: { type: 'transcript', title: 'Talk 2' } },
    ]);
    expect(results.length).toBe(2);
    expect(results[0].source.title).toBe('Note 1');
    expect(results[1].source.title).toBe('Talk 2');
  });
});

// ─── 7. Content Synthesis ────────────────────────────────────────────

describe('Content synthesis (#207)', () => {
  it('synthesize returns raw entries when no LLM available', async () => {
    const result = await synthesizer.synthesize('retry networking', {
      format: 'brief',
      maxEntries: 5,
    });
    expect(result.query).toBe('retry networking');
    expect(result.format).toBe('brief');
    expect(result.entriesConsulted).toBeGreaterThan(0);
    expect(result.content).toContain('Retry');
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.coverage).toBeGreaterThanOrEqual(0);
  });

  it('synthesize returns empty message for no results', async () => {
    const result = await synthesizer.synthesize('quantum computing blockchain', {
      format: 'outline',
    });
    expect(result.entriesConsulted).toBe(0);
    expect(result.content).toContain('No vault entries found');
    expect(result.gaps.length).toBeGreaterThanOrEqual(1);
  });

  it('synthesize includes source attribution', async () => {
    const result = await synthesizer.synthesize('architecture patterns', {
      format: 'talking-points',
      maxEntries: 3,
    });
    for (const source of result.sources) {
      expect(source.id).toBeDefined();
      expect(source.title).toBeDefined();
      expect(source.score).toBeGreaterThanOrEqual(0);
    }
  });

  it('coverage score is between 0 and 100', async () => {
    const result = await synthesizer.synthesize('testing tdd', {
      format: 'post-draft',
    });
    expect(result.coverage).toBeGreaterThanOrEqual(0);
    expect(result.coverage).toBeLessThanOrEqual(100);
  });
});

// ─── 8. Composable Skill Chains ──────────────────────────────────────

describe('Composable skill chains (#204)', () => {
  const mockDispatch = async (op: string, params: Record<string, unknown>): Promise<unknown> => {
    // Simulate op results
    if (op === 'search') return { results: [{ id: 'test', title: 'Test' }] };
    if (op === 'capture_knowledge') return { captured: true, id: 'cap-1' };
    return { ok: true, op, params };
  };

  it('executes a simple two-step chain', async () => {
    const chain = {
      id: 'test-chain',
      name: 'Test Chain',
      steps: [
        { id: 'step1', op: 'search', params: { query: 'retry' }, output: 'searchResult' },
        { id: 'step2', op: 'capture_knowledge', params: { title: 'From chain' } },
      ],
    };

    const instance = await chainRunner.execute(chain, {}, mockDispatch);
    expect(instance.status).toBe('completed');
    expect(instance.stepsCompleted).toBe(2);
    expect(instance.totalSteps).toBe(2);
    expect(instance.stepOutputs.length).toBe(2);
  });

  it('resolves $variable references between steps', async () => {
    let capturedParams: Record<string, unknown> = {};
    const trackingDispatch = async (op: string, params: Record<string, unknown>) => {
      if (op === 'step2-op') capturedParams = params;
      return { value: 'hello from step1' };
    };

    const chain = {
      id: 'var-chain',
      steps: [
        { id: 'step1', op: 'step1-op', output: 'step1Result' },
        { id: 'step2', op: 'step2-op', params: { data: '$step1.value' } },
      ],
    };

    await chainRunner.execute(chain, {}, trackingDispatch);
    expect(capturedParams.data).toBe('hello from step1');
  });

  it('resolves $input references', async () => {
    let capturedParams: Record<string, unknown> = {};
    const trackingDispatch = async (op: string, params: Record<string, unknown>) => {
      capturedParams = params;
      return { ok: true };
    };

    const chain = {
      id: 'input-chain',
      steps: [{ id: 'step1', op: 'my-op', params: { url: '$input.targetUrl' } }],
    };

    await chainRunner.execute(chain, { targetUrl: 'https://example.com' }, trackingDispatch);
    expect(capturedParams.url).toBe('https://example.com');
  });

  it('pauses on user-approval gate', async () => {
    const chain = {
      id: 'gate-chain',
      steps: [
        { id: 'step1', op: 'search', gate: 'user-approval' as const },
        { id: 'step2', op: 'capture_knowledge' },
      ],
    };

    const instance = await chainRunner.execute(chain, {}, mockDispatch);
    expect(instance.status).toBe('paused');
    expect(instance.pausedAtGate).toBe('step1');
    expect(instance.stepsCompleted).toBe(1);
  });

  it('resumes a paused chain after approval', async () => {
    const chain = {
      id: 'resume-chain',
      steps: [
        { id: 'step1', op: 'search', gate: 'user-approval' as const },
        { id: 'step2', op: 'capture_knowledge' },
      ],
    };

    const paused = await chainRunner.execute(chain, {}, mockDispatch);
    expect(paused.status).toBe('paused');

    const resumed = await chainRunner.approve(paused.id, chain, mockDispatch);
    expect(resumed.status).toBe('completed');
    expect(resumed.stepsCompleted).toBe(2);
  });

  it('fails on auto-test gate when step returns error', async () => {
    const failDispatch = async () => ({ error: 'build failed' });

    const chain = {
      id: 'fail-chain',
      steps: [{ id: 'step1', op: 'build', gate: 'auto-test' as const }],
    };

    const instance = await chainRunner.execute(chain, {}, failDispatch);
    expect(instance.status).toBe('failed');
  });

  it('getInstance returns persisted chain state', async () => {
    const chain = {
      id: 'persist-chain',
      steps: [{ id: 'step1', op: 'search' }],
    };

    const instance = await chainRunner.execute(chain, { key: 'value' }, mockDispatch);
    const loaded = chainRunner.getInstance(instance.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.chainId).toBe('persist-chain');
    expect(loaded!.status).toBe('completed');
    expect(loaded!.input.key).toBe('value');
  });

  it('list returns all chain instances', () => {
    const instances = chainRunner.list();
    expect(instances.length).toBeGreaterThanOrEqual(1);
  });

  it('handles step failure gracefully', async () => {
    const throwDispatch = async () => {
      throw new Error('connection refused');
    };

    const chain = {
      id: 'error-chain',
      steps: [
        { id: 'step1', op: 'failing-op' },
        { id: 'step2', op: 'should-not-run' },
      ],
    };

    const instance = await chainRunner.execute(chain, {}, throwDispatch);
    expect(instance.status).toBe('failed');
    expect(instance.stepsCompleted).toBe(0);
    expect(instance.stepOutputs[0].status).toBe('failed');
  });
});
