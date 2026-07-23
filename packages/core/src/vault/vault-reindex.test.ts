/**
 * WS4 Vault Files-First — reindex, conflict resolution (file wins), the
 * files-first write-through, and the safe migration sequence, all tested
 * against filesystem fixtures (never a live vault DB).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync,
  rmSync,
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  utimesSync,
} from 'node:fs';
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
import {
  getSourceOfTruth,
  setSourceOfTruth,
  getVaultFormatVersion,
  getHashFormulaVersion,
  setHashFormulaVersion,
} from './vault-schema.js';
import { computeContentHash } from './content-hash.js';
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
    expect(existsSync(join(designDir, 'duplicate-title-aaaa11.md'))).toBe(true);
    expect(existsSync(join(designDir, 'duplicate-title-bbbb22.md'))).toBe(true);

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

  it('a fresh vault stays v1 / index-first until migration flips it (MINOR 6)', () => {
    const fresh = new Vault(':memory:');
    expect(getVaultFormatVersion(fresh.getProvider())).toBe(1);
    expect(getSourceOfTruth(fresh.getProvider())).toBe('index');
    fresh.close();
  });

  it('migration leaves the vault bound to the file store (BLOCKER)', async () => {
    vault.seed([makeEntry({ id: 'b1', title: 'Bound After', domain: 'design' })]);
    const knowledgeDir = join(tmpDir, 'knowledge');
    await runMigrationToFiles(vault, knowledgeDir, { dbPath });
    expect(vault.getFileStore()).toBe(knowledgeDir);
    // A subsequent add is file-first (no throw from the guard) and writes the .md.
    vault.add(makeEntry({ id: 'b2', title: 'Post Migration', domain: 'design' }));
    expect(existsSync(join(knowledgeDir, 'vault', 'design', 'post-migration.md'))).toBe(true);
  });

  it('pre-flight fails loudly on a foreign .md file in the export dir (MINOR 8)', async () => {
    vault.seed([makeEntry({ id: 'own', title: 'Owned Entry', domain: 'design' })]);
    const knowledgeDir = join(tmpDir, 'knowledge');
    const designDir = join(knowledgeDir, 'vault', 'design');
    mkdirSync(designDir, { recursive: true });
    // A file whose id belongs to no entry in this vault.
    const foreign = makeEntry({ id: 'foreign-id', title: 'Foreign', domain: 'design' });
    writeFileSync(join(designDir, 'foreign.md'), entryToMarkdown(foreign), 'utf-8');

    await expect(runMigrationToFiles(vault, knowledgeDir, { dbPath })).rejects.toThrow(
      /foreign .md file/,
    );
  });
});

// ── BLOCKER: files-first guard ──────────────────────────────────────

describe('WS4 files-first hard guard', () => {
  let tmpDir: string;
  let vault: Vault;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `vault-guard-${randomUUID().slice(0, 8)}`);
    mkdirSync(tmpDir, { recursive: true });
    vault = new Vault(':memory:');
    // Simulate a migrated vault whose binding was (wrongly) not restored.
    setSourceOfTruth(vault.getProvider(), 'files');
  });

  afterEach(() => {
    vault.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('every mutating op throws when files-first but no file store is bound', () => {
    const entry = makeEntry({ id: 'ng', title: 'No Guard', domain: 'design' });
    expect(() => vault.seed([entry])).toThrow(/no file store is bound/);
    expect(() => vault.add(entry)).toThrow(/no file store is bound/);
    expect(() => vault.seedDedup([entry])).toThrow(/no file store is bound/);
    expect(() => vault.installPack([entry])).toThrow(/no file store is bound/);
    expect(() => vault.update('ng', { title: 'x' })).toThrow(/no file store is bound/);
    expect(() => vault.remove('ng')).toThrow(/no file store is bound/);
    expect(() => vault.setTemporal('ng', 1, 2)).toThrow(/no file store is bound/);
  });

  it('binding the file store re-enables mutations (production-shaped)', () => {
    // Mirrors the runtime: when source_of_truth is files, bind before mutating.
    if (vault.getSourceOfTruth() === 'files') vault.bindFileStore(tmpDir);
    vault.add(makeEntry({ id: 'ok', title: 'Now Allowed', domain: 'design' }));
    expect(vault.get('ok')).not.toBeNull();
    expect(existsSync(join(tmpDir, 'vault', 'design', 'now-allowed.md'))).toBe(true);
  });
});

// ── MAJOR 3: hand edits ─────────────────────────────────────────────

describe('WS4 hand-edit detection (recompute + mtime pre-filter)', () => {
  let tmpDir: string;
  let vault: Vault;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `vault-handedit-${randomUUID().slice(0, 8)}`);
    mkdirSync(tmpDir, { recursive: true });
    vault = new Vault(':memory:');
  });

  afterEach(() => {
    vault.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rebuilds the index from a hand-edited file whose frontmatter hash is stale', async () => {
    const entry = makeEntry({
      id: 'he1',
      title: 'Hand Edited',
      domain: 'design',
      description: 'Original prose.',
    });
    vault.seed([entry]);
    await syncAllToMarkdown(vault, tmpDir);
    // Establish a baseline index build time.
    reindexFull(vault, tmpDir);

    const filePath = join(tmpDir, 'vault', 'design', 'hand-edited.md');
    // A human edits the PROSE only — the frontmatter content_hash stays stale
    // (a human cannot recompute a SHA-256). Write with plain fs, not the helper.
    const edited = readFileSync(filePath, 'utf-8').replace(
      'Original prose.',
      'Human edited the prose by hand.',
    );
    writeFileSync(filePath, edited, 'utf-8');
    // Advance mtime past the last index build so the cheap pre-filter parses it.
    const future = Date.now() / 1000 + 5;
    utimesSync(filePath, future, future);

    // The frontmatter-claimed hash still matches the index, but the RECOMPUTED
    // hash does not — the conflict must be detected and the index rebuilt.
    const conflicts = detectConflicts(vault, tmpDir);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].handEdited).toBe(true);

    const result = reindexIncremental(vault, tmpDir);
    expect(result.reindexed).toBe(1);
    expect(vault.get('he1')!.description).toBe('Human edited the prose by hand.');
  });
});

// ── MAJOR 4: hash coverage ──────────────────────────────────────────

describe('WS4 content-hash coverage', () => {
  let tmpDir: string;
  let vault: Vault;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `vault-hash-${randomUUID().slice(0, 8)}`);
    mkdirSync(tmpDir, { recursive: true });
    vault = new Vault(':memory:');
  });

  afterEach(() => {
    vault.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects drift when a previously-unhashed content field changes', async () => {
    const base = makeEntry({
      id: 'h1',
      title: 'Hash Coverage',
      domain: 'design',
      severity: 'suggestion',
      context: 'ctx a',
      why: 'why a',
    });
    vault.seed([base]);
    await syncAllToMarkdown(vault, tmpDir);
    reindexFull(vault, tmpDir);

    const filePath = join(tmpDir, 'vault', 'design', 'hash-coverage.md');
    // Change ONLY the `why` section (previously excluded from the hash).
    const edited: IntelligenceEntry = { ...base, why: 'why B — materially different' };
    writeEntryFileSync(edited, tmpDir, { force: true });
    utimesSync(filePath, Date.now() / 1000 + 5, Date.now() / 1000 + 5);

    const conflicts = detectConflicts(vault, tmpDir);
    expect(conflicts).toHaveLength(1);
    reindexIncremental(vault, tmpDir);
    expect(vault.get('h1')!.why).toBe('why B — materially different');
  });

  it('dedup still ignores origin (identical content across origins de-duplicates)', () => {
    const agentEntry = makeEntry({ id: 'o-agent', title: 'Shared Knowledge', origin: 'agent' });
    vault.add(agentEntry);
    // Same content, different origin — must be seen as a duplicate.
    const packEntry = { ...agentEntry, id: 'o-pack', origin: 'pack' as const };
    const results = vault.seedDedup([packEntry]);
    expect(results[0].action).toBe('duplicate');
    expect(results[0].existingId).toBe('o-agent');
  });
});

// ── MINOR 5: reindex is loud ────────────────────────────────────────

describe('WS4 reindex reports issues (never silent)', () => {
  let tmpDir: string;
  let vault: Vault;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `vault-loud-${randomUUID().slice(0, 8)}`);
    mkdirSync(tmpDir, { recursive: true });
    vault = new Vault(':memory:');
  });

  afterEach(() => {
    vault.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports a file missing its id as a failure instead of silently dropping it', () => {
    const dir = join(tmpDir, 'vault', 'design');
    mkdirSync(dir, { recursive: true });
    // A file with no `id` frontmatter.
    writeFileSync(
      join(dir, 'no-id.md'),
      [
        '---',
        'type: "rule"',
        'domain: "design"',
        'severity: "warning"',
        '---',
        '',
        '# No Id',
        '',
        'Body.',
      ].join('\n'),
      'utf-8',
    );
    const result = reindexFull(vault, tmpDir);
    expect(result.reindexed).toBe(0);
    expect(result.failures.some((f) => f.reason === 'missing-id')).toBe(true);
  });

  it('reports (but still indexes) a file with an unknown type as a warning', () => {
    const dir = join(tmpDir, 'vault', 'design');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'weird.md'),
      [
        '---',
        'id: "weird-1"',
        'type: "concept"', // not a valid IntelligenceEntry type
        'domain: "design"',
        'severity: "warning"',
        '---',
        '',
        '# Weird Type',
        '',
        'Body.',
      ].join('\n'),
      'utf-8',
    );
    const result = reindexFull(vault, tmpDir);
    expect(result.reindexed).toBe(1);
    expect(result.warnings.some((w) => w.reason.startsWith('unknown-type'))).toBe(true);
    // Coerced to a valid type, not dropped.
    expect(vault.get('weird-1')!.type).toBe('pattern');
  });
});

// ── BLOCKER: hash-formula versioning ────────────────────────────────

describe('WS4 hash-formula versioning', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `vault-formula-${randomUUID().slice(0, 8)}`);
    mkdirSync(tmpDir, { recursive: true });
    dbPath = join(tmpDir, 'vault.db');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('re-hashes ALL rows on open when the stored formula version is older', () => {
    const vault = new Vault(dbPath);
    const entry = makeEntry({ id: 'fv1', title: 'Formula Row', domain: 'design' });
    vault.seed([entry]);
    const provider = vault.getProvider();
    // Simulate a vault written by an older, narrower hash formula.
    provider.run("UPDATE entries SET content_hash = '0000000000000000000000000000000000000000'");
    setHashFormulaVersion(provider, 1);
    vault.close();

    // Reopen with the current engine → migrateHashFormula rehashes every row.
    const reopened = new Vault(dbPath);
    expect(getHashFormulaVersion(reopened.getProvider())).toBe(2);
    const stored = reopened
      .getProvider()
      .get<{ content_hash: string }>('SELECT content_hash FROM entries WHERE id = ?', ['fv1']);
    expect(stored!.content_hash).toBe(computeContentHash(entry));
    reopened.close();
  });

  it('migration completes on rows whose stored hash was written by an old formula', async () => {
    const vault = new Vault(dbPath);
    vault.seed([
      makeEntry({ id: 'og1', title: 'Old Formula One', domain: 'design' }),
      makeEntry({ id: 'og2', title: 'Old Formula Two', domain: 'code' }),
    ]);
    // Stale/old-formula hashes in the column — the migration must not trust them.
    vault
      .getProvider()
      .run("UPDATE entries SET content_hash = 'staleoldformulavalue00000000000000000000'");

    const report = await runMigrationToFiles(vault, join(tmpDir, 'knowledge'), { dbPath });
    expect(report.hashParityOk).toBe(true);
    expect(report.integrityOk).toBe(true);
    expect(report.totalEntries).toBe(2);
    vault.close();
  });
});

// ── MAJOR: mtime pre-filter is opt-in, not the default ──────────────

describe('WS4 preserved-mtime edits (full-scan default vs fast mode)', () => {
  let tmpDir: string;
  let vault: Vault;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `vault-mtime-${randomUUID().slice(0, 8)}`);
    mkdirSync(tmpDir, { recursive: true });
    vault = new Vault(':memory:');
  });

  afterEach(() => {
    vault.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('default full-scan catches an edit whose mtime was preserved; fast mode misses it', async () => {
    const entry = makeEntry({
      id: 'mt1',
      title: 'Preserved Mtime',
      domain: 'design',
      description: 'Original.',
    });
    vault.seed([entry]);
    await syncAllToMarkdown(vault, tmpDir);
    reindexFull(vault, tmpDir); // stamps last_index_build

    const filePath = join(tmpDir, 'vault', 'design', 'preserved-mtime.md');
    const edited: IntelligenceEntry = { ...entry, description: 'Edited via rsync -a.' };
    writeEntryFileSync(edited, tmpDir, { force: true });
    // Simulate a backup/restore that PRESERVES the original mtime (in the past).
    utimesSync(filePath, 1000, 1000);

    // Default (full-scan) recomputes every file and catches it.
    expect(detectConflicts(vault, tmpDir)).toHaveLength(1);
    // Fast mode trusts mtime and misses it (documented tradeoff).
    expect(detectConflicts(vault, tmpDir, { mode: 'fast' })).toHaveLength(0);

    // The default reindex rebuilds the index from the file.
    const result = reindexIncremental(vault, tmpDir);
    expect(result.reindexed).toBe(1);
    expect(vault.get('mt1')!.description).toBe('Edited via rsync -a.');
  });

  it('fidelity drift catches a valid_until-only hand edit (behaviorally load-bearing)', async () => {
    const entry = makeEntry({
      id: 'vu1',
      title: 'Expiry Edit',
      domain: 'design',
      validFrom: 1_700_000_000,
      validUntil: 1_800_000_000,
    });
    vault.seed([entry]);
    await syncAllToMarkdown(vault, tmpDir);
    reindexFull(vault, tmpDir);

    const filePath = join(tmpDir, 'vault', 'design', 'expiry-edit.md');
    // Human extends the expiry by editing ONLY valid_until in the frontmatter.
    const edited = readFileSync(filePath, 'utf-8').replace(
      'valid_until: 1800000000',
      'valid_until: 1999999999',
    );
    writeFileSync(filePath, edited, 'utf-8');

    // content_hash is unchanged (temporal is not content), but the FIDELITY hash
    // differs — the drift must still be detected and the index updated.
    expect(detectConflicts(vault, tmpDir)).toHaveLength(1);
    reindexIncremental(vault, tmpDir);
    expect(vault.get('vu1')!.validUntil).toBe(1999999999);
  });
});

// ── MAJOR: archive / restore / bulkRemove are file-first ────────────

describe('WS4 archive / restore / bulkRemove are file-first', () => {
  let tmpDir: string;
  let vault: Vault;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `vault-archive-${randomUUID().slice(0, 8)}`);
    mkdirSync(tmpDir, { recursive: true });
    vault = new Vault(':memory:');
    vault.bindFileStore(tmpDir);
  });

  afterEach(() => {
    vault.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('archive moves the .md out of the scanned tree so reindex cannot resurrect it', () => {
    vault.add(makeEntry({ id: 'ar1', title: 'To Archive', domain: 'design' }));
    const livePath = join(tmpDir, 'vault', 'design', 'to-archive.md');
    expect(existsSync(livePath)).toBe(true);

    // Age the row so it is eligible, then archive.
    vault.getProvider().run('UPDATE entries SET updated_at = 0');
    const res = vault.archive({ olderThanDays: 1 });
    expect(res.archived).toBe(1);

    // File moved to _archive/, gone from the live tree, absent from the index.
    expect(existsSync(livePath)).toBe(false);
    expect(existsSync(join(tmpDir, 'vault', '_archive', 'design', 'to-archive.md'))).toBe(true);
    expect(vault.get('ar1')).toBeNull();

    // A full reindex must NOT resurrect the archived entry.
    reindexFull(vault, tmpDir);
    expect(vault.get('ar1')).toBeNull();
  });

  it('restore moves the .md back and reindex keeps it present', () => {
    vault.add(makeEntry({ id: 'rs1', title: 'To Restore', domain: 'design' }));
    vault.getProvider().run('UPDATE entries SET updated_at = 0');
    vault.archive({ olderThanDays: 1 });
    expect(vault.get('rs1')).toBeNull();

    expect(vault.restore('rs1')).toBe(true);
    expect(existsSync(join(tmpDir, 'vault', 'design', 'to-restore.md'))).toBe(true);
    expect(existsSync(join(tmpDir, 'vault', '_archive', 'design', 'to-restore.md'))).toBe(false);
    expect(vault.get('rs1')).not.toBeNull();

    reindexFull(vault, tmpDir);
    expect(vault.get('rs1')).not.toBeNull();
  });

  it('bulkRemove deletes the .md so reindex cannot resurrect it', () => {
    vault.add(makeEntry({ id: 'br1', title: 'To Bulk Remove', domain: 'design' }));
    const filePath = join(tmpDir, 'vault', 'design', 'to-bulk-remove.md');
    expect(existsSync(filePath)).toBe(true);

    expect(vault.bulkRemove(['br1'])).toBe(1);
    expect(existsSync(filePath)).toBe(false);
    reindexFull(vault, tmpDir);
    expect(vault.get('br1')).toBeNull();
  });

  it('archive/restore/bulkRemove all honor the files-first guard when unbound', () => {
    const guarded = new Vault(':memory:');
    setSourceOfTruth(guarded.getProvider(), 'files');
    expect(() => guarded.archive({ olderThanDays: 1 })).toThrow(/no file store is bound/);
    expect(() => guarded.restore('x')).toThrow(/no file store is bound/);
    expect(() => guarded.bulkRemove(['x'])).toThrow(/no file store is bound/);
    guarded.close();
  });

  it('restore does not overwrite a same-title squatter that took the base slug', () => {
    // Probe: archive A (base slug) → add B same title (takes the slug) → restore A.
    const a = makeEntry({
      id: 'sqa11111',
      title: 'Same Title',
      domain: 'design',
      description: 'Entry A body.',
    });
    vault.add(a);
    vault.getProvider().run('UPDATE entries SET updated_at = 0');
    vault.archive({ olderThanDays: 1 });
    expect(vault.get('sqa11111')).toBeNull();

    const b = makeEntry({
      id: 'sqb22222',
      title: 'Same Title',
      domain: 'design',
      description: 'Entry B body.',
    });
    vault.add(b); // B takes the now-free base slug
    const basePath = join(tmpDir, 'vault', 'design', 'same-title.md');
    expect(existsSync(basePath)).toBe(true);

    expect(vault.restore('sqa11111')).toBe(true);

    // A must land on a disambiguated path (id-tail suffix) — B's file is untouched.
    const aPath = join(tmpDir, 'vault', 'design', 'same-title-a11111.md');
    expect(existsSync(aPath)).toBe(true);
    expect(existsSync(basePath)).toBe(true);
    expect(readFileSync(basePath, 'utf-8')).toContain('sqb22222');
    expect(readFileSync(aPath, 'utf-8')).toContain('sqa11111');
    expect(vault.get('sqa11111')).not.toBeNull();
    expect(vault.get('sqb22222')).not.toBeNull();

    // A full reindex keeps BOTH entries — no silent prune.
    reindexFull(vault, tmpDir);
    expect(vault.get('sqa11111')).not.toBeNull();
    expect(vault.get('sqb22222')).not.toBeNull();
  });

  it('disambiguates colliding entries whose ids share a long common prefix', () => {
    // Live-vault regression: ingest-generated ids share the `ingest-notes-<ts>`
    // prefix, so a PREFIX slice produced the same suffix for both colliding
    // entries — one file overwrote the other and the migration count gate fired.
    const a = makeEntry({
      id: 'ingest-notes-1774853459847-3-w8cs',
      title: 'Separation of Concerns',
      domain: 'methodology',
      description: 'From the constraint toolkit notes.',
    });
    const b = makeEntry({
      id: 'ingest-notes-1774853397196-7-xpwz',
      title: 'Separation of Concerns',
      domain: 'methodology',
      description: 'From the full walkthrough notes.',
    });
    vault.add(a);
    vault.add(b);

    const dir = join(tmpDir, 'vault', 'methodology');
    const files = readdirSync(dir).filter((f) => f.startsWith('separation-of-concerns'));
    expect(files).toHaveLength(2);

    const ids = files
      .map((f) => readFileSync(join(dir, f), 'utf-8').match(/^id:\s*"([^"]+)"/m)?.[1])
      .sort();
    expect(ids).toEqual(
      ['ingest-notes-1774853397196-7-xpwz', 'ingest-notes-1774853459847-3-w8cs'].sort(),
    );

    // Both survive a full reindex — nothing pruned, nothing merged.
    reindexFull(vault, tmpDir);
    expect(vault.get(a.id)).not.toBeNull();
    expect(vault.get(b.id)).not.toBeNull();
  });
});

// ── full-scan reindex performance smoke ─────────────────────────────

describe('WS4 full-scan reindex performance', () => {
  it('reindexes a 1k-entry fixture well under the CI bound', async () => {
    const dir = join(tmpdir(), `vault-perf-${randomUUID().slice(0, 8)}`);
    mkdirSync(dir, { recursive: true });
    const vault = new Vault(':memory:');
    const entries: IntelligenceEntry[] = [];
    for (let i = 0; i < 1000; i++) {
      entries.push(
        makeEntry({
          id: `perf-${i}`,
          title: `Performance Entry Number ${i} With A Distinct Title`,
          domain: ['ts', 'react', 'ops', 'design'][i % 4],
          description: `Body paragraph for entry ${i}. `.repeat(6),
          context: 'Context paragraph.',
          why: 'Reasoning paragraph.',
        }),
      );
    }
    vault.seed(entries);
    await syncAllToMarkdown(vault, dir);

    const t0 = performance.now();
    const result = reindexIncremental(vault, dir); // default full-scan, no-op
    const elapsedMs = performance.now() - t0;

    expect(result.scanned).toBe(1000);
    expect(result.reindexed).toBe(0);
    // Generous bound to avoid CI flakes; observed ~70ms locally.
    expect(elapsedMs).toBeLessThan(2000);

    vault.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
