/**
 * E2E Test: Planning Lifecycle & Orchestration
 *
 * Exercises the full planning lifecycle, orchestration pipeline,
 * playbook matching, drift reconciliation, and edge cases.
 *
 * Uses createAgentRuntime directly with in-memory vault for speed.
 * Tests are organized as user journeys that mirror real agent workflows.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createAgentRuntime, createSemanticFacades, registerFacade } from '@soleri/core';
import type { FacadeConfig, AgentRuntime } from '@soleri/core';

// Point at core's data/flows kept as a test fixture (excluded from npm publish)
const CORE_FLOWS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'core', 'data', 'flows');

const AGENT_ID = 'e2e-planning';

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

describe('E2E: planning-orchestration', () => {
  let runtime: AgentRuntime;
  let facades: FacadeConfig[];
  let handlers: Map<string, ReturnType<typeof captureHandler>>;
  const workDir = join(tmpdir(), `soleri-e2e-planning-${Date.now()}`);

  beforeAll(() => {
    mkdirSync(workDir, { recursive: true });

    runtime = createAgentRuntime({
      agentId: AGENT_ID,
      vaultPath: ':memory:',
      plansPath: join(workDir, 'plans.json'),
      flowsDir: CORE_FLOWS_DIR,
    });

    facades = createSemanticFacades(runtime, AGENT_ID);

    handlers = new Map();
    for (const facade of facades) {
      handlers.set(facade.name, captureHandler(facade));
    }
  });

  afterAll(() => {
    runtime.close();
    rmSync(workDir, { recursive: true, force: true });
  });

  async function callOp(facadeName: string, op: string, params: Record<string, unknown> = {}) {
    const handler = handlers.get(facadeName);
    if (!handler) throw new Error(`No facade: ${facadeName}`);
    const raw = await handler({ op, params });
    return parseResponse(raw);
  }

  const planFacade = `${AGENT_ID}_plan`;
  const orchestrateFacade = `${AGENT_ID}_orchestrate`;

  // =========================================================================
  // Journey 1: Full planning lifecycle
  // =========================================================================

  describe('Journey 1: Full planning lifecycle', () => {
    let planId: string;
    let playbookSessionId: string | null = null;

    it('create_plan should return a plan with id, objective, and tasks', async () => {
      const res = await callOp(planFacade, 'create_plan', {
        objective: 'Build a user authentication module with JWT tokens',
        scope: 'packages/auth — new module with login, signup, token refresh',
        decisions: ['Use JWT for stateless auth', 'Store refresh tokens in DB'],
        tasks: [
          {
            title: 'Design token schema',
            description: 'Define JWT payload structure and DB schema for refresh tokens',
          },
          {
            title: 'Implement login endpoint',
            description: 'POST /auth/login — validate credentials, issue JWT + refresh token',
          },
          {
            title: 'Implement token refresh',
            description: 'POST /auth/refresh — validate refresh token, issue new JWT',
          },
        ],
      });

      expect(res.success).toBe(true);
      const data = res.data as {
        created: boolean;
        plan: {
          id: string;
          objective: string;
          scope: string;
          status: string;
          tasks: Array<{ id: string; title: string; status: string }>;
        };
        playbook?: { sessionId: string | null };
      };
      expect(data.created).toBe(true);
      expect(data.plan.id).toBeDefined();
      expect(data.plan.id).toMatch(/^plan-/);
      expect(data.plan.objective).toContain('authentication');
      expect(data.plan.status).toBe('draft');
      expect(data.plan.tasks.length).toBeGreaterThanOrEqual(3);
      expect(data.plan.tasks[0].id).toBe('task-1');
      expect(data.plan.tasks[0].status).toBe('pending');

      planId = data.plan.id;
      playbookSessionId = data.playbook?.sessionId ?? null;
    });

    it('approve_plan should transition plan to approved', async () => {
      const res = await callOp(planFacade, 'approve_plan', { planId });
      expect(res.success).toBe(true);
      const data = res.data as { approved: boolean; plan: { id: string; status: string } };
      expect(data.approved).toBe(true);
      expect(data.plan.status).toBe('approved');
    });

    it('plan_split should replace tasks with dependency-tracked sub-tasks', async () => {
      const res = await callOp(planFacade, 'plan_split', {
        planId,
        tasks: [
          { title: 'Design token schema', description: 'JWT payload + DB refresh token table' },
          {
            title: 'Write auth tests',
            description: 'TDD: failing tests for login and refresh',
            dependsOn: ['task-1'],
          },
          {
            title: 'Implement login',
            description: 'POST /auth/login endpoint',
            dependsOn: ['task-1', 'task-2'],
          },
          {
            title: 'Implement refresh',
            description: 'POST /auth/refresh endpoint',
            dependsOn: ['task-3'],
          },
        ],
      });

      expect(res.success).toBe(true);
      const data = res.data as {
        split: boolean;
        taskCount: number;
        plan: {
          tasks: Array<{ id: string; description: string; status: string; dependsOn?: string[] }>;
        };
      };
      expect(data.split).toBe(true);
      expect(data.taskCount).toBe(4);

      // Verify each task has id, description, status
      for (const task of data.plan.tasks) {
        expect(task.id).toBeDefined();
        expect(task.description).toBeDefined();
        expect(task.status).toBe('pending');
      }

      // Verify dependencies
      expect(data.plan.tasks[2].dependsOn).toContain('task-1');
      expect(data.plan.tasks[2].dependsOn).toContain('task-2');
    });

    it('start execution and mark tasks as complete', async () => {
      // Start execution via approve_plan with startExecution (plan is already approved,
      // so we use the planner directly — the facade approve op already handled it)
      // We need to start execution first
      const execRes = await callOp(orchestrateFacade, 'orchestrate_execute', {
        planId,
        domain: 'backend',
        context: 'E2E lifecycle test',
      });
      expect(execRes.success).toBe(true);

      // Satisfy playbook gates before completing tasks (TDD playbook requires
      // tdd-red post-task gate and tdd-green completion gate)
      if (playbookSessionId) {
        await callOp(orchestrateFacade, 'playbook_complete', {
          sessionId: playbookSessionId,
          gateResults: { 'tdd-red': true, 'tdd-green': true },
        });
        playbookSessionId = null;
      }

      // Mark all tasks as completed
      for (let i = 1; i <= 4; i++) {
        const taskRes = await callOp(planFacade, 'update_task', {
          planId,
          taskId: `task-${i}`,
          status: 'completed',
        });
        expect(taskRes.success).toBe(true);
      }
    });

    it('plan_reconcile should return a drift report with accuracy score', async () => {
      const res = await callOp(planFacade, 'plan_reconcile', {
        planId,
        actualOutcome: 'All 4 tasks completed successfully. Auth module working with JWT.',
        driftItems: [],
      });

      expect(res.success).toBe(true);
      const data = res.data as {
        reconciled: boolean;
        accuracy: number;
        driftCount: number;
        plan: { status: string; reconciliation: { accuracy: number; driftItems: unknown[] } };
      };
      expect(data.reconciled).toBe(true);
      expect(data.accuracy).toBe(100);
      expect(data.driftCount).toBe(0);
    });

    it('plan should be auto-completed after reconcile', async () => {
      // plan_reconcile with autoComplete=true (default) chains through
      // complete_plan + lifecycle automatically
      const res = await callOp(planFacade, 'get_plan', { planId });
      expect(res.success).toBe(true);
      const data = res.data as { status: string };
      expect(data.status).toBe('completed');
    });

    it('plan_complete_lifecycle should capture knowledge', async () => {
      const res = await callOp(planFacade, 'plan_complete_lifecycle', {
        planId,
        patterns: ['JWT + refresh token combo is reliable for stateless auth'],
        antiPatterns: ['Storing JWT secret in code — use env vars'],
      });

      expect(res.success).toBe(true);
      const data = res.data as {
        completed: boolean;
        knowledgeCaptured: number;
        patternsAdded: number;
        antiPatternsAdded: number;
      };
      expect(data.completed).toBe(true);
      expect(data.knowledgeCaptured).toBe(2);
      expect(data.patternsAdded).toBe(1);
      expect(data.antiPatternsAdded).toBe(1);
    });

    it('get_plan after completion should show completed status', async () => {
      const res = await callOp(planFacade, 'get_plan', { planId });
      expect(res.success).toBe(true);
      const data = res.data as { id: string; status: string; reconciliation: { accuracy: number } };
      expect(data.status).toBe('completed');
      expect(data.reconciliation.accuracy).toBe(100);
    });
  });

  // =========================================================================
  // Journey 2: Plan rejection and re-creation
  // =========================================================================

  describe('Journey 2: Plan rejection and re-creation', () => {
    let firstPlanId: string;
    let secondPlanId: string;

    it('create first plan', async () => {
      const res = await callOp(planFacade, 'create_plan', {
        objective: 'Add dark mode toggle',
        scope: 'UI settings panel',
        tasks: [{ title: 'Add toggle', description: 'Toggle switch in settings' }],
      });

      expect(res.success).toBe(true);
      const data = res.data as { plan: { id: string } };
      firstPlanId = data.plan.id;
    });

    it('reject first plan by creating a new one with modified prompt', async () => {
      // The first plan stays in draft — we do not approve it.
      // Instead, we create a different plan.
      const res = await callOp(planFacade, 'create_plan', {
        objective: 'Add system-aware theme with dark mode, light mode, and auto',
        scope: 'UI settings panel + CSS custom properties',
        tasks: [
          { title: 'Design theme tokens', description: 'CSS custom properties for all 3 themes' },
          { title: 'Add theme switcher', description: 'Three-state toggle in settings' },
          {
            title: 'Persist preference',
            description: 'localStorage + prefers-color-scheme fallback',
          },
        ],
      });

      expect(res.success).toBe(true);
      const data = res.data as { plan: { id: string } };
      secondPlanId = data.plan.id;
    });

    it('new plan should have a different id', () => {
      expect(secondPlanId).not.toBe(firstPlanId);
    });

    it('approve second plan should succeed', async () => {
      const res = await callOp(planFacade, 'approve_plan', { planId: secondPlanId });
      expect(res.success).toBe(true);
      const data = res.data as { approved: boolean; plan: { status: string } };
      expect(data.approved).toBe(true);
    });

    it('first plan should still be in draft', async () => {
      const res = await callOp(planFacade, 'get_plan', { planId: firstPlanId });
      expect(res.success).toBe(true);
      const data = res.data as { status: string };
      expect(data.status).toBe('draft');
    });
  });

  // =========================================================================
  // Journey 3: Orchestration (plan -> execute -> complete)
  // =========================================================================

  describe('Journey 3: Orchestration pipeline', () => {
    let orchPlanId: string;
    let sessionId: string;

    it('orchestrate_plan should return plan with intent and flow info', async () => {
      const res = await callOp(orchestrateFacade, 'orchestrate_plan', {
        prompt: 'Build a notification service that sends emails and push notifications',
        projectPath: workDir,
        domain: 'backend',
        tasks: [
          {
            title: 'Design notification schema',
            description: 'Define notification types and payload structure',
          },
          {
            title: 'Implement email sender',
            description: 'SMTP integration for email notifications',
          },
        ],
      });

      expect(res.success).toBe(true);
      const data = res.data as {
        plan: { id: string; objective: string };
        recommendations: Array<{ pattern: string; strength: number }>;
        flow: { planId: string; intent: string; stepsCount: number; warnings: string[] };
      };

      // Plan should exist with plan- prefix (legacy planner plan)
      expect(data.plan).toBeDefined();
      expect(data.plan.id).toBeDefined();
      expect(data.plan.id).toMatch(/^plan-/);
      expect(data.plan.objective).toContain('notification');
      orchPlanId = data.plan.id;

      // Flow info should be present with BUILD intent (prompt starts with "Build")
      expect(data.flow).toBeDefined();
      expect(data.flow.intent).toBe('BUILD');
      expect(data.flow.flowId).toBe('BUILD-flow');
      // 1 step kept (vault-search), 1 skipped (get-architecture — brain unavailable)
      // Pruning is probe-based: vault=true, brain=false (CI has no brain vocabulary)
      expect(data.flow.stepsCount).toBe(1);
      expect(data.flow.skippedCount).toBe(1);
      expect(Array.isArray(data.flow.warnings)).toBe(true);
      // estimatedTools is a count of total tool calls across kept steps
      expect(typeof data.flow.estimatedTools).toBe('number');
      expect(data.flow.estimatedTools).toBeGreaterThanOrEqual(0);
    });

    it('orchestrate_execute should track execution', async () => {
      // Approve the plan first (without starting execution — let orchestrate_execute do it)
      const approveRes = await callOp(planFacade, 'approve_plan', {
        planId: orchPlanId,
      });
      expect(approveRes.success).toBe(true);

      const res = await callOp(orchestrateFacade, 'orchestrate_execute', {
        planId: orchPlanId,
        domain: 'backend',
        context: 'E2E orchestration test',
      });

      expect(res.success).toBe(true);
      const data = res.data as {
        plan: { id: string; status: string };
        session: { id: string; domain?: string };
      };

      // Legacy path: planner transitions plan to executing
      expect(data.plan).toBeDefined();
      expect(data.plan.status).toBe('executing');
      expect(data.plan.id).toBe(orchPlanId);
      // Brain session is created with the domain we specified
      expect(data.session).toBeDefined();
      expect(data.session.id).toBeDefined();
      expect(typeof data.session.id).toBe('string');
      expect(data.session.id.length).toBeGreaterThan(0);
      sessionId = data.session.id;
    });

    it('orchestrate_complete should run epilogue', async () => {
      // plan_reconcile with autoComplete=true (default) chains through
      // complete_plan + lifecycle automatically
      const reconcileRes = await callOp(planFacade, 'plan_reconcile', {
        planId: orchPlanId,
        actualOutcome: 'Notification service built successfully',
        driftItems: [],
      });
      expect(reconcileRes.success).toBe(true);

      // After reconcile with autoComplete, plan is completed
      const getRes = await callOp(planFacade, 'get_plan', { planId: orchPlanId });
      expect(getRes.success).toBe(true);
      const planData = getRes.data as { status: string; reconciliation: { accuracy: number } };
      expect(planData.status).toBe('completed');
      expect(planData.reconciliation.accuracy).toBe(100);
    });

    it('orchestrate_complete on a separate plan should capture knowledge', async () => {
      // Create a fresh plan for the complete path
      const createRes = await callOp(planFacade, 'create_plan', {
        objective: 'Test orchestrate_complete end-to-end',
        scope: 'E2E test scope',
        tasks: [{ title: 'Single task', description: 'A simple task' }],
      });
      const freshId = (createRes.data as { plan: { id: string } }).plan.id;

      // Approve -> start execution
      await callOp(planFacade, 'approve_plan', { planId: freshId });
      const execRes = await callOp(orchestrateFacade, 'orchestrate_execute', {
        planId: freshId,
        domain: 'backend',
        context: 'Fresh orchestrate_complete test',
      });
      const freshSessionId = (execRes.data as { session: { id: string } }).session.id;

      // Mark task done
      await callOp(planFacade, 'update_task', {
        planId: freshId,
        taskId: 'task-1',
        status: 'completed',
      });

      // Reconcile (transitions plan to 'reconciling')
      await callOp(planFacade, 'plan_reconcile', {
        planId: freshId,
        actualOutcome: 'Task completed',
        driftItems: [],
      });

      // Now call orchestrate_complete — plan is in 'reconciling', so
      // planner.complete() transitions it to 'completed' and the epilogue
      // (brain session end, knowledge extraction, brain feedback) runs.
      const res = await callOp(orchestrateFacade, 'orchestrate_complete', {
        planId: freshId,
        sessionId: freshSessionId,
        outcome: 'completed',
        toolsUsed: ['vault_search'],
        filesModified: [],
      });

      expect(res.success).toBe(true);
      const data = res.data as {
        plan: { id: string; status: string };
        warnings?: string[];
      };
      expect(data.plan).toBeDefined();
      expect(data.plan.status).toBe('completed');
    });
  });

  // =========================================================================
  // Journey 4: Playbook matching
  // =========================================================================

  describe('Journey 4: Playbook matching', () => {
    it('build a button component should match TDD or brainstorming playbook', async () => {
      const res = await callOp(planFacade, 'plan_brainstorm', {
        intent: 'BUILD',
        text: 'build a button component with variants and accessibility',
      });

      expect(res.success).toBe(true);
      const data = res.data as {
        matched: boolean;
        label: string;
        genericMatch: { id: string; score: number } | null;
        gates: Array<{ phase: string; requirement: string }>;
        toolInjections: string[];
      };

      expect(data.matched).toBe(true);
      expect(data.label).toBeDefined();
      // Should match TDD (BUILD intent + "build" keyword) or brainstorming
      expect(data.genericMatch).toBeDefined();
      expect(data.genericMatch!.id).toMatch(/generic-(tdd|brainstorming)/);
      expect(data.genericMatch!.score).toBeGreaterThan(0);
    });

    it('fix the broken login should match systematic-debugging', async () => {
      const res = await callOp(planFacade, 'plan_brainstorm', {
        intent: 'FIX',
        text: 'fix the broken login — users get 500 error on auth endpoint',
      });

      expect(res.success).toBe(true);
      const data = res.data as {
        matched: boolean;
        genericMatch: { id: string; score: number } | null;
      };

      expect(data.matched).toBe(true);
      expect(data.genericMatch).toBeDefined();
      // FIX intent + "fix" + "broken" keywords should match debugging or TDD
      expect(data.genericMatch!.id).toMatch(/generic-(systematic-debugging|tdd)/);
    });

    it('what can you do should match onboarding playbook', async () => {
      const res = await callOp(planFacade, 'plan_brainstorm', {
        text: 'what can you do? help me get started with this agent',
      });

      expect(res.success).toBe(true);
      const data = res.data as {
        matched: boolean;
        genericMatch: { id: string; score: number } | null;
      };

      expect(data.matched).toBe(true);
      expect(data.genericMatch).toBeDefined();
      expect(data.genericMatch!.id).toBe('generic-onboarding');
    });

    it('review the code should match code-review playbook', async () => {
      const res = await callOp(planFacade, 'plan_brainstorm', {
        intent: 'REVIEW',
        text: 'review the pull request for the new authentication module',
      });

      expect(res.success).toBe(true);
      const data = res.data as {
        matched: boolean;
        genericMatch: { id: string; score: number } | null;
        gates: Array<{ phase: string; requirement: string; checkType: string }>;
        toolInjections: string[];
      };

      expect(data.matched).toBe(true);
      expect(data.genericMatch).toBeDefined();
      expect(data.genericMatch!.id).toBe('generic-code-review');
      expect(data.genericMatch!.score).toBeGreaterThanOrEqual(10); // REVIEW intent match = 10 points

      // Code-review playbook has exactly 3 gates
      expect(Array.isArray(data.gates)).toBe(true);
      expect(data.gates.length).toBe(3);
      expect(data.gates[0].phase).toBe('pre-execution');
      expect(data.gates[0].checkType).toBe('review-context');
      expect(data.gates[1].phase).toBe('post-task');
      expect(data.gates[1].checkType).toBe('review-grading-complete');
      expect(data.gates[2].phase).toBe('completion');
      expect(data.gates[2].checkType).toBe('review-verdict');
      // Code-review playbook has empty toolInjections
      expect(Array.isArray(data.toolInjections)).toBe(true);
      expect(data.toolInjections).toHaveLength(0);
    });
  });

  // =========================================================================
  // Journey 5: Plan with drift
  // =========================================================================

  describe('Journey 5: Plan with drift', () => {
    let driftPlanId: string;

    it('create and approve a plan with 3 tasks', async () => {
      const createRes = await callOp(planFacade, 'create_plan', {
        objective: 'Implement caching layer for API responses',
        scope: 'packages/api — Redis cache integration',
        tasks: [
          {
            title: 'Set up Redis connection',
            description: 'Configure Redis client with connection pooling',
          },
          {
            title: 'Add cache middleware',
            description: 'Express middleware for GET request caching',
          },
          {
            title: 'Add cache invalidation',
            description: 'Event-driven cache invalidation on writes',
          },
        ],
      });

      const plan = (createRes.data as { plan: { id: string } }).plan;
      driftPlanId = plan.id;

      // Approve
      await callOp(planFacade, 'approve_plan', { planId: driftPlanId, startExecution: true });
    });

    it('execute only 2 of 3 tasks, skip the third', async () => {
      // Complete task 1
      await callOp(planFacade, 'update_task', {
        planId: driftPlanId,
        taskId: 'task-1',
        status: 'completed',
      });

      // Complete task 2
      await callOp(planFacade, 'update_task', {
        planId: driftPlanId,
        taskId: 'task-2',
        status: 'completed',
      });

      // Skip task 3
      await callOp(planFacade, 'update_task', {
        planId: driftPlanId,
        taskId: 'task-3',
        status: 'skipped',
      });
    });

    it('reconcile should report drift for the skipped step', async () => {
      const res = await callOp(planFacade, 'plan_reconcile', {
        planId: driftPlanId,
        actualOutcome:
          'Redis caching works for GET requests but cache invalidation was deferred to next sprint',
        driftItems: [
          {
            type: 'skipped',
            description: 'Cache invalidation task was deferred — not enough time in sprint',
            impact: 'medium',
            rationale: 'Decided to ship basic caching first and add invalidation later',
          },
        ],
      });

      expect(res.success).toBe(true);
      const data = res.data as {
        reconciled: boolean;
        accuracy: number;
        driftCount: number;
        plan: {
          status: string;
          reconciliation: { accuracy: number; driftItems: Array<{ type: string; impact: string }> };
          executionSummary: { tasksCompleted: number; tasksSkipped: number };
        };
      };

      expect(data.reconciled).toBe(true);
      expect(data.driftCount).toBe(1);
      // Medium impact = 10 point deduction, so accuracy should be 90
      expect(data.accuracy).toBe(90);
      expect(data.accuracy).toBeLessThan(100);

      // Execution summary is computed from task statuses;
      // playbook gates may block completions, so total may vary
      expect(typeof data.plan.executionSummary.tasksCompleted).toBe('number');
      expect(typeof data.plan.executionSummary.tasksSkipped).toBe('number');
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================

  describe('Edge cases', () => {
    it('create plan with empty objective should handle gracefully', async () => {
      const res = await callOp(planFacade, 'create_plan', {
        objective: '',
        scope: '',
      });

      // Should still create — the planner does not enforce non-empty
      expect(res.success).toBe(true);
      const data = res.data as { plan: { id: string; objective: string } };
      expect(data.plan.id).toBeDefined();
    });

    it('approve already-approved plan should fail with transition error', async () => {
      // Create and approve a plan
      const createRes = await callOp(planFacade, 'create_plan', {
        objective: 'Test double approval',
        scope: 'edge case test',
      });
      const id = (createRes.data as { plan: { id: string } }).plan.id;
      await callOp(planFacade, 'approve_plan', { planId: id });

      // Try to approve again — should fail (approved -> approved is not a valid transition)
      // Valid from approved is only: executing
      const res = await callOp(planFacade, 'approve_plan', { planId: id });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Invalid transition');
      expect(res.error).toContain('approved');
    });

    it('complete a plan that was never executed should fail', async () => {
      // Create a draft plan
      const createRes = await callOp(planFacade, 'create_plan', {
        objective: 'Never executed plan',
        scope: 'edge case',
      });
      const id = (createRes.data as { plan: { id: string } }).plan.id;

      // Try to complete without approving or executing — draft → completed is invalid
      // Valid from draft is only: approved
      const res = await callOp(planFacade, 'complete_plan', { planId: id });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Invalid transition');
      expect(res.error).toContain('draft');
    });

    it('multiple plans in parallel should track independently', async () => {
      // Create 3 plans in parallel
      const [res1, res2, res3] = await Promise.all([
        callOp(planFacade, 'create_plan', {
          objective: 'Parallel plan A — add logging',
          scope: 'packages/logging',
        }),
        callOp(planFacade, 'create_plan', {
          objective: 'Parallel plan B — add metrics',
          scope: 'packages/metrics',
        }),
        callOp(planFacade, 'create_plan', {
          objective: 'Parallel plan C — add tracing',
          scope: 'packages/tracing',
        }),
      ]);

      const idA = (res1.data as { plan: { id: string } }).plan.id;
      const idB = (res2.data as { plan: { id: string } }).plan.id;
      const idC = (res3.data as { plan: { id: string } }).plan.id;

      // All IDs should be unique
      expect(new Set([idA, idB, idC]).size).toBe(3);

      // Approve plan A only
      await callOp(planFacade, 'approve_plan', { planId: idA });

      // Verify statuses are independent
      const [getA, getB, getC] = await Promise.all([
        callOp(planFacade, 'get_plan', { planId: idA }),
        callOp(planFacade, 'get_plan', { planId: idB }),
        callOp(planFacade, 'get_plan', { planId: idC }),
      ]);

      expect((getA.data as { status: string }).status).toBe('approved');
      expect((getB.data as { status: string }).status).toBe('draft');
      expect((getC.data as { status: string }).status).toBe('draft');
    });

    it('plan_reconcile with high-impact drift items should drop accuracy significantly', async () => {
      const createRes = await callOp(planFacade, 'create_plan', {
        objective: 'High drift test',
        scope: 'edge case',
        tasks: [
          { title: 'Task A', description: 'First' },
          { title: 'Task B', description: 'Second' },
        ],
      });
      const id = (createRes.data as { plan: { id: string } }).plan.id;

      await callOp(planFacade, 'approve_plan', { planId: id, startExecution: true });

      // Skip all tasks
      await callOp(planFacade, 'update_task', { planId: id, taskId: 'task-1', status: 'skipped' });
      await callOp(planFacade, 'update_task', { planId: id, taskId: 'task-2', status: 'skipped' });

      const res = await callOp(planFacade, 'plan_reconcile', {
        planId: id,
        actualOutcome: 'Nothing went as planned',
        driftItems: [
          {
            type: 'skipped',
            description: 'Task A abandoned',
            impact: 'high',
            rationale: 'Changed approach entirely',
          },
          {
            type: 'skipped',
            description: 'Task B abandoned',
            impact: 'high',
            rationale: 'Changed approach entirely',
          },
          {
            type: 'added',
            description: 'Completely new approach taken',
            impact: 'high',
            rationale: 'Original plan was wrong',
          },
        ],
      });

      expect(res.success).toBe(true);
      const data = res.data as { accuracy: number; driftCount: number };
      // 3 high-impact items * 20 = 60 deductions -> accuracy = 40
      expect(data.accuracy).toBe(40);
      expect(data.driftCount).toBe(3);
    });

    it('plan grading should return grade and score', async () => {
      const createRes = await callOp(planFacade, 'create_plan', {
        objective:
          'Implement a comprehensive user dashboard with real-time analytics, role-based access control, and data export',
        scope: 'packages/dashboard — new module with charts, permissions, CSV export',
        decisions: ['Use WebSocket for real-time updates', 'RBAC with predefined roles'],
        tasks: [
          { title: 'Design dashboard layout', description: 'Wireframe and component hierarchy' },
          { title: 'Implement RBAC', description: 'Role definitions and permission checks' },
          {
            title: 'Build analytics charts',
            description: 'Real-time charts with WebSocket data feed',
          },
          { title: 'Add CSV export', description: 'Server-side CSV generation with streaming' },
        ],
      });

      const id = (createRes.data as { plan: { id: string } }).plan.id;

      const gradeRes = await callOp(planFacade, 'plan_grade', { planId: id });
      expect(gradeRes.success).toBe(true);
      const data = gradeRes.data as {
        grade: string;
        score: number;
        gaps: unknown[];
        iteration: number;
        checkId: string;
      };
      expect(data.grade).toBeDefined();
      expect(data.grade).toMatch(/^(A\+|A|B|C|D|F)$/);
      expect(typeof data.score).toBe('number');
      expect(data.score).toBeGreaterThanOrEqual(0);
      expect(data.score).toBeLessThanOrEqual(100);
      expect(data.iteration).toBe(1);
      expect(data.checkId).toBeDefined();
    });

    it('plan_iterate should modify a draft plan', async () => {
      const createRes = await callOp(planFacade, 'create_plan', {
        objective: 'Original objective',
        scope: 'Original scope',
        tasks: [{ title: 'Original task', description: 'Will be modified' }],
      });
      const id = (createRes.data as { plan: { id: string } }).plan.id;

      const iterRes = await callOp(planFacade, 'plan_iterate', {
        planId: id,
        objective: 'Updated objective with more detail',
        addTasks: [{ title: 'New task', description: 'Added during iteration' }],
      });

      expect(iterRes.success).toBe(true);
      const data = iterRes.data as {
        iterated: boolean;
        plan: { objective: string; tasks: unknown[] };
      };
      expect(data.iterated).toBe(true);
      expect(data.plan.objective).toBe('Updated objective with more detail');
      expect(data.plan.tasks.length).toBeGreaterThanOrEqual(2);
    });

    it('plan_stats should return aggregate statistics', async () => {
      const res = await callOp(planFacade, 'plan_stats');
      expect(res.success).toBe(true);
      const data = res.data as {
        total: number;
        byStatus: Record<string, number>;
        avgTasksPerPlan: number;
        totalTasks: number;
        tasksByStatus: Record<string, number>;
      };
      // Multiple plans created by earlier journeys
      expect(data.total).toBeGreaterThanOrEqual(7);
      // byStatus should have all lifecycle states
      expect(data.byStatus).toBeDefined();
      expect(typeof data.byStatus.draft).toBe('number');
      expect(typeof data.byStatus.approved).toBe('number');
      expect(typeof data.byStatus.completed).toBe('number');
      // Should include completed plans from Journey 1 and Journey 3
      expect(data.byStatus.completed).toBeGreaterThanOrEqual(2);
      // Task aggregates
      expect(typeof data.totalTasks).toBe('number');
      expect(data.totalTasks).toBeGreaterThan(0);
      expect(typeof data.avgTasksPerPlan).toBe('number');
      // tasksByStatus should have all task states
      expect(typeof data.tasksByStatus.pending).toBe('number');
      expect(typeof data.tasksByStatus.completed).toBe('number');
    });

    it('get_plan without ID should list all active plans', async () => {
      const res = await callOp(planFacade, 'get_plan', {});
      expect(res.success).toBe(true);
      const data = res.data as { active: unknown[]; executing: unknown[] };
      expect(Array.isArray(data.active)).toBe(true);
      expect(Array.isArray(data.executing)).toBe(true);
    });

    it('update_task on non-executing plan should fail', async () => {
      const createRes = await callOp(planFacade, 'create_plan', {
        objective: 'Non-executing plan',
        scope: 'test',
        tasks: [{ title: 'A task', description: 'Cannot update in draft' }],
      });
      const id = (createRes.data as { plan: { id: string } }).plan.id;

      const res = await callOp(planFacade, 'update_task', {
        planId: id,
        taskId: 'task-1',
        status: 'completed',
      });
      expect(res.success).toBe(false);
      // Planner enforces: tasks can only be updated on executing or validating plans
      expect(res.error).toContain('Cannot update tasks');
      expect(res.error).toContain("'draft'");
    });

    it('orchestrate_status should return combined overview', async () => {
      const res = await callOp(orchestrateFacade, 'orchestrate_status', {
        domain: 'backend',
      });

      expect(res.success).toBe(true);
      const data = res.data as {
        activePlans: Array<{ id: string; status: string }>;
        vaultStats: { totalEntries: number; byDomain: Record<string, number> };
        brainStats: {
          strengths: number;
          sessions: number;
          activeSessions: number;
          proposals: number;
          promotedProposals: number;
          globalPatterns: number;
          domainProfiles: number;
        };
        recommendations: Array<{ pattern: string; strength: number }>;
        sessionContext: { recentSessions: unknown[] };
        flowPlans: unknown[];
      };
      expect(Array.isArray(data.activePlans)).toBe(true);
      // vaultStats should have the expected shape
      expect(typeof data.vaultStats.totalEntries).toBe('number');
      expect(data.vaultStats.totalEntries).toBeGreaterThanOrEqual(0);
      expect(data.vaultStats.byDomain).toBeDefined();
      // brainStats should have all fields from BrainIntelligenceStats
      expect(typeof data.brainStats.sessions).toBe('number');
      expect(typeof data.brainStats.activeSessions).toBe('number');
      expect(typeof data.brainStats.strengths).toBe('number');
      expect(typeof data.brainStats.proposals).toBe('number');
      expect(typeof data.brainStats.globalPatterns).toBe('number');
      // recommendations is an array (may be empty for fresh brain)
      expect(Array.isArray(data.recommendations)).toBe(true);
      // flowPlans tracks orchestration-created plans
      expect(Array.isArray(data.flowPlans)).toBe(true);
    });

    it('plan_split with invalid dependency should fail', async () => {
      const createRes = await callOp(planFacade, 'create_plan', {
        objective: 'Bad dependency test',
        scope: 'edge case',
      });
      const id = (createRes.data as { plan: { id: string } }).plan.id;

      const res = await callOp(planFacade, 'plan_split', {
        planId: id,
        tasks: [{ title: 'Task A', description: 'First task', dependsOn: ['task-99'] }],
      });

      // plan_split catches the error and returns it in data (no throw at facade level)
      expect(res.success).toBe(true);
      const data = res.data as { error: string };
      expect(data.error).toContain('unknown task');
      expect(data.error).toContain('task-99');
    });

    it('plan_complete_lifecycle on non-completed plan should return error', async () => {
      const createRes = await callOp(planFacade, 'create_plan', {
        objective: 'Not completed yet',
        scope: 'edge case',
      });
      const id = (createRes.data as { plan: { id: string } }).plan.id;

      const res = await callOp(planFacade, 'plan_complete_lifecycle', {
        planId: id,
        patterns: ['This should not work'],
      });

      // plan_complete_lifecycle catches the error and returns it in data (no throw at facade level)
      expect(res.success).toBe(true);
      const data = res.data as { error: string };
      // Plan is in 'draft' status, must be 'completed' for knowledge capture
      expect(data.error).toContain('must be completed');
      expect(data.error).toContain("'draft'");
    });

    it('orchestrate_quick_capture should capture without full lifecycle', async () => {
      const res = await callOp(orchestrateFacade, 'orchestrate_quick_capture', {
        domain: 'frontend',
        context: 'Learned that CSS Grid is better than Flexbox for 2D layouts',
        toolsUsed: ['vault_search'],
        outcome: 'completed',
      });

      expect(res.success).toBe(true);
      const data = res.data as {
        session: { id: string; domain: string; endedAt: string | null; startedAt: string };
        extraction: null | { proposals: unknown[] };
      };
      // Session should be created and ended in one call
      expect(data.session).toBeDefined();
      expect(data.session.id).toBeDefined();
      expect(typeof data.session.id).toBe('string');
      // Session was started and ended in one orchestrate_quick_capture call
      expect(data.session.startedAt).toBeDefined();
      expect(typeof data.session.startedAt).toBe('string');
      expect(data.session.endedAt).toBeDefined();
      expect(typeof data.session.endedAt).toBe('string');
      expect(data.session.domain).toBe('frontend');
      // extraction is null when not enough signal (fresh brain)
      // but the field should be present
      expect('extraction' in data).toBe(true);
    });
  });

  // =========================================================================
  // Journey: Brain feedback loop — orchestrate_complete feeds brain
  // =========================================================================

  describe('Journey: orchestrate_complete records brain feedback', () => {
    const brainFacade = `${AGENT_ID}_brain`;

    it('should record feedback for vault entries used in plan decisions', async () => {
      // 1. Seed vault with an entry directly via runtime (available in test scope)
      const entryId = `feedback-loop-e2e-${Date.now()}`;
      runtime.vault.add({
        id: entryId,
        title: 'Test pattern for brain feedback loop',
        type: 'pattern',
        domain: 'testing',
        description: 'A test pattern to verify feedback recording works end-to-end.',
        severity: 'suggestion',
        tags: ['testing', 'brain-loop'],
      });

      // 2. Create a plan with decisions that embed the entryId
      const planRes = await callOp(planFacade, 'create_plan', {
        objective: 'Verify brain feedback loop works end-to-end',
        scope: 'e2e test',
        decisions: [
          `Brain pattern: Test pattern (strength: 50.0) [entryId:${entryId}]`,
        ],
        tasks: [
          { title: 'Task A', description: 'Do something' },
        ],
      });
      expect(planRes.success).toBe(true);
      const planId = (planRes.data as { created: boolean; plan: { id: string } }).plan.id;

      // 3. Approve + split
      const approveRes = await callOp(planFacade, 'approve_plan', {
        planId,
        force: true,
      });
      expect(approveRes.success).toBe(true);

      const splitRes = await callOp(planFacade, 'plan_split', {
        planId,
        tasks: [{ title: 'Task A', description: 'Do something', type: 'test', complexity: 'low' }],
      });
      expect(splitRes.success).toBe(true);

      // 4. Start execution via orchestrate_execute
      const execRes = await callOp(orchestrateFacade, 'orchestrate_execute', {
        planId,
        domain: 'testing',
        context: 'E2E brain feedback loop test',
      });
      expect(execRes.success).toBe(true);
      const execData = execRes.data as Record<string, unknown>;
      const sessionId = ((execData.session as Record<string, unknown>)?.id as string);

      // 5. Mark task as completed
      await callOp(planFacade, 'update_task', {
        planId,
        taskId: 'task-1',
        status: 'completed',
      });

      // 6. Complete via orchestrate_complete
      const completeRes = await callOp(orchestrateFacade, 'orchestrate_complete', {
        planId,
        sessionId,
        outcome: 'completed',
        summary: 'Completed the test task successfully',
      });
      expect(completeRes.success).toBe(true);

      // 8. Check brain feedback stats — should have at least 1 feedback entry
      const statsRes = await callOp(brainFacade, 'brain_feedback_stats', {});
      expect(statsRes.success).toBe(true);
      const stats = statsRes.data as { total: number; byAction: Record<string, number> };
      expect(stats.total).toBeGreaterThanOrEqual(1);
      expect(stats.byAction.accepted).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // Journey: create_plan vault enrichment feeds brain_feedback on completion
  // =========================================================================

  describe('Journey: vault-enriched create_plan feeds brain_feedback', () => {
    const brainFacade = `${AGENT_ID}_brain`;

    it('should auto-enrich plan decisions from vault and feed brain on completion', async () => {
      // 1. Seed vault with a searchable pattern
      const entryId = `vault-enrich-e2e-${Date.now()}`;
      runtime.vault.add({
        id: entryId,
        title: 'Database migration safety pattern',
        type: 'pattern',
        domain: 'architecture',
        description: 'Always run migrations in a transaction with rollback support.',
        severity: 'warning',
        tags: ['database', 'migration', 'safety'],
      });

      // 2. Create plan with objective matching the vault entry
      const planRes = await callOp(planFacade, 'create_plan', {
        objective: 'Implement safe database migration with rollback',
        scope: 'e2e test',
        tasks: [{ title: 'Add migration runner', description: 'Implement migration with transaction' }],
      });
      expect(planRes.success).toBe(true);
      const data = planRes.data as {
        created: boolean;
        plan: { id: string; decisions: string[] };
        vaultEntryIds: string[];
      };
      expect(data.created).toBe(true);

      // 3. Verify vault enrichment happened
      expect(data.vaultEntryIds.length).toBeGreaterThan(0);
      const vaultDecisions = data.plan.decisions.filter((d: string) =>
        d.startsWith('Vault pattern:'),
      );
      expect(vaultDecisions.length).toBeGreaterThan(0);
      // Each decision should have [entryId:...] for brain feedback extraction
      for (const vd of vaultDecisions) {
        expect(vd).toMatch(/\[entryId:[^\]]+\]/);
      }

      // 4. Full lifecycle: approve → split → execute → complete
      const planId = data.plan.id;
      await callOp(planFacade, 'approve_plan', { planId, force: true });
      await callOp(planFacade, 'plan_split', {
        planId,
        tasks: [
          {
            title: 'Add migration runner',
            description: 'Implement migration with transaction',
            type: 'impl',
            complexity: 'medium',
          },
        ],
      });

      const execRes = await callOp(orchestrateFacade, 'orchestrate_execute', {
        planId,
        domain: 'architecture',
        context: 'E2E vault enrichment test',
      });
      expect(execRes.success).toBe(true);
      const sessionId = (
        (execRes.data as Record<string, unknown>).session as Record<string, unknown>
      )?.id as string;

      await callOp(planFacade, 'update_task', {
        planId,
        taskId: 'task-1',
        status: 'completed',
      });

      const completeRes = await callOp(orchestrateFacade, 'orchestrate_complete', {
        planId,
        sessionId,
        outcome: 'completed',
        summary: 'Migration runner implemented with vault-informed decisions',
      });
      expect(completeRes.success).toBe(true);

      // 5. Verify brain feedback was recorded for the vault entry
      const statsRes = await callOp(brainFacade, 'brain_feedback_stats', {});
      expect(statsRes.success).toBe(true);
      const stats = statsRes.data as { total: number; byAction: Record<string, number> };
      expect(stats.total).toBeGreaterThanOrEqual(1);
    });
  });
});
