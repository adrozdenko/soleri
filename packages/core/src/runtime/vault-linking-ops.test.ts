import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createVaultLinkingOps } from './vault-linking-ops.js';
import type { AgentRuntime } from './types.js';

// ---------------------------------------------------------------------------
// Mock runtime
// ---------------------------------------------------------------------------

function mockRuntime(): AgentRuntime {
  return {
    vault: {
      getProvider: vi.fn().mockReturnValue({
        get: vi.fn(),
        all: vi.fn().mockReturnValue([]),
        run: vi.fn(),
      }),
    },
    linkManager: {
      addLink: vi.fn(),
      removeLink: vi.fn(),
      getLinks: vi.fn().mockReturnValue([]),
      getBacklinks: vi.fn().mockReturnValue([]),
      getLinkCount: vi.fn().mockReturnValue(1),
      traverse: vi.fn().mockReturnValue([]),
      suggestLinks: vi.fn().mockReturnValue([]),
      getOrphans: vi.fn().mockReturnValue([]),
      backfillLinks: vi.fn().mockReturnValue({ created: 0, preview: [] }),
    },
    llmClient: {
      isAvailable: vi.fn().mockReturnValue({ anthropic: false, openai: false }),
      complete: vi.fn(),
    },
  } as unknown as AgentRuntime;
}

function findOp(ops: ReturnType<typeof createVaultLinkingOps>, name: string) {
  const op = ops.find((o) => o.name === name);
  if (!op) throw new Error(`Op "${name}" not found`);
  return op;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createVaultLinkingOps', () => {
  let rt: AgentRuntime;
  let ops: ReturnType<typeof createVaultLinkingOps>;

  beforeEach(() => {
    rt = mockRuntime();
    ops = createVaultLinkingOps(rt);
  });

  it('returns 9 ops', () => {
    expect(ops.length).toBe(9);
  });

  // ─── link_entries ─────────────────────────────────────────────

  describe('link_entries', () => {
    it('throws when source entry does not exist', async () => {
      const op = findOp(ops, 'link_entries');
      const provider = rt.vault.getProvider();
      vi.mocked(provider.get).mockReturnValue(undefined);
      await expect(
        op.handler({ sourceId: 'missing', targetId: 'b', linkType: 'supports' }),
      ).rejects.toThrow('Entry not found');
    });

    it('creates link when both entries exist', async () => {
      const op = findOp(ops, 'link_entries');
      const provider = rt.vault.getProvider();
      vi.mocked(provider.get).mockReturnValue({ id: 'x' });
      const result = (await op.handler({
        sourceId: 'a',
        targetId: 'b',
        linkType: 'extends',
        note: 'test note',
      })) as Record<string, unknown>;
      expect(result.success).toBe(true);
      expect(rt.linkManager.addLink).toHaveBeenCalledWith('a', 'b', 'extends', 'test note');
    });
  });

  // ─── unlink_entries ───────────────────────────────────────────

  describe('unlink_entries', () => {
    it('removes a link and returns success', async () => {
      const op = findOp(ops, 'unlink_entries');
      const result = (await op.handler({
        sourceId: 'a',
        targetId: 'b',
      })) as Record<string, unknown>;
      expect(result.success).toBe(true);
      expect(rt.linkManager.removeLink).toHaveBeenCalledWith('a', 'b');
    });
  });

  // ─── get_links ────────────────────────────────────────────────

  describe('get_links', () => {
    it('returns outgoing and incoming links', async () => {
      const op = findOp(ops, 'get_links');
      vi.mocked(rt.linkManager.getLinks).mockReturnValue([
        { sourceId: 'a', targetId: 'b', linkType: 'supports' },
      ] as never);
      vi.mocked(rt.linkManager.getBacklinks).mockReturnValue([
        { sourceId: 'c', targetId: 'a', linkType: 'extends' },
      ] as never);
      const result = (await op.handler({ entryId: 'a' })) as Record<string, unknown>;
      expect(result.totalLinks).toBe(2);
      expect(result.entryId).toBe('a');
    });
  });

  // ─── traverse ─────────────────────────────────────────────────

  describe('traverse', () => {
    it('walks graph from entry with default depth', async () => {
      const op = findOp(ops, 'traverse');
      vi.mocked(rt.linkManager.traverse).mockReturnValue([{ id: 'b' }] as never);
      const result = (await op.handler({ entryId: 'a' })) as Record<string, unknown>;
      expect(result.totalConnected).toBe(1);
      expect(rt.linkManager.traverse).toHaveBeenCalledWith('a', 2);
    });

    it('uses provided depth', async () => {
      const op = findOp(ops, 'traverse');
      vi.mocked(rt.linkManager.traverse).mockReturnValue([] as never);
      await op.handler({ entryId: 'a', depth: 4 });
      expect(rt.linkManager.traverse).toHaveBeenCalledWith('a', 4);
    });
  });

  // ─── suggest_links ────────────────────────────────────────────

  describe('suggest_links', () => {
    it('returns suggestions from linkManager', async () => {
      const op = findOp(ops, 'suggest_links');
      vi.mocked(rt.linkManager.suggestLinks).mockReturnValue([
        { entryId: 'b', score: 0.9, reason: 'similar tags' },
      ] as never);
      const result = (await op.handler({ entryId: 'a', limit: 5 })) as Record<string, unknown>;
      expect(result.totalSuggestions).toBe(1);
    });
  });

  // ─── get_orphans ──────────────────────────────────────────────

  describe('get_orphans', () => {
    it('returns orphaned entries', async () => {
      const op = findOp(ops, 'get_orphans');
      vi.mocked(rt.linkManager.getOrphans).mockReturnValue([{ id: 'orphan1' }] as never);
      const result = (await op.handler({ limit: 20 })) as Record<string, unknown>;
      expect(result.totalOrphans).toBe(1);
    });
  });

  // ─── relink_vault ─────────────────────────────────────────────

  describe('relink_vault', () => {
    it('returns error when no LLM provider available', async () => {
      const op = findOp(ops, 'relink_vault');
      const result = (await op.handler({ batchSize: 10, limit: 0, dryRun: false })) as Record<
        string,
        unknown
      >;
      expect(result.success).toBe(false);
      expect(result.error).toContain('No LLM');
    });

    it('returns dry run preview without modifying links', async () => {
      const op = findOp(ops, 'relink_vault');
      vi.mocked(rt.llmClient.isAvailable).mockReturnValue({ anthropic: true, openai: false });
      const provider = rt.vault.getProvider();
      vi.mocked(provider.get).mockReturnValue({ c: 0 });
      vi.mocked(provider.all).mockReturnValue([]);
      const result = (await op.handler({ batchSize: 10, limit: 0, dryRun: true })) as Record<
        string,
        unknown
      >;
      expect(result.dryRun).toBe(true);
      expect(provider.run).not.toHaveBeenCalled();
    });
  });

  // ─── backfill_links ───────────────────────────────────────────

  describe('backfill_links', () => {
    it('delegates to linkManager.backfillLinks', async () => {
      const op = findOp(ops, 'backfill_links');
      vi.mocked(rt.linkManager.backfillLinks).mockReturnValue({
        created: 5,
        preview: [{ sourceId: 'a', targetId: 'b' }],
      } as never);
      const result = (await op.handler({
        threshold: 0.7,
        maxLinks: 3,
        dryRun: false,
        batchSize: 50,
      })) as Record<string, unknown>;
      expect(result.created).toBe(5);
    });
  });

  // ─── link_stats ───────────────────────────────────────────────

  describe('link_stats', () => {
    it('returns graph statistics from vault', async () => {
      const op = findOp(ops, 'link_stats');
      const provider = rt.vault.getProvider();
      vi.mocked(provider.get)
        .mockReturnValueOnce({ c: 42 }) // totalLinks
        .mockReturnValueOnce({ c: 100 }) // totalEntries
        .mockReturnValueOnce({ c: 5 }) // orphans
        .mockReturnValueOnce({ c: 30 }); // withNotes
      vi.mocked(provider.all)
        .mockReturnValueOnce([{ link_type: 'extends', c: 20 }]) // byType
        .mockReturnValueOnce([{ title: 'Top Entry', links: 10 }]); // mostConnected
      const result = (await op.handler({})) as Record<string, unknown>;
      expect(result.totalLinks).toBe(42);
      expect(result.totalEntries).toBe(100);
      expect(result.orphans).toBe(5);
    });

    it('returns zeros on provider error', async () => {
      const op = findOp(ops, 'link_stats');
      const provider = rt.vault.getProvider();
      vi.mocked(provider.get).mockImplementation(() => {
        throw new Error('DB error');
      });
      const result = (await op.handler({})) as Record<string, unknown>;
      expect(result.totalLinks).toBe(0);
    });
  });
});
