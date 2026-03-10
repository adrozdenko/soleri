/**
 * Git Vault Sync Tests — auto-commit vault changes to local git.
 */

import { describe, test, expect, afterEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { GitVaultSync } from '../vault/git-vault-sync.js';
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

function gitLog(repoDir: string): string[] {
  try {
    const out = execFileSync('git', ['log', '--oneline'], { cwd: repoDir, encoding: 'utf-8' });
    return out
      .trim()
      .split('\n')
      .filter((l) => l.length > 0);
  } catch {
    return [];
  }
}

describe('GitVaultSync', () => {
  const dirs: string[] = [];

  function makeTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'git-vault-sync-'));
    dirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of dirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  // ─── init ──────────────────────────────────────────────

  test('init creates git repo', async () => {
    const repoDir = join(makeTempDir(), 'vault');
    const sync = new GitVaultSync({ repoDir });
    await sync.init();
    expect(existsSync(join(repoDir, '.git'))).toBe(true);
  });

  test('init is idempotent', async () => {
    const repoDir = join(makeTempDir(), 'vault');
    const sync = new GitVaultSync({ repoDir });
    await sync.init();
    await sync.init(); // should not throw
    expect(existsSync(join(repoDir, '.git'))).toBe(true);
  });

  test('throws if not initialized', async () => {
    const repoDir = join(makeTempDir(), 'vault');
    const sync = new GitVaultSync({ repoDir });
    await expect(sync.onAdd(makeEntry('e1', 'Test'))).rejects.toThrow('not initialized');
  });

  // ─── onAdd ─────────────────────────────────────────────

  test('onAdd writes entry file and commits', async () => {
    const repoDir = join(makeTempDir(), 'vault');
    const sync = new GitVaultSync({ repoDir });
    await sync.init();

    const entry = makeEntry('pattern-1', 'Test Pattern', 'design');
    await sync.onAdd(entry);

    // File exists
    const filePath = join(repoDir, 'design', 'pattern-1.json');
    expect(existsSync(filePath)).toBe(true);

    // Content is valid JSON
    const content = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(content.id).toBe('pattern-1');
    expect(content.title).toBe('Test Pattern');

    // Git commit exists
    const log = gitLog(repoDir);
    expect(log).toHaveLength(1);
    expect(log[0]).toContain('vault: add pattern [design] pattern-1');
  });

  // ─── onUpdate ──────────────────────────────────────────

  test('onUpdate overwrites file and commits', async () => {
    const repoDir = join(makeTempDir(), 'vault');
    const sync = new GitVaultSync({ repoDir });
    await sync.init();

    await sync.onAdd(makeEntry('e1', 'Original'));
    await sync.onUpdate({ ...makeEntry('e1', 'Updated'), description: 'Updated description' });

    const content = JSON.parse(readFileSync(join(repoDir, 'general', 'e1.json'), 'utf-8'));
    expect(content.title).toBe('Updated');
    expect(content.description).toBe('Updated description');

    const log = gitLog(repoDir);
    expect(log).toHaveLength(2);
    expect(log[0]).toContain('vault: update');
  });

  // ─── onRemove ──────────────────────────────────────────

  test('onRemove deletes file and commits', async () => {
    const repoDir = join(makeTempDir(), 'vault');
    const sync = new GitVaultSync({ repoDir });
    await sync.init();

    await sync.onAdd(makeEntry('doomed', 'Will Be Removed'));
    expect(existsSync(join(repoDir, 'general', 'doomed.json'))).toBe(true);

    await sync.onRemove('doomed', 'pattern', 'general');
    expect(existsSync(join(repoDir, 'general', 'doomed.json'))).toBe(false);

    const log = gitLog(repoDir);
    expect(log).toHaveLength(2);
    expect(log[0]).toContain('vault: remove');
  });

  test('onRemove is a no-op for non-existent file', async () => {
    const repoDir = join(makeTempDir(), 'vault');
    const sync = new GitVaultSync({ repoDir });
    await sync.init();

    // Should not throw
    await sync.onRemove('nonexistent', 'pattern', 'general');
  });

  // ─── syncAll ───────────────────────────────────────────

  test('syncAll writes all entries in a single commit', async () => {
    const repoDir = join(makeTempDir(), 'vault');
    const sync = new GitVaultSync({ repoDir });
    await sync.init();

    const entries = [
      makeEntry('e1', 'Entry 1', 'design'),
      makeEntry('e2', 'Entry 2', 'design'),
      makeEntry('e3', 'Entry 3', 'a11y'),
    ];

    const result = await sync.syncAll(entries);
    expect(result.synced).toBe(3);

    // Files exist in domain subdirectories
    expect(existsSync(join(repoDir, 'design', 'e1.json'))).toBe(true);
    expect(existsSync(join(repoDir, 'design', 'e2.json'))).toBe(true);
    expect(existsSync(join(repoDir, 'a11y', 'e3.json'))).toBe(true);

    // Single commit
    const log = gitLog(repoDir);
    expect(log).toHaveLength(1);
    expect(log[0]).toContain('bulk sync 3 entries');
  });

  // ─── log ───────────────────────────────────────────────

  test('log returns commit history', async () => {
    const repoDir = join(makeTempDir(), 'vault');
    const sync = new GitVaultSync({ repoDir });
    await sync.init();

    await sync.onAdd(makeEntry('e1', 'First'));
    await sync.onAdd(makeEntry('e2', 'Second'));

    const log = await sync.log();
    expect(log).toHaveLength(2);
  });

  test('log returns empty for fresh repo', async () => {
    const repoDir = join(makeTempDir(), 'vault');
    const sync = new GitVaultSync({ repoDir });
    await sync.init();

    const log = await sync.log();
    expect(log).toEqual([]);
  });

  // ─── autoCommit: false ─────────────────────────────────

  test('autoCommit false writes files without committing', async () => {
    const repoDir = join(makeTempDir(), 'vault');
    const sync = new GitVaultSync({ repoDir, autoCommit: false });
    await sync.init();

    await sync.onAdd(makeEntry('e1', 'No Commit'));
    expect(existsSync(join(repoDir, 'general', 'e1.json'))).toBe(true);

    // No commits
    const log = gitLog(repoDir);
    expect(log).toEqual([]);
  });

  // ─── Multiple domains ─────────────────────────────────

  test('organizes entries by domain subdirectories', async () => {
    const repoDir = join(makeTempDir(), 'vault');
    const sync = new GitVaultSync({ repoDir });
    await sync.init();

    await sync.onAdd(makeEntry('p1', 'Design pattern', 'design'));
    await sync.onAdd(makeEntry('p2', 'A11y rule', 'accessibility'));
    await sync.onAdd(makeEntry('p3', 'General tip', 'general'));

    expect(existsSync(join(repoDir, 'design', 'p1.json'))).toBe(true);
    expect(existsSync(join(repoDir, 'accessibility', 'p2.json'))).toBe(true);
    expect(existsSync(join(repoDir, 'general', 'p3.json'))).toBe(true);

    const log = gitLog(repoDir);
    expect(log).toHaveLength(3);
  });
});
