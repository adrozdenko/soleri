import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createVaultSharingOps } from './vault-sharing-ops.js';
import type { AgentRuntime } from './types.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../vault/scope-detector.js', () => ({
  detectScope: vi.fn().mockReturnValue({
    tier: 'project',
    confidence: 'HIGH',
    reason: 'project-specific pattern',
    signals: [],
  }),
}));

// ---------------------------------------------------------------------------
// Mock runtime
// ---------------------------------------------------------------------------

function mockRuntime(): AgentRuntime {
  return {
    config: { agentId: 'test-agent' },
    vault: {
      get: vi.fn(),
      seed: vi.fn(),
      getProvider: vi.fn().mockReturnValue({
        all: vi.fn().mockReturnValue([]),
        get: vi.fn(),
        run: vi.fn(),
      }),
    },
  } as unknown as AgentRuntime;
}

function findOp(ops: ReturnType<typeof createVaultSharingOps>, name: string) {
  const op = ops.find((o) => o.name === name);
  if (!op) throw new Error(`Op "${name}" not found`);
  return op;
}

// ---------------------------------------------------------------------------
// Tests — scope ops only (sync/review ops moved to separate files)
// ---------------------------------------------------------------------------

describe('createVaultSharingOps', () => {
  let rt: AgentRuntime;
  let ops: ReturnType<typeof createVaultSharingOps>;

  beforeEach(() => {
    vi.clearAllMocks();
    rt = mockRuntime();
    ops = createVaultSharingOps(rt);
  });

  it('returns 3 scope ops', () => {
    expect(ops.length).toBe(3);
  });

  it('has the expected op names', () => {
    const names = ops.map((o) => o.name);
    expect(names).toEqual(['vault_detect_scope', 'vault_set_scope', 'vault_list_by_scope']);
  });

  // ─── vault_detect_scope ───────────────────────────────────────

  describe('vault_detect_scope', () => {
    it('returns scope detection result', async () => {
      const op = findOp(ops, 'vault_detect_scope');
      const result = (await op.handler({
        title: 'Test pattern',
        description: 'A project-specific pattern',
      })) as Record<string, unknown>;
      expect(result.tier).toBe('project');
      expect(result.confidence).toBe('HIGH');
    });
  });

  // ─── vault_set_scope ──────────────────────────────────────────

  describe('vault_set_scope', () => {
    it('returns error when entry not found', async () => {
      const op = findOp(ops, 'vault_set_scope');
      vi.mocked(rt.vault.get).mockReturnValue(undefined as never);
      const result = (await op.handler({ id: 'missing', tier: 'team' })) as Record<
        string,
        unknown
      >;
      expect(result.error).toContain('not found');
    });

    it('updates scope tier on existing entry', async () => {
      const op = findOp(ops, 'vault_set_scope');
      vi.mocked(rt.vault.get).mockReturnValue({
        id: 'e1',
        title: 'Entry',
        tier: 'agent',
      } as never);
      const result = (await op.handler({ id: 'e1', tier: 'team' })) as Record<string, unknown>;
      expect(result.updated).toBe(true);
      expect(result.tier).toBe('team');
      expect(rt.vault.seed).toHaveBeenCalled();
    });
  });

  // ─── vault_list_by_scope ──────────────────────────────────────

  describe('vault_list_by_scope', () => {
    it('queries entries filtered by tier', async () => {
      const op = findOp(ops, 'vault_list_by_scope');
      const provider = rt.vault.getProvider();
      vi.mocked(provider.all).mockReturnValue([
        {
          id: 'e1',
          type: 'pattern',
          domain: 'general',
          title: 'Entry 1',
          severity: 'suggestion',
          description: 'desc',
          tier: 'team',
          tags: '["a"]',
        },
      ]);
      const result = (await op.handler({ tier: 'team' })) as Record<string, unknown>;
      expect(result.count).toBe(1);
      expect(result.tier).toBe('team');
    });
  });
});
