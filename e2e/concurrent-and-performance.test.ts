/**
 * E2E Test: Concurrent Facade Calls & Large Vault Performance
 *
 * Tests that facades handle concurrent calls without race conditions
 * (real Claude Code fires multiple tool calls in parallel), and that
 * vault search stays fast with 1000+ entries.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createAgentRuntime,
  createSemanticFacades,
  createDomainFacades,
  registerFacade,
} from '@soleri/core';
import type { FacadeConfig, AgentRuntime } from '@soleri/core';

const AGENT_ID = 'e2e-concurrent';

function captureHandler(facade: FacadeConfig) {
  let captured:
    | ((args: { op: string; params: Record<string, unknown> }) => Promise<{
        content: Array<{ type: string; text: string }>;
      }>)
    | null = null;

  const mockServer = {
    tool: (_name: string, _desc: string, _schema: unknown, handler: unknown) => {
      captured = handler as typeof captured;
    },
  };
  registerFacade(mockServer as never, facade);
  return captured!;
}

function parseResponse(raw: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(raw.content[0].text) as {
    success: boolean;
    data?: unknown;
    error?: string;
    op: string;
    facade: string;
  };
}

describe('E2E: concurrent-and-performance', () => {
  let runtime: AgentRuntime;
  let handlers: Map<string, ReturnType<typeof captureHandler>>;
  const plannerDir = join(tmpdir(), `soleri-e2e-perf-${Date.now()}`);

  beforeAll(() => {
    mkdirSync(plannerDir, { recursive: true });

    runtime = createAgentRuntime({
      agentId: AGENT_ID,
      vaultPath: ':memory:',
      plansPath: join(plannerDir, 'plans.json'),
    });

    const semanticFacades = createSemanticFacades(runtime, AGENT_ID);
    const domainFacades = createDomainFacades(runtime, AGENT_ID, ['frontend', 'backend', 'infra']);
    const facades = [...semanticFacades, ...domainFacades];

    handlers = new Map();
    for (const facade of facades) {
      handlers.set(facade.name, captureHandler(facade));
    }
  });

  afterAll(() => {
    runtime.close();
    rmSync(plannerDir, { recursive: true, force: true });
  });

  async function callOp(facadeName: string, op: string, params: Record<string, unknown> = {}) {
    const handler = handlers.get(facadeName);
    if (!handler) throw new Error(`No facade: ${facadeName}`);
    const raw = await handler({ op, params });
    return parseResponse(raw);
  }

  // ─── Concurrent Facade Calls ───────────────────────────────────────

  it('should handle concurrent calls to different facades', async () => {
    const calls = [
      { facade: `${AGENT_ID}_vault`, op: 'vault_stats' },
      { facade: `${AGENT_ID}_brain`, op: 'brain_stats' },
      { facade: `${AGENT_ID}_curator`, op: 'curator_status' },
      { facade: `${AGENT_ID}_admin`, op: 'admin_health' },
      { facade: `${AGENT_ID}_control`, op: 'route_intent' },
    ] as const;

    const results = await Promise.all([
      callOp(calls[0].facade, calls[0].op),
      callOp(calls[1].facade, calls[1].op),
      callOp(calls[2].facade, calls[2].op),
      callOp(calls[3].facade, calls[3].op),
      callOp(calls[4].facade, calls[4].op, { prompt: 'Fix the button' }),
    ]);

    // Every response must succeed and carry correct op + facade metadata
    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      expect(res.success).toBe(true);
      expect(res.op).toBe(calls[i].op);
      expect(res.facade).toBe(calls[i].facade);
    }

    // Verify response shapes per facade
    const vaultStats = results[0].data as { totalEntries: number };
    expect(typeof vaultStats.totalEntries).toBe('number');

    const brainStats = results[1].data as { vocabularySize: number };
    expect(typeof brainStats.vocabularySize).toBe('number');

    const curatorStatus = results[2].data as Record<string, unknown>;
    expect(curatorStatus).toBeDefined();

    const adminHealth = results[3].data as { status: string };
    expect(adminHealth.status).toBe('ok');

    const routeIntent = results[4].data as { intent: string };
    expect(typeof routeIntent.intent).toBe('string');
  });

  it('should handle concurrent writes to the same facade', async () => {
    const capturePromises = Array.from({ length: 10 }, (_, i) =>
      callOp(`${AGENT_ID}_vault`, 'capture_knowledge', {
        entries: [
          {
            type: 'pattern',
            domain: i % 2 === 0 ? 'frontend' : 'backend',
            title: `Concurrent Pattern ${i}`,
            description: `Pattern captured during concurrent write test number ${i}`,
            severity: 'warning',
            tags: ['concurrent', `batch-${i}`],
          },
        ],
      }),
    );

    const results = await Promise.all(capturePromises);

    for (const res of results) {
      expect(res.success).toBe(true);
    }

    // Verify EACH specific entry is individually findable by searching its title.
    // Use a generous limit because FTS ranking may push exact matches down.
    for (let i = 0; i < 10; i++) {
      const searchRes = await callOp(`${AGENT_ID}_vault`, 'search', {
        query: `Concurrent Pattern ${i}`,
        limit: 20,
      });
      expect(searchRes.success).toBe(true);
      const searchResults = searchRes.data as Array<{ entry: { title: string }; score: number }>;
      const found = searchResults.some((r) => r.entry.title === `Concurrent Pattern ${i}`);
      expect(found, `Expected to find "Concurrent Pattern ${i}" in search results`).toBe(true);
    }
  });

  it('should handle concurrent reads while writing', async () => {
    const mixed = [
      // Reads
      callOp(`${AGENT_ID}_vault`, 'search', { query: 'concurrent pattern' }),
      callOp(`${AGENT_ID}_vault`, 'vault_stats'),
      callOp(`${AGENT_ID}_brain`, 'brain_stats'),
      // Writes
      callOp(`${AGENT_ID}_vault`, 'capture_knowledge', {
        entries: [
          {
            type: 'pattern',
            domain: 'frontend',
            title: 'Read-Write Concurrent Test',
            description: 'Entry written during concurrent read-write test',
            severity: 'warning',
            tags: ['concurrent', 'mixed'],
          },
        ],
      }),
      callOp(`${AGENT_ID}_brain`, 'record_feedback', {
        query: 'test',
        entryId: 'some-id',
        action: 'accepted',
      }),
    ];

    const results = await Promise.all(mixed);

    for (const res of results) {
      expect(res.success).toBe(true);
    }

    // Verify the write actually persisted — search for the specific entry by title
    const verifyRes = await callOp(`${AGENT_ID}_vault`, 'search', {
      query: 'Read-Write Concurrent Test',
      limit: 5,
    });
    expect(verifyRes.success).toBe(true);
    const verifyResults = verifyRes.data as Array<{ entry: { title: string }; score: number }>;
    const found = verifyResults.some((r) => r.entry.title === 'Read-Write Concurrent Test');
    expect(found, 'Expected "Read-Write Concurrent Test" entry to be persisted and searchable').toBe(
      true,
    );
  });

  it('should handle concurrent domain facade calls', async () => {
    const domainCalls = [
      { facade: `${AGENT_ID}_frontend`, op: 'search', params: { query: 'component' } },
      { facade: `${AGENT_ID}_backend`, op: 'search', params: { query: 'database' } },
      { facade: `${AGENT_ID}_infra`, op: 'search', params: { query: 'deployment' } },
    ];

    const results = await Promise.all(
      domainCalls.map((c) => callOp(c.facade, c.op, c.params)),
    );

    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      expect(res.success).toBe(true);
      expect(res.facade).toBe(domainCalls[i].facade);
      expect(res.op).toBe(domainCalls[i].op);
    }
  });

  // ─── Duplicate ID Resilience ─────────────────────────────────────
  // (placed before 500-entry seeding to stay within moderate governance quota of 500)

  it('should handle concurrent writes with duplicate entry IDs without data corruption', async () => {
    const duplicateId = `dup-test-${Date.now()}`;
    // Each entry has a wildly different title so brain dedup (title cosine >= 0.8) won't block.
    const distinctTitles = [
      'Kubernetes Pod Scheduling Strategy',
      'React Hydration Mismatch Debugging',
      'PostgreSQL Index Bloom Filter Tuning',
      'WebSocket Heartbeat Timeout Handling',
      'CSS Container Query Layout Patterns',
    ];

    const writePromises = distinctTitles.map((title) =>
      callOp(`${AGENT_ID}_vault`, 'capture_knowledge', {
        entries: [
          {
            id: duplicateId,
            type: 'pattern',
            domain: 'testing',
            title,
            description: `Unique description for: ${title}`,
            severity: 'info',
            tags: ['dup-id-test'],
          },
        ],
      }),
    );

    const results = await Promise.all(writePromises);

    // All calls should complete without throwing
    for (const res of results) {
      expect(res.success).toBe(true);
    }

    // Check capture results. The handler returns:
    //   { captured, proposed, rejected, duplicated, results: [{ id, action }] }
    // action values: 'capture' (success), 'duplicate' (title-similarity blocked), 'propose', 'error'
    const captureData = results.map(
      (r) =>
        r.data as {
          captured: number;
          duplicated: number;
          results: Array<{ id: string; action: string }>;
        },
    );
    const totalCaptured = captureData.reduce((sum, d) => sum + d.captured, 0);
    const totalDuplicated = captureData.reduce((sum, d) => sum + d.duplicated, 0);

    // At least one entry must have been captured (the first to arrive).
    // Others may be 'duplicate' if title similarity triggers, or also 'capture'
    // (all titles are distinct, so most should pass dedup and upsert via ON CONFLICT(id)).
    expect(totalCaptured + totalDuplicated).toBe(distinctTitles.length);
    expect(totalCaptured, 'At least one entry must be captured').toBeGreaterThanOrEqual(1);

    // Verify the vault has exactly 1 entry for our shared ID.
    // Multiple 'capture' calls with the same ID upsert via ON CONFLICT(id) DO UPDATE.
    const listRes = await callOp(`${AGENT_ID}_vault`, 'list_all', {
      tags: ['dup-id-test'],
      limit: 20,
      verbose: true,
    });
    expect(listRes.success).toBe(true);
    const allEntries = listRes.data as Array<{ id: string; title: string }>;
    const matchingById = allEntries.filter((e) => e.id === duplicateId);
    expect(
      matchingById.length,
      `Expected exactly 1 entry with ID "${duplicateId}", found ${matchingById.length}`,
    ).toBe(1);
  });

  // ─── Large Vault Performance ───────────────────────────────────────

  it('should seed 500 entries efficiently', async () => {
    // Track exact count before seeding
    const beforeRes = await callOp(`${AGENT_ID}_vault`, 'vault_stats');
    expect(beforeRes.success).toBe(true);
    const beforeCount = (beforeRes.data as { totalEntries: number }).totalEntries;

    const batchSize = 50;
    const batches = 10;
    const totalSeeded = batchSize * batches; // 500

    const domains = ['frontend', 'backend', 'infra', 'security', 'testing'];
    const types = ['pattern', 'anti-pattern', 'rule'] as const;
    const severities = ['critical', 'warning', 'info'] as const;

    for (let batch = 0; batch < batches; batch++) {
      const entries = Array.from({ length: batchSize }, (_, i) => {
        const idx = batch * batchSize + i;
        return {
          type: types[idx % types.length],
          domain: domains[idx % domains.length],
          title: `Perf Test Entry ${idx}`,
          description: `Performance test entry number ${idx} for measuring search latency and vault scalability under load`,
          severity: severities[idx % severities.length],
          tags: ['perf-test', `batch-${batch}`, domains[idx % domains.length]],
        };
      });

      const res = await callOp(`${AGENT_ID}_vault`, 'capture_knowledge', { entries });
      expect(res.success).toBe(true);
    }

    // Verify count grew substantially. Not exact because brain dedup (title similarity >= 0.8)
    // may block a small number of entries with near-identical titles across batches.
    // We expect at least 90% to land (450 of 500).
    const afterRes = await callOp(`${AGENT_ID}_vault`, 'vault_stats');
    expect(afterRes.success).toBe(true);
    const afterCount = (afterRes.data as { totalEntries: number }).totalEntries;
    const seeded = afterCount - beforeCount;
    expect(seeded).toBeGreaterThanOrEqual(totalSeeded * 0.9);
    expect(seeded).toBeLessThanOrEqual(totalSeeded);
  });

  it('should have 500+ total entries', async () => {
    const res = await callOp(`${AGENT_ID}_vault`, 'vault_stats');
    expect(res.success).toBe(true);
    const stats = res.data as { totalEntries: number };
    expect(stats.totalEntries).toBeGreaterThanOrEqual(500);
  });

  it('should search large vault within adaptive time ceiling', async () => {
    // Warmup / calibration run
    const warmupStart = performance.now();
    await callOp(`${AGENT_ID}_vault`, 'search', {
      query: 'scalability performance optimization',
    });
    const calibrationTime = performance.now() - warmupStart;

    // Actual measured run
    const start = performance.now();
    const res = await callOp(`${AGENT_ID}_vault`, 'search', {
      query: 'scalability performance optimization',
    });
    const elapsed = performance.now() - start;

    expect(res.success).toBe(true);
    // Adaptive: 5x calibration time or 500ms ceiling, whichever is larger.
    // 500ms is generous enough for CI environments with slow I/O.
    const threshold = Math.max(calibrationTime * 5, 500);
    expect(elapsed).toBeLessThan(threshold);
  });

  it('should return relevant results from large vault', async () => {
    const res = await callOp(`${AGENT_ID}_vault`, 'search', {
      query: 'performance test entry',
      limit: 20,
    });
    expect(res.success).toBe(true);
    const results = res.data as Array<{ entry: { title: string }; score: number }>;
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(20);

    // Verify each result has the expected shape
    for (const r of results) {
      expect(r.entry).toBeDefined();
      expect(typeof r.entry.title).toBe('string');
      expect(typeof r.score).toBe('number');
    }

    // Verify scores are in descending order (search relevance ranking)
    for (let i = 1; i < results.length; i++) {
      expect(
        results[i].score,
        `Score at index ${i} (${results[i].score}) should be <= score at index ${i - 1} (${results[i - 1].score})`,
      ).toBeLessThanOrEqual(results[i - 1].score);
    }
  });

  it('should rebuild vocabulary on large vault efficiently', async () => {
    // Warmup / calibration run
    const warmupStart = performance.now();
    await callOp(`${AGENT_ID}_brain`, 'rebuild_vocabulary');
    const calibrationTime = performance.now() - warmupStart;

    // Actual measured run
    const start = performance.now();
    const res = await callOp(`${AGENT_ID}_brain`, 'rebuild_vocabulary');
    const elapsed = performance.now() - start;

    expect(res.success).toBe(true);
    const data = res.data as { vocabularySize: number };
    expect(data.vocabularySize).toBeGreaterThan(0);
    // Adaptive: 5x calibration or 5s ceiling (vocabulary rebuild is heavier than search)
    const threshold = Math.max(calibrationTime * 5, 5000);
    expect(elapsed).toBeLessThan(threshold);
  });

  it('should run curator health audit on large vault', async () => {
    // Warmup / calibration run
    const warmupStart = performance.now();
    await callOp(`${AGENT_ID}_curator`, 'curator_health_audit');
    const calibrationTime = performance.now() - warmupStart;

    // Actual measured run
    const start = performance.now();
    const res = await callOp(`${AGENT_ID}_curator`, 'curator_health_audit');
    const elapsed = performance.now() - start;

    expect(res.success).toBe(true);
    const data = res.data as { score: number };
    expect(typeof data.score).toBe('number');
    // Adaptive: 5x calibration or 10s ceiling (health audit is the heaviest operation)
    const threshold = Math.max(calibrationTime * 5, 10_000);
    expect(elapsed).toBeLessThan(threshold);
  });

});
