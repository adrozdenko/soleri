/**
 * E2E Test: Error Paths
 *
 * Dedicated negative/error tests across all facades. Verifies the system
 * handles invalid ops, missing params, wrong types, nonexistent resources,
 * invalid state transitions, and runtime edge cases correctly.
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

const AGENT_ID = 'e2e-errors';

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

describe('E2E: error-paths', () => {
  let runtime: AgentRuntime;
  let facades: FacadeConfig[];
  let handlers: Map<string, ReturnType<typeof captureHandler>>;
  const plannerDir = join(tmpdir(), `soleri-e2e-errors-${Date.now()}`);

  beforeAll(() => {
    mkdirSync(plannerDir, { recursive: true });

    runtime = createAgentRuntime({
      agentId: AGENT_ID,
      vaultPath: ':memory:',
      plansPath: join(plannerDir, 'plans.json'),
    });

    facades = createSemanticFacades(runtime, AGENT_ID);

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

  // ─── 1. Invalid op names (per facade) ───────────────────────────────

  describe('Invalid op names', () => {
    const facadeSuffixes = [
      'vault',
      'brain',
      'plan',
      'memory',
      'admin',
      'curator',
      'loop',
      'control',
      'orchestrate',
    ];

    for (const suffix of facadeSuffixes) {
      it(`${suffix}: nonexistent_op should return success: false with "Unknown operation"`, async () => {
        const res = await callOp(`${AGENT_ID}_${suffix}`, 'nonexistent_op');
        expect(res.success).toBe(false);
        expect(res.error).toContain('Unknown operation');
        expect(res.op).toBe('nonexistent_op');
        expect(res.facade).toBe(`${AGENT_ID}_${suffix}`);
      });
    }
  });

  // ─── 2. Missing required params ─────────────────────────────────────

  describe('Missing required params', () => {
    it('vault: capture_knowledge with empty entries array should succeed (no-op capture)', async () => {
      const res = await callOp(`${AGENT_ID}_vault`, 'capture_knowledge', {
        entries: [],
      });
      // Empty array is valid — should either succeed with 0 captured or fail gracefully
      expect(res).toBeDefined();
      expect(res.op).toBe('capture_knowledge');
    });

    it('plan: create_plan with no objective should fail with validation error', async () => {
      const res = await callOp(`${AGENT_ID}_plan`, 'create_plan', {});
      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
      expect(res.error).toMatch(/objective|required|invalid/i);
    });

    it('brain: record_feedback with no entryId should fail with validation error', async () => {
      const res = await callOp(`${AGENT_ID}_brain`, 'record_feedback', {
        query: 'test',
        action: 'accepted',
      });
      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
      expect(res.error).toMatch(/entryId|required|invalid/i);
    });

    it('memory: memory_capture with no required fields should fail', async () => {
      const res = await callOp(`${AGENT_ID}_memory`, 'memory_capture', {});
      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
      expect(res.error).toMatch(/required|invalid/i);
    });
  });

  // ─── 3. Wrong param types ───────────────────────────────────────────

  describe('Wrong param types', () => {
    it('vault: search with query as number should fail or coerce', async () => {
      const res = await callOp(`${AGENT_ID}_vault`, 'search', {
        query: 123 as unknown as string,
      });
      // Zod should reject non-string query
      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
    });

    it('plan: approve_plan with planId as number should fail', async () => {
      const res = await callOp(`${AGENT_ID}_plan`, 'approve_plan', {
        planId: 123 as unknown as string,
      });
      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
    });
  });

  // ─── 4. Nonexistent resource IDs ────────────────────────────────────

  describe('Nonexistent resource IDs', () => {
    it('plan: approve_plan with nonexistent planId should error', async () => {
      const res = await callOp(`${AGENT_ID}_plan`, 'approve_plan', {
        planId: 'nonexistent-plan-id',
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/not found|nonexistent/i);
    });

    it('plan: update_task with nonexistent planId should error', async () => {
      const res = await callOp(`${AGENT_ID}_plan`, 'update_task', {
        planId: 'nonexistent-plan-id',
        taskId: 'nonexistent-task',
        status: 'completed',
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/not found|nonexistent/i);
    });

    it('plan: update_task with valid planId but nonexistent taskId should error', async () => {
      // First create a plan to get a valid planId
      const createRes = await callOp(`${AGENT_ID}_plan`, 'create_plan', {
        objective: 'Test plan for task error',
        scope: 'Error testing',
        tasks: [{ title: 'Task 1', description: 'First task' }],
      });
      expect(createRes.success).toBe(true);
      const planData = createRes.data as { plan: { id: string } };

      // Approve and start execution so update_task is valid
      await callOp(`${AGENT_ID}_plan`, 'approve_plan', {
        planId: planData.plan.id,
        startExecution: true,
      });

      // Now try to update a nonexistent task
      const res = await callOp(`${AGENT_ID}_plan`, 'update_task', {
        planId: planData.plan.id,
        taskId: 'nonexistent-task-id',
        status: 'completed',
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/not found|nonexistent/i);
    });

    it('brain: session_get with nonexistent sessionId should return error', async () => {
      const res = await callOp(`${AGENT_ID}_brain`, 'session_get', {
        sessionId: 'nonexistent-session-id',
      });
      // session_get returns { error: ... } inside data, success is still true
      // because the handler returns a value without throwing
      if (res.success) {
        const data = res.data as { error?: string };
        expect(data.error).toBeDefined();
        expect(data.error).toMatch(/not found/i);
      } else {
        expect(res.error).toMatch(/not found/i);
      }
    });
  });

  // ─── 5. Invalid state transitions ──────────────────────────────────

  describe('Invalid state transitions', () => {
    it('plan: approve_plan on already-approved plan should error', async () => {
      // Create and approve a plan
      const createRes = await callOp(`${AGENT_ID}_plan`, 'create_plan', {
        objective: 'Double-approve test',
        scope: 'Error testing',
      });
      expect(createRes.success).toBe(true);
      const planData = createRes.data as { plan: { id: string } };

      const approveRes = await callOp(`${AGENT_ID}_plan`, 'approve_plan', {
        planId: planData.plan.id,
      });
      expect(approveRes.success).toBe(true);

      // Try to approve again — should error (approved -> approved is invalid)
      const res = await callOp(`${AGENT_ID}_plan`, 'approve_plan', {
        planId: planData.plan.id,
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/invalid transition|already/i);
    });

    it('plan: plan_reconcile on draft plan should error (not in executing state)', async () => {
      // Create a plan but don't approve or execute it
      const createRes = await callOp(`${AGENT_ID}_plan`, 'create_plan', {
        objective: 'Reconcile-on-draft test',
        scope: 'Error testing',
      });
      expect(createRes.success).toBe(true);
      const planData = createRes.data as { plan: { id: string } };

      const res = await callOp(`${AGENT_ID}_plan`, 'plan_reconcile', {
        planId: planData.plan.id,
        actualOutcome: 'Nothing happened',
      });

      // The handler may return success:false (if error propagates through dispatch)
      // or success:true with data.error (if handler catches internally).
      // Either way, an error message about invalid status must be present.
      if (res.success) {
        const data = res.data as { error?: string };
        expect(data.error).toBeDefined();
        expect(data.error).toMatch(/cannot reconcile|not.*executing|draft/i);
      } else {
        expect(res.error).toMatch(/cannot reconcile|not.*executing|draft/i);
      }
    });
  });

  // ─── 6. Runtime edge cases ──────────────────────────────────────────

  describe('Runtime edge cases', () => {
    it('double-close runtime should not throw', () => {
      // Create a separate runtime for this test
      const tempDir = join(tmpdir(), `soleri-e2e-dblclose-${Date.now()}`);
      mkdirSync(tempDir, { recursive: true });

      const tempRuntime = createAgentRuntime({
        agentId: 'e2e-dblclose',
        vaultPath: ':memory:',
        plansPath: join(tempDir, 'plans.json'),
      });

      // First close — should succeed
      expect(() => tempRuntime.close()).not.toThrow();

      // Second close — must not throw
      expect(() => tempRuntime.close()).not.toThrow();

      rmSync(tempDir, { recursive: true, force: true });
    });

    it('operations after close should fail gracefully', async () => {
      const tempDir = join(tmpdir(), `soleri-e2e-afterclose-${Date.now()}`);
      mkdirSync(tempDir, { recursive: true });

      const tempRuntime = createAgentRuntime({
        agentId: 'e2e-afterclose',
        vaultPath: ':memory:',
        plansPath: join(tempDir, 'plans.json'),
      });

      const tempFacades = createSemanticFacades(tempRuntime, 'e2e-afterclose');
      const tempHandlers = new Map<string, ReturnType<typeof captureHandler>>();
      for (const facade of tempFacades) {
        tempHandlers.set(facade.name, captureHandler(facade));
      }

      // Close runtime
      tempRuntime.close();

      // Try to call an op — should either return error or throw (caught by facade dispatch)
      const handler = tempHandlers.get('e2e-afterclose_vault');
      if (handler) {
        try {
          const raw = await handler({ op: 'search', params: { query: 'test' } });
          const res = parseResponse(raw);
          // If it doesn't throw, it should indicate failure
          expect(res.success).toBe(false);
        } catch {
          // Throwing is also acceptable — the system didn't silently succeed
          expect(true).toBe(true);
        }
      }

      rmSync(tempDir, { recursive: true, force: true });
    });
  });

  // ─── 7. Empty/boundary inputs ───────────────────────────────────────

  describe('Empty and boundary inputs', () => {
    it('vault: search with empty string query should handle gracefully', async () => {
      const res = await callOp(`${AGENT_ID}_vault`, 'search', { query: '' });
      // Empty string is technically a valid string — should return empty results or error
      expect(res).toBeDefined();
      expect(res.op).toBe('search');
      if (res.success) {
        // If it succeeds, data should be an array (empty results)
        const data = res.data as unknown[];
        expect(Array.isArray(data)).toBe(true);
      }
    });

    it('memory: memory_search with empty query should handle gracefully', async () => {
      const res = await callOp(`${AGENT_ID}_memory`, 'memory_search', { query: '' });
      expect(res).toBeDefined();
      expect(res.op).toBe('memory_search');
      if (res.success) {
        const data = res.data as unknown[];
        expect(Array.isArray(data)).toBe(true);
      }
    });

    it('brain: brain_recommend with empty domain should handle gracefully', async () => {
      const res = await callOp(`${AGENT_ID}_brain`, 'brain_recommend', { domain: '' });
      expect(res).toBeDefined();
      expect(res.op).toBe('brain_recommend');
      // Empty domain is optional and can default — should succeed
      if (res.success) {
        expect(res.data).toBeDefined();
      }
    });

    it('vault: load_entries with empty ids array should fail validation', async () => {
      const res = await callOp(`${AGENT_ID}_vault`, 'load_entries', { ids: [] });
      // Schema requires .min(1) so empty array should fail
      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
    });

    it('plan: create_plan with extremely long objective should handle', async () => {
      const longObjective = 'x'.repeat(10_000);
      const res = await callOp(`${AGENT_ID}_plan`, 'create_plan', {
        objective: longObjective,
        scope: 'Boundary test',
      });
      // Should either succeed (no length limit) or fail gracefully
      expect(res).toBeDefined();
      expect(res.op).toBe('create_plan');
    });
  });
});
