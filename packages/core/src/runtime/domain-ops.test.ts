/**
 * Colocated unit tests for domain-ops.ts — mock-based, no real DB.
 */

import { describe, it, expect, vi } from 'vitest';
import { createDomainFacade, createDomainFacades } from './domain-ops.js';
import type { AgentRuntime } from './types.js';
import type { DomainPack } from '../domain-packs/types.js';

function mockRuntime() {
  return {
    vault: {
      list: vi.fn().mockReturnValue([]),
      search: vi.fn().mockReturnValue([]),
      get: vi.fn().mockReturnValue(null),
      remove: vi.fn().mockReturnValue(true),
    },
    brain: {
      intelligentSearch: vi.fn().mockResolvedValue([]),
      enrichAndCapture: vi.fn().mockReturnValue({ captured: true, id: 'cap-1', autoTags: [] }),
    },
    governance: {
      evaluateCapture: vi.fn().mockReturnValue({ action: 'capture' }),
      propose: vi.fn().mockReturnValue(1),
    },
  } as unknown as AgentRuntime;
}

describe('createDomainFacade', () => {
  it('creates a facade with correct name for simple domain', () => {
    const facade = createDomainFacade(mockRuntime(), 'agent1', 'security');
    expect(facade.name).toBe('agent1_security');
  });

  it('replaces hyphens with underscores in facade name', () => {
    const facade = createDomainFacade(mockRuntime(), 'agent1', 'api-design');
    expect(facade.name).toBe('agent1_api_design');
  });

  it('capitalizes domain in description', () => {
    const facade = createDomainFacade(mockRuntime(), 'agent1', 'security');
    expect(facade.description).toContain('Security');
  });

  it('creates exactly 5 standard ops', () => {
    const facade = createDomainFacade(mockRuntime(), 'agent1', 'testing');
    expect(facade.ops).toHaveLength(5);
    expect(facade.ops.map((o) => o.name)).toEqual([
      'get_patterns',
      'search',
      'get_entry',
      'capture',
      'remove',
    ]);
  });

  describe('get_patterns', () => {
    it('scopes list call to domain', async () => {
      const rt = mockRuntime();
      const facade = createDomainFacade(rt, 'a', 'security');
      const op = facade.ops.find((o) => o.name === 'get_patterns')!;
      await op.handler({ tags: ['auth'], severity: 'critical', limit: 5 });
      expect(rt.vault.list).toHaveBeenCalledWith({
        domain: 'security',
        severity: 'critical',
        type: undefined,
        tags: ['auth'],
        limit: 5,
      });
    });

    it('defaults limit to 20', async () => {
      const rt = mockRuntime();
      const facade = createDomainFacade(rt, 'a', 'testing');
      await facade.ops.find((o) => o.name === 'get_patterns')!.handler({});
      const args = (rt.vault.list as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(args.limit).toBe(20);
    });
  });

  describe('search', () => {
    it('uses brain.intelligentSearch scoped to domain', async () => {
      const rt = mockRuntime();
      (rt.brain.intelligentSearch as ReturnType<typeof vi.fn>).mockResolvedValue([{ entry: {} }]);
      const facade = createDomainFacade(rt, 'a', 'security');
      await facade.ops.find((o) => o.name === 'search')!.handler({ query: 'auth patterns' });
      expect(rt.brain.intelligentSearch).toHaveBeenCalledWith('auth patterns', {
        domain: 'security',
        tags: undefined,
        limit: 10,
      });
    });

    it('falls back to vault FTS when brain returns empty', async () => {
      const rt = mockRuntime();
      (rt.brain.intelligentSearch as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (rt.vault.search as ReturnType<typeof vi.fn>).mockReturnValue([{ entry: { id: 'e1' } }]);
      const facade = createDomainFacade(rt, 'a', 'security');
      const results = (await facade.ops
        .find((o) => o.name === 'search')!
        .handler({
          query: 'test',
        })) as unknown[];
      expect(rt.vault.search).toHaveBeenCalledWith('test', { domain: 'security', limit: 10 });
      expect(results).toHaveLength(1);
    });
  });

  describe('get_entry', () => {
    it('returns entry from vault', async () => {
      const rt = mockRuntime();
      (rt.vault.get as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'x', title: 'Found' });
      const facade = createDomainFacade(rt, 'a', 'testing');
      const result = await facade.ops.find((o) => o.name === 'get_entry')!.handler({ id: 'x' });
      expect(result).toEqual({ id: 'x', title: 'Found' });
    });

    it('returns error object for missing entry', async () => {
      const rt = mockRuntime();
      const facade = createDomainFacade(rt, 'a', 'testing');
      const result = (await facade.ops
        .find((o) => o.name === 'get_entry')!
        .handler({
          id: 'missing',
        })) as { error: string };
      expect(result.error).toContain('missing');
    });
  });

  describe('capture', () => {
    it('calls brain.enrichAndCapture when governance allows', async () => {
      const rt = mockRuntime();
      const facade = createDomainFacade(rt, 'a', 'security');
      const result = (await facade.ops
        .find((o) => o.name === 'capture')!
        .handler({
          id: 'new-1',
          type: 'pattern',
          title: 'Test',
          severity: 'warning',
          description: 'desc',
          tags: ['x'],
        })) as { captured: boolean; governance: { action: string } };
      expect(rt.brain.enrichAndCapture).toHaveBeenCalledOnce();
      expect(result.governance.action).toBe('capture');
    });

    it('creates proposal when governance says propose', async () => {
      const rt = mockRuntime();
      (rt.governance.evaluateCapture as ReturnType<typeof vi.fn>).mockReturnValue({
        action: 'propose',
        reason: 'needs review',
      });
      const facade = createDomainFacade(rt, 'a', 'security');
      const result = (await facade.ops
        .find((o) => o.name === 'capture')!
        .handler({
          id: 'p1',
          type: 'pattern',
          title: 'Proposed',
          severity: 'warning',
          description: 'desc',
          tags: [],
        })) as { captured: boolean; governance: { action: string; proposalId: number } };
      expect(result.captured).toBe(false);
      expect(result.governance.action).toBe('propose');
      expect(result.governance.proposalId).toBe(1);
    });

    it('returns reject for rejected captures', async () => {
      const rt = mockRuntime();
      (rt.governance.evaluateCapture as ReturnType<typeof vi.fn>).mockReturnValue({
        action: 'reject',
        reason: 'quota exceeded',
      });
      const facade = createDomainFacade(rt, 'a', 'security');
      const result = (await facade.ops
        .find((o) => o.name === 'capture')!
        .handler({
          id: 'r1',
          type: 'rule',
          title: 'Rejected',
          severity: 'warning',
          description: 'desc',
          tags: [],
        })) as { captured: boolean; governance: { action: string; reason: string } };
      expect(result.captured).toBe(false);
      expect(result.governance.action).toBe('reject');
      expect(result.governance.reason).toBe('quota exceeded');
    });
  });

  describe('remove', () => {
    it('returns removed status', async () => {
      const rt = mockRuntime();
      const facade = createDomainFacade(rt, 'a', 'testing');
      const result = (await facade.ops
        .find((o) => o.name === 'remove')!
        .handler({
          id: 'del-1',
        })) as { removed: boolean; id: string };
      expect(result.removed).toBe(true);
      expect(result.id).toBe('del-1');
    });

    it('has admin auth', () => {
      const facade = createDomainFacade(mockRuntime(), 'a', 'testing');
      expect(facade.ops.find((o) => o.name === 'remove')!.auth).toBe('admin');
    });
  });
});

describe('createDomainFacades', () => {
  it('creates one facade per domain', () => {
    const facades = createDomainFacades(mockRuntime(), 'ag', ['a', 'b', 'c']);
    expect(facades).toHaveLength(3);
    expect(facades.map((f) => f.name)).toEqual(['ag_a', 'ag_b', 'ag_c']);
  });

  it('returns empty array for empty domains', () => {
    expect(createDomainFacades(mockRuntime(), 'ag', [])).toEqual([]);
  });

  describe('with domain packs', () => {
    it('merges pack ops with standard ops (pack ops take priority)', () => {
      const packOp = {
        name: 'search',
        description: 'Custom search',
        auth: 'read' as const,
        handler: vi.fn(),
      };
      const pack: DomainPack = {
        name: 'test-pack',
        version: '1.0.0',
        domains: ['security'],
        ops: [packOp],
      };
      const facades = createDomainFacades(mockRuntime(), 'ag', ['security'], [pack]);
      const secFacade = facades.find((f) => f.name === 'ag_security')!;
      const searchOp = secFacade.ops.find((o) => o.name === 'search')!;
      expect(searchOp.handler).toBe(packOp.handler);
      // Standard ops that aren't overridden should still be present
      expect(secFacade.ops.some((o) => o.name === 'get_patterns')).toBe(true);
    });

    it('adds standalone facades with agentId prefix', () => {
      const standaloneFacade = {
        name: 'color_check',
        description: 'Color tools',
        ops: [{ name: 'check', description: 'Check', auth: 'read' as const, handler: vi.fn() }],
      };
      const pack: DomainPack = {
        name: 'design-pack',
        version: '1.0.0',
        domains: ['design'],
        ops: [],
        facades: [standaloneFacade],
      };
      const facades = createDomainFacades(mockRuntime(), 'ag', ['design'], [pack]);
      const standalone = facades.find((f) => f.name === 'ag_color_check');
      expect(standalone).toBeDefined();
    });

    it('does not affect unclaimed domains', () => {
      const pack: DomainPack = {
        name: 'only-security',
        version: '1.0.0',
        domains: ['security'],
        ops: [{ name: 'custom', description: 'X', auth: 'read' as const, handler: vi.fn() }],
      };
      const facades = createDomainFacades(mockRuntime(), 'ag', ['security', 'testing'], [pack]);
      const testingFacade = facades.find((f) => f.name === 'ag_testing')!;
      // Testing domain should have standard 5 ops only
      expect(testingFacade.ops).toHaveLength(5);
      expect(testingFacade.ops.some((o) => o.name === 'custom')).toBe(false);
    });
  });
});
