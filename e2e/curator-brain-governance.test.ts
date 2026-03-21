/**
 * E2E Test: Curator, Brain Intelligence, Governance, and Orchestrate
 *
 * Exercises the advanced engine features: curator grooming & health audits,
 * brain learning loop with feedback → vocabulary → recommendations,
 * governance policy lifecycle, and orchestrate plan/execute/complete.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createAgentRuntime,
  createSemanticFacades,
  registerFacade,
} from '@soleri/core';
import type { FacadeConfig, AgentRuntime } from '@soleri/core';

const AGENT_ID = 'e2e-advanced';

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

function parseResponse(raw: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(raw.content[0].text) as {
    success: boolean;
    data?: unknown;
    error?: string;
    op: string;
    facade: string;
  };
}

describe('E2E: curator-brain-governance', () => {
  let runtime: AgentRuntime;
  let handlers: Map<string, ReturnType<typeof captureHandler>>;
  const plannerDir = join(tmpdir(), `soleri-e2e-advanced-${Date.now()}`);

  beforeAll(() => {
    mkdirSync(plannerDir, { recursive: true });

    runtime = createAgentRuntime({
      agentId: AGENT_ID,
      vaultPath: ':memory:',
      plansPath: join(plannerDir, 'plans.json'),
    });

    const facades = createSemanticFacades(runtime, AGENT_ID);
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

  // ─── Seed vault with entries for curator/brain to work with ────────

  it('seed: should capture multiple vault entries', async () => {
    const entries = [
      {
        type: 'pattern',
        domain: 'frontend',
        title: 'Component Composition',
        description: 'Prefer composition over inheritance for UI components',
        severity: 'warning',
        tags: ['react', 'components', 'architecture'],
      },
      {
        type: 'anti-pattern',
        domain: 'frontend',
        title: 'Prop Drilling',
        description: 'Avoid passing props through many intermediate components',
        severity: 'warning',
        tags: ['react', 'state', 'anti-pattern'],
      },
      {
        type: 'pattern',
        domain: 'backend',
        title: 'Connection Pooling',
        description: 'Always use connection pooling for database access in production',
        severity: 'critical',
        tags: ['database', 'performance'],
      },
      {
        type: 'rule',
        domain: 'backend',
        title: 'No Raw SQL',
        description: 'Use parameterized queries to prevent SQL injection attacks',
        severity: 'critical',
        tags: ['security', 'database', 'sql'],
      },
      {
        type: 'pattern',
        domain: 'frontend',
        title: 'Semantic HTML',
        description: 'Use semantic HTML elements for better accessibility',
        severity: 'info',
        tags: ['a11y', 'html', 'accessibility'],
      },
    ];

    const res = await callOp(`${AGENT_ID}_vault`, 'capture_knowledge', { entries });
    expect(res.success).toBe(true);
  });

  // ─── Curator Tests ─────────────────────────────────────────────────

  it('curator: health_audit should return score and metrics', async () => {
    const res = await callOp(`${AGENT_ID}_curator`, 'curator_health_audit');
    expect(res.success).toBe(true);
    const data = res.data as { score: number; metrics: Record<string, number>; recommendations: string[] };
    expect(typeof data.score).toBe('number');
    expect(data.score).toBeGreaterThanOrEqual(0);
    expect(data.score).toBeLessThanOrEqual(100);
    expect(data.metrics).toBeDefined();
    expect(Array.isArray(data.recommendations)).toBe(true);
  });

  it('curator: status should return table info', async () => {
    const res = await callOp(`${AGENT_ID}_curator`, 'curator_status');
    expect(res.success).toBe(true);
    const data = res.data as { initialized: boolean };
    expect(data.initialized).toBe(true);
  });

  it('curator: groom_all should normalize tags across all entries', async () => {
    const res = await callOp(`${AGENT_ID}_curator`, 'curator_groom_all');
    expect(res.success).toBe(true);
  });

  it('curator: detect_duplicates should scan entries', async () => {
    const res = await callOp(`${AGENT_ID}_curator`, 'curator_detect_duplicates', {
      threshold: 0.3,
    });
    expect(res.success).toBe(true);
    expect(Array.isArray(res.data)).toBe(true);
  });

  it('curator: contradictions should detect pattern vs anti-pattern conflicts', async () => {
    const res = await callOp(`${AGENT_ID}_curator`, 'curator_contradictions', {
      detect: true,
    });
    expect(res.success).toBe(true);
    expect(Array.isArray(res.data)).toBe(true);
  });

  it('curator: consolidate (dry-run) should return recommendations without mutations', async () => {
    const res = await callOp(`${AGENT_ID}_curator`, 'curator_consolidate', {
      dryRun: true,
    });
    expect(res.success).toBe(true);
  });

  // ─── Brain Learning Loop ───────────────────────────────────────────

  it('brain: rebuild_vocabulary should index vault entries', async () => {
    const res = await callOp(`${AGENT_ID}_brain`, 'rebuild_vocabulary');
    expect(res.success).toBe(true);
    const data = res.data as { rebuilt: boolean; vocabularySize: number };
    expect(data.rebuilt).toBe(true);
    expect(data.vocabularySize).toBeGreaterThan(0);
  });

  it('brain: record_feedback should accept feedback on entries', async () => {
    // Search first to get entry IDs
    const searchRes = await callOp(`${AGENT_ID}_vault`, 'search', { query: 'component composition' });
    expect(searchRes.success).toBe(true);
    const results = searchRes.data as Array<{ entry: { id: string }; score: number }>;
    expect(results.length).toBeGreaterThan(0);

    const entryId = results[0].entry.id;
    const res = await callOp(`${AGENT_ID}_brain`, 'record_feedback', {
      query: 'component composition',
      entryId,
      action: 'accepted',
    });
    expect(res.success).toBe(true);
  });

  it('brain: brain_stats should reflect vocabulary and feedback', async () => {
    const res = await callOp(`${AGENT_ID}_brain`, 'brain_stats');
    expect(res.success).toBe(true);
    const data = res.data as { vocabularySize: number; intelligence: Record<string, unknown> };
    expect(data.vocabularySize).toBeGreaterThan(0);
    expect(data.intelligence).toBeDefined();
  });

  it('brain: brain_lifecycle start → end session', async () => {
    const startRes = await callOp(`${AGENT_ID}_brain`, 'brain_lifecycle', {
      action: 'start',
      domain: 'frontend',
      context: 'E2E testing brain sessions',
    });
    expect(startRes.success).toBe(true);
    const session = startRes.data as { id: string };
    expect(session.id).toBeDefined();

    const endRes = await callOp(`${AGENT_ID}_brain`, 'brain_lifecycle', {
      action: 'end',
      sessionId: session.id,
      toolsUsed: ['vault_search', 'brain_stats'],
      filesModified: ['test.ts'],
      planOutcome: 'completed',
    });
    expect(endRes.success).toBe(true);
  });

  it('brain: session_list should return sessions', async () => {
    const res = await callOp(`${AGENT_ID}_brain`, 'session_list', {});
    expect(res.success).toBe(true);
    const data = res.data as { sessions: unknown[]; count: number };
    expect(data.count).toBeGreaterThan(0);
  });

  it('brain: brain_build_intelligence should compute strengths', async () => {
    const res = await callOp(`${AGENT_ID}_brain`, 'brain_build_intelligence');
    expect(res.success).toBe(true);
  });

  it('brain: brain_strengths should return scored patterns', async () => {
    const res = await callOp(`${AGENT_ID}_brain`, 'brain_strengths', { limit: 10 });
    expect(res.success).toBe(true);
    expect(Array.isArray(res.data)).toBe(true);
  });

  it('brain: brain_recommend should return recommendations', async () => {
    const res = await callOp(`${AGENT_ID}_brain`, 'brain_recommend', {
      domain: 'frontend',
      task: 'build a reusable component',
      limit: 5,
    });
    expect(res.success).toBe(true);
    expect(Array.isArray(res.data)).toBe(true);
  });

  it('brain: brain_export and brain_import round-trip', async () => {
    const exportRes = await callOp(`${AGENT_ID}_brain`, 'brain_export');
    expect(exportRes.success).toBe(true);
    const exportData = exportRes.data;

    const importRes = await callOp(`${AGENT_ID}_brain`, 'brain_import', {
      data: exportData,
    });
    expect(importRes.success).toBe(true);
  });

  // ─── Governance Tests ──────────────────────────────────────────────

  it('governance: get default policy', async () => {
    const res = await callOp(`${AGENT_ID}_control`, 'governance_policy', {
      action: 'get',
      projectPath: '/tmp/e2e-project',
    });
    expect(res.success).toBe(true);
    const data = res.data as { quotas: { maxEntriesTotal: number }; retention: unknown; autoCapture: unknown };
    expect(data.quotas.maxEntriesTotal).toBeDefined();
    expect(data.retention).toBeDefined();
    expect(data.autoCapture).toBeDefined();
  });

  it('governance: apply strict preset', async () => {
    const res = await callOp(`${AGENT_ID}_control`, 'governance_policy', {
      action: 'applyPreset',
      projectPath: '/tmp/e2e-project',
      preset: 'strict',
      changedBy: 'e2e-test',
    });
    expect(res.success).toBe(true);
    const data = res.data as { applied: boolean; policy: { quotas: { maxEntriesTotal: number } } };
    expect(data.applied).toBe(true);
    expect(data.policy.quotas.maxEntriesTotal).toBe(200);
  });

  it('governance: get stats returns quota and proposal info', async () => {
    const res = await callOp(`${AGENT_ID}_control`, 'governance_stats', {
      projectPath: '/tmp/e2e-project',
    });
    expect(res.success).toBe(true);
    const data = res.data as { quotaStatus: { total: number }; proposalStats: { total: number } };
    expect(data.quotaStatus).toBeDefined();
    expect(data.proposalStats).toBeDefined();
  });

  it('governance: dashboard returns comprehensive view', async () => {
    const res = await callOp(`${AGENT_ID}_control`, 'governance_dashboard', {
      projectPath: '/tmp/e2e-project',
    });
    expect(res.success).toBe(true);
    const data = res.data as { vaultSize: number; quotaPercent: number; policySummary: unknown };
    expect(typeof data.vaultSize).toBe('number');
    expect(typeof data.quotaPercent).toBe('number');
    expect(data.policySummary).toBeDefined();
  });

  it('governance: proposal lifecycle — list (empty), then check stats', async () => {
    const listRes = await callOp(`${AGENT_ID}_control`, 'governance_proposals', {
      action: 'list',
      projectPath: '/tmp/e2e-project',
    });
    expect(listRes.success).toBe(true);
    expect(Array.isArray(listRes.data)).toBe(true);

    const statsRes = await callOp(`${AGENT_ID}_control`, 'governance_proposals', {
      action: 'stats',
      projectPath: '/tmp/e2e-project',
    });
    expect(statsRes.success).toBe(true);
  });

  // ─── Orchestrate Tests ─────────────────────────────────────────────

  it('orchestrate: session_start project', async () => {
    const res = await callOp(`${AGENT_ID}_orchestrate`, 'session_start', {
      projectPath: '/tmp/e2e-project',
      name: 'E2E Test Project',
    });
    expect(res.success).toBe(true);
    const data = res.data as { project: { name: string }; vault: { entries: number } };
    expect(data.project.name).toBeDefined();
    expect(data.vault.entries).toBeGreaterThanOrEqual(0);
  });

  it('orchestrate: plan → execute → complete lifecycle', async () => {
    // Plan
    const planRes = await callOp(`${AGENT_ID}_orchestrate`, 'orchestrate_plan', {
      objective: 'Test the orchestration pipeline',
      scope: 'E2E testing scope',
      domain: 'frontend',
      tasks: [
        { title: 'Step 1', description: 'First orchestrated step' },
        { title: 'Step 2', description: 'Second orchestrated step' },
      ],
    });
    expect(planRes.success).toBe(true);
    const planData = planRes.data as { plan: { id: string }; recommendations: unknown[] };
    expect(planData.plan.id).toBeDefined();

    // Approve plan before executing
    const approveRes = await callOp(`${AGENT_ID}_plan`, 'approve_plan', {
      planId: planData.plan.id,
    });
    expect(approveRes.success).toBe(true);

    // Execute via orchestrate (starts plan execution + brain session)
    const execRes = await callOp(`${AGENT_ID}_orchestrate`, 'orchestrate_execute', {
      planId: planData.plan.id,
      domain: 'frontend',
      context: 'E2E orchestration test',
    });
    expect(execRes.success).toBe(true);
    const execData = execRes.data as { plan: unknown; session: { id: string } };
    expect(execData.session.id).toBeDefined();

    // Complete via plan lifecycle (plan state machine: executing → validating → reconciling → completed)
    const completePlanRes = await callOp(`${AGENT_ID}_plan`, 'plan_complete_lifecycle', {
      planId: planData.plan.id,
    });
    expect(completePlanRes.success).toBe(true);
  });

  it('orchestrate: quick_capture captures knowledge without plan lifecycle', async () => {
    const res = await callOp(`${AGENT_ID}_orchestrate`, 'orchestrate_quick_capture', {
      domain: 'backend',
      context: 'Quick capture of a database optimization insight',
      toolsUsed: ['vault_search'],
      filesModified: ['db-config.ts'],
      outcome: 'completed',
    });
    expect(res.success).toBe(true);
    const data = res.data as { session: unknown };
    expect(data.session).toBeDefined();
  });

  it('orchestrate: status returns combined overview', async () => {
    const res = await callOp(`${AGENT_ID}_orchestrate`, 'orchestrate_status', {
      domain: 'frontend',
      sessionLimit: 5,
    });
    expect(res.success).toBe(true);
    const data = res.data as {
      activePlans: unknown;
      sessionContext: unknown;
      vaultStats: unknown;
      brainStats: unknown;
    };
    expect(data.vaultStats).toBeDefined();
    expect(data.brainStats).toBeDefined();
  });
});
