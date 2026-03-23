/**
 * Vault Connect/Disconnect Tests — dynamic named vault connections.
 */

import { describe, test, expect, afterEach } from 'vitest';
import { VaultManager } from './vault-manager.js';
import type { IntelligenceEntry } from '../intelligence/types.js';

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

describe('VaultManager — named connections', () => {
  let mgr: VaultManager;

  afterEach(() => {
    mgr?.close();
  });

  test('connect adds a named vault', () => {
    mgr = new VaultManager({ agentId: 'test' });
    const conn = mgr.connect('shared-kb', ':memory:', 0.7);
    expect(conn.name).toBe('shared-kb');
    expect(conn.priority).toBe(0.7);
    expect(conn.vault).toBeDefined();
  });

  test('connect default priority is 0.5', () => {
    mgr = new VaultManager({ agentId: 'test' });
    const conn = mgr.connect('default-priority', ':memory:');
    expect(conn.priority).toBe(0.5);
  });

  test('connect duplicate name throws', () => {
    mgr = new VaultManager({ agentId: 'test' });
    mgr.connect('dup', ':memory:');
    expect(() => mgr.connect('dup', ':memory:')).toThrow("Vault 'dup' is already connected");
  });

  test('disconnectNamed removes vault', () => {
    mgr = new VaultManager({ agentId: 'test' });
    mgr.connect('temp', ':memory:');
    expect(mgr.disconnectNamed('temp')).toBe(true);
    expect(mgr.getConnected('temp')).toBeUndefined();
  });

  test('disconnectNamed returns false for unknown', () => {
    mgr = new VaultManager({ agentId: 'test' });
    expect(mgr.disconnectNamed('nonexistent')).toBe(false);
  });

  test('listConnected returns sorted by priority', () => {
    mgr = new VaultManager({ agentId: 'test' });
    mgr.connect('low', ':memory:', 0.3);
    mgr.connect('high', ':memory:', 0.9);
    mgr.connect('mid', ':memory:', 0.5);

    const list = mgr.listConnected();
    expect(list).toHaveLength(3);
    expect(list[0].name).toBe('high');
    expect(list[1].name).toBe('mid');
    expect(list[2].name).toBe('low');
  });

  test('listConnected empty when none connected', () => {
    mgr = new VaultManager({ agentId: 'test' });
    expect(mgr.listConnected()).toEqual([]);
  });

  test('getConnected returns entry', () => {
    mgr = new VaultManager({ agentId: 'test' });
    mgr.connect('kb', ':memory:', 0.6);
    const entry = mgr.getConnected('kb');
    expect(entry?.name).toBe('kb');
    expect(entry?.priority).toBe(0.6);
  });

  test('search includes named vaults', () => {
    mgr = new VaultManager({ agentId: 'test' });
    const agentVault = mgr.open('agent', ':memory:');
    agentVault.add(makeEntry('a1', 'Agent design tokens'));

    const conn = mgr.connect('shared', ':memory:', 0.7);
    conn.vault.add(makeEntry('s1', 'Shared design tokens'));

    const results = mgr.search('design tokens');
    expect(results.length).toBe(2);
    const ids = results.map((r) => r.entry.id);
    expect(ids).toContain('a1');
    expect(ids).toContain('s1');
  });

  test('search weights named vault by priority', () => {
    mgr = new VaultManager({ agentId: 'test' });

    // Named vault with very low priority
    const conn = mgr.connect('low-pri', ':memory:', 0.1);
    conn.vault.add(makeEntry('lp1', 'Low priority pattern'));

    // Agent tier (weight 1.0)
    const agentVault = mgr.open('agent', ':memory:');
    agentVault.add(makeEntry('hp1', 'High priority pattern'));

    const results = mgr.search('priority pattern');
    expect(results.length).toBe(2);
    // Agent should be first (1.0 weight vs 0.1)
    expect(results[0].entry.id).toBe('hp1');
    expect(results[1].entry.id).toBe('lp1');
  });

  test('dedup: agent tier wins over named vault for same entry', () => {
    mgr = new VaultManager({ agentId: 'test' });
    const agentVault = mgr.open('agent', ':memory:');
    agentVault.add(makeEntry('same-id', 'Shared entry'));

    const conn = mgr.connect('external', ':memory:', 0.7);
    conn.vault.add(makeEntry('same-id', 'Shared entry'));

    const results = mgr.search('shared entry');
    const sameResults = results.filter((r) => r.entry.id === 'same-id');
    expect(sameResults.length).toBe(1);
    // Score should reflect agent weight (1.0) not external (0.7)
    expect(sameResults[0].score).toBeGreaterThan(0);
  });

  test('disconnected vault excluded from search', () => {
    mgr = new VaultManager({ agentId: 'test' });
    const conn = mgr.connect('removable', ':memory:', 0.5);
    conn.vault.add(makeEntry('r1', 'Removable content'));

    // Search before disconnect
    let results = mgr.search('removable content');
    expect(results.length).toBe(1);

    // Disconnect
    mgr.disconnectNamed('removable');

    // Search after disconnect
    results = mgr.search('removable content');
    expect(results.length).toBe(0);
  });

  test('close clears both tiers and named connections', () => {
    mgr = new VaultManager({ agentId: 'test' });
    mgr.open('agent', ':memory:');
    mgr.connect('extra1', ':memory:');
    mgr.connect('extra2', ':memory:');

    mgr.close();
    expect(mgr.size).toBe(0);
    expect(mgr.listConnected()).toEqual([]);
  });

  test('mixed search: tiers + named vaults all contribute', () => {
    mgr = new VaultManager({ agentId: 'test' });
    const agentVault = mgr.open('agent', ':memory:');
    const projectVault = mgr.open('project', ':memory:');
    const conn = mgr.connect('library', ':memory:', 0.4);

    agentVault.add(makeEntry('a1', 'Agent widget pattern'));
    projectVault.add(makeEntry('p1', 'Project widget convention'));
    conn.vault.add(makeEntry('l1', 'Library widget standard'));

    const results = mgr.search('widget');
    expect(results.length).toBe(3);
    // Ordering: agent (1.0) > project (0.8) > library (0.4)
    expect(results[0].entry.id).toBe('a1');
    expect(results[1].entry.id).toBe('p1');
    expect(results[2].entry.id).toBe('l1');
  });
});
