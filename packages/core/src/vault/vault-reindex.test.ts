/**
 * WS4 Vault Files-First — reindex, conflict resolution (file wins), the
 * files-first write-through, and the safe migration sequence, all tested
 * against filesystem fixtures (never a live vault DB).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { Vault } from './vault.js';
import { syncAllToMarkdown, writeEntryFileSync, entryToMarkdown } from './vault-markdown-sync.js';
import {
  scanVaultFiles,
  readEntryFile,
  detectConflicts,
  reindexIncremental,
  reindexFull,
  runMigrationToFiles,
} from './vault-reindex.js';
import { getSourceOfTruth, getVaultFormatVersion } from './vault-schema.js';
import type { IntelligenceEntry } from '../intelligence/types.js';

function makeEntry(overrides: Partial<IntelligenceEntry> = {}): IntelligenceEntry {
  return {
    id: `e-${randomUUID().slice(0, 8)}`,
    type: 'pattern',
    domain: 'architecture',
    title: 'Test Pattern',
    severity: 'suggestion',
    description: 'A test pattern description.',
    tags: ['testing'],
    ...overrides,
  };
}

describe('WS4 files-first reindex', () => {
  let tmpDir: string;
  let vault: Vault;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `vault-reindex-${randomUUID().slice(0, 8)}`);
    mkdirSync(tmpDir, { recursive: true });
    vault = new Vault(':memory:');
  });

  afterEach(() => {
    vault.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── scan ─────────────────────────────────────────────────────────

  it('scans vault files reading id + content_hash from frontmatter', async () => {
    vault.seed([
      makeEntry({ id: 'x1', title: 'Alpha', domain: 'design' }),
      makeEntry({ id: 'x2', title: 'Beta', domain: 'code' }),
    ]);
    await syncAllToMarkdown(vault, tmpDir);

    const scanned = scanVaultFiles(tmpDir);
    expect(scanned).toHaveLength(2);
    const ids = scanned.map((s) => s.id).sort();
    expect(ids).toEqual(['x1', 'x2']);
    for (const s of scanned) {
      expect(s.frontmatterHash).toMatch(/^[0-9a-f]{40}$/);
    }
  });

  it('excludes _index.md from the scan', async () => {
    vault.seed([makeEntry({ id: 'x1', title: 'Alpha', domain: 'design' })]);
    await syncAllToMarkdown(vault, tmpDir);
    expect(existsSync(join(tmpDir, 'vault', '_index.md'))).toBe(true);
    expect(scanVaultFiles(tmpDir)).toHaveLength(1);
  });

  // ── readEntryFile integrity ──────────────────────────────────────

  it('readEntryFile recomputes a matching content_hash for well-formed files', async () => {
    const entry = makeEntry({ id: 'r1', title: 'Readable', domain: 'design' });
    vault.seed([entry]);
    await syncAllToMarkdown(vault, tmpDir);

    const filePath = join(tmpDir, 'vault', 'design', 'readable.md');
    const { frontmatterHash, computedHash, entry: parsed } = readEntryFile(filePath, 'design');
    expect(frontmatterHash).toBe(computedHash);
    expect(parsed.id).toBe('r1');
  });

  it('detects a tampered file where frontmatter hash != recomputed hash', () => {
    // A body edited without refreshing content_hash is the loud-failure signal.
    const entry = makeEntry({ id: 't1', title: 'Tampered', domain: 'design' });
    const md = entryToMarkdown(entry).replace(
      'A test pattern description.',
      'Silently edited body — hash is now stale.',
    );
    const dir = join(tmpDir, 'vault', 'design');
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, 'tampered.md');
    writeFileSync(filePath, md, 'utf-8');

    const { frontmatterHash, computedHash } = readEntryFile(filePath, 'design');
    expect(frontmatterHash).not.toBe(computedHash);
  });

  // ── conflict detection (file wins) ───────────────────────────────

  it('detects no conflicts when files match the index', async () => {
    vault.seed([makeEntry({ id: 'c1', title: 'Stable', domain: 'design' })]);
    await syncAllToMarkdown(vault, tmpDir);
    expect(detectConflicts(vault, tmpDir)).toHaveLength(0);
  });

  it('THE FILE ALWAYS WINS: a drifted file rebuilds the index row, file is untouched', async () => {
    const entry = makeEntry({
      id: 'w1',
      title: 'Winner',
      domain: 'design',
      description: 'Original description.',
    });
    vault.seed([entry]);
    await syncAllToMarkdown(vault, tmpDir);

    const filePath = join(tmpDir, 'vault', 'design', 'winner.md');

    // Simulate a human/editor edit: new body + refreshed hash written to the FILE.
    const edited: IntelligenceEntry = { ...entry, description: 'Human-edited description.' };
    writeEntryFileSync(edited, tmpDir);
    const fileBefore = readFileSync(filePath, 'utf-8');

    // Index still holds the old content.
    expect(vault.get('w1')!.description).toBe('Original description.');

    const conflicts = detectConflicts(vault, tmpDir);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].reason).toBe('hash-mismatch');

    const result = reindexIncremental(vault, tmpDir);
    expect(result.reindexed).toBe(1);

    // File wins: index now matches the file.
    expect(vault.get('w1')!.description).toBe('Human-edited description.');
    // The DB never overwrote the file.
    expect(readFileSync(filePath, 'utf-8')).toBe(fileBefore);
  });

  it('incremental reindex skips files whose hash matches (cheap no-op)', async () => {
    vault.seed([makeEntry({ id: 's1', title: 'Skip Me', domain: 'design' })]);
    await syncAllToMarkdown(vault, tmpDir);
    const result = reindexIncremental(vault, tmpDir);
    expect(result.reindexed).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('incremental reindex inserts a file that is missing from the index', async () => {
    vault.seed([makeEntry({ id: 'keep', title: 'Keep', domain: 'design' })]);
    await syncAllToMarkdown(vault, tmpDir);

    // A brand-new file appears (e.g. from a git pull) with no index row.
    const fresh = makeEntry({ id: 'fresh', title: 'Fresh From Pull', domain: 'design' });
    writeEntryFileSync(fresh, tmpDir);
    expect(vault.get('fresh')).toBeNull();

    const result = reindexIncremental(vault, tmpDir);
    expect(result.reindexed).toBe(1);
    expect(vault.get('fresh')!.title).toBe('Fresh From Pull');
  });

  // ── full reindex ─────────────────────────────────────────────────

  it('full reindex rebuilds from files and prunes index rows with no file', async () => {
    vault.seed([
      makeEntry({ id: 'a', title: 'Alpha', domain: 'design' }),
      makeEntry({ id: 'b', title: 'Beta', domain: 'design' }),
    ]);
    await syncAllToMarkdown(vault, tmpDir);

    // Delete Beta's file so it becomes an orphan index row.
    rmSync(join(tmpDir, 'vault', 'design', 'beta.md'), { force: true });

    const result = reindexFull(vault, tmpDir);
    expect(result.reindexed).toBe(1);
    expect(result.pruned).toBe(1);
    expect(vault.get('a')).not.toBeNull();
    expect(vault.get('b')).toBeNull();
  });

  it('full reindex keeps FTS search working after rebuild', async () => {
    vault.seed([makeEntry({ id: 'f1', title: 'Searchable Widget', domain: 'design' })]);
    await syncAllToMarkdown(vault, tmpDir);
    reindexFull(vault, tmpDir);
    const hits = vault.search('Searchable Widget', { limit: 5 });
    expect(hits.some((h) => h.entry.id === 'f1')).toBe(true);
  });
});

// ── slug collisions ─────────────────────────────────────────────────

describe('WS4 slug-collision handling', () => {
  let tmpDir: string;
  let vault: Vault;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `vault-collide-${randomUUID().slice(0, 8)}`);
    mkdirSync(tmpDir, { recursive: true });
    vault = new Vault(':memory:');
  });

  afterEach(() => {
    vault.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('disambiguates same-domain same-slug entries with an id suffix', async () => {
    const e1 = makeEntry({ id: 'aaaaaa11', title: 'Duplicate Title', domain: 'design' });
    const e2 = makeEntry({ id: 'bbbbbb22', title: 'Duplicate Title', domain: 'design' });
    vault.seed([e1, e2]);

    const result = await syncAllToMarkdown(vault, tmpDir);
    expect(result.collisions).toHaveLength(2);

    const designDir = join(tmpDir, 'vault', 'design');
    expect(existsSync(join(designDir, 'duplicate-title-aaaaaa.md'))).toBe(true);
    expect(existsSync(join(designDir, 'duplicate-title-bbbbbb.md'))).toBe(true);

    // Both survive a full reindex with distinct ids.
    reindexFull(vault, tmpDir);
    expect(vault.get('aaaaaa11')).not.toBeNull();
    expect(vault.get('bbbbbb22')).not.toBeNull();
  });
});

// ── write-through ───────────────────────────────────────────────────

describe('WS4 files-first write-through', () => {
  let tmpDir: string;
  let vault: Vault;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `vault-wt-${randomUUID().slice(0, 8)}`);
    mkdirSync(tmpDir, { recursive: true });
    vault = new Vault(':memory:');
    vault.bindFileStore(tmpDir);
  });

  afterEach(() => {
    vault.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('add() writes the .md file first, then the index row', () => {
    vault.add(makeEntry({ id: 'wt1', title: 'Written Through', domain: 'design' }));
    const filePath = join(tmpDir, 'vault', 'design', 'written-through.md');
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf-8')).toContain('# Written Through');
    expect(vault.get('wt1')).not.toBeNull();
  });

  it('update() rewrites the file (renaming on title change) and removes the stale one', () => {
    vault.add(makeEntry({ id: 'wt2', title: 'Original Name', domain: 'design' }));
    const oldPath = join(tmpDir, 'vault', 'design', 'original-name.md');
    expect(existsSync(oldPath)).toBe(true);

    vault.update('wt2', { title: 'Renamed Entry' });
    expect(existsSync(oldPath)).toBe(false);
    expect(existsSync(join(tmpDir, 'vault', 'design', 'renamed-entry.md'))).toBe(true);
  });

  it('remove() deletes the .md file first', () => {
    vault.add(makeEntry({ id: 'wt3', title: 'To Be Removed', domain: 'design' }));
    const filePath = join(tmpDir, 'vault', 'design', 'to-be-removed.md');
    expect(existsSync(filePath)).toBe(true);
    vault.remove('wt3');
    expect(existsSync(filePath)).toBe(false);
    expect(vault.get('wt3')).toBeNull();
  });

  it('does nothing to the filesystem when no file store is bound', () => {
    const plain = new Vault(':memory:');
    plain.add(makeEntry({ id: 'nofs', title: 'No File Store', domain: 'design' }));
    expect(existsSync(join(tmpDir, 'vault', 'design', 'no-file-store.md'))).toBe(false);
    plain.close();
  });
});

// ── migration ───────────────────────────────────────────────────────

describe('WS4 files-first migration', () => {
  let tmpDir: string;
  let dbPath: string;
  let vault: Vault;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `vault-migrate-${randomUUID().slice(0, 8)}`);
    mkdirSync(tmpDir, { recursive: true });
    dbPath = join(tmpDir, 'vault.db');
    vault = new Vault(dbPath);
  });

  afterEach(() => {
    vault.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runs the full safe migration sequence and flips canonicality', async () => {
    const entries: IntelligenceEntry[] = [];
    for (let i = 0; i < 12; i++) {
      entries.push(
        makeEntry({
          id: `m-${i}`,
          title: `Migration Entry ${i}`,
          domain: i % 2 === 0 ? 'design' : 'code',
          severity: (['critical', 'warning', 'suggestion'] as const)[i % 3],
        }),
      );
    }
    vault.seed(entries);

    const knowledgeDir = join(tmpDir, 'knowledge');
    const report = await runMigrationToFiles(vault, knowledgeDir, { dbPath });

    // 1. Backup taken.
    expect(report.backupPath).not.toBeNull();
    expect(existsSync(report.backupPath!)).toBe(true);
    // 2/3. Export + integrity.
    expect(report.totalEntries).toBe(12);
    expect(report.filesOnDisk).toBe(12);
    expect(report.integrityOk).toBe(true);
    expect(report.integrityMismatches).toHaveLength(0);
    // 5. Canonicality flipped + format bumped.
    expect(report.sourceOfTruth).toBe('files');
    expect(report.formatVersion).toBe(2);
    expect(getSourceOfTruth(vault.getProvider())).toBe('files');
    expect(getVaultFormatVersion(vault.getProvider())).toBe(2);
    // 6. Parity holds.
    expect(report.hashParityOk).toBe(true);
    expect(report.ftsParityOk).toBe(true);
  });

  it('backup is a faithful copy that still opens as a v-compatible vault', async () => {
    vault.seed([makeEntry({ id: 'bk1', title: 'Backup Me', domain: 'design' })]);
    const knowledgeDir = join(tmpDir, 'knowledge');
    const report = await runMigrationToFiles(vault, knowledgeDir, { dbPath });

    const backup = new Vault(report.backupPath!);
    expect(backup.get('bk1')).not.toBeNull();
    backup.close();
  });

  it('reports and disambiguates slug collisions during migration', async () => {
    vault.seed([
      makeEntry({ id: 'coll-a1', title: 'Same Slug', domain: 'design' }),
      makeEntry({ id: 'coll-b2', title: 'Same Slug', domain: 'design' }),
    ]);
    const knowledgeDir = join(tmpDir, 'knowledge');
    const report = await runMigrationToFiles(vault, knowledgeDir, { dbPath });
    expect(report.collisions).toHaveLength(2);
    expect(report.integrityOk).toBe(true);
  });

  it('a v2 vault refuses to open on an engine that only supports v1 (format guard)', async () => {
    vault.seed([makeEntry({ id: 'g1', title: 'Guarded', domain: 'design' })]);
    await runMigrationToFiles(vault, join(tmpDir, 'knowledge'), { dbPath });
    vault.close();

    // Simulate an older engine by forcing the on-disk user_version above what it supports.
    const reopened = new Vault(dbPath);
    reopened.getProvider().run('PRAGMA user_version = 99');
    reopened.close();
    expect(() => new Vault(dbPath)).toThrow(/newer than engine supports/);
  });
});
