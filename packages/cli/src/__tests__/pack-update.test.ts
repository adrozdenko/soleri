import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PackLockfile } from '@soleri/core';
import type { LockEntry } from '@soleri/core';

/**
 * Tests for `soleri pack update` command logic.
 *
 * We test the core logic (lockfile reading, version comparison, lockfile writing)
 * rather than the full CLI invocation, following the same pattern as other CLI tests.
 */

function makeLockEntry(overrides: Partial<LockEntry> = {}): LockEntry {
  return {
    id: 'test-pack',
    version: '1.0.0',
    type: 'knowledge',
    source: 'npm',
    directory: '/tmp/test-pack',
    integrity: 'sha256-abc',
    installedAt: new Date().toISOString(),
    vaultEntries: 0,
    skills: [],
    hooks: [],
    facadesRegistered: false,
    ...overrides,
  };
}

describe('pack update — lockfile logic', () => {
  let tempDir: string;
  let lockfilePath: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `pack-update-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    lockfilePath = join(tempDir, 'soleri.lock');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should list npm packs from lockfile', () => {
    const lockfile = new PackLockfile(lockfilePath);
    lockfile.set(makeLockEntry({ id: 'pack-a', source: 'npm', version: '1.0.0' }));
    lockfile.set(makeLockEntry({ id: 'pack-b', source: 'local', version: '2.0.0' }));
    lockfile.save();

    const reloaded = new PackLockfile(lockfilePath);
    const npmPacks = reloaded.list().filter((e) => e.source === 'npm');
    expect(npmPacks).toHaveLength(1);
    expect(npmPacks[0].id).toBe('pack-a');
  });

  it('should identify local/built-in packs as non-updatable', () => {
    const lockfile = new PackLockfile(lockfilePath);
    lockfile.set(makeLockEntry({ id: 'local-pack', source: 'local' }));
    lockfile.set(makeLockEntry({ id: 'builtin-pack', source: 'built-in' }));
    lockfile.save();

    const reloaded = new PackLockfile(lockfilePath);
    const skipped = reloaded.list().filter((e) => e.source !== 'npm');
    expect(skipped).toHaveLength(2);
    expect(skipped.map((e) => e.id).sort()).toEqual(['builtin-pack', 'local-pack']);
  });

  it('should return empty list when no packs installed', () => {
    const lockfile = new PackLockfile(lockfilePath);
    expect(lockfile.list()).toHaveLength(0);
  });

  it('should update lockfile entry with new version', () => {
    const lockfile = new PackLockfile(lockfilePath);
    const entry = makeLockEntry({ id: 'pack-a', version: '1.0.0', source: 'npm' });
    lockfile.set(entry);
    lockfile.save();

    // Simulate update
    const updatedLockfile = new PackLockfile(lockfilePath);
    const existing = updatedLockfile.get('pack-a')!;
    updatedLockfile.set({
      ...existing,
      version: '1.2.0',
      installedAt: new Date().toISOString(),
    });
    updatedLockfile.save();

    const verified = new PackLockfile(lockfilePath);
    expect(verified.get('pack-a')!.version).toBe('1.2.0');
  });

  it('should not modify lockfile when versions match (no outdated)', () => {
    const lockfile = new PackLockfile(lockfilePath);
    const entry = makeLockEntry({ id: 'pack-a', version: '1.0.0', source: 'npm' });
    lockfile.set(entry);
    lockfile.save();

    const originalContent = readFileSync(lockfilePath, 'utf-8');

    // "Check" pass — read lockfile, compare versions, find no updates
    const checkLockfile = new PackLockfile(lockfilePath);
    const npmPacks = checkLockfile.list().filter((e) => e.source === 'npm');
    const outdated = npmPacks.filter((e) => {
      // Simulate: latest version == current version
      const latestVersion = '1.0.0';
      return e.version !== latestVersion;
    });

    expect(outdated).toHaveLength(0);
    // Lockfile should not have been modified
    expect(readFileSync(lockfilePath, 'utf-8')).toBe(originalContent);
  });

  it('should handle mixed npm and local packs correctly', () => {
    const lockfile = new PackLockfile(lockfilePath);
    lockfile.set(makeLockEntry({ id: 'npm-pack-1', source: 'npm', version: '1.0.0' }));
    lockfile.set(makeLockEntry({ id: 'npm-pack-2', source: 'npm', version: '2.0.0' }));
    lockfile.set(makeLockEntry({ id: 'local-pack', source: 'local', version: '1.0.0' }));
    lockfile.save();

    const reloaded = new PackLockfile(lockfilePath);
    const all = reloaded.list();
    const npmOnly = all.filter((e) => e.source === 'npm');
    const nonNpm = all.filter((e) => e.source !== 'npm');

    expect(all).toHaveLength(3);
    expect(npmOnly).toHaveLength(2);
    expect(nonNpm).toHaveLength(1);
    expect(nonNpm[0].id).toBe('local-pack');
  });

  it('should filter by specific pack ID', () => {
    const lockfile = new PackLockfile(lockfilePath);
    lockfile.set(makeLockEntry({ id: 'pack-a', source: 'npm', version: '1.0.0' }));
    lockfile.set(makeLockEntry({ id: 'pack-b', source: 'npm', version: '2.0.0' }));
    lockfile.save();

    const reloaded = new PackLockfile(lockfilePath);
    const filtered = reloaded
      .list()
      .filter((e) => e.source === 'npm')
      .filter((e) => e.id === 'pack-a');

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('pack-a');
  });

  it('should detect when specific pack is local and cannot be updated', () => {
    const lockfile = new PackLockfile(lockfilePath);
    lockfile.set(makeLockEntry({ id: 'my-local', source: 'local', version: '1.0.0' }));
    lockfile.save();

    const reloaded = new PackLockfile(lockfilePath);
    const packId = 'my-local';
    const isInstalled = reloaded.has(packId);
    const entry = reloaded.get(packId)!;
    const isNpm = entry.source === 'npm';

    expect(isInstalled).toBe(true);
    expect(isNpm).toBe(false);
  });
});
