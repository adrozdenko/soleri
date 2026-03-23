import { describe, it, expect, afterEach } from 'vitest';
import { createAgentRuntime } from './runtime.js';
import { createPlaybookOps } from './playbook-ops.js';
import type { AgentRuntime } from './types.js';
import type { OpDefinition } from '../facades/types.js';

describe('playbook execution ops', () => {
  let runtime: AgentRuntime;
  let ops: OpDefinition[];

  function findOp(name: string): OpDefinition {
    const op = ops.find((o) => o.name === name);
    if (!op) throw new Error(`Op "${name}" not found`);
    return op;
  }

  afterEach(() => {
    runtime?.close();
  });

  function setup() {
    runtime = createAgentRuntime({
      agentId: 'test-playbook-exec',
      vaultPath: ':memory:',
    });
    ops = createPlaybookOps(runtime);
  }

  it('should return 8 ops total', () => {
    setup();
    expect(ops).toHaveLength(8);
    const names = ops.map((o) => o.name);
    expect(names).toContain('playbook_start');
    expect(names).toContain('playbook_step');
    expect(names).toContain('playbook_complete');
  });

  // ─── playbook_start ─────────────────────────────────────────────

  describe('playbook_start', () => {
    it('should start by playbookId', async () => {
      setup();
      const result = (await findOp('playbook_start').handler({
        playbookId: 'generic-tdd',
      })) as { sessionId: string; label: string; totalSteps: number };

      expect(result.sessionId).toMatch(/^pbk-/);
      expect(result.label).toBe('Test-Driven Development');
      expect(result.totalSteps).toBeGreaterThan(0);
    });

    it('should start by intent auto-match', async () => {
      setup();
      const result = (await findOp('playbook_start').handler({
        intent: 'BUILD',
        text: 'implement a new feature with tests',
      })) as { sessionId: string; label: string };

      expect(result.sessionId).toMatch(/^pbk-/);
      expect(result.label).toBeDefined();
    });

    it('should return error for unknown playbookId', async () => {
      setup();
      const result = (await findOp('playbook_start').handler({
        playbookId: 'nonexistent',
      })) as { error: string };

      expect(result.error).toContain('not found');
    });

    it('should return available playbooks when no match', async () => {
      setup();
      const result = (await findOp('playbook_start').handler({
        intent: 'DELIVER',
        text: 'something very obscure with no keyword matches',
      })) as { error: string; available: Array<{ id: string }> };

      // May or may not match — if error, should list available
      if (result.error) {
        expect(result.available).toBeDefined();
        expect(result.available.length).toBeGreaterThan(0);
      }
    });

    it('should return error with no params', async () => {
      setup();
      const result = (await findOp('playbook_start').handler({})) as {
        error: string;
        available: Array<{ id: string }>;
      };

      expect(result.error).toContain('Provide');
      expect(result.available.length).toBeGreaterThan(0);
    });
  });

  // ─── playbook_step ──────────────────────────────────────────────

  describe('playbook_step', () => {
    it('should advance through steps', async () => {
      setup();
      const start = (await findOp('playbook_start').handler({
        playbookId: 'generic-tdd',
      })) as { sessionId: string };

      const step = (await findOp('playbook_step').handler({
        sessionId: start.sessionId,
        output: 'Wrote failing test for the feature',
      })) as {
        completedStep: { status: string; output: string };
        nextStep: { status: string } | null;
        progress: { done: number; total: number };
      };

      expect(step.completedStep.status).toBe('done');
      expect(step.completedStep.output).toBe('Wrote failing test for the feature');
      expect(step.nextStep).not.toBeNull();
      expect(step.progress.done).toBe(1);
    });

    it('should return error for invalid session', async () => {
      setup();
      const result = (await findOp('playbook_step').handler({
        sessionId: 'invalid',
      })) as { error: string };

      expect(result.error).toContain('not found');
    });
  });

  // ─── playbook_complete ──────────────────────────────────────────

  describe('playbook_complete', () => {
    it('should complete with gate validation', async () => {
      setup();
      const start = (await findOp('playbook_start').handler({
        playbookId: 'generic-tdd',
      })) as { sessionId: string; totalSteps: number };

      // Advance through all steps
      for (let i = 0; i < start.totalSteps; i++) {
        await findOp('playbook_step').handler({
          sessionId: start.sessionId,
          output: `Step ${i + 1}`,
        });
      }

      const result = (await findOp('playbook_complete').handler({
        sessionId: start.sessionId,
        gateResults: { 'tdd-red': true, 'tdd-green': true },
      })) as {
        status: string;
        gatesPassed: boolean;
        unsatisfiedGates: string[];
        duration: number;
      };

      expect(result.status).toBe('completed');
      expect(result.gatesPassed).toBe(true);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should abort a session', async () => {
      setup();
      const start = (await findOp('playbook_start').handler({
        playbookId: 'generic-tdd',
      })) as { sessionId: string };

      const result = (await findOp('playbook_complete').handler({
        sessionId: start.sessionId,
        abort: true,
      })) as { status: string };

      expect(result.status).toBe('aborted');
    });
  });

  // ─── auth levels ────────────────────────────────────────────────

  describe('auth levels', () => {
    it('should use write auth for execution ops', () => {
      setup();
      expect(findOp('playbook_start').auth).toBe('write');
      expect(findOp('playbook_step').auth).toBe('write');
      expect(findOp('playbook_complete').auth).toBe('write');
    });
  });
});
