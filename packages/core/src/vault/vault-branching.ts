/**
 * Vault Branching — experiment with knowledge changes on named branches
 * before merging to the main vault.
 *
 * Each branch tracks a set of operations (add/modify/remove) against vault entries.
 * On merge, all operations are applied atomically to the main vault.
 * Conflict resolution: branch entry wins (explicit user action to merge).
 *
 * Improved over Salvador: uses PersistenceProvider abstraction, separate
 * metadata table (no sentinel markers), and merge logic built-in.
 */

import type { PersistenceProvider } from '../persistence/types.js';
import type { IntelligenceEntry } from '../intelligence/types.js';
import type { Vault } from './vault.js';

// =============================================================================
// TYPES
// =============================================================================

export type BranchAction = 'add' | 'modify' | 'remove';

export interface BranchEntry {
  id: number;
  branchName: string;
  entryId: string;
  action: BranchAction;
  entryData: IntelligenceEntry | null;
  createdAt: number;
}

export interface BranchSummary {
  name: string;
  entryCount: number;
  createdAt: number;
  merged: boolean;
}

export interface MergeResult {
  merged: boolean;
  branchName: string;
  added: number;
  modified: number;
  removed: number;
  total: number;
}

// =============================================================================
// VAULT BRANCHING
// =============================================================================

export class VaultBranching {
  private provider: PersistenceProvider;
  private vault: Vault;

  constructor(vault: Vault) {
    this.vault = vault;
    this.provider = vault.getProvider();
    this.initialize();
  }

  private initialize(): void {
    this.provider.execSql(`
      CREATE TABLE IF NOT EXISTS vault_branch_meta (
        name TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        merged_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS vault_branch_ops (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        branch_name TEXT NOT NULL REFERENCES vault_branch_meta(name),
        entry_id TEXT NOT NULL,
        action TEXT NOT NULL CHECK(action IN ('add', 'modify', 'remove')),
        entry_data TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_branch_ops_name ON vault_branch_ops(branch_name);
    `);
  }

  /**
   * Create a new branch. Name must be unique among active (unmerged) branches.
   */
  branch(name: string): boolean {
    const existing = this.provider.get<{ name: string; merged_at: number | null }>(
      'SELECT name, merged_at FROM vault_branch_meta WHERE name = @name',
      { name },
    );
    if (existing && existing.merged_at === null) {
      throw new Error(`Branch '${name}' already exists`);
    }
    // Allow reuse of merged branch names — delete old record first
    if (existing) {
      this.provider.run('DELETE FROM vault_branch_ops WHERE branch_name = @name', { name });
      this.provider.run('DELETE FROM vault_branch_meta WHERE name = @name', { name });
    }
    this.provider.run('INSERT INTO vault_branch_meta (name) VALUES (@name)', { name });
    return true;
  }

  /**
   * Add an operation to a branch.
   * For 'add' and 'modify', entryData is required.
   * For 'remove', entryData is optional.
   */
  addOperation(
    branchName: string,
    entryId: string,
    action: BranchAction,
    entryData?: IntelligenceEntry,
  ): void {
    this.assertActiveBranch(branchName);
    if ((action === 'add' || action === 'modify') && !entryData) {
      throw new Error(`Entry data required for '${action}' action`);
    }
    this.provider.run(
      `INSERT INTO vault_branch_ops (branch_name, entry_id, action, entry_data)
       VALUES (@branchName, @entryId, @action, @entryData)`,
      {
        branchName,
        entryId,
        action,
        entryData: entryData ? JSON.stringify(entryData) : null,
      },
    );
  }

  /**
   * List entries on a branch.
   */
  listEntries(branchName: string): BranchEntry[] {
    const rows = this.provider.all<{
      id: number;
      branch_name: string;
      entry_id: string;
      action: string;
      entry_data: string | null;
      created_at: number;
    }>(
      `SELECT id, branch_name, entry_id, action, entry_data, created_at
       FROM vault_branch_ops WHERE branch_name = @branchName
       ORDER BY created_at ASC`,
      { branchName },
    );
    return rows.map((r) => ({
      id: r.id,
      branchName: r.branch_name,
      entryId: r.entry_id,
      action: r.action as BranchAction,
      entryData: r.entry_data ? (JSON.parse(r.entry_data) as IntelligenceEntry) : null,
      createdAt: r.created_at,
    }));
  }

  /**
   * List all branches with summary info.
   */
  listBranches(): BranchSummary[] {
    const rows = this.provider.all<{
      name: string;
      created_at: number;
      merged_at: number | null;
      entry_count: number;
    }>(
      `SELECT m.name, m.created_at, m.merged_at,
              COALESCE(COUNT(o.id), 0) as entry_count
       FROM vault_branch_meta m
       LEFT JOIN vault_branch_ops o ON o.branch_name = m.name
       GROUP BY m.name
       ORDER BY m.created_at DESC`,
    );
    return rows.map((r) => ({
      name: r.name,
      entryCount: r.entry_count,
      createdAt: r.created_at,
      merged: r.merged_at !== null,
    }));
  }

  /**
   * Merge a branch into the main vault. Applies all operations atomically.
   * Conflict resolution: branch entry wins (the user explicitly chose to merge).
   */
  merge(branchName: string): MergeResult {
    this.assertActiveBranch(branchName);
    const ops = this.listEntries(branchName);

    // Collapse ops: for each entryId, only the last action matters
    const collapsed = new Map<string, BranchEntry>();
    for (const op of ops) {
      collapsed.set(op.entryId, op);
    }

    let added = 0;
    let modified = 0;
    let removed = 0;

    this.provider.transaction(() => {
      for (const op of collapsed.values()) {
        switch (op.action) {
          case 'add':
            if (op.entryData) {
              this.vault.add(op.entryData);
              added++;
            }
            break;
          case 'modify':
            if (op.entryData) {
              // Branch wins: upsert via seed (INSERT OR REPLACE)
              this.vault.add(op.entryData);
              modified++;
            }
            break;
          case 'remove':
            this.vault.remove(op.entryId);
            removed++;
            break;
        }
      }
      // Mark branch as merged
      this.provider.run(
        'UPDATE vault_branch_meta SET merged_at = unixepoch() WHERE name = @branchName',
        { branchName },
      );
    });

    return {
      merged: true,
      branchName,
      added,
      modified,
      removed,
      total: added + modified + removed,
    };
  }

  /**
   * Delete a branch and all its operations.
   */
  deleteBranch(branchName: string): boolean {
    const existing = this.provider.get<{ name: string }>(
      'SELECT name FROM vault_branch_meta WHERE name = @branchName',
      { branchName },
    );
    if (!existing) return false;

    this.provider.transaction(() => {
      this.provider.run('DELETE FROM vault_branch_ops WHERE branch_name = @branchName', {
        branchName,
      });
      this.provider.run('DELETE FROM vault_branch_meta WHERE name = @branchName', { branchName });
    });
    return true;
  }

  private assertActiveBranch(name: string): void {
    const branch = this.provider.get<{ merged_at: number | null }>(
      'SELECT merged_at FROM vault_branch_meta WHERE name = @name',
      { name },
    );
    if (!branch) throw new Error(`Branch '${name}' does not exist`);
    if (branch.merged_at !== null) throw new Error(`Branch '${name}' is already merged`);
  }
}
