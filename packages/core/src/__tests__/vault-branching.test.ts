/**
 * Vault Branching Tests — branch, merge, list, delete operations.
 */

import { describe, test, expect, afterEach } from 'vitest';
import { Vault } from '../vault/vault.js';
import { VaultBranching } from '../vault/vault-branching.js';
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

describe('VaultBranching', () => {
  let vault: Vault;
  let branching: VaultBranching;

  afterEach(() => {
    vault?.close();
  });

  function setup() {
    vault = new Vault(':memory:');
    branching = new VaultBranching(vault);
    return { vault, branching };
  }

  // ─── branch() ──────────────────────────────────────────────

  test('creates a branch', () => {
    setup();
    expect(branching.branch('experiment')).toBe(true);
    const branches = branching.listBranches();
    expect(branches).toHaveLength(1);
    expect(branches[0].name).toBe('experiment');
    expect(branches[0].merged).toBe(false);
  });

  test('throws on duplicate active branch name', () => {
    setup();
    branching.branch('dup');
    expect(() => branching.branch('dup')).toThrow("Branch 'dup' already exists");
  });

  test('allows reusing a merged branch name', () => {
    setup();
    branching.branch('reuse');
    branching.merge('reuse');
    // Should not throw — old merged branch gets cleaned up
    expect(branching.branch('reuse')).toBe(true);
  });

  // ─── addOperation() ───────────────────────────────────────

  test('adds operations to a branch', () => {
    setup();
    branching.branch('ops-test');
    const entry = makeEntry('e1', 'Test Entry');
    branching.addOperation('ops-test', 'e1', 'add', entry);
    branching.addOperation('ops-test', 'e2', 'remove');

    const entries = branching.listEntries('ops-test');
    expect(entries).toHaveLength(2);
    expect(entries[0].action).toBe('add');
    expect(entries[0].entryData?.id).toBe('e1');
    expect(entries[1].action).toBe('remove');
    expect(entries[1].entryData).toBeNull();
  });

  test('throws when adding to non-existent branch', () => {
    setup();
    expect(() => branching.addOperation('ghost', 'e1', 'add', makeEntry('e1', 'x'))).toThrow(
      "Branch 'ghost' does not exist",
    );
  });

  test('throws when adding to merged branch', () => {
    setup();
    branching.branch('sealed');
    branching.merge('sealed');
    expect(() => branching.addOperation('sealed', 'e1', 'add', makeEntry('e1', 'x'))).toThrow(
      "Branch 'sealed' is already merged",
    );
  });

  test('requires entry data for add action', () => {
    setup();
    branching.branch('data-check');
    expect(() => branching.addOperation('data-check', 'e1', 'add')).toThrow(
      "Entry data required for 'add' action",
    );
  });

  test('requires entry data for modify action', () => {
    setup();
    branching.branch('data-check');
    expect(() => branching.addOperation('data-check', 'e1', 'modify')).toThrow(
      "Entry data required for 'modify' action",
    );
  });

  // ─── listBranches() ───────────────────────────────────────

  test('lists multiple branches', () => {
    setup();
    branching.branch('alpha');
    branching.branch('beta');
    branching.addOperation('alpha', 'e1', 'add', makeEntry('e1', 'Entry'));
    branching.addOperation('alpha', 'e2', 'add', makeEntry('e2', 'Entry 2'));

    const branches = branching.listBranches();
    expect(branches).toHaveLength(2);
    const alpha = branches.find((b) => b.name === 'alpha')!;
    const beta = branches.find((b) => b.name === 'beta')!;
    expect(alpha.entryCount).toBe(2);
    expect(beta.entryCount).toBe(0);
  });

  test('empty list when no branches', () => {
    setup();
    expect(branching.listBranches()).toEqual([]);
  });

  // ─── merge() ──────────────────────────────────────────────

  test('merge adds new entries to vault', () => {
    setup();
    branching.branch('add-test');
    branching.addOperation('add-test', 'new1', 'add', makeEntry('new1', 'New Entry'));
    branching.addOperation('add-test', 'new2', 'add', makeEntry('new2', 'New Entry 2'));

    const result = branching.merge('add-test');
    expect(result.merged).toBe(true);
    expect(result.added).toBe(2);
    expect(result.total).toBe(2);

    // Verify entries exist in vault
    expect(vault.get('new1')?.title).toBe('New Entry');
    expect(vault.get('new2')?.title).toBe('New Entry 2');
  });

  test('merge modifies existing entries (branch wins)', () => {
    setup();
    vault.add(makeEntry('existing', 'Original Title'));

    branching.branch('modify-test');
    const modified = makeEntry('existing', 'Updated Title');
    branching.addOperation('modify-test', 'existing', 'modify', modified);

    const result = branching.merge('modify-test');
    expect(result.modified).toBe(1);

    // Branch entry wins
    expect(vault.get('existing')?.title).toBe('Updated Title');
  });

  test('merge removes entries from vault', () => {
    setup();
    vault.add(makeEntry('doomed', 'About to be removed'));

    branching.branch('remove-test');
    branching.addOperation('remove-test', 'doomed', 'remove');

    const result = branching.merge('remove-test');
    expect(result.removed).toBe(1);
    expect(vault.get('doomed')).toBeNull();
  });

  test('merge collapses multiple ops on same entry', () => {
    setup();
    branching.branch('collapse-test');
    branching.addOperation('collapse-test', 'e1', 'add', makeEntry('e1', 'First'));
    branching.addOperation('collapse-test', 'e1', 'modify', makeEntry('e1', 'Second'));
    branching.addOperation('collapse-test', 'e1', 'remove');

    const result = branching.merge('collapse-test');
    // Last op wins: remove
    expect(result.removed).toBe(1);
    expect(result.added).toBe(0);
    expect(vault.get('e1')).toBeNull();
  });

  test('merge marks branch as merged', () => {
    setup();
    branching.branch('merge-mark');
    branching.merge('merge-mark');

    const branches = branching.listBranches();
    const merged = branches.find((b) => b.name === 'merge-mark')!;
    expect(merged.merged).toBe(true);
  });

  test('merge throws on non-existent branch', () => {
    setup();
    expect(() => branching.merge('ghost')).toThrow("Branch 'ghost' does not exist");
  });

  test('merge throws on already-merged branch', () => {
    setup();
    branching.branch('double-merge');
    branching.merge('double-merge');
    expect(() => branching.merge('double-merge')).toThrow(
      "Branch 'double-merge' is already merged",
    );
  });

  // ─── deleteBranch() ───────────────────────────────────────

  test('deletes a branch', () => {
    setup();
    branching.branch('temp');
    branching.addOperation('temp', 'e1', 'add', makeEntry('e1', 'Temp'));
    expect(branching.deleteBranch('temp')).toBe(true);
    expect(branching.listBranches()).toEqual([]);
  });

  test('returns false for non-existent branch', () => {
    setup();
    expect(branching.deleteBranch('nonexistent')).toBe(false);
  });

  test('deletes a merged branch', () => {
    setup();
    branching.branch('merged-del');
    branching.merge('merged-del');
    expect(branching.deleteBranch('merged-del')).toBe(true);
  });

  // ─── Mixed workflow ───────────────────────────────────────

  test('full workflow: branch, add entries, merge, verify vault', () => {
    setup();
    // Seed vault with existing entries
    vault.add(makeEntry('existing-1', 'Existing Pattern'));
    vault.add(makeEntry('to-update', 'Old Title'));
    vault.add(makeEntry('to-remove', 'Will Be Removed'));

    // Create branch and make changes
    branching.branch('feature-x');
    branching.addOperation(
      'feature-x',
      'new-entry',
      'add',
      makeEntry('new-entry', 'New from branch'),
    );
    branching.addOperation('feature-x', 'to-update', 'modify', makeEntry('to-update', 'New Title'));
    branching.addOperation('feature-x', 'to-remove', 'remove');

    // Verify vault is unchanged before merge
    expect(vault.get('to-update')?.title).toBe('Old Title');
    expect(vault.get('to-remove')).not.toBeNull();
    expect(vault.get('new-entry')).toBeNull();

    // Merge
    const result = branching.merge('feature-x');
    expect(result.added).toBe(1);
    expect(result.modified).toBe(1);
    expect(result.removed).toBe(1);

    // Verify vault state after merge
    expect(vault.get('existing-1')?.title).toBe('Existing Pattern'); // untouched
    expect(vault.get('new-entry')?.title).toBe('New from branch');
    expect(vault.get('to-update')?.title).toBe('New Title');
    expect(vault.get('to-remove')).toBeNull();
  });
});
