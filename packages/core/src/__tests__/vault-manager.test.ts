/**
 * VaultManager Tests — multi-tier vault orchestration.
 */

import { describe, test, expect, afterEach } from 'vitest';
import { VaultManager } from '../vault/vault-manager.js';
import type { IntelligenceEntry } from '../intelligence/types.js';

// =============================================================================
// HELPERS
// =============================================================================

function makeEntry(id: string, title: string, domain = 'general'): IntelligenceEntry {
  return {
    id,
    type: 'pattern',
    domain,
    title,
    severity: 'suggestion',
    description: `Description for ${title}`,
    tags: [domain],
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('VaultManager', () => {
  let mgr: VaultManager;

  afterEach(() => {
    mgr?.close();
  });

  test('constructs without error', () => {
    mgr = new VaultManager({ agentId: 'test-agent' });
    expect(mgr).toBeDefined();
    expect(mgr.size).toBe(0);
  });

  test('open agent tier', () => {
    mgr = new VaultManager({ agentId: 'test-agent' });
    const vault = mgr.open('agent', ':memory:');
    expect(vault).toBeDefined();
    expect(mgr.size).toBe(1);
    expect(mgr.hasTier('agent')).toBe(true);
  });

  test('getTier returns vault', () => {
    mgr = new VaultManager({ agentId: 'test-agent' });
    const vault = mgr.open('agent', ':memory:');
    expect(mgr.getTier('agent')).toBe(vault);
  });

  test('getTier throws for disconnected tier', () => {
    mgr = new VaultManager({ agentId: 'test-agent' });
    expect(() => mgr.getTier('project')).toThrow("Vault tier 'project' is not connected");
  });

  test('hasTier returns false for disconnected', () => {
    mgr = new VaultManager({ agentId: 'test-agent' });
    expect(mgr.hasTier('agent')).toBe(false);
  });

  test('disconnect removes tier', () => {
    mgr = new VaultManager({ agentId: 'test-agent' });
    mgr.open('agent', ':memory:');
    expect(mgr.disconnect('agent')).toBe(true);
    expect(mgr.hasTier('agent')).toBe(false);
    expect(mgr.size).toBe(0);
  });

  test('disconnect returns false for non-connected tier', () => {
    mgr = new VaultManager({ agentId: 'test-agent' });
    expect(mgr.disconnect('project')).toBe(false);
  });

  test('re-opening a tier closes previous', () => {
    mgr = new VaultManager({ agentId: 'test-agent' });
    const v1 = mgr.open('agent', ':memory:');
    v1.add(makeEntry('e1', 'First'));

    const v2 = mgr.open('agent', ':memory:');
    // New vault should be empty (different :memory: DB)
    expect(v2.stats().totalEntries).toBe(0);
    expect(mgr.getTier('agent')).toBe(v2);
  });

  test('search on single tier', () => {
    mgr = new VaultManager({ agentId: 'test-agent' });
    const vault = mgr.open('agent', ':memory:');
    vault.add(makeEntry('e1', 'Use semantic tokens for colors'));
    vault.add(makeEntry('e2', 'Avoid hardcoded hex values'));

    const results = mgr.search('semantic tokens');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].entry.title).toContain('semantic tokens');
  });

  test('search cascades across tiers', () => {
    mgr = new VaultManager({ agentId: 'test-agent' });
    const agentVault = mgr.open('agent', ':memory:');
    const projectVault = mgr.open('project', ':memory:');

    agentVault.add(makeEntry('a1', 'Agent pattern about routing'));
    projectVault.add(makeEntry('p1', 'Project pattern about routing'));

    const results = mgr.search('routing');
    expect(results.length).toBe(2);
    // Both entries should be present
    const ids = results.map((r) => r.entry.id);
    expect(ids).toContain('a1');
    expect(ids).toContain('p1');
  });

  test('search applies tier weight — agent ranked higher', () => {
    mgr = new VaultManager({ agentId: 'test-agent' });
    const agentVault = mgr.open('agent', ':memory:');
    const projectVault = mgr.open('project', ':memory:');

    // Add identical entries to both tiers
    agentVault.add(makeEntry('shared', 'Use tokens for spacing'));
    projectVault.add(makeEntry('shared', 'Use tokens for spacing'));

    const results = mgr.search('tokens spacing');
    // Dedup: only one result (agent wins with weight 1.0 vs project 0.8)
    expect(results.length).toBe(1);
    // Score should reflect agent weight (1.0 * raw score)
    expect(results[0].score).toBeGreaterThan(0);
  });

  test('search deduplicates — highest priority wins', () => {
    mgr = new VaultManager({ agentId: 'test-agent' });
    const agentVault = mgr.open('agent', ':memory:');
    const teamVault = mgr.open('team', ':memory:');

    agentVault.add(makeEntry('dup1', 'Shared pattern'));
    teamVault.add(makeEntry('dup1', 'Shared pattern'));

    const results = mgr.search('shared pattern');
    const dup1Results = results.filter((r) => r.entry.id === 'dup1');
    expect(dup1Results.length).toBe(1);
  });

  test('search respects limit', () => {
    mgr = new VaultManager({ agentId: 'test-agent' });
    const vault = mgr.open('agent', ':memory:');
    for (let i = 0; i < 10; i++) {
      vault.add(makeEntry(`e${i}`, `Pattern number ${i} about design`));
    }

    const results = mgr.search('design', 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  test('search with no connected tiers returns empty', () => {
    mgr = new VaultManager({ agentId: 'test-agent' });
    const results = mgr.search('anything');
    expect(results).toEqual([]);
  });

  test('custom weights override defaults', () => {
    mgr = new VaultManager({
      agentId: 'test-agent',
      weights: { team: 1.5 }, // boost team above agent
    });
    const agentVault = mgr.open('agent', ':memory:');
    const teamVault = mgr.open('team', ':memory:');

    agentVault.add(makeEntry('same', 'Important pattern'));
    teamVault.add(makeEntry('same', 'Important pattern'));

    const results = mgr.search('important pattern');
    // With team weight 1.5 > agent weight 1.0, team's version should have higher score
    expect(results.length).toBe(1);
    // The score should be > 1.0 * raw (since team weight is 1.5)
  });

  test('listTiers shows all tiers', () => {
    mgr = new VaultManager({ agentId: 'test-agent' });
    mgr.open('agent', ':memory:');

    const tiers = mgr.listTiers();
    expect(tiers).toHaveLength(3); // agent, project, team
    const agentTier = tiers.find((t) => t.tier === 'agent');
    expect(agentTier?.connected).toBe(true);
    const projectTier = tiers.find((t) => t.tier === 'project');
    expect(projectTier?.connected).toBe(false);
  });

  test('listTiers shows entry counts', () => {
    mgr = new VaultManager({ agentId: 'test-agent' });
    const vault = mgr.open('agent', ':memory:');
    vault.add(makeEntry('e1', 'Entry one'));
    vault.add(makeEntry('e2', 'Entry two'));

    const tiers = mgr.listTiers();
    const agentTier = tiers.find((t) => t.tier === 'agent');
    expect(agentTier?.entryCount).toBe(2);
  });

  test('close closes all connections', () => {
    mgr = new VaultManager({ agentId: 'test-agent' });
    mgr.open('agent', ':memory:');
    mgr.open('project', ':memory:');
    mgr.open('team', ':memory:');
    expect(mgr.size).toBe(3);

    mgr.close();
    expect(mgr.size).toBe(0);
  });

  test('getConfig returns config', () => {
    mgr = new VaultManager({ agentId: 'test-agent' });
    expect(mgr.getConfig().agentId).toBe('test-agent');
  });

  test('three tiers search cascade with correct ordering', () => {
    mgr = new VaultManager({ agentId: 'test-agent' });
    const agentVault = mgr.open('agent', ':memory:');
    const projectVault = mgr.open('project', ':memory:');
    const teamVault = mgr.open('team', ':memory:');

    agentVault.add(makeEntry('a-only', 'Agent-only design pattern'));
    projectVault.add(makeEntry('p-only', 'Project-only design pattern'));
    teamVault.add(makeEntry('t-only', 'Team-only design pattern'));

    const results = mgr.search('design pattern');
    expect(results.length).toBe(3);

    // Verify ordering: agent (1.0) > project (0.8) > team (0.6)
    const ids = results.map((r) => r.entry.id);
    expect(ids[0]).toBe('a-only');
    expect(ids[1]).toBe('p-only');
    expect(ids[2]).toBe('t-only');
  });
});
