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
  assessTaskComplexity,
  OperatorContextStore,
} from '@soleri/core';
import type { FacadeConfig, AgentRuntime } from '@soleri/core';

const AGENT_ID = 'e2e-pipeline';

/** Capture the MCP handler from registerFacade without a real server */
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

  it('should register all 24 facades (22 semantic + 2 domain)', () => {
    expect(facades.length).toBe(24);
    expect(handlers.size).toBe(24);
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
    expect(res.data).toEqual([]);
  });

  it('vault: capture_knowledge and search', async () => {
    const captureRes = await callOp(`${AGENT_ID}_vault`, 'capture_knowledge', {
      entries: [
        {
          type: 'pattern',
          domain: 'frontend',
          title: 'E2E Test Pattern',
          description: 'A pattern captured during E2E testing',
          severity: 'warning',
          tags: ['e2e', 'testing'],
        },
      ],
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
    const stats = res.data as {
      vocabularySize: number;
      feedbackCount: number;
      weights: Record<string, number>;
      intelligence: { strengths: number; sessions: number; activeSessions: number };
    };
    // Vocabulary may be non-zero if prior tests captured vault entries
    expect(typeof stats.vocabularySize).toBe('number');
    expect(stats.vocabularySize).toBeGreaterThanOrEqual(0);
    expect(typeof stats.feedbackCount).toBe('number');
    expect(stats.feedbackCount).toBeGreaterThanOrEqual(0);
    expect(stats.weights).toBeDefined();
    expect(stats.intelligence).toBeDefined();
    expect(stats.intelligence.strengths).toBe(0);
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

    const approveRes = await callOp(`${AGENT_ID}_plan`, 'approve_plan', {
      planId: planData.plan.id,
    });
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
      query: 'E2E testing lesson',
    });
    expect(searchRes.success).toBe(true);
    const memories = searchRes.data as Array<{ id: string; type: string; summary: string }>;
    expect(memories.length).toBeGreaterThan(0);
    // The captured content should appear in the search results (summary is truncated)
    expect(memories.some((m) => m.summary.includes('E2E'))).toBe(true);
  });

  // --- Admin Facade ---

  it('admin: admin_health should report status', async () => {
    const res = await callOp(`${AGENT_ID}_admin`, 'admin_health');
    expect(res.success).toBe(true);
    const health = res.data as {
      status: string;
      vault: { entries: number; domains: string[] };
      llm: { openai: boolean; anthropic: boolean };
      brain: { vocabularySize: number; feedbackCount: number };
      curator: { initialized: boolean };
    };
    expect(health.status).toBe('ok');
    expect(health.vault).toBeDefined();
    expect(typeof health.vault.entries).toBe('number');
    expect(Array.isArray(health.vault.domains)).toBe(true);
    expect(health.llm).toBeDefined();
    expect(typeof health.llm.openai).toBe('boolean');
    expect(typeof health.llm.anthropic).toBe('boolean');
    expect(health.brain).toBeDefined();
    expect(typeof health.brain.vocabularySize).toBe('number');
    expect(health.curator).toBeDefined();
  });

  it('admin: admin_tool_list should enumerate registered ops', async () => {
    const res = await callOp(`${AGENT_ID}_admin`, 'admin_tool_list');
    expect(res.success).toBe(true);
    const data = res.data as { count: number; ops: Record<string, string[]> };
    expect(data.count).toBeGreaterThan(0);
    expect(Object.keys(data.ops).length).toBeGreaterThan(0);

    // Flatten all op names to verify specific known ops exist
    const allOps = Object.values(data.ops).flat();
    // Admin ops (always present — from fallback or full list)
    expect(allOps).toContain('admin_health');
    expect(allOps).toContain('admin_tool_list');
    expect(allOps).toContain('admin_config');
    expect(allOps).toContain('admin_diagnostic');
    // Verify ops map is grouped by facade prefix
    expect(data.ops).toBeDefined();
    expect(typeof data.ops).toBe('object');
    // The 'admin' group should exist
    expect(data.ops['admin']).toBeDefined();
    expect(data.ops['admin'].length).toBeGreaterThanOrEqual(8);
  });

  // --- Curator Facade ---

  it('curator: curator_health_audit should return vault quality score', async () => {
    const res = await callOp(`${AGENT_ID}_curator`, 'curator_health_audit');
    expect(res.success).toBe(true);
    const audit = res.data as { score: number };
    expect(typeof audit.score).toBe('number');
    expect(audit.score).toBeGreaterThanOrEqual(0);
    expect(audit.score).toBeLessThanOrEqual(100);
  });

  // --- Loop Facade ---

  it('loop: loop_start → loop_status → loop_cancel lifecycle', async () => {
    const startRes = await callOp(`${AGENT_ID}_loop`, 'loop_start', {
      mode: 'custom',
      prompt: 'E2E loop test',
    });
    expect(startRes.success).toBe(true);
    const startData = startRes.data as { started: boolean; loopId: string; mode: string };
    expect(startData.started).toBe(true);
    expect(startData.loopId).toBeDefined();
    expect(startData.mode).toBe('custom');

    const statusRes = await callOp(`${AGENT_ID}_loop`, 'loop_status');
    expect(statusRes.success).toBe(true);
    const statusData = statusRes.data as { active: boolean; loop: unknown };
    expect(statusData.active).toBe(true);
    expect(statusData.loop).not.toBeNull();

    const cancelRes = await callOp(`${AGENT_ID}_loop`, 'loop_cancel');
    expect(cancelRes.success).toBe(true);
    const cancelData = cancelRes.data as { cancelled: boolean; status: string };
    expect(cancelData.cancelled).toBe(true);
    expect(cancelData.status).toBe('cancelled');

    // After cancel, loop should no longer be active
    const statusAfterCancel = await callOp(`${AGENT_ID}_loop`, 'loop_status');
    expect(statusAfterCancel.success).toBe(true);
    const afterCancelData = statusAfterCancel.data as { active: boolean; loop: unknown };
    expect(afterCancelData.active).toBe(false);
    expect(afterCancelData.loop).toBeNull();
  });

  // --- Control Facade ---

  it('control: route_intent should classify user prompts', async () => {
    const res = await callOp(`${AGENT_ID}_control`, 'route_intent', {
      prompt: 'Fix this broken button',
    });
    expect(res.success).toBe(true);
    const intent = res.data as {
      intent: string;
      mode: string;
      confidence: number;
      method: string;
      matchedKeywords: string[];
    };
    // "Fix" and "broken" are both FIX-MODE keywords
    expect(intent.intent).toBe('fix');
    expect(intent.mode).toBe('FIX-MODE');
    expect(intent.confidence).toBeGreaterThan(0);
    expect(intent.method).toBe('keyword');
    expect(intent.matchedKeywords).toContain('fix');
    expect(intent.matchedKeywords).toContain('broken');
  });

  it('control: get_identity should return agent identity', async () => {
    const res = await callOp(`${AGENT_ID}_control`, 'get_identity', {
      agentId: AGENT_ID,
    });
    expect(res.success).toBe(true);
    const identity = res.data as { agentId: string; found?: boolean };
    // Identity may or may not exist yet, but agentId must match in the response
    if ('found' in identity && identity.found === false) {
      expect(identity.agentId).toBe(AGENT_ID);
    } else {
      expect(identity.agentId).toBe(AGENT_ID);
    }
  });

  // --- Domain Facades ---

  it('domain: search should return results scoped to the domain', async () => {
    const res = await callOp(`${AGENT_ID}_frontend`, 'search', { query: 'component pattern' });
    expect(res.success).toBe(true);
    const results = res.data as Array<{ entry: { domain: string } }>;
    // All results (if any) should be scoped to the frontend domain
    for (const r of results) {
      expect(r.entry.domain).toBe('frontend');
    }
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
      entries: [
        {
          type: 'pattern',
          domain: 'backend',
          title: 'Database Connection Pooling',
          description: 'Always use connection pooling for database access in production',
          severity: 'warning',
          tags: ['database', 'performance'],
        },
      ],
    });

    await callOp(`${AGENT_ID}_brain`, 'rebuild_vocabulary');

    const searchRes = await callOp(`${AGENT_ID}_vault`, 'search', {
      query: 'database connection pooling',
    });
    expect(searchRes.success).toBe(true);
    const results = searchRes.data as Array<{ entry: { title: string } }>;
    expect(results.some((r) => r.entry.title === 'Database Connection Pooling')).toBe(true);
  });

  // --- Task Auto-Assessment ---

  describe('Task Auto-Assessment', () => {
    it('simple task: assess → complete without plan', async () => {
      const result = assessTaskComplexity({ prompt: 'fix typo in README' });
      expect(result.classification).toBe('simple');
      expect(result.score).toBeLessThan(40);

      // Start a brain session first so orchestrate_complete has a valid sessionId
      const sessionRes = await callOp(`${AGENT_ID}_brain`, 'brain_lifecycle', {
        action: 'start',
        domain: 'testing',
        context: 'simple task test',
      });
      expect(sessionRes.success).toBe(true);
      const session = sessionRes.data as { id: string };

      // Call orchestrate_complete without a plan (direct task path)
      const complete = await callOp(`${AGENT_ID}_orchestrate`, 'orchestrate_complete', {
        sessionId: session.id,
        summary: 'Fixed typo in README',
        outcome: 'completed',
      });
      expect(complete.success).toBe(true);
      const data = complete.data as { plan: { status: string } };
      expect(data.plan.status).toBe('completed');
    });

    it('complex task: assess → plan → complete', async () => {
      // Multiple signals needed to exceed threshold of 40:
      // cross-cutting (auth=20) + file-count (5 files=25) = 45
      const result = assessTaskComplexity({
        prompt: 'add authentication to all API endpoints',
        filesEstimated: 5,
      });
      expect(result.classification).toBe('complex');

      // Create plan via orchestrate
      const plan = await callOp(`${AGENT_ID}_orchestrate`, 'orchestrate_plan', {
        prompt: 'add authentication to all API endpoints',
        projectPath: plannerDir,
      });
      expect(plan.success).toBe(true);
      const planData = plan.data as { plan: { id: string }; flow: { intent: string } };
      expect(planData.plan.id).toBeDefined();

      // Approve and execute the plan through its lifecycle
      const approveRes = await callOp(`${AGENT_ID}_plan`, 'approve_plan', {
        planId: planData.plan.id,
      });
      expect(approveRes.success).toBe(true);

      // Execute via orchestrate (transitions plan to executing + starts brain session)
      const execRes = await callOp(`${AGENT_ID}_orchestrate`, 'orchestrate_execute', {
        planId: planData.plan.id,
        domain: 'testing',
        context: 'complex task test',
      });
      expect(execRes.success).toBe(true);
      const execData = execRes.data as { session: { id: string } };

      // Complete with plan
      const complete = await callOp(`${AGENT_ID}_orchestrate`, 'orchestrate_complete', {
        planId: planData.plan.id,
        sessionId: execData.session.id,
        summary: 'Added auth to all endpoints',
        outcome: 'completed',
      });
      expect(complete.success).toBe(true);
    });

    it('assessment signals are correct for multi-signal complex task', () => {
      // migrate (cross-cutting=20) + filesEstimated 8 (file-count=25) = 45
      const result = assessTaskComplexity({
        prompt: 'migrate database schema across services',
        filesEstimated: 8,
      });
      expect(result.classification).toBe('complex');
      expect(result.score).toBeGreaterThanOrEqual(40);
      expect(result.signals.length).toBeGreaterThan(0);

      // Verify specific signals fired
      const triggered = result.signals.filter((s) => s.triggered);
      expect(triggered.length).toBeGreaterThan(0);

      // file-count should trigger (8 >= 3)
      const fileCountSignal = result.signals.find((s) => s.name === 'file-count');
      expect(fileCountSignal?.triggered).toBe(true);

      // cross-cutting should trigger (migrate keyword)
      const crossCuttingSignal = result.signals.find((s) => s.name === 'cross-cutting-keywords');
      expect(crossCuttingSignal?.triggered).toBe(true);
    });

    it('simple task with parent plan context stays simple', () => {
      const result = assessTaskComplexity({
        prompt: 'update button styles in header component',
        hasParentPlan: true,
        filesEstimated: 1,
      });
      expect(result.classification).toBe('simple');
      // approach-already-described signal should have negative weight
      const approachSignal = result.signals.find((s) => s.name === 'approach-already-described');
      expect(approachSignal?.triggered).toBe(true);
      expect(approachSignal?.weight).toBeLessThan(0);
    });
  });

  // --- Operator Context Learning ---

  describe('Operator Context Learning', () => {
    beforeAll(() => {
      // Wire up OperatorContextStore on the runtime using the vault's persistence provider
      const store = new OperatorContextStore(runtime.vault.getProvider());
      (runtime as Record<string, unknown>).operatorContextStore = store;
    });

    it('signals compound through orchestrate_complete', async () => {
      // Start a brain session so orchestrate_complete has a valid sessionId
      const sessionRes = await callOp(`${AGENT_ID}_brain`, 'brain_lifecycle', {
        action: 'start',
        domain: 'testing',
        context: 'operator context test session 1',
      });
      expect(sessionRes.success).toBe(true);
      const session = sessionRes.data as { id: string };

      const result = await callOp(`${AGENT_ID}_orchestrate`, 'orchestrate_complete', {
        sessionId: session.id,
        outcome: 'completed',
        summary: 'Fixed a bug',
        operatorSignals: {
          expertise: [{ topic: 'typescript', level: 'expert', confidence: 0.9 }],
          corrections: [{ rule: 'dont summarize', scope: 'global' }],
          interests: [{ tag: 'coffee' }],
          patterns: [{ pattern: 'prefers small PRs', frequency: 'occasional' }],
        },
      });
      expect(result.success).toBe(true);
    });

    it('inspect returns accumulated profile', async () => {
      const inspect = await callOp(`${AGENT_ID}_admin`, 'operator_context_inspect', {});
      expect(inspect.success).toBe(true);
      const ctx = inspect.data as {
        available: boolean;
        expertise: unknown[];
        corrections: unknown[];
        interests: unknown[];
        patterns: unknown[];
        sessionCount: number;
      };
      expect(ctx.available).toBe(true);
      expect(ctx.expertise).toBeDefined();
      expect(ctx.expertise.length).toBeGreaterThan(0);
      expect(ctx.corrections).toBeDefined();
      expect(ctx.corrections.length).toBeGreaterThan(0);
      expect(ctx.interests).toBeDefined();
      expect(ctx.interests.length).toBeGreaterThan(0);
      expect(ctx.patterns).toBeDefined();
      expect(ctx.patterns.length).toBeGreaterThan(0);
    });

    it('second session compounds (progressive learning)', async () => {
      // Start another brain session
      const sessionRes = await callOp(`${AGENT_ID}_brain`, 'brain_lifecycle', {
        action: 'start',
        domain: 'testing',
        context: 'operator context test session 2',
      });
      expect(sessionRes.success).toBe(true);
      const session = sessionRes.data as { id: string };

      // Second complete with overlapping signals — confidence should grow
      await callOp(`${AGENT_ID}_orchestrate`, 'orchestrate_complete', {
        sessionId: session.id,
        outcome: 'completed',
        summary: 'Added feature',
        operatorSignals: {
          expertise: [{ topic: 'typescript', level: 'expert', confidence: 0.95 }],
          corrections: [],
          interests: [{ tag: 'coffee' }], // mentioned again — confidence should grow
          patterns: [],
        },
      });

      // Inspect should show compounded results
      const inspect = await callOp(`${AGENT_ID}_admin`, 'operator_context_inspect', {});
      expect(inspect.success).toBe(true);
      const ctx = inspect.data as {
        available: boolean;
        expertise: Array<{ topic: string; confidence: number; sessionCount: number }>;
        interests: Array<{ tag: string; confidence: number; mentionCount: number }>;
      };

      // Expertise: typescript should have sessionCount 2
      const tsExpertise = ctx.expertise.find(
        (e) => e.topic.toLowerCase() === 'typescript',
      );
      expect(tsExpertise).toBeDefined();
      expect(tsExpertise!.sessionCount).toBe(2);

      // Interest: coffee mentioned 2x — confidence should be higher than initial 0.5
      const coffeeInterest = ctx.interests.find(
        (i) => i.tag.toLowerCase() === 'coffee',
      );
      expect(coffeeInterest).toBeDefined();
      expect(coffeeInterest!.mentionCount).toBe(2);
      expect(coffeeInterest!.confidence).toBeGreaterThan(0.5);
    });

    it('delete removes a correction item', async () => {
      // Inspect to get the actual correction id
      const inspect = await callOp(`${AGENT_ID}_admin`, 'operator_context_inspect', {});
      expect(inspect.success).toBe(true);
      const ctx = inspect.data as {
        corrections: Array<{ id: string; rule: string }>;
      };
      expect(ctx.corrections.length).toBeGreaterThan(0);
      const correctionId = ctx.corrections[0].id;

      // Delete the correction
      const del = await callOp(`${AGENT_ID}_admin`, 'operator_context_delete', {
        type: 'correction',
        id: correctionId,
      });
      expect(del.success).toBe(true);
      const delData = del.data as { deleted: boolean };
      expect(delData.deleted).toBe(true);

      // Verify it's gone
      const inspect2 = await callOp(`${AGENT_ID}_admin`, 'operator_context_inspect', {});
      const ctx2 = inspect2.data as {
        corrections: Array<{ id: string }>;
      };
      const found = ctx2.corrections.find((c) => c.id === correctionId);
      expect(found).toBeUndefined();
    });
  });
});
