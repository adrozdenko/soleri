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
    const results = await Promise.all([
      callOp(`${AGENT_ID}_vault`, 'vault_stats'),
      callOp(`${AGENT_ID}_brain`, 'brain_stats'),
      callOp(`${AGENT_ID}_curator`, 'curator_status'),
      callOp(`${AGENT_ID}_admin`, 'admin_health'),
      callOp(`${AGENT_ID}_control`, 'route_intent', { prompt: 'Fix the button' }),
    ]);

    for (const res of results) {
      expect(res.success).toBe(true);
    }
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

    // Verify all entries were captured
    const statsRes = await callOp(`${AGENT_ID}_vault`, 'vault_stats');
    expect(statsRes.success).toBe(true);
    const stats = statsRes.data as { totalEntries: number };
    expect(stats.totalEntries).toBeGreaterThanOrEqual(10);
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
  });

  it('should handle concurrent domain facade calls', async () => {
    const results = await Promise.all([
      callOp(`${AGENT_ID}_frontend`, 'search', { query: 'component' }),
      callOp(`${AGENT_ID}_backend`, 'search', { query: 'database' }),
      callOp(`${AGENT_ID}_infra`, 'search', { query: 'deployment' }),
    ]);

    for (const res of results) {
      expect(res.success).toBe(true);
    }
  });

  // ─── Large Vault Performance ───────────────────────────────────────

  it('should seed 500 entries efficiently', async () => {
    const batchSize = 50;
    const batches = 10;

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
  });

  it('should have 500+ total entries', async () => {
    const res = await callOp(`${AGENT_ID}_vault`, 'vault_stats');
    expect(res.success).toBe(true);
    const stats = res.data as { totalEntries: number };
    expect(stats.totalEntries).toBeGreaterThanOrEqual(500);
  });

  it('should search large vault in under 100ms', async () => {
    const start = performance.now();
    const res = await callOp(`${AGENT_ID}_vault`, 'search', {
      query: 'scalability performance optimization',
    });
    const elapsed = performance.now() - start;

    expect(res.success).toBe(true);
    expect(elapsed).toBeLessThan(100);
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
  });

  it('should rebuild vocabulary on large vault efficiently', async () => {
    const start = performance.now();
    const res = await callOp(`${AGENT_ID}_brain`, 'rebuild_vocabulary');
    const elapsed = performance.now() - start;

    expect(res.success).toBe(true);
    const data = res.data as { vocabularySize: number };
    expect(data.vocabularySize).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(2000); // Should complete under 2s even with 500+ entries
  });

  it('should run curator health audit on large vault', async () => {
    const start = performance.now();
    const res = await callOp(`${AGENT_ID}_curator`, 'curator_health_audit');
    const elapsed = performance.now() - start;

    expect(res.success).toBe(true);
    const data = res.data as { score: number };
    expect(typeof data.score).toBe('number');
    expect(elapsed).toBeLessThan(5000);
  });
});
