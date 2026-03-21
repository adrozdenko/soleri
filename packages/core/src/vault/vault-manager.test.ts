import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VaultManager, type ConnectedVault } from './vault-manager.js';
import type { SearchResult } from './vault.js';

// ─── Mock Vault ──────────────────────────────────────────────────────

vi.mock('./vault.js', () => {
  const MockVault = function (this: Record<string, unknown>, path: string) {
    this._path = path;
    this.search = vi.fn().mockReturnValue([]);
    this.stats = vi.fn().mockReturnValue({ totalEntries: 0, byType: {}, byDomain: {}, bySeverity: {} });
    this.close = vi.fn();
  } as unknown as typeof import('./vault.js')['Vault'];
  return { Vault: MockVault };
});

function makeManager(weights?: Partial<Record<'agent' | 'project' | 'team', number>>): VaultManager {
  return new VaultManager({ agentId: 'test-agent', weights });
}

describe('VaultManager', () => {
  let mgr: VaultManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mgr = makeManager();
  });

  // ── open / getTier / hasTier ────────────────────────────────────────

  it('opens a vault for a tier', () => {
    const vault = mgr.open('agent', '/tmp/agent.db');
    expect(vault).toBeDefined();
    expect(mgr.hasTier('agent')).toBe(true);
    expect(mgr.size).toBe(1);
  });

  it('getTier returns the vault for an open tier', () => {
    mgr.open('project', '/tmp/project.db');
    const v = mgr.getTier('project');
    expect(v).toBeDefined();
  });

  it('getTier throws for unconnected tier', () => {
    expect(() => mgr.getTier('team')).toThrow("Vault tier 'team' is not connected");
  });

  it('re-opening a tier closes the previous vault', () => {
    const first = mgr.open('agent', '/tmp/a.db');
    mgr.open('agent', '/tmp/b.db');
    expect(first.close).toHaveBeenCalled();
    expect(mgr.size).toBe(1);
  });

  // ── disconnect ──────────────────────────────────────────────────────

  it('disconnects a tier and closes its vault', () => {
    const vault = mgr.open('agent', '/tmp/a.db');
    expect(mgr.disconnect('agent')).toBe(true);
    expect(vault.close).toHaveBeenCalled();
    expect(mgr.hasTier('agent')).toBe(false);
  });

  it('disconnect returns false for unconnected tier', () => {
    expect(mgr.disconnect('team')).toBe(false);
  });

  // ── connect / disconnectNamed / listConnected / getConnected ────────

  it('connects a named vault source', () => {
    const entry = mgr.connect('shared', '/tmp/shared.db', 0.7);
    expect(entry.name).toBe('shared');
    expect(entry.priority).toBe(0.7);
  });

  it('throws when connecting duplicate named vault', () => {
    mgr.connect('shared', '/tmp/shared.db');
    expect(() => mgr.connect('shared', '/tmp/other.db')).toThrow("already connected");
  });

  it('disconnects a named vault', () => {
    const entry = mgr.connect('shared', '/tmp/shared.db');
    expect(mgr.disconnectNamed('shared')).toBe(true);
    expect(entry.vault.close).toHaveBeenCalled();
  });

  it('disconnectNamed returns false for unknown name', () => {
    expect(mgr.disconnectNamed('unknown')).toBe(false);
  });

  it('listConnected returns entries sorted by priority desc', () => {
    mgr.connect('low', '/tmp/low.db', 0.3);
    mgr.connect('high', '/tmp/high.db', 0.9);
    mgr.connect('mid', '/tmp/mid.db', 0.5);
    const list = mgr.listConnected();
    expect(list.map((e) => e.name)).toEqual(['high', 'mid', 'low']);
  });

  it('getConnected returns the entry or undefined', () => {
    mgr.connect('x', '/tmp/x.db');
    expect(mgr.getConnected('x')).toBeDefined();
    expect(mgr.getConnected('y')).toBeUndefined();
  });

  // ── search ──────────────────────────────────────────────────────────

  it('returns empty array when no vaults connected', () => {
    expect(mgr.search('query')).toEqual([]);
  });

  it('merges results from tier vaults with weight', () => {
    const agentVault = mgr.open('agent', '/tmp/a.db');
    (agentVault.search as ReturnType<typeof vi.fn>).mockReturnValue([
      { entry: { id: 'e1', title: 'A' }, score: 1.0 },
    ]);

    const results = mgr.search('test');
    expect(results).toHaveLength(1);
    // agent weight is 1.0, so score stays 1.0
    expect(results[0].score).toBe(1.0);
  });

  it('deduplicates entries keeping highest weighted score', () => {
    const entry = { id: 'e1', title: 'Shared' };
    const agentVault = mgr.open('agent', '/tmp/a.db');
    (agentVault.search as ReturnType<typeof vi.fn>).mockReturnValue([
      { entry, score: 0.5 },
    ]);

    const teamVault = mgr.open('team', '/tmp/t.db');
    (teamVault.search as ReturnType<typeof vi.fn>).mockReturnValue([
      { entry, score: 0.8 },
    ]);

    const results = mgr.search('test');
    // Agent: 0.5 * 1.0 = 0.5, Team: 0.8 * 0.6 = 0.48 → agent wins
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0.5);
  });

  it('includes named vault results in search', () => {
    const entry = mgr.connect('extra', '/tmp/extra.db', 0.9);
    (entry.vault.search as ReturnType<typeof vi.fn>).mockReturnValue([
      { entry: { id: 'e2', title: 'Extra' }, score: 1.0 },
    ]);

    const results = mgr.search('test');
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0.9); // 1.0 * 0.9 priority
  });

  it('respects limit parameter', () => {
    const vault = mgr.open('agent', '/tmp/a.db');
    const manyResults = Array.from({ length: 30 }, (_, i) => ({
      entry: { id: `e${i}`, title: `Entry ${i}` },
      score: 1 - i * 0.01,
    }));
    (vault.search as ReturnType<typeof vi.fn>).mockReturnValue(manyResults);

    expect(mgr.search('test', 5)).toHaveLength(5);
  });

  // ── listTiers ───────────────────────────────────────────────────────

  it('lists all three tiers with connection status', () => {
    mgr.open('agent', '/tmp/a.db');
    const tiers = mgr.listTiers();
    expect(tiers).toHaveLength(3);

    const agent = tiers.find((t) => t.tier === 'agent');
    expect(agent!.connected).toBe(true);

    const project = tiers.find((t) => t.tier === 'project');
    expect(project!.connected).toBe(false);
    expect(project!.entryCount).toBe(0);
  });

  // ── getConfig / close ───────────────────────────────────────────────

  it('returns the config', () => {
    expect(mgr.getConfig().agentId).toBe('test-agent');
  });

  it('close shuts down all vaults', () => {
    const av = mgr.open('agent', '/tmp/a.db');
    const cv = mgr.connect('extra', '/tmp/e.db');
    mgr.close();
    expect(av.close).toHaveBeenCalled();
    expect(cv.vault.close).toHaveBeenCalled();
    expect(mgr.size).toBe(0);
    expect(mgr.listConnected()).toEqual([]);
  });

  // ── custom weights ──────────────────────────────────────────────────

  it('applies custom weights to search scoring', () => {
    const customMgr = makeManager({ team: 2.0 });
    const teamVault = customMgr.open('team', '/tmp/t.db');
    (teamVault.search as ReturnType<typeof vi.fn>).mockReturnValue([
      { entry: { id: 'e1', title: 'T' }, score: 0.5 },
    ]);

    const results = customMgr.search('test');
    expect(results[0].score).toBe(1.0); // 0.5 * 2.0
    customMgr.close();
  });
});
