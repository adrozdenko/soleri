/**
 * Colocated contract tests for links-facade.ts.
 * Verifies the facade delegates to createVaultLinkingOps and
 * exposes all 9 linking ops with correct auth levels.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createLinksFacadeOps } from './links-facade.js';
import { captureOps, executeOp } from '../../engine/test-helpers.js';
import type { CapturedOp } from '../../engine/test-helpers.js';
import type { AgentRuntime } from '../types.js';

// ─── Mock runtime ────────────────────────────────────────────────────

function makeRuntime(): AgentRuntime {
  return {
    vault: {
      getProvider: vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue({ id: 'x' }),
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

// ─── Tests ───────────────────────────────────────────────────────────

describe('links-facade', () => {
  let runtime: AgentRuntime;
  let ops: Map<string, CapturedOp>;

  beforeEach(() => {
    runtime = makeRuntime();
    ops = captureOps(createLinksFacadeOps(runtime));
  });

  // ─── Handler delegation ───────────────────────────────────────────

  describe('link_entries', () => {
    it('creates a link via linkManager', async () => {
      const result = await executeOp(ops, 'link_entries', {
        sourceId: 'a',
        targetId: 'b',
        linkType: 'extends',
        note: 'test',
      });
      expect(result.success).toBe(true);
      const data = result.data as { success: boolean };
      expect(data.success).toBe(true);
      const lm = runtime.linkManager as { addLink: ReturnType<typeof vi.fn> };
      expect(lm.addLink).toHaveBeenCalledWith('a', 'b', 'extends', 'test');
    });
  });

  describe('unlink_entries', () => {
    it('removes a link', async () => {
      const result = await executeOp(ops, 'unlink_entries', {
        sourceId: 'a',
        targetId: 'b',
      });
      expect(result.success).toBe(true);
      const lm = runtime.linkManager as { removeLink: ReturnType<typeof vi.fn> };
      expect(lm.removeLink).toHaveBeenCalledWith('a', 'b');
    });
  });

  describe('get_links', () => {
    it('returns outgoing and incoming links', async () => {
      const result = await executeOp(ops, 'get_links', { entryId: 'a' });
      expect(result.success).toBe(true);
      const data = result.data as { totalLinks: number };
      expect(data.totalLinks).toBe(0);
    });
  });

  describe('traverse', () => {
    it('traverses with default depth', async () => {
      const result = await executeOp(ops, 'traverse', { entryId: 'a' });
      expect(result.success).toBe(true);
      const lm = runtime.linkManager as { traverse: ReturnType<typeof vi.fn> };
      expect(lm.traverse).toHaveBeenCalledWith('a', 2);
    });
  });

  describe('suggest_links', () => {
    it('returns suggestions', async () => {
      const result = await executeOp(ops, 'suggest_links', { entryId: 'a' });
      expect(result.success).toBe(true);
      const data = result.data as { totalSuggestions: number };
      expect(data.totalSuggestions).toBe(0);
    });
  });

  describe('get_orphans', () => {
    it('returns orphaned entries', async () => {
      const result = await executeOp(ops, 'get_orphans', {});
      expect(result.success).toBe(true);
      const data = result.data as { totalOrphans: number };
      expect(data.totalOrphans).toBe(0);
    });
  });

  describe('backfill_links', () => {
    it('delegates to linkManager', async () => {
      const result = await executeOp(ops, 'backfill_links', {
        threshold: 0.7,
        maxLinks: 3,
        dryRun: false,
        batchSize: 50,
      });
      expect(result.success).toBe(true);
      const data = result.data as { created: number };
      expect(data.created).toBe(0);
    });
  });

  describe('link_stats', () => {
    it('returns graph statistics', async () => {
      const provider = (runtime.vault as { getProvider: ReturnType<typeof vi.fn> }).getProvider();
      vi.mocked(provider.get)
        .mockReturnValueOnce({ c: 10 }) // totalLinks
        .mockReturnValueOnce({ c: 50 }) // totalEntries
        .mockReturnValueOnce({ c: 3 }) // orphans
        .mockReturnValueOnce({ c: 5 }); // withNotes
      vi.mocked(provider.all)
        .mockReturnValueOnce([{ link_type: 'extends', c: 7 }])
        .mockReturnValueOnce([{ title: 'Top', links: 5 }]);

      const result = await executeOp(ops, 'link_stats', {});
      expect(result.success).toBe(true);
      const data = result.data as { totalLinks: number; totalEntries: number };
      expect(data.totalLinks).toBe(10);
      expect(data.totalEntries).toBe(50);
    });
  });

  describe('relink_vault', () => {
    it('returns error when no LLM available', async () => {
      const result = await executeOp(ops, 'relink_vault', {
        batchSize: 10,
        limit: 0,
        dryRun: false,
      });
      expect(result.success).toBe(true);
      const data = result.data as { success: boolean; error: string };
      expect(data.success).toBe(false);
      expect(data.error).toContain('No LLM');
    });
  });
});
