/**
 * E2E tests for curator async infrastructure (#210).
 *
 * Tests the full pipeline: enqueue → DAG resolution → handler dispatch → completion.
 * Also tests quality gate and classifier graceful degradation (no LLM).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Vault } from '../vault/vault.js';
import { Brain } from '../brain/brain.js';
import { Curator } from './curator.js';
import { JobQueue } from '../queue/job-queue.js';
import { PipelineRunner } from '../queue/pipeline-runner.js';
import { TypedEventBus } from '../events/event-bus.js';
import { LinkManager } from '../vault/linking.js';
import { evaluateQuality } from './quality-gate.js';
import { classifyEntry } from './classifier.js';
import type { IntelligenceEntry } from '../intelligence/types.js';

// ─── Shared Setup ────────────────────────────────────────────────────

let vault: Vault;
let _brain: Brain;
let curator: Curator;
let queue: JobQueue;
let runner: PipelineRunner;
let linkManager: LinkManager;

const SEED: IntelligenceEntry[] = [
  {
    id: 'pattern-circuit-breaker',
    type: 'pattern',
    domain: 'architecture',
    title: 'Circuit Breaker for External Services',
    severity: 'critical',
    description: 'Wrap external service calls in a circuit breaker to prevent cascade failures.',
    tags: ['networking', 'resilience', 'microservices'],
    why: 'Prevents one failing service from taking down the entire system.',
  },
  {
    id: 'anti-pattern-no-timeout',
    type: 'anti-pattern',
    domain: 'architecture',
    title: 'HTTP Calls Without Timeout',
    severity: 'critical',
    description: 'Never make HTTP calls without a timeout. Can hang indefinitely.',
    tags: ['networking', 'timeout', 'http'],
  },
  {
    id: 'pattern-semantic-tokens',
    type: 'pattern',
    domain: 'design',
    title: 'Use Semantic Tokens',
    severity: 'warning',
    description: 'Prefer semantic tokens over primitive color values for maintainability.',
    tags: ['tokens', 'design-system'],
  },
];

beforeAll(() => {
  vault = new Vault(':memory:');
  vault.seed(SEED);
  _brain = new Brain(vault);
  curator = new Curator(vault);
  queue = new JobQueue(vault.getProvider());
  linkManager = new LinkManager(vault.getProvider());
  runner = new PipelineRunner(queue);

  // Register handlers matching the runtime setup
  runner.registerHandler('tag-normalize', async (job) => {
    const entry = vault.get(job.entryId ?? '');
    if (!entry) return { skipped: true, reason: 'entry not found' };
    return curator.normalizeTag(entry.tags[0] ?? '');
  });
  runner.registerHandler('dedup-check', async (job) => {
    const entry = vault.get(job.entryId ?? '');
    if (!entry) return { skipped: true, reason: 'entry not found' };
    return curator.detectDuplicates(entry.id);
  });
  runner.registerHandler('auto-link', async (job) => {
    const suggestions = linkManager.suggestLinks(job.entryId ?? '', 3);
    for (const s of suggestions) {
      linkManager.addLink(job.entryId ?? '', s.entryId, s.suggestedType, `pipeline: ${s.reason}`);
    }
    return { linked: suggestions.length };
  });
  runner.registerHandler('quality-gate', async (job) => {
    const entry = vault.get(job.entryId ?? '');
    if (!entry) return { skipped: true, reason: 'entry not found' };
    return evaluateQuality(entry, null); // No LLM in tests
  });
  runner.registerHandler('classify', async (job) => {
    const entry = vault.get(job.entryId ?? '');
    if (!entry) return { skipped: true, reason: 'entry not found' };
    return classifyEntry(entry, null); // No LLM in tests
  });

  // ─── 9 additional handlers for full Salvador parity (#216) ────
  runner.registerHandler('enrich-frontmatter', async (job) => {
    const entry = vault.get(job.entryId ?? '');
    if (!entry) return { skipped: true, reason: 'entry not found' };
    return curator.enrichMetadata(entry.id);
  });
  runner.registerHandler('detect-staleness', async (job) => {
    const entry = vault.get(job.entryId ?? '');
    if (!entry) return { skipped: true, reason: 'entry not found' };
    const entryTimestamp = (entry.validFrom ?? 0) * 1000 || Date.now();
    const ageMs = Date.now() - entryTimestamp;
    const isStale = ageMs > 90 * 86400000;
    return { stale: isStale, ageDays: Math.floor(ageMs / 86400000), entryId: entry.id };
  });
  runner.registerHandler('detect-duplicate', async (job) => {
    const entry = vault.get(job.entryId ?? '');
    if (!entry) return { skipped: true, reason: 'entry not found' };
    return curator.detectDuplicates(entry.id);
  });
  runner.registerHandler('detect-contradiction', async (job) => {
    const entry = vault.get(job.entryId ?? '');
    if (!entry) return { skipped: true, reason: 'entry not found' };
    const contradictions = curator.detectContradictions(0.4);
    const relevant = contradictions.filter(
      (c) => c.patternId === job.entryId || c.antipatternId === job.entryId,
    );
    return { found: relevant.length, contradictions: relevant };
  });
  runner.registerHandler('consolidate-duplicates', async () => {
    return curator.consolidate({ dryRun: false, staleDaysThreshold: 90 });
  });
  runner.registerHandler('archive-stale', async () => {
    const result = curator.consolidate({ dryRun: false, staleDaysThreshold: 90 });
    return { archived: result.staleEntries.length, result };
  });
  runner.registerHandler('verify-searchable', async (job) => {
    const entry = vault.get(job.entryId ?? '');
    if (!entry) return { skipped: true, reason: 'entry not found' };
    const searchResults = vault.search(entry.title, { limit: 1 });
    const found = searchResults.some((r) => r.entry.id === entry.id);
    return { searchable: found, entryId: entry.id };
  });
});

afterAll(() => {
  runner.stop();
  vault.close();
});

// ─── Job Queue Integration ──────────────────────────────────────────

describe('Job Queue — curator pipeline', () => {
  it('enqueues a 3-step DAG pipeline for an entry', () => {
    const pipelineId = 'pipe-test-1';
    const entryId = 'pattern-circuit-breaker';

    const step1 = queue.enqueue('tag-normalize', { entryId, pipelineId });
    const step2 = queue.enqueue('dedup-check', { entryId, pipelineId, dependsOn: [step1] });
    queue.enqueue('auto-link', { entryId, pipelineId, dependsOn: [step2] });

    const jobs = queue.getByPipeline(pipelineId);
    expect(jobs.length).toBe(3);
    expect(jobs[0].type).toBe('tag-normalize');
    expect(jobs[1].dependsOn).toContain(step1);
    expect(jobs[2].dependsOn).toContain(step2);
  });

  it('dequeueReady only returns jobs with completed deps', () => {
    const pipelineId = 'pipe-test-dag';
    const step1 = queue.enqueue('tag-normalize', {
      entryId: 'pattern-circuit-breaker',
      pipelineId,
    });
    const step2 = queue.enqueue('dedup-check', {
      entryId: 'pattern-circuit-breaker',
      pipelineId,
      dependsOn: [step1],
    });

    // Only step1 should be ready
    const ready = queue.dequeueReady(10);
    const readyIds = ready.map((j) => j.id);
    expect(readyIds).toContain(step1);
    expect(readyIds).not.toContain(step2);
  });
});

// ─── Pipeline Runner Integration ────────────────────────────────────

describe('Pipeline Runner — full pipeline execution', () => {
  it('executes a 3-step pipeline in DAG order', async () => {
    const pipelineId = 'pipe-runner-test';
    const entryId = 'pattern-circuit-breaker';

    const step1 = queue.enqueue('tag-normalize', { entryId, pipelineId });
    const step2 = queue.enqueue('dedup-check', { entryId, pipelineId, dependsOn: [step1] });
    const step3 = queue.enqueue('auto-link', { entryId, pipelineId, dependsOn: [step2] });

    // Process step 1
    const batch1 = await runner.processOnce(10);
    expect(batch1).toBeGreaterThanOrEqual(1);
    expect(queue.get(step1)!.status).toBe('completed');

    // Process step 2
    const batch2 = await runner.processOnce(10);
    expect(batch2).toBeGreaterThanOrEqual(1);
    expect(queue.get(step2)!.status).toBe('completed');

    // Process step 3
    const batch3 = await runner.processOnce(10);
    expect(batch3).toBeGreaterThanOrEqual(1);
    expect(queue.get(step3)!.status).toBe('completed');

    // All jobs in pipeline should be completed
    const jobs = queue.getByPipeline(pipelineId);
    expect(jobs.every((j) => j.status === 'completed')).toBe(true);
  });

  it('tag-normalize handler returns normalization result', async () => {
    const id = queue.enqueue('tag-normalize', { entryId: 'pattern-circuit-breaker' });
    await runner.processOnce();

    const job = queue.get(id);
    expect(job!.status).toBe('completed');
    expect(job!.result).toBeDefined();
  });

  it('dedup-check handler detects duplicates', async () => {
    const id = queue.enqueue('dedup-check', { entryId: 'pattern-circuit-breaker' });
    await runner.processOnce();

    const job = queue.get(id);
    expect(job!.status).toBe('completed');
    expect(job!.result).toBeDefined();
  });

  it('auto-link handler creates Zettelkasten links', async () => {
    const id = queue.enqueue('auto-link', { entryId: 'pattern-circuit-breaker' });
    await runner.processOnce();

    const job = queue.get(id);
    expect(job!.status).toBe('completed');
    const result = job!.result as { linked: number };
    expect(typeof result.linked).toBe('number');
  });

  it('handles missing entry gracefully', async () => {
    const id = queue.enqueue('tag-normalize', { entryId: 'nonexistent-entry' });
    await runner.processOnce();

    const job = queue.get(id);
    expect(job!.status).toBe('completed');
    expect((job!.result as Record<string, unknown>).skipped).toBe(true);
  });

  it('runner status tracks processed/failed counts', async () => {
    const status = runner.getStatus();
    expect(status.jobsProcessed).toBeGreaterThan(0);
    expect(typeof status.jobsFailed).toBe('number');
    expect(typeof status.jobsRetried).toBe('number');
  });
});

// ─── Quality Gate (no LLM) ──────────────────────────────────────────

describe('Quality Gate — graceful degradation', () => {
  it('returns ACCEPT with default scores when no LLM', async () => {
    const entry = vault.get('pattern-circuit-breaker')!;
    const result = await evaluateQuality(entry, null);

    expect(result.evaluated).toBe(false);
    expect(result.verdict).toBe('ACCEPT');
    expect(result.overallScore).toBe(50);
    expect(result.scores.novelty).toBe(50);
    expect(result.scores.actionability).toBe(50);
    expect(result.reasoning).toContain('unavailable');
  });

  it('quality-gate job handler works via pipeline', async () => {
    const id = queue.enqueue('quality-gate', { entryId: 'pattern-circuit-breaker' });
    await runner.processOnce();

    const job = queue.get(id);
    expect(job!.status).toBe('completed');
    const result = job!.result as { evaluated: boolean; verdict: string };
    expect(result.verdict).toBe('ACCEPT');
  });
});

// ─── Classifier (no LLM) ────────────────────────────────────────────

describe('Classifier — graceful degradation', () => {
  it('returns empty classification when no LLM', async () => {
    const entry = vault.get('pattern-circuit-breaker')!;
    const result = await classifyEntry(entry, null);

    expect(result.classified).toBe(false);
    expect(result.suggestedDomain).toBeNull();
    expect(result.suggestedSeverity).toBeNull();
    expect(result.suggestedTags).toEqual([]);
    expect(result.confidence).toBe(0);
  });

  it('classify job handler works via pipeline', async () => {
    const id = queue.enqueue('classify', { entryId: 'anti-pattern-no-timeout' });
    await runner.processOnce();

    const job = queue.get(id);
    expect(job!.status).toBe('completed');
    const result = job!.result as { classified: boolean };
    expect(result.classified).toBe(false); // No LLM
  });
});

// ─── Salvador Parity Handlers (#216) ─────────────────────────────────

describe('Pipeline Runner — Salvador parity handlers (#216)', () => {
  it('enrich-frontmatter enriches entry metadata', async () => {
    const id = queue.enqueue('enrich-frontmatter', { entryId: 'pattern-circuit-breaker' });
    await runner.processOnce();
    const job = queue.get(id);
    expect(job!.status).toBe('completed');
    expect(job!.result).toBeDefined();
  });

  it('detect-staleness checks entry age', async () => {
    const id = queue.enqueue('detect-staleness', { entryId: 'pattern-circuit-breaker' });
    await runner.processOnce();
    const job = queue.get(id);
    expect(job!.status).toBe('completed');
    const result = job!.result as { stale: boolean; ageDays: number };
    expect(typeof result.stale).toBe('boolean');
    expect(typeof result.ageDays).toBe('number');
  });

  it('detect-duplicate runs dedup on specific entry', async () => {
    const id = queue.enqueue('detect-duplicate', { entryId: 'pattern-circuit-breaker' });
    await runner.processOnce();
    const job = queue.get(id);
    expect(job!.status).toBe('completed');
    expect(job!.result).toBeDefined();
  });

  it('detect-contradiction finds pattern/anti-pattern conflicts', async () => {
    const id = queue.enqueue('detect-contradiction', { entryId: 'pattern-circuit-breaker' });
    await runner.processOnce();
    const job = queue.get(id);
    expect(job!.status).toBe('completed');
    const result = job!.result as { found: number };
    expect(typeof result.found).toBe('number');
  });

  it('consolidate-duplicates runs consolidation', async () => {
    const id = queue.enqueue('consolidate-duplicates', {});
    await runner.processOnce();
    const job = queue.get(id);
    expect(job!.status).toBe('completed');
    expect(job!.result).toBeDefined();
  });

  it('archive-stale archives old entries', async () => {
    const id = queue.enqueue('archive-stale', {});
    await runner.processOnce();
    const job = queue.get(id);
    expect(job!.status).toBe('completed');
    const result = job!.result as { archived: number };
    expect(typeof result.archived).toBe('number');
  });

  it('verify-searchable confirms entry is FTS-indexed', async () => {
    const id = queue.enqueue('verify-searchable', { entryId: 'pattern-circuit-breaker' });
    await runner.processOnce();
    const job = queue.get(id);
    expect(job!.status).toBe('completed');
    const result = job!.result as { searchable: boolean };
    expect(result.searchable).toBe(true);
  });

  it('all handlers handle missing entries gracefully', async () => {
    const types = [
      'enrich-frontmatter',
      'detect-staleness',
      'detect-duplicate',
      'detect-contradiction',
      'verify-searchable',
    ];
    for (const type of types) {
      const id = queue.enqueue(type, { entryId: 'nonexistent' });
      await runner.processOnce();
      const job = queue.get(id);
      expect(job!.status).toBe('completed');
      expect((job!.result as Record<string, unknown>).skipped).toBe(true);
    }
  });
});

describe('Full Salvador DAG — 7-step curator pipeline', () => {
  it('runs the complete quality pipeline in DAG order', async () => {
    const entryId = 'pattern-semantic-tokens';
    const pipelineId = 'full-salvador-dag';

    const step1 = queue.enqueue('quality-gate', { entryId, pipelineId });
    const step2 = queue.enqueue('enrich-frontmatter', { entryId, pipelineId, dependsOn: [step1] });
    const step3 = queue.enqueue('tag-normalize', { entryId, pipelineId, dependsOn: [step2] });
    const step4 = queue.enqueue('dedup-check', { entryId, pipelineId, dependsOn: [step3] });
    const step5Id = queue.enqueue('detect-contradiction', {
      entryId,
      pipelineId,
      dependsOn: [step4],
    });
    const step6Id = queue.enqueue('auto-link', { entryId, pipelineId, dependsOn: [step5Id] });
    queue.enqueue('verify-searchable', { entryId, pipelineId, dependsOn: [step6Id] });

    // Drain the DAG
    for (let i = 0; i < 15; i++) {
      await runner.processOnce(20);
    }

    const jobs = queue.getByPipeline(pipelineId);
    const statuses = jobs.map((j) => `${j.type}:${j.status}`);

    expect(statuses).toEqual([
      'quality-gate:completed',
      'enrich-frontmatter:completed',
      'tag-normalize:completed',
      'dedup-check:completed',
      'detect-contradiction:completed',
      'auto-link:completed',
      'verify-searchable:completed',
    ]);
  });
});

// ─── Event Bus Integration ──────────────────────────────────────────

describe('Event Bus — curator events', () => {
  type CuratorEvents = {
    'entry:captured': { id: string; title: string };
    'pipeline:started': { pipelineId: string; entryId: string };
    'pipeline:completed': { pipelineId: string; jobsCompleted: number };
    'quality:rejected': { entryId: string; score: number; reasons: string[] };
  };

  it('fires entry:captured event and listeners receive it', () => {
    const bus = new TypedEventBus<CuratorEvents>();
    let received: CuratorEvents['entry:captured'] | null = null;

    bus.on('entry:captured', (payload) => {
      received = payload;
    });
    bus.emit('entry:captured', { id: 'test-1', title: 'Test Entry' });

    expect(received).toEqual({ id: 'test-1', title: 'Test Entry' });
  });

  it('fires pipeline events in sequence', () => {
    const bus = new TypedEventBus<CuratorEvents>();
    const events: string[] = [];

    bus.on('pipeline:started', () => events.push('started'));
    bus.on('pipeline:completed', () => events.push('completed'));

    bus.emit('pipeline:started', { pipelineId: 'p1', entryId: 'e1' });
    bus.emit('pipeline:completed', { pipelineId: 'p1', jobsCompleted: 3 });

    expect(events).toEqual(['started', 'completed']);
  });

  it('fires quality:rejected for low-scoring entries', () => {
    const bus = new TypedEventBus<CuratorEvents>();
    let rejected: CuratorEvents['quality:rejected'] | null = null;

    bus.on('quality:rejected', (payload) => {
      rejected = payload;
    });
    bus.emit('quality:rejected', {
      entryId: 'junk-1',
      score: 25,
      reasons: ['too vague', 'no actionability'],
    });

    expect(rejected!.score).toBe(25);
    expect(rejected!.reasons).toContain('too vague');
  });
});

// ─── Full Pipeline E2E ──────────────────────────────────────────────

describe('Full pipeline E2E — capture to completion', () => {
  it('processes a 5-step pipeline: quality-gate → tag-normalize → dedup → classify → auto-link', async () => {
    const entryId = 'anti-pattern-no-timeout';
    const pipelineId = 'full-e2e';

    const step1 = queue.enqueue('quality-gate', { entryId, pipelineId });
    const step2 = queue.enqueue('tag-normalize', { entryId, pipelineId, dependsOn: [step1] });
    const step3 = queue.enqueue('dedup-check', { entryId, pipelineId, dependsOn: [step2] });
    const step4 = queue.enqueue('classify', { entryId, pipelineId, dependsOn: [step3] });
    queue.enqueue('auto-link', { entryId, pipelineId, dependsOn: [step4] });

    // Process all steps — run enough batches to drain DAG
    // (earlier tests may have left pending jobs, so process generously)
    for (let i = 0; i < 10; i++) {
      await runner.processOnce(20);
    }

    const jobs = queue.getByPipeline(pipelineId);
    const statuses = jobs.map((j) => `${j.type}:${j.status}`);

    expect(statuses).toEqual([
      'quality-gate:completed',
      'tag-normalize:completed',
      'dedup-check:completed',
      'classify:completed',
      'auto-link:completed',
    ]);
  });

  it('queue stats reflect pipeline completion', () => {
    const stats = queue.getStats();
    expect(stats.completed).toBeGreaterThan(5);
    expect(stats.total).toBeGreaterThan(10);
  });
});
