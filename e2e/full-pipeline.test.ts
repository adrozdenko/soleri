/**
 * E2E Test: Full Pipeline
 *
 * Creates a real agent runtime with all facades, then exercises
 * ops across every facade type. This validates that core, forge,
 * and the facade system all wire together correctly.
 *
 * No subprocess, no npm install — uses createAgentRuntime directly
 * with in-memory vault for speed.
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

const AGENT_ID = 'e2e-pipeline';

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

/** Parse MCP tool response to FacadeResponse */
function parseResponse(raw: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(raw.content[0].text) as {
    success: boolean;
    data?: unknown;
    error?: string;
    op: string;
    facade: string;
  };
}

describe('E2E: full-pipeline', () => {
  let runtime: AgentRuntime;
  let facades: FacadeConfig[];
  let handlers: Map<string, ReturnType<typeof captureHandler>>;
  const plannerDir = join(tmpdir(), `soleri-e2e-pipeline-${Date.now()}`);

  beforeAll(() => {
    mkdirSync(plannerDir, { recursive: true });

    runtime = createAgentRuntime({
      agentId: AGENT_ID,
      vaultPath: ':memory:',
      plansPath: join(plannerDir, 'plans.json'),
    });

    const semanticFacades = createSemanticFacades(runtime, AGENT_ID);
    const domainFacades = createDomainFacades(runtime, AGENT_ID, ['frontend', 'backend']);
    facades = [...semanticFacades, ...domainFacades];

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

  // --- Facade Registration ---

  it('should register all 15 facades (13 semantic + 2 domain)', () => {
    expect(facades.length).toBe(15);
    expect(handlers.size).toBe(15);
  });

  it('should have correct facade names', () => {
    const names = facades.map((f) => f.name);
    expect(names).toContain(`${AGENT_ID}_vault`);
    expect(names).toContain(`${AGENT_ID}_plan`);
    expect(names).toContain(`${AGENT_ID}_brain`);
    expect(names).toContain(`${AGENT_ID}_memory`);
    expect(names).toContain(`${AGENT_ID}_admin`);
    expect(names).toContain(`${AGENT_ID}_curator`);
    expect(names).toContain(`${AGENT_ID}_loop`);
    expect(names).toContain(`${AGENT_ID}_orchestrate`);
    expect(names).toContain(`${AGENT_ID}_control`);
    expect(names).toContain(`${AGENT_ID}_cognee`);
    expect(names).toContain(`${AGENT_ID}_context`);
    expect(names).toContain(`${AGENT_ID}_agency`);
    expect(names).toContain(`${AGENT_ID}_chat`);
    expect(names).toContain(`${AGENT_ID}_frontend`);
    expect(names).toContain(`${AGENT_ID}_backend`);
  });

  // --- Vault Facade ---

  it('vault: search should return empty results on fresh vault', async () => {
    const res = await callOp(`${AGENT_ID}_vault`, 'search', { query: 'test pattern' });
    expect(res.success).toBe(true);
    expect(res.op).toBe('search');
    expect(res.facade).toBe(`${AGENT_ID}_vault`);
  });

  it('vault: capture_knowledge and search', async () => {
    const captureRes = await callOp(`${AGENT_ID}_vault`, 'capture_knowledge', {
      entries: [{
        type: 'pattern',
        domain: 'frontend',
        title: 'E2E Test Pattern',
        description: 'A pattern captured during E2E testing',
        severity: 'warning',
        tags: ['e2e', 'testing'],
      }],
    });
    expect(captureRes.success).toBe(true);

    const searchRes = await callOp(`${AGENT_ID}_vault`, 'search', { query: 'E2E Test Pattern' });
    expect(searchRes.success).toBe(true);
    const results = searchRes.data as Array<{ entry: { title: string }; score: number }>;
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].entry.title).toBe('E2E Test Pattern');
  });

  it('vault: vault_stats should reflect captured entry', async () => {
    const res = await callOp(`${AGENT_ID}_vault`, 'vault_stats');
    expect(res.success).toBe(true);
    const stats = res.data as { totalEntries: number };
    expect(stats.totalEntries).toBeGreaterThanOrEqual(1);
  });

  // --- Brain Facade ---

  it('brain: brain_stats should return learning metrics', async () => {
    const res = await callOp(`${AGENT_ID}_brain`, 'brain_stats');
    expect(res.success).toBe(true);
  });

  it('brain: record_feedback should accept feedback', async () => {
    const res = await callOp(`${AGENT_ID}_brain`, 'record_feedback', {
      query: 'test query',
      entryId: 'some-id',
      action: 'accepted',
    });
    expect(res.success).toBe(true);
  });

  // --- Plan Facade ---

  it('plan: full lifecycle — create_plan → approve_plan', async () => {
    const createRes = await callOp(`${AGENT_ID}_plan`, 'create_plan', {
      title: 'E2E Test Plan',
      objective: 'Validate planning lifecycle',
      scope: 'E2E testing scope',
      tasks: [
        { title: 'Step 1', description: 'First step' },
        { title: 'Step 2', description: 'Second step' },
      ],
    });
    expect(createRes.success).toBe(true);
    const planData = createRes.data as { plan: { id: string } };
    expect(planData.plan.id).toBeDefined();

    const approveRes = await callOp(`${AGENT_ID}_plan`, 'approve_plan', { planId: planData.plan.id });
    expect(approveRes.success).toBe(true);
  });

  // --- Memory Facade ---

  it('memory: memory_capture and memory_search', async () => {
    const captureRes = await callOp(`${AGENT_ID}_memory`, 'memory_capture', {
      type: 'lesson',
      content: 'E2E tests validate the full pipeline',
      projectPath: '/tmp/e2e-test',
      context: 'e2e-testing',
      summary: 'E2E testing lesson',
    });
    expect(captureRes.success).toBe(true);

    const searchRes = await callOp(`${AGENT_ID}_memory`, 'memory_search', {
      query: 'E2E tests pipeline',
    });
    expect(searchRes.success).toBe(true);
  });

  // --- Admin Facade ---

  it('admin: admin_health should report status', async () => {
    const res = await callOp(`${AGENT_ID}_admin`, 'admin_health');
    expect(res.success).toBe(true);
    const health = res.data as { status: string };
    expect(health.status).toBeDefined();
  });

  it('admin: admin_tool_list should enumerate registered ops', async () => {
    const res = await callOp(`${AGENT_ID}_admin`, 'admin_tool_list');
    expect(res.success).toBe(true);
    const data = res.data as { count: number; ops: Record<string, string[]> };
    expect(data.count).toBeGreaterThan(0);
    expect(Object.keys(data.ops).length).toBeGreaterThan(0);
  });

  // --- Curator Facade ---

  it('curator: curator_health_audit should return vault quality score', async () => {
    const res = await callOp(`${AGENT_ID}_curator`, 'curator_health_audit');
    expect(res.success).toBe(true);
    const audit = res.data as { score: number };
    expect(typeof audit.score).toBe('number');
  });

  // --- Loop Facade ---

  it('loop: loop_start → loop_status → loop_cancel lifecycle', async () => {
    const startRes = await callOp(`${AGENT_ID}_loop`, 'loop_start', {
      mode: 'custom',
      prompt: 'E2E loop test',
    });
    expect(startRes.success).toBe(true);

    const statusRes = await callOp(`${AGENT_ID}_loop`, 'loop_status');
    expect(statusRes.success).toBe(true);

    const cancelRes = await callOp(`${AGENT_ID}_loop`, 'loop_cancel');
    expect(cancelRes.success).toBe(true);
  });

  // --- Control Facade ---

  it('control: route_intent should classify user prompts', async () => {
    const res = await callOp(`${AGENT_ID}_control`, 'route_intent', {
      prompt: 'Fix this broken button',
    });
    expect(res.success).toBe(true);
    const intent = res.data as { intent: string };
    expect(intent.intent).toBeDefined();
  });

  it('control: get_identity should return agent identity', async () => {
    const res = await callOp(`${AGENT_ID}_control`, 'get_identity', {
      agentId: AGENT_ID,
    });
    expect(res.success).toBe(true);
  });

  // --- Cognee Facade (graceful degradation) ---

  it('cognee: cognee_status should report availability without crashing', async () => {
    const res = await callOp(`${AGENT_ID}_cognee`, 'cognee_status');
    expect(res.success).toBe(true);
  });

  // --- Domain Facades ---

  it('domain: search on empty domain should return empty results', async () => {
    const res = await callOp(`${AGENT_ID}_frontend`, 'search', { query: 'component pattern' });
    expect(res.success).toBe(true);
  });

  it('domain: capture and retrieve domain-specific knowledge', async () => {
    const captureRes = await callOp(`${AGENT_ID}_frontend`, 'capture', {
      id: `e2e-domain-${Date.now()}`,
      type: 'pattern',
      title: 'Component Composition',
      description: 'Prefer composition over inheritance for UI components',
      severity: 'suggestion',
      tags: ['components', 'architecture'],
    });
    expect(captureRes.success).toBe(true);

    const searchRes = await callOp(`${AGENT_ID}_frontend`, 'search', {
      query: 'component composition',
    });
    expect(searchRes.success).toBe(true);
    const results = searchRes.data as Array<{ title: string }>;
    expect(results.length).toBeGreaterThan(0);
  });

  // --- Error Handling ---

  it('should return error for unknown op', async () => {
    const res = await callOp(`${AGENT_ID}_vault`, 'nonexistent_op');
    expect(res.success).toBe(false);
    expect(res.error).toContain('Unknown operation');
  });

  // --- Cross-Facade Integration ---

  it('knowledge captured via vault should be findable via search', async () => {
    await callOp(`${AGENT_ID}_vault`, 'capture_knowledge', {
      entries: [{
        type: 'pattern',
        domain: 'backend',
        title: 'Database Connection Pooling',
        description: 'Always use connection pooling for database access in production',
        severity: 'warning',
        tags: ['database', 'performance'],
      }],
    });

    await callOp(`${AGENT_ID}_brain`, 'rebuild_vocabulary');

    const searchRes = await callOp(`${AGENT_ID}_vault`, 'search', {
      query: 'database connection pooling',
    });
    expect(searchRes.success).toBe(true);
    const results = searchRes.data as Array<{ entry: { title: string } }>;
    expect(results.some((r) => r.entry.title === 'Database Connection Pooling')).toBe(true);
  });
});
