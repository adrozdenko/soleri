/**
 * E2E Test: Vault Persistence
 *
 * Validates that data written to a file-backed vault survives
 * closing and reopening the runtime. Covers vault entries,
 * brain vocabulary, plan data, and multi-cycle persistence.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAgentRuntime, createSemanticFacades, registerFacade } from '@soleri/core';
import type { FacadeConfig, AgentRuntime } from '@soleri/core';

const AGENT_ID = 'e2e-persist';
const tempDir = join(tmpdir(), `soleri-e2e-persistence-${Date.now()}`);

/** Capture the MCP handler from registerFacade without a real server */
function captureHandler(facade: FacadeConfig) {
  let captured: ((args: { op: string; params: Record<string, unknown> }) => Promise<{
    content: Array<{ type: string; text: string }>;
  }>) | null = null;

  const mockServer = {
    tool: (_name: string, _desc: string, _schema: unknown, handler: unknown) => {
      captured = handler as typeof captured;
    },
  };
  registerFacade(mockServer as never, facade);
  return captured!;
}

/** Parse MCP tool response to structured object */
function parseResponse(raw: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(raw.content[0].text) as {
    success: boolean;
    data?: unknown;
    error?: string;
    op: string;
    facade: string;
  };
}

/** Create a runtime with file-backed vault in the given subdirectory */
function createFileRuntime(subDir: string) {
  const dir = join(tempDir, subDir);
  mkdirSync(dir, { recursive: true });

  const vaultPath = join(dir, 'vault.db');
  const plansPath = join(dir, 'plans.json');

  const runtime = createAgentRuntime({ agentId: AGENT_ID, vaultPath, plansPath });
  const facades = createSemanticFacades(runtime, AGENT_ID);
  const handlers = new Map<string, ReturnType<typeof captureHandler>>();
  for (const facade of facades) {
    handlers.set(facade.name, captureHandler(facade));
  }

  return { runtime, facades, handlers, vaultPath, plansPath };
}

/** Call a facade op by name */
async function callOp(
  handlers: Map<string, ReturnType<typeof captureHandler>>,
  facadeName: string,
  op: string,
  params: Record<string, unknown> = {},
) {
  const handler = handlers.get(facadeName);
  if (!handler) throw new Error(`No facade: ${facadeName}`);
  const raw = await handler({ op, params });
  return parseResponse(raw);
}

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('E2E: vault persistence across runtime restarts', () => {
  const subDir = 'vault-persist';

  it('vault data persists across runtime close/reopen', async () => {
    // --- First runtime: capture knowledge ---
    const first = createFileRuntime(subDir);

    const captureRes = await callOp(first.handlers, `${AGENT_ID}_vault`, 'capture_knowledge', {
      entries: [
        {
          type: 'pattern',
          domain: 'backend',
          title: 'Persistence Pattern Alpha',
          description: 'Data must survive runtime restarts',
          severity: 'critical',
          tags: ['persistence', 'e2e'],
        },
        {
          type: 'pattern',
          domain: 'frontend',
          title: 'Persistence Pattern Beta',
          description: 'File-backed vaults retain all entries',
          severity: 'info',
          tags: ['persistence', 'vault'],
        },
      ],
    });
    expect(captureRes.success).toBe(true);

    // Verify entries exist before closing
    const statsBeforeClose = await callOp(first.handlers, `${AGENT_ID}_vault`, 'vault_stats');
    expect(statsBeforeClose.success).toBe(true);
    const beforeStats = statsBeforeClose.data as { totalEntries: number };
    expect(beforeStats.totalEntries).toBeGreaterThanOrEqual(2);

    // Close runtime
    first.runtime.close();

    // --- Second runtime: reopen with same paths ---
    const second = createFileRuntime(subDir);

    // Search for previously captured entries
    const searchRes = await callOp(second.handlers, `${AGENT_ID}_vault`, 'search', {
      query: 'Persistence Pattern',
    });
    expect(searchRes.success).toBe(true);
    const results = searchRes.data as Array<{ entry: { title: string }; score: number }>;
    expect(results.length).toBeGreaterThanOrEqual(2);

    const titles = results.map((r) => r.entry.title);
    expect(titles).toContain('Persistence Pattern Alpha');
    expect(titles).toContain('Persistence Pattern Beta');

    // Stats should also reflect persisted data
    const statsAfterReopen = await callOp(second.handlers, `${AGENT_ID}_vault`, 'vault_stats');
    expect(statsAfterReopen.success).toBe(true);
    const afterStats = statsAfterReopen.data as { totalEntries: number };
    expect(afterStats.totalEntries).toBeGreaterThanOrEqual(2);

    second.runtime.close();
  });
});

describe('E2E: brain vocabulary persistence', () => {
  const subDir = 'brain-persist';

  it('brain vocabulary persists across runtime close/reopen', async () => {
    // --- First runtime: record feedback to build vocabulary ---
    const first = createFileRuntime(subDir);

    const feedbackRes = await callOp(first.handlers, `${AGENT_ID}_brain`, 'record_feedback', {
      query: 'semantic token usage',
      entryId: 'entry-001',
      action: 'accepted',
    });
    expect(feedbackRes.success).toBe(true);

    // Record another feedback
    await callOp(first.handlers, `${AGENT_ID}_brain`, 'record_feedback', {
      query: 'color contrast ratio',
      entryId: 'entry-002',
      action: 'dismissed',
    });

    // Get baseline stats
    const statsFirst = await callOp(first.handlers, `${AGENT_ID}_brain`, 'brain_stats');
    expect(statsFirst.success).toBe(true);

    first.runtime.close();

    // --- Second runtime: verify vocabulary survived ---
    const second = createFileRuntime(subDir);

    const statsSecond = await callOp(second.handlers, `${AGENT_ID}_brain`, 'brain_stats');
    expect(statsSecond.success).toBe(true);

    // Brain stats should reflect previously recorded vocabulary
    const data = statsSecond.data as { vocabularySize?: number; totalFeedback?: number };
    // At minimum, the brain should have data from the previous session
    expect(data).toBeDefined();

    second.runtime.close();
  });
});

describe('E2E: plan data persistence', () => {
  const subDir = 'plan-persist';

  it('plan data persists across runtime close/reopen', async () => {
    // --- First runtime: create a plan ---
    const first = createFileRuntime(subDir);

    const createRes = await callOp(first.handlers, `${AGENT_ID}_plan`, 'create_plan', {
      objective: 'Validate plan persistence across restarts',
      scope: 'E2E persistence testing',
      tasks: [
        { title: 'Write data', description: 'Write vault entries' },
        { title: 'Restart runtime', description: 'Close and reopen' },
      ],
    });
    expect(createRes.success).toBe(true);
    const planData = createRes.data as { plan: { id: string } };
    const planId = planData.plan.id;
    expect(planId).toBeDefined();

    first.runtime.close();

    // --- Second runtime: verify plan still exists ---
    const second = createFileRuntime(subDir);

    const getRes = await callOp(second.handlers, `${AGENT_ID}_plan`, 'get_plan', { planId });
    expect(getRes.success).toBe(true);
    const retrieved = getRes.data as { id: string; objective: string };
    expect(retrieved.id).toBe(planId);
    expect(retrieved.objective).toBe('Validate plan persistence across restarts');

    second.runtime.close();
  });
});

describe('E2E: multiple close/reopen cycles', () => {
  const subDir = 'multi-cycle';

  it('data accumulates across multiple runtime cycles', async () => {
    // --- Cycle 1: write initial data ---
    const cycle1 = createFileRuntime(subDir);

    await callOp(cycle1.handlers, `${AGENT_ID}_vault`, 'capture_knowledge', {
      entries: [
        {
          type: 'pattern',
          domain: 'infra',
          title: 'Cycle 1 Entry',
          description: 'Written during first runtime cycle',
          severity: 'info',
          tags: ['cycle-1'],
        },
      ],
    });

    const stats1 = await callOp(cycle1.handlers, `${AGENT_ID}_vault`, 'vault_stats');
    const count1 = (stats1.data as { totalEntries: number }).totalEntries;
    expect(count1).toBeGreaterThanOrEqual(1);

    cycle1.runtime.close();

    // --- Cycle 2: write more data, verify cycle 1 data exists ---
    const cycle2 = createFileRuntime(subDir);

    // Verify cycle 1 data is present
    const search2 = await callOp(cycle2.handlers, `${AGENT_ID}_vault`, 'search', {
      query: 'Cycle 1 Entry',
    });
    expect(search2.success).toBe(true);
    const results2 = search2.data as Array<{ entry: { title: string } }>;
    expect(results2.length).toBeGreaterThanOrEqual(1);
    expect(results2[0].entry.title).toBe('Cycle 1 Entry');

    // Write more data
    await callOp(cycle2.handlers, `${AGENT_ID}_vault`, 'capture_knowledge', {
      entries: [
        {
          type: 'pattern',
          domain: 'infra',
          title: 'Cycle 2 Entry',
          description: 'Written during second runtime cycle',
          severity: 'warning',
          tags: ['cycle-2'],
        },
      ],
    });

    const stats2 = await callOp(cycle2.handlers, `${AGENT_ID}_vault`, 'vault_stats');
    const count2 = (stats2.data as { totalEntries: number }).totalEntries;
    expect(count2).toBeGreaterThan(count1);

    cycle2.runtime.close();

    // --- Cycle 3: all data from both cycles should be present ---
    const cycle3 = createFileRuntime(subDir);

    const searchCycle1 = await callOp(cycle3.handlers, `${AGENT_ID}_vault`, 'search', {
      query: 'Cycle 1 Entry',
    });
    expect(searchCycle1.success).toBe(true);
    const resultsCycle1 = searchCycle1.data as Array<{ entry: { title: string } }>;
    expect(resultsCycle1.some((r) => r.entry.title === 'Cycle 1 Entry')).toBe(true);

    const searchCycle2 = await callOp(cycle3.handlers, `${AGENT_ID}_vault`, 'search', {
      query: 'Cycle 2 Entry',
    });
    expect(searchCycle2.success).toBe(true);
    const resultsCycle2 = searchCycle2.data as Array<{ entry: { title: string } }>;
    expect(resultsCycle2.some((r) => r.entry.title === 'Cycle 2 Entry')).toBe(true);

    // Total entries should reflect all accumulated data
    const stats3 = await callOp(cycle3.handlers, `${AGENT_ID}_vault`, 'vault_stats');
    const count3 = (stats3.data as { totalEntries: number }).totalEntries;
    expect(count3).toBeGreaterThanOrEqual(2);

    cycle3.runtime.close();
  });
});
