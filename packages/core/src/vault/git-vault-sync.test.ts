import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { GitVaultSync } from './git-vault-sync.js';
import type { IntelligenceEntry } from '../intelligence/types.js';

function makeEntry(overrides: Partial<IntelligenceEntry> = {}): IntelligenceEntry {
  return {
    id: `test-${randomUUID().slice(0, 8)}`,
    type: 'pattern',
    domain: 'architecture',
    title: 'Test Pattern',
    severity: 'suggestion',
    description: 'A test pattern.',
    tags: ['testing'],
    ...overrides,
  };
}

describe('GitVaultSync', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `git-vault-sync-${randomUUID().slice(0, 8)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── constructor defaults ────────────────────────────────────────────

  it('stores repoDir from config', () => {
    const sync = new GitVaultSync({ repoDir: tmpDir });
    expect(sync.getRepoDir()).toBe(tmpDir);
  });

  // ── init ────────────────────────────────────────────────────────────

  it('creates directory and initializes git repo', async () => {
    const repoDir = join(tmpDir, 'new-repo');
    const sync = new GitVaultSync({ repoDir });
    await sync.init();
    expect(existsSync(join(repoDir, '.git'))).toBe(true);
  });

  it('is idempotent — init twice does not fail', async () => {
    const sync = new GitVaultSync({ repoDir: tmpDir });
    await sync.init();
    await sync.init(); // should not throw
    expect(existsSync(join(tmpDir, '.git'))).toBe(true);
  });

  // ── ensureInitialized guard ─────────────────────────────────────────

  it('throws if onAdd called before init', async () => {
    const sync = new GitVaultSync({ repoDir: tmpDir });
    await expect(sync.onAdd(makeEntry())).rejects.toThrow('not initialized');
  });

  it('throws if onUpdate called before init', async () => {
    const sync = new GitVaultSync({ repoDir: tmpDir });
    await expect(sync.onUpdate(makeEntry())).rejects.toThrow('not initialized');
  });

  it('throws if onRemove called before init', async () => {
    const sync = new GitVaultSync({ repoDir: tmpDir });
    await expect(sync.onRemove('id', 'pattern', 'domain')).rejects.toThrow('not initialized');
  });

  // ── onAdd ───────────────────────────────────────────────────────────

  it('writes entry as JSON file on add', async () => {
    const sync = new GitVaultSync({ repoDir: tmpDir, autoCommit: false });
    await sync.init();
    const entry = makeEntry({ domain: 'testing', id: 'e1' });
    await sync.onAdd(entry);

    const filePath = join(tmpDir, 'testing', 'e1.json');
    expect(existsSync(filePath)).toBe(true);
    const content = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(content.id).toBe('e1');
    expect(content.title).toBe('Test Pattern');
  });

  it('creates domain subdirectory on add', async () => {
    const sync = new GitVaultSync({ repoDir: tmpDir, autoCommit: false });
    await sync.init();
    await sync.onAdd(makeEntry({ domain: 'new-domain' }));
    expect(existsSync(join(tmpDir, 'new-domain'))).toBe(true);
  });

  it('commits on add when autoCommit is true', async () => {
    const sync = new GitVaultSync({ repoDir: tmpDir, autoCommit: true });
    await sync.init();
    await sync.onAdd(makeEntry({ id: 'committed-entry' }));
    const log = await sync.log(5);
    expect(log.length).toBeGreaterThanOrEqual(1);
    expect(log[0]).toContain('vault: add');
  });

  // ── onUpdate ────────────────────────────────────────────────────────

  it('overwrites entry file on update', async () => {
    const sync = new GitVaultSync({ repoDir: tmpDir, autoCommit: false });
    await sync.init();
    const entry = makeEntry({ id: 'e1', domain: 'arch', title: 'Original' });
    await sync.onAdd(entry);
    await sync.onUpdate({ ...entry, title: 'Updated' });

    const content = JSON.parse(readFileSync(join(tmpDir, 'arch', 'e1.json'), 'utf-8'));
    expect(content.title).toBe('Updated');
  });

  // ── onRemove ────────────────────────────────────────────────────────

  it('deletes the entry file on remove', async () => {
    const sync = new GitVaultSync({ repoDir: tmpDir, autoCommit: false });
    await sync.init();
    const entry = makeEntry({ id: 'e1', domain: 'arch' });
    await sync.onAdd(entry);
    await sync.onRemove('e1', 'pattern', 'arch');
    expect(existsSync(join(tmpDir, 'arch', 'e1.json'))).toBe(false);
  });

  it('does not throw when removing non-existent file', async () => {
    const sync = new GitVaultSync({ repoDir: tmpDir, autoCommit: false });
    await sync.init();
    await sync.onRemove('nonexistent', 'pattern', 'arch'); // should not throw
  });

  // ── syncAll ─────────────────────────────────────────────────────────

  it('writes all entries and returns count', async () => {
    const sync = new GitVaultSync({ repoDir: tmpDir, autoCommit: false });
    await sync.init();
    const entries = [makeEntry({ id: 'e1', domain: 'd' }), makeEntry({ id: 'e2', domain: 'd' })];
    const result = await sync.syncAll(entries);
    expect(result.synced).toBe(2);
    expect(existsSync(join(tmpDir, 'd', 'e1.json'))).toBe(true);
    expect(existsSync(join(tmpDir, 'd', 'e2.json'))).toBe(true);
  });

  it('returns zero for empty array', async () => {
    const sync = new GitVaultSync({ repoDir: tmpDir, autoCommit: false });
    await sync.init();
    const result = await sync.syncAll([]);
    expect(result.synced).toBe(0);
  });

  // ── log ─────────────────────────────────────────────────────────────

  it('returns empty array when no commits exist', async () => {
    const sync = new GitVaultSync({ repoDir: tmpDir });
    await sync.init();
    const log = await sync.log();
    expect(log).toEqual([]);
  });

  // ── pull ────────────────────────────────────────────────────────────

  it('imports entries from git directory into vault', async () => {
    const sync = new GitVaultSync({ repoDir: tmpDir, autoCommit: false });
    await sync.init();
    // Write entry files manually
    const entry = makeEntry({ id: 'imported', domain: 'test-domain' });
    mkdirSync(join(tmpDir, 'test-domain'), { recursive: true });
    writeFileSync(join(tmpDir, 'test-domain', 'imported.json'), JSON.stringify(entry), 'utf-8');

    const mockVault = {
      get: vi.fn().mockReturnValue(null),
      seed: vi.fn().mockReturnValue(1),
    };
    const result = await sync.pull(mockVault);
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
    expect(mockVault.seed).toHaveBeenCalled();
  });

  it('skips conflicting entries when onConflict is vault', async () => {
    const sync = new GitVaultSync({ repoDir: tmpDir, autoCommit: false });
    await sync.init();
    const entry = makeEntry({ id: 'conflict', domain: 'test' });
    mkdirSync(join(tmpDir, 'test'), { recursive: true });
    writeFileSync(join(tmpDir, 'test', 'conflict.json'), JSON.stringify(entry), 'utf-8');

    const mockVault = {
      get: vi.fn().mockReturnValue(entry), // exists in vault
      seed: vi.fn().mockReturnValue(1),
    };
    const result = await sync.pull(mockVault, { onConflict: 'vault' });
    expect(result.skipped).toBe(1);
    expect(result.conflicts).toBe(1);
    expect(mockVault.seed).not.toHaveBeenCalled();
  });

  it('overwrites conflicting entries when onConflict is git (default)', async () => {
    const sync = new GitVaultSync({ repoDir: tmpDir, autoCommit: false });
    await sync.init();
    const entry = makeEntry({ id: 'conflict', domain: 'test' });
    mkdirSync(join(tmpDir, 'test'), { recursive: true });
    writeFileSync(join(tmpDir, 'test', 'conflict.json'), JSON.stringify(entry), 'utf-8');

    const mockVault = {
      get: vi.fn().mockReturnValue(entry),
      seed: vi.fn().mockReturnValue(1),
    };
    const result = await sync.pull(mockVault);
    expect(result.imported).toBe(1);
    expect(result.conflicts).toBe(1);
  });

  // ── sync (bidirectional) ────────────────────────────────────────────

  it('pushes and pulls during bidirectional sync', async () => {
    const sync = new GitVaultSync({ repoDir: tmpDir, autoCommit: false });
    await sync.init();

    const vaultEntry = makeEntry({ id: 'vault-e', domain: 'dom' });
    const mockVault = {
      get: vi.fn().mockReturnValue(null),
      seed: vi.fn().mockReturnValue(1),
      exportAll: vi.fn().mockReturnValue({ entries: [vaultEntry] }),
    };

    const result = await sync.sync(mockVault);
    expect(result.pushed).toBe(1);
    // The pushed entry will also be found during pull, but filtered by vaultIds
    expect(result.pulled).toBe(0);
  });
});
