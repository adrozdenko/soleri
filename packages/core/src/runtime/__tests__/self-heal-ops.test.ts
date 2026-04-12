import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSelfHealOps } from '../self-heal-ops.js';
import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function mockRuntime(): AgentRuntime {
  return {
    curator: {
      healthAudit: vi.fn().mockReturnValue({
        score: 72,
        metrics: { coverage: 0.8, freshness: 0.9, quality: 0.7, tagHealth: 0.6 },
        recommendations: ['Tag some untagged entries'],
      }),
      groomAll: vi.fn().mockReturnValue({ groomed: 5, staleCount: 2 }),
      detectDuplicates: vi.fn().mockReturnValue([{ entryA: 'a1', entryB: 'a2', similarity: 0.92 }]),
      detectContradictions: vi
        .fn()
        .mockReturnValue([{ entryA: 'c1', entryB: 'c2', type: 'contradicts' }]),
      consolidate: vi.fn().mockReturnValue({ duplicates: 1, stale: 2, durationMs: 15 }),
    },
    linkManager: {
      backfillLinks: vi.fn().mockReturnValue({ processed: 3, linksCreated: 2, durationMs: 20 }),
    },
    vault: {
      getProvider: vi.fn().mockImplementation(() => {
        // OperationLogger constructor calls ensureTable → execSql
        // Provide a minimal provider that won't crash
        return {
          execSql: vi.fn(),
          runSql: vi.fn(),
          getSql: vi.fn(),
          allSql: vi.fn(),
        };
      }),
    },
  } as unknown as AgentRuntime;
}

function findOp(ops: OpDefinition[], name: string): OpDefinition {
  const op = ops.find((o) => o.name === name);
  if (!op) throw new Error(`Op "${name}" not found`);
  return op;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('createSelfHealOps', () => {
  let runtime: AgentRuntime;
  let ops: OpDefinition[];
  let healOp: OpDefinition;

  beforeEach(() => {
    runtime = mockRuntime();
    ops = createSelfHealOps(runtime);
    healOp = findOp(ops, 'vault_self_heal');
  });

  it('returns a result with healthBefore and healthAfter scores', async () => {
    // healthAudit is called twice (before and after), return different scores
    const healthAudit = vi.mocked(runtime.curator.healthAudit);
    healthAudit
      .mockReturnValueOnce({ score: 65, metrics: {}, recommendations: [] })
      .mockReturnValueOnce({ score: 80, metrics: {}, recommendations: ['Keep it up'] });

    const result = (await healOp.handler({})) as Record<string, unknown>;

    expect(result.healthBefore).toBe(65);
    expect(result.healthAfter).toBe(80);
  });

  it('dry-run mode (default) does NOT call curator.consolidate', async () => {
    await healOp.handler({});

    expect(runtime.curator.consolidate).not.toHaveBeenCalled();
  });

  it('live mode (dryRun=false) DOES call curator.consolidate', async () => {
    await healOp.handler({ dryRun: false });

    expect(runtime.curator.consolidate).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: false }),
    );
  });

  it('includes grooming results', async () => {
    const result = (await healOp.handler({})) as Record<string, unknown>;

    expect(result.grooming).toEqual({ groomed: 5, staleCount: 2 });
    expect(runtime.curator.groomAll).toHaveBeenCalled();
  });

  it('includes duplicate detection results', async () => {
    const result = (await healOp.handler({})) as Record<string, unknown>;

    expect(result.duplicates).toEqual([{ entryA: 'a1', entryB: 'a2', similarity: 0.92 }]);
    expect(runtime.curator.detectDuplicates).toHaveBeenCalled();
  });

  it('includes contradiction detection results', async () => {
    const result = (await healOp.handler({})) as Record<string, unknown>;

    expect(result.contradictions).toEqual([{ entryA: 'c1', entryB: 'c2', type: 'contradicts' }]);
    expect(runtime.curator.detectContradictions).toHaveBeenCalled();
  });

  it('handles missing linkManager gracefully (no crash)', async () => {
    // Create runtime without linkManager
    const runtimeNoLinks = {
      ...runtime,
      linkManager: undefined,
    } as unknown as AgentRuntime;

    const opsNoLinks = createSelfHealOps(runtimeNoLinks);
    const op = findOp(opsNoLinks, 'vault_self_heal');

    const result = (await op.handler({})) as Record<string, unknown>;

    expect(result.linksCreated).toBe(0);
    // Should not throw
    expect(result.healthBefore).toBeDefined();
    expect(result.healthAfter).toBeDefined();
  });

  it('returns durationMs > 0', async () => {
    const result = (await healOp.handler({})) as Record<string, unknown>;

    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs as number).toBeGreaterThanOrEqual(0);
  });
});
