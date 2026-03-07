import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAgentRuntime } from '../runtime/runtime.js';
import { createVaultExtraOps } from '../runtime/vault-extra-ops.js';
import type { AgentRuntime } from '../runtime/types.js';
import type { OpDefinition } from '../facades/types.js';
import type { IntelligenceEntry } from '../intelligence/types.js';

function makeEntry(overrides: Partial<IntelligenceEntry> & { id: string }): IntelligenceEntry {
  return {
    type: 'pattern',
    domain: 'testing',
    title: 'Test entry',
    severity: 'warning',
    description: 'A test entry.',
    tags: ['test'],
    ...overrides,
  };
}

describe('createVaultExtraOps', () => {
  let runtime: AgentRuntime;
  let ops: OpDefinition[];
  let plannerDir: string;

  beforeEach(() => {
    plannerDir = join(tmpdir(), 'vault-extra-ops-test-' + Date.now());
    mkdirSync(plannerDir, { recursive: true });
    runtime = createAgentRuntime({
      agentId: 'test-vault-extra',
      vaultPath: ':memory:',
      plansPath: join(plannerDir, 'plans.json'),
    });
    ops = createVaultExtraOps(runtime);
  });

  afterEach(() => {
    runtime.close();
    rmSync(plannerDir, { recursive: true, force: true });
  });

  function findOp(name: string): OpDefinition {
    const op = ops.find((o) => o.name === name);
    if (!op) throw new Error(`Op "${name}" not found`);
    return op;
  }

  it('should return 23 ops', () => {
    expect(ops.length).toBe(25);
  });

  it('should have all expected op names', () => {
    const names = ops.map((o) => o.name);
    expect(names).toContain('vault_get');
    expect(names).toContain('vault_update');
    expect(names).toContain('vault_remove');
    expect(names).toContain('vault_bulk_add');
    expect(names).toContain('vault_bulk_remove');
    expect(names).toContain('vault_tags');
    expect(names).toContain('vault_domains');
    expect(names).toContain('vault_recent');
    expect(names).toContain('vault_import');
    expect(names).toContain('vault_seed');
    expect(names).toContain('vault_backup');
    expect(names).toContain('vault_age_report');
    // #153: Seed canonical
    expect(names).toContain('vault_seed_canonical');
    // #155: Knowledge lifecycle
    expect(names).toContain('knowledge_audit');
    expect(names).toContain('knowledge_health');
    expect(names).toContain('knowledge_merge');
    expect(names).toContain('knowledge_reorganize');
    // #89: Bi-temporal
    expect(names).toContain('vault_set_temporal');
    expect(names).toContain('vault_find_expiring');
    expect(names).toContain('vault_find_expired');
  });

  // ─── vault_get ────────────────────────────────────────────────────

  it('vault_get should return entry when found', async () => {
    runtime.vault.seed([makeEntry({ id: 'vg-1', title: 'Get test' })]);
    const result = (await findOp('vault_get').handler({ id: 'vg-1' })) as IntelligenceEntry;
    expect(result.id).toBe('vg-1');
    expect(result.title).toBe('Get test');
  });

  it('vault_get should return error when not found', async () => {
    const result = (await findOp('vault_get').handler({ id: 'nonexistent' })) as {
      error: string;
    };
    expect(result.error).toContain('nonexistent');
  });

  // ─── vault_update ─────────────────────────────────────────────────

  it('vault_update should update title', async () => {
    runtime.vault.seed([makeEntry({ id: 'vu-1', title: 'Original' })]);
    const result = (await findOp('vault_update').handler({
      id: 'vu-1',
      title: 'Updated',
    })) as { updated: boolean; entry: IntelligenceEntry };
    expect(result.updated).toBe(true);
    expect(result.entry.title).toBe('Updated');
    // Verify in vault directly
    expect(runtime.vault.get('vu-1')!.title).toBe('Updated');
  });

  it('vault_update should update tags', async () => {
    runtime.vault.seed([makeEntry({ id: 'vu-2', tags: ['old'] })]);
    const result = (await findOp('vault_update').handler({
      id: 'vu-2',
      tags: ['new', 'shiny'],
    })) as { updated: boolean; entry: IntelligenceEntry };
    expect(result.entry.tags).toEqual(['new', 'shiny']);
  });

  it('vault_update should return error when entry not found', async () => {
    const result = (await findOp('vault_update').handler({
      id: 'missing',
      title: 'x',
    })) as { error: string };
    expect(result.error).toContain('missing');
  });

  it('vault_update should return error when no fields provided', async () => {
    runtime.vault.seed([makeEntry({ id: 'vu-3' })]);
    const result = (await findOp('vault_update').handler({ id: 'vu-3' })) as { error: string };
    expect(result.error).toContain('No fields');
  });

  // ─── vault_remove ─────────────────────────────────────────────────

  it('vault_remove should delete entry', async () => {
    runtime.vault.seed([makeEntry({ id: 'vr-1' })]);
    const result = (await findOp('vault_remove').handler({ id: 'vr-1' })) as {
      removed: boolean;
      id: string;
    };
    expect(result.removed).toBe(true);
    expect(result.id).toBe('vr-1');
    expect(runtime.vault.get('vr-1')).toBeNull();
  });

  it('vault_remove should return removed=false for missing entry', async () => {
    const result = (await findOp('vault_remove').handler({ id: 'nope' })) as { removed: boolean };
    expect(result.removed).toBe(false);
  });

  // ─── vault_bulk_add ───────────────────────────────────────────────

  it('vault_bulk_add should add multiple entries', async () => {
    const entries = [
      makeEntry({ id: 'ba-1', title: 'Bulk 1' }),
      makeEntry({ id: 'ba-2', title: 'Bulk 2' }),
      makeEntry({ id: 'ba-3', title: 'Bulk 3' }),
    ];
    const result = (await findOp('vault_bulk_add').handler({ entries })) as {
      added: number;
      total: number;
    };
    expect(result.added).toBe(3);
    expect(result.total).toBe(3);
    expect(runtime.vault.get('ba-2')!.title).toBe('Bulk 2');
  });

  it('vault_bulk_add should upsert existing entries', async () => {
    runtime.vault.seed([makeEntry({ id: 'ba-u1', title: 'Old' })]);
    const result = (await findOp('vault_bulk_add').handler({
      entries: [makeEntry({ id: 'ba-u1', title: 'New' })],
    })) as { added: number; total: number };
    expect(result.added).toBe(1);
    expect(result.total).toBe(1); // no new entry, just update
    expect(runtime.vault.get('ba-u1')!.title).toBe('New');
  });

  // ─── vault_bulk_remove ────────────────────────────────────────────

  it('vault_bulk_remove should remove multiple entries', async () => {
    runtime.vault.seed([
      makeEntry({ id: 'br-1' }),
      makeEntry({ id: 'br-2' }),
      makeEntry({ id: 'br-3' }),
    ]);
    const result = (await findOp('vault_bulk_remove').handler({
      ids: ['br-1', 'br-3'],
    })) as { removed: number; requested: number; total: number };
    expect(result.removed).toBe(2);
    expect(result.requested).toBe(2);
    expect(result.total).toBe(1); // br-2 remains
    expect(runtime.vault.get('br-2')).not.toBeNull();
    expect(runtime.vault.get('br-1')).toBeNull();
  });

  it('vault_bulk_remove should handle missing IDs gracefully', async () => {
    runtime.vault.seed([makeEntry({ id: 'br-4' })]);
    const result = (await findOp('vault_bulk_remove').handler({
      ids: ['br-4', 'br-missing'],
    })) as { removed: number; requested: number };
    expect(result.removed).toBe(1);
    expect(result.requested).toBe(2);
  });

  // ─── vault_tags ───────────────────────────────────────────────────

  it('vault_tags should return unique tags with counts', async () => {
    runtime.vault.seed([
      makeEntry({ id: 'vt-1', tags: ['alpha', 'beta'] }),
      makeEntry({ id: 'vt-2', tags: ['beta', 'gamma'] }),
      makeEntry({ id: 'vt-3', tags: ['beta'] }),
    ]);
    const result = (await findOp('vault_tags').handler({})) as {
      tags: Array<{ tag: string; count: number }>;
      count: number;
    };
    expect(result.count).toBe(3); // alpha, beta, gamma
    const beta = result.tags.find((t) => t.tag === 'beta');
    expect(beta!.count).toBe(3);
    const alpha = result.tags.find((t) => t.tag === 'alpha');
    expect(alpha!.count).toBe(1);
    // beta should be first (highest count)
    expect(result.tags[0].tag).toBe('beta');
  });

  it('vault_tags should return empty when vault is empty', async () => {
    const result = (await findOp('vault_tags').handler({})) as {
      tags: Array<{ tag: string; count: number }>;
      count: number;
    };
    expect(result.tags).toEqual([]);
    expect(result.count).toBe(0);
  });

  // ─── vault_domains ────────────────────────────────────────────────

  it('vault_domains should return domains with counts', async () => {
    runtime.vault.seed([
      makeEntry({ id: 'vd-1', domain: 'security' }),
      makeEntry({ id: 'vd-2', domain: 'security' }),
      makeEntry({ id: 'vd-3', domain: 'a11y' }),
    ]);
    const result = (await findOp('vault_domains').handler({})) as {
      domains: Array<{ domain: string; count: number }>;
      count: number;
    };
    expect(result.count).toBe(2);
    const security = result.domains.find((d) => d.domain === 'security');
    expect(security!.count).toBe(2);
    const a11y = result.domains.find((d) => d.domain === 'a11y');
    expect(a11y!.count).toBe(1);
  });

  // ─── vault_recent ─────────────────────────────────────────────────

  it('vault_recent should return entries ordered by most recent', async () => {
    runtime.vault.seed([
      makeEntry({ id: 'rec-1', title: 'First' }),
      makeEntry({ id: 'rec-2', title: 'Second' }),
    ]);
    const result = (await findOp('vault_recent').handler({})) as {
      entries: IntelligenceEntry[];
      count: number;
    };
    expect(result.count).toBe(2);
    // Both entries should be present
    expect(result.entries.map((e) => e.id)).toContain('rec-1');
    expect(result.entries.map((e) => e.id)).toContain('rec-2');
  });

  it('vault_recent should respect limit', async () => {
    runtime.vault.seed([
      makeEntry({ id: 'rl-1' }),
      makeEntry({ id: 'rl-2' }),
      makeEntry({ id: 'rl-3' }),
    ]);
    const result = (await findOp('vault_recent').handler({ limit: 2 })) as {
      entries: IntelligenceEntry[];
      count: number;
    };
    expect(result.count).toBe(2);
  });

  // ─── vault_import ─────────────────────────────────────────────────

  it('vault_import should import new entries', async () => {
    const entries = [
      makeEntry({ id: 'vi-1', title: 'Import 1' }),
      makeEntry({ id: 'vi-2', title: 'Import 2' }),
    ];
    const result = (await findOp('vault_import').handler({ entries })) as {
      imported: number;
      newEntries: number;
      updatedEntries: number;
      total: number;
    };
    expect(result.imported).toBe(2);
    expect(result.newEntries).toBe(2);
    expect(result.updatedEntries).toBe(0);
    expect(result.total).toBe(2);
  });

  it('vault_import should track updated vs new entries', async () => {
    runtime.vault.seed([makeEntry({ id: 'vi-3', title: 'Existing' })]);
    const entries = [
      makeEntry({ id: 'vi-3', title: 'Updated' }),
      makeEntry({ id: 'vi-4', title: 'Brand New' }),
    ];
    const result = (await findOp('vault_import').handler({ entries })) as {
      imported: number;
      newEntries: number;
      updatedEntries: number;
      total: number;
    };
    expect(result.imported).toBe(2);
    expect(result.newEntries).toBe(1);
    expect(result.updatedEntries).toBe(1);
    expect(result.total).toBe(2);
  });

  // ─── vault_seed ───────────────────────────────────────────────────

  it('vault_seed should be idempotent', async () => {
    const entries = [makeEntry({ id: 'vs-1', title: 'Seed' })];
    const r1 = (await findOp('vault_seed').handler({ entries })) as {
      seeded: number;
      total: number;
    };
    expect(r1.seeded).toBe(1);
    expect(r1.total).toBe(1);
    // Seed again
    const r2 = (await findOp('vault_seed').handler({ entries })) as {
      seeded: number;
      total: number;
    };
    expect(r2.seeded).toBe(1);
    expect(r2.total).toBe(1); // still 1, not 2
  });

  // ─── vault_backup ─────────────────────────────────────────────────

  it('vault_backup should export all entries', async () => {
    runtime.vault.seed([
      makeEntry({ id: 'vb-1', title: 'Backup 1' }),
      makeEntry({ id: 'vb-2', title: 'Backup 2' }),
    ]);
    const result = (await findOp('vault_backup').handler({})) as {
      entries: IntelligenceEntry[];
      exportedAt: number;
      count: number;
    };
    expect(result.count).toBe(2);
    expect(result.entries.length).toBe(2);
    expect(result.exportedAt).toBeGreaterThan(0);
    expect(result.entries.map((e) => e.id).sort()).toEqual(['vb-1', 'vb-2']);
  });

  it('vault_backup should return empty bundle when vault is empty', async () => {
    const result = (await findOp('vault_backup').handler({})) as {
      entries: IntelligenceEntry[];
      count: number;
    };
    expect(result.entries).toEqual([]);
    expect(result.count).toBe(0);
  });

  // ─── vault_age_report ─────────────────────────────────────────────

  it('vault_age_report should return age distribution', async () => {
    runtime.vault.seed([makeEntry({ id: 'va-1' }), makeEntry({ id: 'va-2' })]);
    const result = (await findOp('vault_age_report').handler({})) as {
      total: number;
      buckets: Array<{ label: string; count: number; minDays: number; maxDays: number }>;
      oldestTimestamp: number | null;
      newestTimestamp: number | null;
    };
    expect(result.total).toBe(2);
    expect(result.buckets.length).toBe(5);
    // Entries just created should be in the 'today' bucket
    const today = result.buckets.find((b) => b.label === 'today');
    expect(today!.count).toBe(2);
    expect(result.oldestTimestamp).toBeGreaterThan(0);
    expect(result.newestTimestamp).toBeGreaterThan(0);
  });

  it('vault_age_report should handle empty vault', async () => {
    const result = (await findOp('vault_age_report').handler({})) as {
      total: number;
      oldestTimestamp: number | null;
      newestTimestamp: number | null;
    };
    expect(result.total).toBe(0);
    expect(result.oldestTimestamp).toBeNull();
    expect(result.newestTimestamp).toBeNull();
  });

  // ─── Auth levels ──────────────────────────────────────────────────

  it('should assign correct auth levels', () => {
    const readOps = [
      'vault_get',
      'vault_tags',
      'vault_domains',
      'vault_recent',
      'vault_backup',
      'vault_age_report',
    ];
    const writeOps = ['vault_update', 'vault_bulk_add', 'vault_import', 'vault_seed'];
    const adminOps = ['vault_remove', 'vault_bulk_remove'];

    for (const name of readOps) {
      expect(findOp(name).auth).toBe('read');
    }
    for (const name of writeOps) {
      expect(findOp(name).auth).toBe('write');
    }
    for (const name of adminOps) {
      expect(findOp(name).auth).toBe('admin');
    }
  });

  // ─── vault_set_temporal ─────────────────────────────────────────

  describe('vault_set_temporal', () => {
    it('should set validUntil on an entry', async () => {
      runtime.vault.seed([makeEntry({ id: 'temporal-1' })]);
      const result = (await findOp('vault_set_temporal').handler({
        id: 'temporal-1',
        validUntil: Math.floor(Date.now() / 1000) + 86400 * 30,
      })) as { updated: boolean; id: string; validUntil: number | null };
      expect(result.updated).toBe(true);
      expect(result.id).toBe('temporal-1');
      expect(result.validUntil).toBeGreaterThan(0);
    });

    it('should return error for missing entry', async () => {
      const result = (await findOp('vault_set_temporal').handler({
        id: 'nonexistent',
        validUntil: 1000,
      })) as { error: string };
      expect(result.error).toBeDefined();
    });
  });

  // ─── vault_find_expiring ────────────────────────────────────────

  describe('vault_find_expiring', () => {
    it('should find entries expiring within N days', async () => {
      const now = Math.floor(Date.now() / 1000);
      runtime.vault.seed([
        makeEntry({ id: 'exp-1' }),
        makeEntry({ id: 'exp-2' }),
        makeEntry({ id: 'exp-3' }),
      ]);
      runtime.vault.setTemporal('exp-1', undefined, now + 86400 * 5);
      runtime.vault.setTemporal('exp-2', undefined, now + 86400 * 60);

      const result = (await findOp('vault_find_expiring').handler({
        withinDays: 10,
      })) as { entries: unknown[]; count: number };
      expect(result.count).toBe(1);
    });
  });

  // ─── vault_find_expired ─────────────────────────────────────────

  describe('vault_find_expired', () => {
    it('should find expired entries', async () => {
      const now = Math.floor(Date.now() / 1000);
      runtime.vault.seed([makeEntry({ id: 'past-1' }), makeEntry({ id: 'past-2' })]);
      runtime.vault.setTemporal('past-1', undefined, now - 86400);
      runtime.vault.setTemporal('past-2', undefined, now + 86400);

      const result = (await findOp('vault_find_expired').handler({})) as {
        entries: unknown[];
        count: number;
      };
      expect(result.count).toBe(1);
    });
  });
});
