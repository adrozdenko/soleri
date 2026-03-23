/**
 * Colocated contract tests for vault-facade.ts.
 * Tests the inline ops defined directly in createVaultFacadeOps.
 * Satellite ops (vault-extra-ops, capture-ops, intake-ops, etc.) have their own tests.
 * All runtime dependencies are mocked.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createVaultFacadeOps } from './vault-facade.js';
import { captureOps, executeOp } from '../../engine/test-helpers.js';
import type { CapturedOp } from '../../engine/test-helpers.js';
import type { AgentRuntime } from '../types.js';

// ─── Mock factories ──────────────────────────────────────────────────

function makeMockVault() {
  return {
    stats: vi.fn().mockReturnValue({
      totalEntries: 25,
      byType: { pattern: 15, 'anti-pattern': 5, rule: 3, playbook: 2 },
      byDomain: { design: 10, architecture: 8, general: 7 },
    }),
    list: vi.fn().mockReturnValue([
      { id: 'e1', title: 'Token naming', type: 'pattern', domain: 'design', tags: ['tokens'] },
      { id: 'e2', title: 'No inline styles', type: 'rule', domain: 'css', tags: ['style'] },
    ]),
    add: vi.fn(),
    get: vi.fn().mockReturnValue(null),
    remove: vi.fn().mockReturnValue(true),
    update: vi.fn().mockReturnValue(true),
    seed: vi.fn().mockReturnValue(3),
    getTags: vi.fn().mockReturnValue([{ tag: 'tokens', count: 5 }]),
    getDomains: vi.fn().mockReturnValue([{ domain: 'design', count: 10 }]),
    getRecent: vi.fn().mockReturnValue([]),
    exportAll: vi.fn().mockReturnValue({ entries: [] }),
    getAgeReport: vi.fn().mockReturnValue({ buckets: [], oldestTimestamp: null }),
    getDb: vi.fn().mockReturnValue({ prepare: vi.fn().mockReturnValue({ all: vi.fn().mockReturnValue([]) }) }),
    searchMemories: vi.fn().mockReturnValue([]),
    isAutoLinkEnabled: vi.fn().mockReturnValue(false),
    setTemporal: vi.fn().mockReturnValue(true),
    findExpiring: vi.fn().mockReturnValue([]),
    findExpired: vi.fn().mockReturnValue([]),
    archive: vi.fn().mockReturnValue({ archived: 0 }),
    restore: vi.fn().mockReturnValue(true),
    optimize: vi.fn().mockReturnValue({ success: true }),
    findByContentHash: vi.fn().mockReturnValue(null),
    contentHashStats: vi.fn().mockReturnValue({ total: 10, hashed: 10, uniqueHashes: 8 }),
    bulkRemove: vi.fn().mockReturnValue(2),
    close: vi.fn(),
  };
}

function makeMockBrain() {
  return {
    intelligentSearch: vi.fn().mockResolvedValue([
      { id: 'e1', title: 'Result 1', score: 0.9 },
    ]),
    scanSearch: vi.fn().mockResolvedValue([
      { id: 'e1', title: 'Result 1', score: 0.8 },
    ]),
    loadEntries: vi.fn().mockReturnValue([
      { id: 'e1', title: 'Full entry', type: 'pattern' },
    ]),
    enrichAndCapture: vi.fn().mockReturnValue({
      captured: true, id: 'cap-1', autoTags: ['auto'], duplicate: null,
    }),
    recordFeedback: vi.fn(),
  };
}

function makeMockVaultManager() {
  return {
    open: vi.fn(),
    disconnect: vi.fn().mockReturnValue(true),
    listTiers: vi.fn().mockReturnValue([
      { tier: 'agent', connected: true, entries: 25 },
    ]),
    search: vi.fn().mockReturnValue([
      { id: 'e1', tier: 'agent', score: 0.9 },
    ]),
    connect: vi.fn(),
    disconnectNamed: vi.fn().mockReturnValue(true),
    listConnected: vi.fn().mockReturnValue([
      { name: 'team-shared', priority: 0.5 },
    ]),
  };
}

function makeMockVaultBranching() {
  return {
    branch: vi.fn(),
    addOperation: vi.fn(),
    listBranches: vi.fn().mockReturnValue([{ name: 'experiment', ops: 3 }]),
    merge: vi.fn().mockReturnValue({ merged: true, applied: 3 }),
    deleteBranch: vi.fn().mockReturnValue(true),
  };
}

function makeMockIntakePipeline() {
  return {
    ingestBook: vi.fn().mockReturnValue({ jobId: 'j1' }),
    processChunks: vi.fn().mockReturnValue({ processed: 5 }),
    getJob: vi.fn().mockReturnValue({ id: 'j1', status: 'pending' }),
    getChunks: vi.fn().mockReturnValue([]),
    listJobs: vi.fn().mockReturnValue([]),
    preview: vi.fn().mockReturnValue({ entries: [] }),
  };
}

function makeMockTextIngester() {
  return {
    ingestUrl: vi.fn().mockResolvedValue({ ingested: 3, duplicates: 1 }),
    ingestText: vi.fn().mockResolvedValue({ ingested: 2 }),
    ingestBatch: vi.fn().mockResolvedValue({ ingested: 5, items: 3 }),
  };
}

function makeMockGovernance() {
  return {
    evaluateCapture: vi.fn().mockReturnValue({ action: 'capture' }),
    propose: vi.fn(),
  };
}

function makeMockLinkManager() {
  return {
    suggestLinks: vi.fn().mockReturnValue([]),
    addLink: vi.fn(),
    removeLink: vi.fn().mockReturnValue(true),
    getLinks: vi.fn().mockReturnValue([]),
    traverse: vi.fn().mockReturnValue([]),
    getOrphans: vi.fn().mockReturnValue([]),
    getStats: vi.fn().mockReturnValue({ totalLinks: 0 }),
  };
}

function makeMockKnowledgeReview() {
  return {
    submit: vi.fn().mockReturnValue({ id: 'rev-1' }),
    list: vi.fn().mockReturnValue([]),
    approve: vi.fn().mockReturnValue(true),
    reject: vi.fn().mockReturnValue(true),
  };
}

function makeRuntime(overrides: Partial<Record<string, unknown>> = {}): AgentRuntime {
  return {
    vault: makeMockVault(),
    brain: makeMockBrain(),
    vaultManager: makeMockVaultManager(),
    vaultBranching: makeMockVaultBranching(),
    intakePipeline: makeMockIntakePipeline(),
    textIngester: makeMockTextIngester(),
    governance: makeMockGovernance(),
    linkManager: makeMockLinkManager(),
    knowledgeReview: makeMockKnowledgeReview(),
    config: { agentId: 'test-agent' },
    ...overrides,
  } as unknown as AgentRuntime;
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('vault-facade', () => {
  let runtime: AgentRuntime;
  let ops: Map<string, CapturedOp>;

  beforeEach(() => {
    runtime = makeRuntime();
    ops = captureOps(createVaultFacadeOps(runtime));
  });

  // ─── Registration ─────────────────────────────────────────────────

  it('registers ops from all groups', () => {
    // The facade includes inline ops + satellite ops from 5 modules.
    // We check the inline ops explicitly, satellite ops just need to exist.
    expect(ops.size).toBeGreaterThan(30);
  });

  it('includes core inline op names', () => {
    const coreOps = [
      'search', 'load_entries', 'vault_stats', 'list_all', 'export',
      'capture_enriched', 'vault_connect', 'vault_disconnect', 'vault_tiers',
      'vault_search_all', 'vault_connect_source', 'vault_disconnect_source',
      'vault_list_sources', 'vault_branch', 'vault_branch_add',
      'vault_branch_list', 'vault_merge_branch', 'vault_delete_branch',
    ];
    for (const name of coreOps) {
      expect(ops.has(name), `missing op: ${name}`).toBe(true);
    }
  });

  it('includes satellite ops', () => {
    // Spot-check a few ops from each satellite module
    expect(ops.has('vault_get')).toBe(true);        // vault-extra-ops
    expect(ops.has('capture_knowledge')).toBe(true); // capture-ops
    expect(ops.has('search_intelligent')).toBe(true); // capture-ops
    expect(ops.has('link_entries')).toBe(true);       // vault-linking-ops
  });

  // ─── Auth levels ─────────────────────────────────────────────────

  it('has correct auth levels for inline ops', () => {
    expect(ops.get('search')!.auth).toBe('read');
    expect(ops.get('load_entries')!.auth).toBe('read');
    expect(ops.get('vault_stats')!.auth).toBe('read');
    expect(ops.get('list_all')!.auth).toBe('read');
    expect(ops.get('export')!.auth).toBe('read');
    expect(ops.get('capture_enriched')!.auth).toBe('write');
    expect(ops.get('vault_connect')!.auth).toBe('admin');
    expect(ops.get('vault_disconnect')!.auth).toBe('admin');
    expect(ops.get('vault_tiers')!.auth).toBe('read');
    expect(ops.get('vault_search_all')!.auth).toBe('read');
    expect(ops.get('vault_connect_source')!.auth).toBe('admin');
    expect(ops.get('vault_disconnect_source')!.auth).toBe('admin');
    expect(ops.get('vault_list_sources')!.auth).toBe('read');
    expect(ops.get('vault_branch')!.auth).toBe('write');
    expect(ops.get('vault_branch_add')!.auth).toBe('write');
    expect(ops.get('vault_branch_list')!.auth).toBe('read');
    expect(ops.get('vault_merge_branch')!.auth).toBe('admin');
    expect(ops.get('vault_delete_branch')!.auth).toBe('admin');
  });

  // ─── search ────────────────────────────────────────────────────────

  describe('search', () => {
    it('performs full search by default', async () => {
      const result = await executeOp(ops, 'search', { query: 'tokens' });
      expect(result.success).toBe(true);
      const brain = runtime.brain as ReturnType<typeof makeMockBrain>;
      expect(brain.intelligentSearch).toHaveBeenCalledWith('tokens', {
        domain: undefined, type: undefined, severity: undefined,
        tags: undefined, limit: 10,
      });
    });

    it('uses scan mode when specified', async () => {
      const result = await executeOp(ops, 'search', {
        query: 'tokens', mode: 'scan',
      });
      expect(result.success).toBe(true);
      const brain = runtime.brain as ReturnType<typeof makeMockBrain>;
      expect(brain.scanSearch).toHaveBeenCalledWith('tokens', expect.objectContaining({
        limit: 10,
      }));
      expect(brain.intelligentSearch).not.toHaveBeenCalled();
    });

    it('passes all filter params', async () => {
      await executeOp(ops, 'search', {
        query: 'test', domain: 'design', type: 'pattern',
        severity: 'critical', tags: ['a11y'], limit: 5, mode: 'full',
      });
      const brain = runtime.brain as ReturnType<typeof makeMockBrain>;
      expect(brain.intelligentSearch).toHaveBeenCalledWith('test', {
        domain: 'design', type: 'pattern', severity: 'critical',
        tags: ['a11y'], limit: 5,
      });
    });
  });

  // ─── load_entries ──────────────────────────────────────────────────

  describe('load_entries', () => {
    it('loads entries by ids', async () => {
      const result = await executeOp(ops, 'load_entries', {
        ids: ['e1', 'e2'],
      });
      expect(result.success).toBe(true);
      const brain = runtime.brain as ReturnType<typeof makeMockBrain>;
      expect(brain.loadEntries).toHaveBeenCalledWith(['e1', 'e2']);
    });

    it('rejects empty ids array', async () => {
      const result = await executeOp(ops, 'load_entries', { ids: [] });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid params');
    });
  });

  // ─── vault_stats ───────────────────────────────────────────────────

  describe('vault_stats', () => {
    it('returns vault statistics', async () => {
      const result = await executeOp(ops, 'vault_stats', {});
      expect(result.success).toBe(true);
      const data = result.data as { totalEntries: number };
      expect(data.totalEntries).toBe(25);
    });
  });

  // ─── list_all ──────────────────────────────────────────────────────

  describe('list_all', () => {
    it('returns lightweight summaries by default', async () => {
      const result = await executeOp(ops, 'list_all', {});
      expect(result.success).toBe(true);
      const data = result.data as Array<{ id: string; title: string; tags: string[] }>;
      expect(data).toHaveLength(2);
      expect(data[0].id).toBe('e1');
      expect(data[0].title).toBe('Token naming');
      expect(data[0].tags).toEqual(['tokens']);
      // Ensure description is NOT in the lightweight summary
      expect((data[0] as Record<string, unknown>).description).toBeUndefined();
    });

    it('returns verbose entries when requested', async () => {
      const result = await executeOp(ops, 'list_all', { verbose: true });
      expect(result.success).toBe(true);
      const vault = runtime.vault as ReturnType<typeof makeMockVault>;
      expect(vault.list).toHaveBeenCalled();
    });

    it('uses default pagination', async () => {
      await executeOp(ops, 'list_all', {});
      const vault = runtime.vault as ReturnType<typeof makeMockVault>;
      expect(vault.list).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 20, offset: 0 }),
      );
    });

    it('passes all filter params', async () => {
      await executeOp(ops, 'list_all', {
        domain: 'design', type: 'pattern', severity: 'warning',
        tags: ['a11y'], limit: 5, offset: 10,
      });
      const vault = runtime.vault as ReturnType<typeof makeMockVault>;
      expect(vault.list).toHaveBeenCalledWith({
        domain: 'design', type: 'pattern', severity: 'warning',
        tags: ['a11y'], limit: 5, offset: 10,
      });
    });
  });

  // ─── export ────────────────────────────────────────────────────────

  describe('export', () => {
    it('exports all domains', async () => {
      const result = await executeOp(ops, 'export', {});
      expect(result.success).toBe(true);
      const data = result.data as { exported: boolean; bundles: unknown[]; totalEntries: number };
      expect(data.exported).toBe(true);
      // Should export 3 domains based on mock stats
      expect(data.bundles).toHaveLength(3);
    });

    it('exports single domain when specified', async () => {
      const result = await executeOp(ops, 'export', { domain: 'design' });
      expect(result.success).toBe(true);
      const data = result.data as { bundles: Array<{ domain: string }> };
      expect(data.bundles).toHaveLength(1);
      expect(data.bundles[0].domain).toBe('design');
    });
  });

  // ─── capture_enriched ──────────────────────────────────────────────

  describe('capture_enriched', () => {
    it('captures with LLM enrichment when successful', async () => {
      const result = await executeOp(ops, 'capture_enriched', {
        title: 'Semantic tokens', description: 'Always use semantic tokens',
        type: 'pattern', domain: 'design', tags: ['tokens'],
      });
      expect(result.success).toBe(true);
      const data = result.data as { captured: boolean; enriched: boolean; entryId: string };
      expect(data.captured).toBe(true);
      expect(data.enriched).toBe(true);
    });

    it('falls back to basic capture when enrichment fails', async () => {
      const brain = runtime.brain as ReturnType<typeof makeMockBrain>;
      brain.enrichAndCapture.mockImplementation(() => { throw new Error('LLM unavailable'); });

      const result = await executeOp(ops, 'capture_enriched', {
        title: 'Test entry', description: 'A test pattern to avoid problems',
      });
      expect(result.success).toBe(true);
      const data = result.data as { captured: boolean; enriched: boolean };
      expect(data.captured).toBe(true);
      expect(data.enriched).toBe(false);
    });

    it('infers anti-pattern type from description keywords', async () => {
      const brain = runtime.brain as ReturnType<typeof makeMockBrain>;
      brain.enrichAndCapture.mockImplementation(() => { throw new Error('LLM down'); });
      const vault = runtime.vault as ReturnType<typeof makeMockVault>;

      await executeOp(ops, 'capture_enriched', {
        title: 'Avoid inline styles',
        description: "Don't use inline styles in components",
      });
      expect(vault.add).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'anti-pattern' }),
      );
    });

    it('infers critical severity from keywords', async () => {
      const brain = runtime.brain as ReturnType<typeof makeMockBrain>;
      brain.enrichAndCapture.mockImplementation(() => { throw new Error('fail'); });
      const vault = runtime.vault as ReturnType<typeof makeMockVault>;

      await executeOp(ops, 'capture_enriched', {
        title: 'Security check', description: 'This is a critical security requirement',
      });
      expect(vault.add).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'critical' }),
      );
    });

    it('auto-generates tags from title when none provided', async () => {
      const brain = runtime.brain as ReturnType<typeof makeMockBrain>;
      brain.enrichAndCapture.mockImplementation(() => { throw new Error('fail'); });
      const vault = runtime.vault as ReturnType<typeof makeMockVault>;

      await executeOp(ops, 'capture_enriched', {
        title: 'Semantic token naming conventions',
        description: 'A helpful pattern',
      });
      expect(vault.add).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: expect.arrayContaining(['semantic', 'token', 'naming', 'conventions']),
        }),
      );
    });

    it('returns error on total failure', async () => {
      const brain = runtime.brain as ReturnType<typeof makeMockBrain>;
      brain.enrichAndCapture.mockImplementation(() => { throw new Error('fail'); });
      const vault = runtime.vault as ReturnType<typeof makeMockVault>;
      vault.add.mockImplementation(() => { throw new Error('DB error'); });

      const result = await executeOp(ops, 'capture_enriched', {
        title: 'Test', description: 'Test',
      });
      expect(result.success).toBe(true);
      const data = result.data as { error: string };
      expect(data.error).toBe('DB error');
    });
  });

  // ─── Multi-vault ops ──────────────────────────────────────────────

  describe('vault_connect', () => {
    it('connects a vault tier', async () => {
      const result = await executeOp(ops, 'vault_connect', {
        tier: 'project', path: '/tmp/project.db',
      });
      expect(result.success).toBe(true);
      const data = result.data as { connected: boolean; tier: string; path: string };
      expect(data.connected).toBe(true);
      expect(data.tier).toBe('project');
      expect(data.path).toBe('/tmp/project.db');
    });
  });

  describe('vault_disconnect', () => {
    it('disconnects a vault tier', async () => {
      const result = await executeOp(ops, 'vault_disconnect', { tier: 'team' });
      expect(result.success).toBe(true);
      const data = result.data as { disconnected: boolean; tier: string };
      expect(data.disconnected).toBe(true);
      expect(data.tier).toBe('team');
    });
  });

  describe('vault_tiers', () => {
    it('lists vault tiers', async () => {
      const result = await executeOp(ops, 'vault_tiers', {});
      expect(result.success).toBe(true);
      const data = result.data as { tiers: Array<{ tier: string }> };
      expect(data.tiers).toHaveLength(1);
      expect(data.tiers[0].tier).toBe('agent');
    });
  });

  describe('vault_search_all', () => {
    it('searches across all tiers', async () => {
      const result = await executeOp(ops, 'vault_search_all', { query: 'tokens' });
      expect(result.success).toBe(true);
      const data = result.data as { results: unknown[]; count: number };
      expect(data.count).toBe(1);
      const vm = runtime.vaultManager as ReturnType<typeof makeMockVaultManager>;
      expect(vm.search).toHaveBeenCalledWith('tokens', 20);
    });

    it('passes custom limit', async () => {
      await executeOp(ops, 'vault_search_all', { query: 'test', limit: 5 });
      const vm = runtime.vaultManager as ReturnType<typeof makeMockVaultManager>;
      expect(vm.search).toHaveBeenCalledWith('test', 5);
    });
  });

  // ─── Named vault connections ───────────────────────────────────────

  describe('vault_connect_source', () => {
    it('connects with default priority', async () => {
      const result = await executeOp(ops, 'vault_connect_source', {
        name: 'team-kb', path: '/tmp/team.db',
      });
      expect(result.success).toBe(true);
      const data = result.data as { connected: boolean; priority: number };
      expect(data.connected).toBe(true);
      expect(data.priority).toBe(0.5);
    });

    it('connects with custom priority', async () => {
      const result = await executeOp(ops, 'vault_connect_source', {
        name: 'primary', path: '/tmp/p.db', priority: 1.5,
      });
      expect(result.success).toBe(true);
      const vm = runtime.vaultManager as ReturnType<typeof makeMockVaultManager>;
      expect(vm.connect).toHaveBeenCalledWith('primary', '/tmp/p.db', 1.5);
    });
  });

  describe('vault_disconnect_source', () => {
    it('disconnects a named source', async () => {
      const result = await executeOp(ops, 'vault_disconnect_source', {
        name: 'team-kb',
      });
      expect(result.success).toBe(true);
      const data = result.data as { disconnected: boolean; name: string };
      expect(data.disconnected).toBe(true);
      expect(data.name).toBe('team-kb');
    });
  });

  describe('vault_list_sources', () => {
    it('lists connected sources', async () => {
      const result = await executeOp(ops, 'vault_list_sources', {});
      expect(result.success).toBe(true);
      const data = result.data as { sources: Array<{ name: string }> };
      expect(data.sources).toHaveLength(1);
      expect(data.sources[0].name).toBe('team-shared');
    });
  });

  // ─── Branching ────────────────────────────────────────────────────

  describe('vault_branch', () => {
    it('creates a branch', async () => {
      const result = await executeOp(ops, 'vault_branch', { name: 'experiment' });
      expect(result.success).toBe(true);
      const data = result.data as { created: boolean; name: string };
      expect(data.created).toBe(true);
      expect(data.name).toBe('experiment');
    });

    it('returns error on duplicate branch', async () => {
      const vb = runtime.vaultBranching as ReturnType<typeof makeMockVaultBranching>;
      vb.branch.mockImplementation(() => { throw new Error('Branch already exists'); });
      const result = await executeOp(ops, 'vault_branch', { name: 'dup' });
      expect(result.success).toBe(true);
      const data = result.data as { error: string };
      expect(data.error).toBe('Branch already exists');
    });
  });

  describe('vault_branch_add', () => {
    it('adds an operation to a branch', async () => {
      const result = await executeOp(ops, 'vault_branch_add', {
        branchName: 'exp', entryId: 'e1', action: 'add',
        entryData: { id: 'e1', title: 'New', type: 'pattern', domain: 'test' },
      });
      expect(result.success).toBe(true);
      const data = result.data as { added: boolean; action: string };
      expect(data.added).toBe(true);
      expect(data.action).toBe('add');
    });

    it('returns error on invalid branch', async () => {
      const vb = runtime.vaultBranching as ReturnType<typeof makeMockVaultBranching>;
      vb.addOperation.mockImplementation(() => { throw new Error('Branch not found'); });
      const result = await executeOp(ops, 'vault_branch_add', {
        branchName: 'missing', entryId: 'e1', action: 'remove',
      });
      expect(result.success).toBe(true);
      expect((result.data as { error: string }).error).toBe('Branch not found');
    });
  });

  describe('vault_branch_list', () => {
    it('lists all branches', async () => {
      const result = await executeOp(ops, 'vault_branch_list', {});
      expect(result.success).toBe(true);
      const data = result.data as { branches: Array<{ name: string }> };
      expect(data.branches).toHaveLength(1);
      expect(data.branches[0].name).toBe('experiment');
    });
  });

  describe('vault_merge_branch', () => {
    it('merges a branch', async () => {
      const result = await executeOp(ops, 'vault_merge_branch', {
        branchName: 'experiment',
      });
      expect(result.success).toBe(true);
      const data = result.data as { merged: boolean; applied: number };
      expect(data.merged).toBe(true);
      expect(data.applied).toBe(3);
    });

    it('returns error on merge failure', async () => {
      const vb = runtime.vaultBranching as ReturnType<typeof makeMockVaultBranching>;
      vb.merge.mockImplementation(() => { throw new Error('Conflict detected'); });
      const result = await executeOp(ops, 'vault_merge_branch', {
        branchName: 'conflict',
      });
      expect(result.success).toBe(true);
      expect((result.data as { error: string }).error).toBe('Conflict detected');
    });
  });

  describe('vault_delete_branch', () => {
    it('deletes a branch', async () => {
      const result = await executeOp(ops, 'vault_delete_branch', {
        branchName: 'experiment',
      });
      expect(result.success).toBe(true);
      const data = result.data as { deleted: boolean; branchName: string };
      expect(data.deleted).toBe(true);
      expect(data.branchName).toBe('experiment');
    });
  });

  // ─── Obsidian ops ──────────────────────────────────────────────────
  // ObsidianSync is instantiated inside the handler, so we test param passing
  // and that the handler doesn't throw. Full ObsidianSync tests are elsewhere.

});
