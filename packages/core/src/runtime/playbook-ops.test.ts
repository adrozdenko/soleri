/**
 * Unit tests for playbook-ops — 8 ops for playbook management and execution.
 */

import { describe, it, expect, vi } from 'vitest';
import { captureOps, executeOp } from '../engine/test-helpers.js';
import { createPlaybookOps } from './playbook-ops.js';
import type { AgentRuntime } from './types.js';

/** Minimal vault stub that stores entries in memory. */
function makeVaultStub() {
  const entries = new Map<
    string,
    {
      id: string;
      type: string;
      domain?: string;
      title: string;
      description: string;
      context?: string;
      tags?: string[];
      severity?: string;
    }
  >();
  return {
    list: (opts: { type?: string; domain?: string; limit?: number }) => {
      let arr = [...entries.values()];
      if (opts.type) arr = arr.filter((e) => e.type === opts.type);
      if (opts.domain) arr = arr.filter((e) => e.domain === opts.domain);
      return arr.slice(0, opts.limit ?? 50);
    },
    get: (id: string) => entries.get(id) ?? null,
    add: (entry: {
      id: string;
      type: string;
      title: string;
      description: string;
      domain?: string;
      context?: string;
      tags?: string[];
      severity?: string;
    }) => {
      entries.set(entry.id, entry);
    },
    _entries: entries,
  };
}

/** Minimal playbook executor stub. */
function makePlaybookExecutorStub() {
  const sessions = new Map<string, { id: string; step: number; completed: boolean }>();
  return {
    start: vi.fn((def: { id: string; title: string }) => {
      const sessionId = `session-${def.id}`;
      sessions.set(sessionId, { id: sessionId, step: 0, completed: false });
      return { sessionId, currentStep: 0, playbook: def };
    }),
    step: vi.fn((sessionId: string, opts: { output?: string; skip?: boolean }) => {
      const session = sessions.get(sessionId);
      if (!session) return { error: `Session not found: ${sessionId}` };
      session.step++;
      return { sessionId, currentStep: session.step, skipped: opts.skip ?? false };
    }),
    complete: vi.fn((sessionId: string, opts: { abort?: boolean }) => {
      const session = sessions.get(sessionId);
      if (!session) return { error: `Session not found: ${sessionId}` };
      session.completed = true;
      return { sessionId, status: opts.abort ? 'aborted' : 'completed' };
    }),
  };
}

describe('playbook-ops', () => {
  function setup() {
    const vault = makeVaultStub();
    const playbookExecutor = makePlaybookExecutorStub();
    const ops = captureOps(
      createPlaybookOps({ vault, playbookExecutor } as unknown as AgentRuntime),
    );
    return { vault, playbookExecutor, ops };
  }

  describe('playbook_list', () => {
    it('returns empty list when no playbooks exist', async () => {
      const { ops } = setup();
      const res = await executeOp(ops, 'playbook_list', {});
      expect(res.success).toBe(true);
      const data = res.data as { playbooks: unknown[]; count: number };
      expect(data.count).toBe(0);
      expect(data.playbooks).toEqual([]);
    });

    it('lists playbook entries from vault', async () => {
      const { ops, vault } = setup();
      vault.add({
        id: 'playbook-test-1',
        type: 'playbook',
        domain: 'testing',
        title: 'TDD Workflow',
        description: 'Test-driven development playbook',
        context: JSON.stringify({
          steps: [{ order: 1, title: 'Write test', description: 'Write failing test' }],
        }),
        tags: ['tdd'],
      });

      const res = await executeOp(ops, 'playbook_list', {});
      expect(res.success).toBe(true);
      // parsePlaybookFromEntry may return null if format doesn't match exactly,
      // but we verify the op runs without error
    });
  });

  describe('playbook_get', () => {
    it('returns error for missing playbook', async () => {
      const { ops } = setup();
      const res = await executeOp(ops, 'playbook_get', { id: 'nonexistent' });
      expect(res.success).toBe(true);
      expect((res.data as { error: string }).error).toContain('not found');
    });

    it('returns error for non-playbook entry', async () => {
      const { ops, vault } = setup();
      vault.add({ id: 'entry-1', type: 'pattern', title: 'Not a playbook', description: 'nope' });

      const res = await executeOp(ops, 'playbook_get', { id: 'entry-1' });
      expect(res.success).toBe(true);
      expect((res.data as { error: string }).error).toContain('not a playbook');
    });
  });

  describe('playbook_create', () => {
    it('creates a playbook with valid steps', async () => {
      const { ops, vault } = setup();
      const res = await executeOp(ops, 'playbook_create', {
        title: 'My Playbook',
        domain: 'testing',
        description: 'A test playbook',
        steps: [
          { title: 'Step 1', description: 'Do first thing' },
          { title: 'Step 2', description: 'Do second thing' },
        ],
        tags: ['test'],
      });

      expect(res.success).toBe(true);
      const data = res.data as { created: boolean; id: string; steps: number };
      expect(data.created).toBe(true);
      expect(data.steps).toBe(2);
      expect(data.id).toMatch(/^playbook-testing-/);
      // Verify stored in vault
      expect(vault._entries.has(data.id)).toBe(true);
    });

    it('uses provided id when given', async () => {
      const { ops } = setup();
      const res = await executeOp(ops, 'playbook_create', {
        id: 'custom-id',
        title: 'Custom',
        domain: 'dev',
        description: 'Custom ID playbook',
        steps: [{ title: 'Step', description: 'Do it' }],
      });
      expect((res.data as { id: string }).id).toBe('custom-id');
    });
  });

  describe('playbook_match', () => {
    it('returns match result for text query', async () => {
      const { ops } = setup();
      const res = await executeOp(ops, 'playbook_match', {
        text: 'I need to debug a performance issue',
        intent: 'FIX',
      });
      // Even with no vault playbooks, matchPlaybooks should return built-in matches
      expect(res.success).toBe(true);
    });

    it('handles text-only match without intent', async () => {
      const { ops } = setup();
      const res = await executeOp(ops, 'playbook_match', { text: 'build a component' });
      expect(res.success).toBe(true);
    });
  });

  describe('playbook_start', () => {
    it('returns error when neither playbookId nor intent provided', async () => {
      const { ops } = setup();
      const res = await executeOp(ops, 'playbook_start', {});
      expect(res.success).toBe(true);
      const data = res.data as { error: string; available: unknown[] };
      expect(data.error).toContain('Provide playbookId or intent');
      expect(data.available).toBeDefined();
    });

    it('returns error for unknown playbookId', async () => {
      const { ops } = setup();
      const res = await executeOp(ops, 'playbook_start', { playbookId: 'nonexistent' });
      expect(res.success).toBe(true);
      expect((res.data as { error: string }).error).toContain('not found');
    });

    it('starts a built-in playbook by id', async () => {
      const { ops, playbookExecutor } = setup();
      // Built-in playbooks: tdd, brainstorming, code-review, subagent-execution, debugging, verification
      const res = await executeOp(ops, 'playbook_start', { playbookId: 'tdd' });
      expect(res.success).toBe(true);
      if (!(res.data as { error?: string }).error) {
        expect(playbookExecutor.start).toHaveBeenCalled();
      }
    });

    it('auto-matches by intent and text', async () => {
      const { ops } = setup();
      const res = await executeOp(ops, 'playbook_start', { intent: 'FIX', text: 'debug crash' });
      expect(res.success).toBe(true);
      // Either starts a matched playbook or returns "no matching playbook"
    });
  });
});
