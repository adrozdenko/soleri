import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCaptureOps } from './capture-ops.js';
import type { AgentRuntime } from './types.js';
import type { OpDefinition } from '../facades/types.js';

// ─── Mock External Modules ─────────────────────────────────────────────

vi.mock('../vault/scope-detector.js', () => ({
  detectScope: vi.fn(() => ({
    tier: 'project',
    confidence: 'HIGH',
    reason: 'Content indicates project scope',
    signals: [],
  })),
}));

vi.mock('../vault/vault-markdown-sync.js', () => ({
  syncEntryToMarkdown: vi.fn(() => Promise.resolve()),
}));

vi.mock('../paths.js', () => ({
  agentKnowledgeDir: vi.fn(() => '/mock/knowledge'),
}));

// ─── Mock Runtime Factory ──────────────────────────────────────────────

function createMockRuntime(): AgentRuntime {
  return {
    config: { agentId: 'test-agent' },
    vault: {
      isAutoLinkEnabled: vi.fn(() => false),
      searchMemories: vi.fn(() => []),
    },
    brain: {
      enrichAndCapture: vi.fn(() => ({
        blocked: false,
        entry: { id: 'captured-1' },
      })),
      intelligentSearch: vi.fn(async () => [{ id: 'r1', title: 'Result 1', score: 0.8 }]),
      scanSearch: vi.fn(async () => [
        {
          id: 'r1',
          title: 'Result 1',
          score: 0.8,
          snippet: 'Short desc...',
          tokenEstimate: 50,
          type: 'pattern',
          domain: 'test',
          severity: 'suggestion',
          tags: ['test'],
        },
      ]),
      recordFeedback: vi.fn(),
    },
    governance: {
      evaluateCapture: vi.fn(() => ({ action: 'capture' })),
      propose: vi.fn(),
    },
    linkManager: {
      suggestLinks: vi.fn(() => []),
      addLink: vi.fn(),
    },
  } as unknown as AgentRuntime;
}

function findOp(ops: OpDefinition[], name: string): OpDefinition {
  const op = ops.find((o) => o.name === name);
  if (!op) throw new Error(`Op not found: ${name}`);
  return op;
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe('createCaptureOps', () => {
  let runtime: AgentRuntime;
  let ops: OpDefinition[];

  beforeEach(() => {
    vi.clearAllMocks();
    runtime = createMockRuntime();
    ops = createCaptureOps(runtime);
  });

  it('returns 4 ops', () => {
    expect(ops).toHaveLength(4);
  });

  it('all ops have required fields', () => {
    for (const op of ops) {
      expect(op.name).toBeTruthy();
      expect(op.handler).toBeDefined();
      expect(['read', 'write']).toContain(op.auth);
    }
  });

  describe('capture_knowledge', () => {
    it('captures a single entry with governance approval', async () => {
      const result = (await findOp(ops, 'capture_knowledge').handler({
        entries: [
          {
            type: 'pattern',
            domain: 'testing',
            title: 'Test Pattern',
            description: 'A useful pattern',
            tags: ['test'],
          },
        ],
      })) as Record<string, unknown>;
      expect(result.captured).toBe(1);
      expect(result.rejected).toBe(0);
      expect(result.proposed).toBe(0);
    });

    it('captures multiple entries', async () => {
      const result = (await findOp(ops, 'capture_knowledge').handler({
        entries: [
          { type: 'pattern', domain: 'a', title: 'A', description: 'a', tags: [] },
          { type: 'rule', domain: 'b', title: 'B', description: 'b', tags: [] },
        ],
      })) as Record<string, unknown>;
      expect(result.captured).toBe(2);
    });

    it('uses manual tier override when provided', async () => {
      const result = (await findOp(ops, 'capture_knowledge').handler({
        tier: 'team',
        entries: [{ type: 'pattern', domain: 'a', title: 'A', description: 'a', tags: [] }],
      })) as Record<string, unknown>;
      expect(result.captured).toBe(1);
      const results = result.results as Array<Record<string, unknown>>;
      expect((results[0].scope as Record<string, unknown>).tier).toBe('team');
      expect((results[0].scope as Record<string, unknown>).confidence).toBe('MANUAL');
    });

    it('handles governance proposal action', async () => {
      vi.mocked(runtime.governance.evaluateCapture).mockReturnValue({
        action: 'propose',
        reason: 'Requires review',
      } as unknown);
      const result = (await findOp(ops, 'capture_knowledge').handler({
        entries: [{ type: 'pattern', domain: 'a', title: 'A', description: 'a', tags: [] }],
      })) as Record<string, unknown>;
      expect(result.proposed).toBe(1);
      expect(result.captured).toBe(0);
      expect(runtime.governance.propose).toHaveBeenCalled();
    });

    it('handles governance reject action', async () => {
      vi.mocked(runtime.governance.evaluateCapture).mockReturnValue({
        action: 'reject',
        reason: 'Not allowed',
      } as unknown);
      const result = (await findOp(ops, 'capture_knowledge').handler({
        entries: [{ type: 'pattern', domain: 'a', title: 'A', description: 'a', tags: [] }],
      })) as Record<string, unknown>;
      expect(result.rejected).toBe(1);
    });

    it('detects duplicates from brain.enrichAndCapture', async () => {
      vi.mocked(runtime.brain.enrichAndCapture).mockReturnValue({
        blocked: true,
        duplicate: { id: 'existing-1' },
      } as unknown);
      const result = (await findOp(ops, 'capture_knowledge').handler({
        entries: [{ type: 'pattern', domain: 'a', title: 'A', description: 'a', tags: [] }],
      })) as Record<string, unknown>;
      expect(result.duplicated).toBe(1);
      expect(result.captured).toBe(0);
    });

    it('handles enrichAndCapture errors gracefully', async () => {
      vi.mocked(runtime.brain.enrichAndCapture).mockImplementation(() => {
        throw new Error('Capture failed');
      });
      const result = (await findOp(ops, 'capture_knowledge').handler({
        entries: [{ type: 'pattern', domain: 'a', title: 'A', description: 'a', tags: [] }],
      })) as Record<string, unknown>;
      expect(result.rejected).toBe(1);
      const results = result.results as Array<Record<string, unknown>>;
      expect(results[0].action).toBe('error');
    });

    it('auto-links when vault has auto-link enabled', async () => {
      vi.mocked(runtime.vault.isAutoLinkEnabled).mockReturnValue(true);
      vi.mocked(runtime.linkManager.suggestLinks).mockReturnValue([
        { entryId: 'related-1', title: 'Related', suggestedType: 'related', score: 0.9 },
      ]);
      const result = (await findOp(ops, 'capture_knowledge').handler({
        entries: [{ type: 'pattern', domain: 'a', title: 'A', description: 'a', tags: [] }],
      })) as Record<string, unknown>;
      expect(result.autoLinkedCount).toBe(1);
      expect(result.suggestedLinks).toBeDefined();
    });

    it('maps extended types correctly', async () => {
      const result = (await findOp(ops, 'capture_knowledge').handler({
        entries: [
          { type: 'workflow', domain: 'a', title: 'A', description: 'a', tags: [] },
          { type: 'principle', domain: 'b', title: 'B', description: 'b', tags: [] },
        ],
      })) as Record<string, unknown>;
      // 'workflow' and 'principle' map to 'rule' — should still capture
      expect(result.captured).toBe(2);
    });

    it('uses per-entry tier override over top-level', async () => {
      const result = (await findOp(ops, 'capture_knowledge').handler({
        tier: 'team',
        entries: [
          { type: 'pattern', domain: 'a', title: 'A', description: 'a', tags: [], tier: 'agent' },
        ],
      })) as Record<string, unknown>;
      const results = result.results as Array<Record<string, unknown>>;
      expect((results[0].scope as Record<string, unknown>).tier).toBe('agent');
    });
  });

  describe('capture_quick', () => {
    it('captures single entry with minimal fields', async () => {
      const result = (await findOp(ops, 'capture_quick').handler({
        type: 'pattern',
        domain: 'testing',
        title: 'Quick Pattern',
        description: 'A quick capture',
      })) as Record<string, unknown>;
      expect(result.captured).toBe(true);
      expect(result.id).toBeDefined();
      expect((result.governance as Record<string, unknown>).action).toBe('capture');
    });

    it('uses auto-detected scope when no tier provided', async () => {
      const result = (await findOp(ops, 'capture_quick').handler({
        type: 'pattern',
        domain: 'testing',
        title: 'Quick Pattern',
        description: 'A quick capture',
      })) as Record<string, unknown>;
      expect((result.scope as Record<string, unknown>).tier).toBe('project');
      expect((result.scope as Record<string, unknown>).confidence).toBe('HIGH');
    });

    it('uses manual tier when provided', async () => {
      const result = (await findOp(ops, 'capture_quick').handler({
        type: 'pattern',
        domain: 'testing',
        title: 'Quick Pattern',
        description: 'A quick capture',
        tier: 'agent',
      })) as Record<string, unknown>;
      expect((result.scope as Record<string, unknown>).tier).toBe('agent');
      expect((result.scope as Record<string, unknown>).confidence).toBe('MANUAL');
    });

    it('handles governance proposal', async () => {
      vi.mocked(runtime.governance.evaluateCapture).mockReturnValue({
        action: 'propose',
        reason: 'Needs review',
      } as unknown);
      const result = (await findOp(ops, 'capture_quick').handler({
        type: 'pattern',
        domain: 'testing',
        title: 'Quick',
        description: 'test',
      })) as Record<string, unknown>;
      expect(result.captured).toBe(false);
      expect((result.governance as Record<string, unknown>).action).toBe('propose');
    });

    it('handles governance rejection', async () => {
      vi.mocked(runtime.governance.evaluateCapture).mockReturnValue({
        action: 'reject',
        reason: 'Blocked',
      } as unknown);
      const result = (await findOp(ops, 'capture_quick').handler({
        type: 'pattern',
        domain: 'testing',
        title: 'Quick',
        description: 'test',
      })) as Record<string, unknown>;
      expect(result.captured).toBe(false);
      expect((result.governance as Record<string, unknown>).action).toBe('reject');
    });

    it('handles duplicate detection', async () => {
      vi.mocked(runtime.brain.enrichAndCapture).mockReturnValue({
        blocked: true,
        duplicate: { id: 'existing-2' },
      } as unknown);
      const result = (await findOp(ops, 'capture_quick').handler({
        type: 'pattern',
        domain: 'testing',
        title: 'Dup',
        description: 'duplicate',
      })) as Record<string, unknown>;
      expect(result.captured).toBe(false);
      expect((result.governance as Record<string, unknown>).action).toBe('duplicate');
    });

    it('handles enrichAndCapture errors', async () => {
      vi.mocked(runtime.brain.enrichAndCapture).mockImplementation(() => {
        throw new Error('Brain down');
      });
      const result = (await findOp(ops, 'capture_quick').handler({
        type: 'pattern',
        domain: 'testing',
        title: 'Fail',
        description: 'fails',
      })) as Record<string, unknown>;
      expect(result.captured).toBe(false);
      expect((result.governance as Record<string, unknown>).action).toBe('error');
    });

    it('handles governance evaluation errors', async () => {
      vi.mocked(runtime.governance.evaluateCapture).mockImplementation(() => {
        throw new Error('Gov down');
      });
      const result = (await findOp(ops, 'capture_quick').handler({
        type: 'pattern',
        domain: 'testing',
        title: 'Fail',
        description: 'fails',
      })) as Record<string, unknown>;
      expect(result.captured).toBe(false);
      expect((result.governance as Record<string, unknown>).action).toBe('error');
    });
  });

  describe('search_intelligent', () => {
    it('searches vault via brain intelligent search', async () => {
      const result = (await findOp(ops, 'search_intelligent').handler({
        query: 'auth patterns',
      })) as Array<Record<string, unknown>>;
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].source).toBe('vault');
    });

    it('includes memories when flag is set', async () => {
      vi.mocked(runtime.vault.searchMemories).mockReturnValue([
        { id: 'm1', summary: 'Auth discussion', score: 0.5 },
      ] as unknown);
      const result = (await findOp(ops, 'search_intelligent').handler({
        query: 'auth',
        includeMemories: true,
      })) as Array<Record<string, unknown>>;
      expect(result.some((r) => r.source === 'memory')).toBe(true);
    });

    it('handles search failure gracefully', async () => {
      vi.mocked(runtime.brain.intelligentSearch).mockRejectedValue(new Error('Search down'));
      const result = (await findOp(ops, 'search_intelligent').handler({
        query: 'anything',
      })) as Array<Record<string, unknown>>;
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    it('respects limit parameter', async () => {
      const manyResults = Array.from({ length: 30 }, (_, i) => ({
        id: `r${i}`,
        score: 1 - i * 0.01,
      }));
      vi.mocked(runtime.brain.intelligentSearch).mockResolvedValue(manyResults as unknown);
      const result = (await findOp(ops, 'search_intelligent').handler({
        query: 'test',
        limit: 5,
      })) as Array<Record<string, unknown>>;
      expect(result.length).toBeLessThanOrEqual(5);
    });

    it('sorts results by score descending', async () => {
      vi.mocked(runtime.brain.intelligentSearch).mockResolvedValue([
        { id: 'low', score: 0.3 },
        { id: 'high', score: 0.9 },
      ] as unknown);
      const result = (await findOp(ops, 'search_intelligent').handler({
        query: 'test',
      })) as Array<Record<string, unknown>>;
      expect((result[0].score as number) >= (result[1].score as number)).toBe(true);
    });

    it('scan mode calls brain.scanSearch instead of intelligentSearch', async () => {
      const result = (await findOp(ops, 'search_intelligent').handler({
        query: 'test patterns',
        mode: 'scan',
      })) as Array<Record<string, unknown>>;
      expect(runtime.brain.scanSearch).toHaveBeenCalledWith(
        'test patterns',
        expect.objectContaining({ limit: 10 }),
      );
      expect(runtime.brain.intelligentSearch).not.toHaveBeenCalled();
      expect(Array.isArray(result)).toBe(true);
      expect(result[0].source).toBe('vault');
      expect(result[0].snippet).toBeDefined();
    });

    it('scan mode defaults limit to 10', async () => {
      await findOp(ops, 'search_intelligent').handler({
        query: 'test',
        mode: 'scan',
      });
      expect(runtime.brain.scanSearch).toHaveBeenCalledWith(
        'test',
        expect.objectContaining({ limit: 10 }),
      );
    });

    it('full mode (default) still uses intelligentSearch with limit 20', async () => {
      await findOp(ops, 'search_intelligent').handler({
        query: 'test',
      });
      expect(runtime.brain.intelligentSearch).toHaveBeenCalledWith(
        'test',
        expect.objectContaining({ limit: 20 }),
      );
      expect(runtime.brain.scanSearch).not.toHaveBeenCalled();
    });

    it('scan mode with includeMemories returns lightweight memory results', async () => {
      vi.mocked(runtime.vault.searchMemories).mockReturnValue([
        {
          id: 'm1',
          summary:
            'A long memory summary that should be truncated to 120 chars for scan mode lightweight results test',
          context: 'Auth context',
        },
      ] as unknown);
      const result = (await findOp(ops, 'search_intelligent').handler({
        query: 'auth',
        mode: 'scan',
        includeMemories: true,
      })) as Array<Record<string, unknown>>;
      const memResult = result.find((r) => r.source === 'memory');
      expect(memResult).toBeDefined();
      expect(memResult!.id).toBe('m1');
      expect(memResult!.snippet).toBeDefined();
      expect(typeof memResult!.snippet).toBe('string');
      // Should NOT have full memory fields
      expect(memResult!.filesModified).toBeUndefined();
      expect(memResult!.toolsUsed).toBeUndefined();
    });

    it('scan mode handles search failure gracefully', async () => {
      vi.mocked(runtime.brain.scanSearch).mockRejectedValue(new Error('Scan failed'));
      const result = (await findOp(ops, 'search_intelligent').handler({
        query: 'anything',
        mode: 'scan',
      })) as Array<Record<string, unknown>>;
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });
  });

  describe('search_feedback', () => {
    it('records positive feedback', async () => {
      const result = (await findOp(ops, 'search_feedback').handler({
        query: 'auth patterns',
        entryId: 'entry-1',
        helpful: true,
      })) as Record<string, unknown>;
      expect(result.recorded).toBe(true);
      expect(result.action).toBe('accepted');
      expect(runtime.brain.recordFeedback).toHaveBeenCalledWith(
        'auth patterns',
        'entry-1',
        'accepted',
      );
    });

    it('records negative feedback', async () => {
      const result = (await findOp(ops, 'search_feedback').handler({
        query: 'auth',
        entryId: 'entry-2',
        helpful: false,
      })) as Record<string, unknown>;
      expect(result.recorded).toBe(true);
      expect(result.action).toBe('dismissed');
    });

    it('handles feedback recording errors', async () => {
      vi.mocked(runtime.brain.recordFeedback).mockImplementation(() => {
        throw new Error('DB error');
      });
      const result = (await findOp(ops, 'search_feedback').handler({
        query: 'auth',
        entryId: 'entry-1',
        helpful: true,
      })) as Record<string, unknown>;
      expect(result.recorded).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('includes optional context', async () => {
      const result = (await findOp(ops, 'search_feedback').handler({
        query: 'auth',
        entryId: 'entry-1',
        helpful: true,
        context: 'Used for login flow',
      })) as Record<string, unknown>;
      expect(result.context).toBe('Used for login flow');
    });
  });
});
