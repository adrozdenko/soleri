import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VaultBranching } from './vault-branching.js';
import type { PersistenceProvider, RunResult } from '../persistence/types.js';
import type { IntelligenceEntry } from '../intelligence/types.js';

// ─── In-memory mock persistence ──────────────────────────────────────

function makeEntry(id: string): IntelligenceEntry {
  return {
    id,
    type: 'pattern',
    domain: 'test',
    title: `Entry ${id}`,
    severity: 'suggestion',
    description: `Description for ${id}`,
    tags: ['test'],
  };
}

class BranchingMockDB implements PersistenceProvider {
  readonly backend = 'sqlite' as const;
  private meta: Array<{ name: string; created_at: number; merged_at: number | null }> = [];
  private ops: Array<{
    id: number;
    branch_name: string;
    entry_id: string;
    action: string;
    entry_data: string | null;
    created_at: number;
  }> = [];
  private nextId = 1;

  execSql(): void {}

  run(sql: string, params?: Record<string, unknown> | unknown[]): RunResult {
    const p = this.norm(params);

    if (sql.includes('INSERT INTO vault_branch_meta')) {
      this.meta.push({ name: p.name as string, created_at: Date.now(), merged_at: null });
      return { changes: 1, lastInsertRowid: this.meta.length };
    }
    if (sql.includes('INSERT INTO vault_branch_ops')) {
      this.ops.push({
        id: this.nextId++,
        branch_name: p.branchName as string,
        entry_id: p.entryId as string,
        action: p.action as string,
        entry_data: (p.entryData as string) ?? null,
        created_at: Date.now(),
      });
      return { changes: 1, lastInsertRowid: this.nextId - 1 };
    }
    if (sql.includes('UPDATE vault_branch_meta SET merged_at')) {
      const m = this.meta.find((r) => r.name === p.branchName);
      if (m) m.merged_at = Date.now();
      return { changes: 1, lastInsertRowid: 0 };
    }
    if (sql.includes('DELETE FROM vault_branch_ops')) {
      const name = (p.branchName ?? p.name) as string;
      const before = this.ops.length;
      this.ops = this.ops.filter((o) => o.branch_name !== name);
      return { changes: before - this.ops.length, lastInsertRowid: 0 };
    }
    if (sql.includes('DELETE FROM vault_branch_meta')) {
      const name = (p.branchName ?? p.name) as string;
      const before = this.meta.length;
      this.meta = this.meta.filter((m) => m.name !== name);
      return { changes: before - this.meta.length, lastInsertRowid: 0 };
    }
    return { changes: 0, lastInsertRowid: 0 };
  }

  get<T>(sql: string, params?: Record<string, unknown> | unknown[]): T | undefined {
    const p = this.norm(params);
    const name = (p.name ?? p.branchName) as string;
    if (sql.includes('vault_branch_meta')) {
      const m = this.meta.find((r) => r.name === name);
      return m as T | undefined;
    }
    return undefined;
  }

  all<T>(sql: string, params?: Record<string, unknown> | unknown[]): T[] {
    const p = this.norm(params);
    if (sql.includes('vault_branch_ops') && p.branchName) {
      return this.ops.filter((o) => o.branch_name === p.branchName) as T[];
    }
    if (sql.includes('vault_branch_meta')) {
      return this.meta.map((m) => ({
        ...m,
        entry_count: this.ops.filter((o) => o.branch_name === m.name).length,
      })) as T[];
    }
    return [];
  }

  transaction<T>(fn: () => T): T {
    return fn();
  }

  ftsSearch<T>(): T[] {
    return [];
  }
  ftsRebuild(): void {}
  close(): void {}

  private norm(params?: Record<string, unknown> | unknown[]): Record<string, unknown> {
    if (!params || Array.isArray(params)) return {};
    return params;
  }
}

// ─── Mock Vault facade ───────────────────────────────────────────────

function makeMockVault(provider: BranchingMockDB) {
  return {
    getProvider: () => provider,
    add: vi.fn(),
    remove: vi.fn(),
  } as unknown;
}

describe('VaultBranching', () => {
  let db: BranchingMockDB;
  let branching: VaultBranching;

  beforeEach(() => {
    db = new BranchingMockDB();
    branching = new VaultBranching(makeMockVault(db));
  });

  // ── branch ──────────────────────────────────────────────────────────

  it('creates a new branch', () => {
    expect(branching.branch('feature-x')).toBe(true);
  });

  it('throws when creating duplicate active branch', () => {
    branching.branch('feature-x');
    expect(() => branching.branch('feature-x')).toThrow('already exists');
  });

  // ── addOperation ────────────────────────────────────────────────────

  it('adds an add operation with entry data', () => {
    branching.branch('b1');
    branching.addOperation('b1', 'e1', 'add', makeEntry('e1'));
    const ops = branching.listEntries('b1');
    expect(ops).toHaveLength(1);
    expect(ops[0].action).toBe('add');
    expect(ops[0].entryId).toBe('e1');
  });

  it('adds a remove operation without entry data', () => {
    branching.branch('b1');
    branching.addOperation('b1', 'e1', 'remove');
    const ops = branching.listEntries('b1');
    expect(ops).toHaveLength(1);
    expect(ops[0].action).toBe('remove');
  });

  it('throws when adding to non-existent branch', () => {
    expect(() => branching.addOperation('missing', 'e1', 'add', makeEntry('e1'))).toThrow(
      'does not exist',
    );
  });

  it('throws when add/modify has no entry data', () => {
    branching.branch('b1');
    expect(() => branching.addOperation('b1', 'e1', 'add')).toThrow('Entry data required');
    expect(() => branching.addOperation('b1', 'e1', 'modify')).toThrow('Entry data required');
  });

  // ── listEntries ─────────────────────────────────────────────────────

  it('returns empty list for branch with no ops', () => {
    branching.branch('b1');
    expect(branching.listEntries('b1')).toEqual([]);
  });

  // ── listBranches ────────────────────────────────────────────────────

  it('lists all branches with summary info', () => {
    branching.branch('b1');
    branching.branch('b2');
    branching.addOperation('b1', 'e1', 'add', makeEntry('e1'));
    const branches = branching.listBranches();
    expect(branches).toHaveLength(2);
    const b1 = branches.find((b) => b.name === 'b1');
    expect(b1!.entryCount).toBe(1);
    expect(b1!.merged).toBe(false);
  });

  // ── merge ───────────────────────────────────────────────────────────

  it('merges a branch applying add operations', () => {
    const mockVault = makeMockVault(db);
    branching = new VaultBranching(mockVault);
    branching.branch('b1');
    branching.addOperation('b1', 'e1', 'add', makeEntry('e1'));
    const result = branching.merge('b1');
    expect(result.merged).toBe(true);
    expect(result.added).toBe(1);
    expect(result.total).toBe(1);
    expect(mockVault.add).toHaveBeenCalled();
  });

  it('merges with remove operations', () => {
    const mockVault = makeMockVault(db);
    branching = new VaultBranching(mockVault);
    branching.branch('b1');
    branching.addOperation('b1', 'e1', 'remove');
    const result = branching.merge('b1');
    expect(result.removed).toBe(1);
    expect(mockVault.remove).toHaveBeenCalledWith('e1');
  });

  it('collapses multiple ops for same entry (last wins)', () => {
    const mockVault = makeMockVault(db);
    branching = new VaultBranching(mockVault);
    branching.branch('b1');
    branching.addOperation('b1', 'e1', 'add', makeEntry('e1'));
    branching.addOperation('b1', 'e1', 'remove');
    const result = branching.merge('b1');
    // Last op is remove, so add shouldn't happen on this entry
    expect(result.removed).toBe(1);
    expect(result.added).toBe(0);
  });

  it('throws when merging non-existent branch', () => {
    expect(() => branching.merge('missing')).toThrow('does not exist');
  });

  it('throws when merging already-merged branch', () => {
    branching.branch('b1');
    branching.merge('b1');
    expect(() => branching.merge('b1')).toThrow('already merged');
  });

  // ── deleteBranch ────────────────────────────────────────────────────

  it('deletes an existing branch', () => {
    branching.branch('b1');
    branching.addOperation('b1', 'e1', 'add', makeEntry('e1'));
    expect(branching.deleteBranch('b1')).toBe(true);
    expect(branching.listBranches()).toHaveLength(0);
  });

  it('returns false when deleting non-existent branch', () => {
    expect(branching.deleteBranch('nonexistent')).toBe(false);
  });
});
