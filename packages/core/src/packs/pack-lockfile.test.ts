/**
 * Pack Lockfile & Resolver Tests.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PackLockfile, inferPackType } from './lockfile.js';
import type { LockEntry } from './lockfile.js';
import { resolvePack, checkVersionCompat } from './resolver.js';

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'pack-lock-'));
}

function makeEntry(overrides: Partial<LockEntry> = {}): LockEntry {
  return {
    id: 'test-pack',
    version: '1.0.0',
    type: 'knowledge',
    source: 'local',
    directory: '/tmp/test-pack',
    integrity: 'sha256-abc123',
    installedAt: new Date().toISOString(),
    vaultEntries: 10,
    skills: [],
    hooks: [],
    facadesRegistered: false,
    ...overrides,
  };
}

// ─── PackLockfile ─────────────────────────────────────────────

describe('PackLockfile', () => {
  let tmpDir: string;
  let lockPath: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
    lockPath = join(tmpDir, 'soleri.lock');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('creates empty lockfile on first use', () => {
    const lock = new PackLockfile(lockPath);
    expect(lock.size).toBe(0);
    expect(lock.list()).toEqual([]);
  });

  test('set and get entries', () => {
    const lock = new PackLockfile(lockPath);
    const entry = makeEntry();
    lock.set(entry);
    expect(lock.get('test-pack')).toEqual(entry);
    expect(lock.has('test-pack')).toBe(true);
    expect(lock.size).toBe(1);
  });

  test('remove entries', () => {
    const lock = new PackLockfile(lockPath);
    lock.set(makeEntry());
    expect(lock.remove('test-pack')).toBe(true);
    expect(lock.has('test-pack')).toBe(false);
    expect(lock.size).toBe(0);
  });

  test('remove returns false for unknown', () => {
    const lock = new PackLockfile(lockPath);
    expect(lock.remove('nonexistent')).toBe(false);
  });

  test('save persists to disk', () => {
    const lock = new PackLockfile(lockPath);
    lock.set(makeEntry());
    lock.save();
    expect(existsSync(lockPath)).toBe(true);

    const data = JSON.parse(readFileSync(lockPath, 'utf-8'));
    expect(data.version).toBe(1);
    expect(data.packs['test-pack'].version).toBe('1.0.0');
  });

  test('save returns false when not dirty', () => {
    const lock = new PackLockfile(lockPath);
    expect(lock.save()).toBe(false);
  });

  test('reload reads from disk', () => {
    const lock1 = new PackLockfile(lockPath);
    lock1.set(makeEntry());
    lock1.save();

    const lock2 = new PackLockfile(lockPath);
    expect(lock2.has('test-pack')).toBe(true);
    expect(lock2.get('test-pack')?.version).toBe('1.0.0');
  });

  test('handles corrupted file gracefully', () => {
    writeFileSync(lockPath, 'not json{{{', 'utf-8');
    const lock = new PackLockfile(lockPath);
    expect(lock.size).toBe(0);
  });

  test('handles wrong version gracefully', () => {
    writeFileSync(lockPath, JSON.stringify({ version: 99, packs: {} }), 'utf-8');
    const lock = new PackLockfile(lockPath);
    expect(lock.size).toBe(0);
  });

  test('multiple entries', () => {
    const lock = new PackLockfile(lockPath);
    lock.set(makeEntry({ id: 'pack-a', type: 'hooks' }));
    lock.set(makeEntry({ id: 'pack-b', type: 'skills' }));
    lock.set(makeEntry({ id: 'pack-c', type: 'knowledge' }));
    expect(lock.size).toBe(3);
    expect(lock.list()).toHaveLength(3);
  });

  test('update existing entry', () => {
    const lock = new PackLockfile(lockPath);
    lock.set(makeEntry({ id: 'pack-a', version: '1.0.0' }));
    lock.set(makeEntry({ id: 'pack-a', version: '2.0.0' }));
    expect(lock.size).toBe(1);
    expect(lock.get('pack-a')?.version).toBe('2.0.0');
  });

  test('computeIntegrity returns sha256 hash', () => {
    const manifestPath = join(tmpDir, 'soleri-pack.json');
    writeFileSync(manifestPath, '{"id": "test"}', 'utf-8');
    const hash = PackLockfile.computeIntegrity(manifestPath);
    expect(hash).toMatch(/^sha256-[a-f0-9]{64}$/);
  });

  test('computeIntegrity returns empty for missing file', () => {
    expect(PackLockfile.computeIntegrity('/nonexistent/path')).toBe('');
  });
});

// ─── inferPackType ────────────────────────────────────────────

describe('inferPackType', () => {
  test('knowledge when only vault', () => {
    expect(inferPackType({ vault: { dir: 'vault' } })).toBe('knowledge');
  });

  test('hooks when only hooks', () => {
    expect(inferPackType({ hooks: { dir: 'hooks' } })).toBe('hooks');
  });

  test('skills when only skills', () => {
    expect(inferPackType({ skills: { dir: 'skills' } })).toBe('skills');
  });

  test('domain when only facades', () => {
    expect(inferPackType({ facades: [{ name: 'test', ops: [] }] })).toBe('domain');
  });

  test('bundle when multiple types', () => {
    expect(inferPackType({ vault: { dir: 'v' }, hooks: { dir: 'h' } })).toBe('bundle');
  });

  test('knowledge when empty', () => {
    expect(inferPackType({})).toBe('knowledge');
  });
});

// ─── resolvePack ──────────────────────────────────────────────

describe('resolvePack', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('resolves local absolute path', () => {
    writeFileSync(join(tmpDir, 'soleri-pack.json'), '{}', 'utf-8');
    const result = resolvePack(tmpDir, { npm: false });
    expect(result.source).toBe('local');
    expect(result.directory).toBe(tmpDir);
  });

  test('resolves from built-in directories', () => {
    const builtinDir = join(tmpDir, 'builtins');
    const packDir = join(builtinDir, 'my-pack');
    mkdirSync(packDir, { recursive: true });
    writeFileSync(join(packDir, 'soleri-pack.json'), '{}', 'utf-8');

    const result = resolvePack('my-pack', { builtinDirs: [builtinDir], npm: false });
    expect(result.source).toBe('built-in');
    expect(result.directory).toBe(packDir);
  });

  test('throws for nonexistent pack without npm', () => {
    expect(() => resolvePack('nonexistent-pack-xyz', { npm: false })).toThrow(/not found/);
  });

  test('throws for nonexistent local path', () => {
    expect(() => resolvePack('/nonexistent/absolute/path', { npm: false })).toThrow(/not found/);
  });
});

// ─── checkVersionCompat ──────────────────────────────────────

describe('checkVersionCompat', () => {
  test('returns true for empty/undefined range', () => {
    expect(checkVersionCompat('2.10.0')).toBe(true);
    expect(checkVersionCompat('2.10.0', '')).toBe(true);
    expect(checkVersionCompat('2.10.0', undefined)).toBe(true);
  });

  test('exact version match', () => {
    expect(checkVersionCompat('2.10.0', '2.10.0')).toBe(true);
    expect(checkVersionCompat('2.10.1', '2.10.0')).toBe(false);
  });

  test('caret range ^X.Y.Z', () => {
    expect(checkVersionCompat('2.10.0', '^2.0.0')).toBe(true);
    expect(checkVersionCompat('2.0.0', '^2.0.0')).toBe(true);
    expect(checkVersionCompat('3.0.0', '^2.0.0')).toBe(false);
    expect(checkVersionCompat('1.9.9', '^2.0.0')).toBe(false);
  });

  test('tilde range ~X.Y.Z', () => {
    expect(checkVersionCompat('1.2.5', '~1.2.3')).toBe(true);
    expect(checkVersionCompat('1.2.3', '~1.2.3')).toBe(true);
    expect(checkVersionCompat('1.3.0', '~1.2.3')).toBe(false);
    expect(checkVersionCompat('1.2.2', '~1.2.3')).toBe(false);
  });

  test('compound range >=X.Y.Z <A.B.C', () => {
    expect(checkVersionCompat('2.5.0', '>=2.0.0 <3.0.0')).toBe(true);
    expect(checkVersionCompat('2.0.0', '>=2.0.0 <3.0.0')).toBe(true);
    expect(checkVersionCompat('3.0.0', '>=2.0.0 <3.0.0')).toBe(false);
    expect(checkVersionCompat('1.9.9', '>=2.0.0 <3.0.0')).toBe(false);
  });

  test('single >= constraint', () => {
    expect(checkVersionCompat('3.0.0', '>=2.0.0')).toBe(true);
    expect(checkVersionCompat('2.0.0', '>=2.0.0')).toBe(true);
    expect(checkVersionCompat('1.9.9', '>=2.0.0')).toBe(false);
  });

  test('single < constraint', () => {
    expect(checkVersionCompat('2.9.9', '<3.0.0')).toBe(true);
    expect(checkVersionCompat('3.0.0', '<3.0.0')).toBe(false);
  });

  test('unparseable version returns true (permissive)', () => {
    expect(checkVersionCompat('not-a-version', '^2.0.0')).toBe(true);
  });
});
