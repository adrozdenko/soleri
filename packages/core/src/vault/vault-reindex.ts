/**
 * Vault reindex + files-first migration (WS4 Vault Files-First).
 *
 * In the files-first model the markdown files under `knowledge/vault/<domain>/<slug>.md`
 * are the CANONICAL store; the SQLite `entries`/`entries_fts` tables are a derived,
 * rebuildable index. This module owns the file→index direction:
 *
 *   - `readEntryFile` / `parsedToEntry` — read a canonical file into an entry.
 *   - `scanVaultFiles` — cheap frontmatter scan (id + content_hash, no full parse).
 *   - `detectConflicts` — find files whose hash drifted from the index (file always wins).
 *   - `reindexIncremental` — rebuild only drifted/new index rows (§6.1 incremental).
 *   - `reindexFull` — rebuild the whole index from the file tree (+ prune orphans).
 *   - `runMigrationToFiles` — the safe one-shot migration sequence (backup → export →
 *     verify → collision audit → flip canonicality → full reindex + parity → keep backup).
 *
 * Conflict rule (§6.3): THE FILE ALWAYS WINS. The DB is never written back to a file
 * from this module; only files are read into the index.
 */

import { readdirSync, readFileSync, existsSync, copyFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { IntelligenceEntry } from '../intelligence/types.js';
import type { Vault } from './vault.js';
import { computeContentHash, computeFidelityHash } from './content-hash.js';
import { fromObsidianMarkdown, type ParsedMarkdownEntry } from './obsidian-sync.js';
import { seed as seedEntriesDb, bulkRemove as bulkRemoveEntries } from './vault-entries.js';
import {
  syncAllToMarkdown,
  titleToSlug,
  type SlugCollision,
  type SyncAllOptions,
} from './vault-markdown-sync.js';
import {
  setSourceOfTruth,
  setVaultFormatVersion,
  getVaultFormatVersion,
  getLastIndexBuild,
  setLastIndexBuild,
  VAULT_FORMAT_VERSION,
  type VaultSourceOfTruth,
} from './vault-schema.js';

const VALID_TYPES = new Set<IntelligenceEntry['type']>([
  'pattern',
  'anti-pattern',
  'rule',
  'playbook',
]);
const VALID_SEVERITIES = new Set<IntelligenceEntry['severity']>([
  'critical',
  'warning',
  'suggestion',
]);
const VALID_TIERS = new Set(['agent', 'project', 'team']);
const VALID_ORIGINS = new Set(['agent', 'pack', 'user']);

// ─── File → Entry ───────────────────────────────────────────────────

/**
 * Build a clean IntelligenceEntry from parsed canonical frontmatter + body.
 * Coerces the loose parsed `type`/`severity` (which may be a legacy value like
 * `concept`) to the valid enums, and only sets optional fields that are present.
 */
export function parsedToEntry(parsed: ParsedMarkdownEntry, domainFallback = ''): IntelligenceEntry {
  const type = VALID_TYPES.has(parsed.type as IntelligenceEntry['type'])
    ? (parsed.type as IntelligenceEntry['type'])
    : 'pattern';
  const severity = VALID_SEVERITIES.has(parsed.severity as IntelligenceEntry['severity'])
    ? (parsed.severity as IntelligenceEntry['severity'])
    : 'suggestion';

  const entry: IntelligenceEntry = {
    id: parsed.id ?? '',
    type,
    domain: parsed.domain ?? domainFallback,
    title: parsed.title ?? '',
    severity,
    description: parsed.description ?? '',
    tags: parsed.tags ?? [],
  };
  if (parsed.context) entry.context = parsed.context;
  if (parsed.example) entry.example = parsed.example;
  if (parsed.counterExample) entry.counterExample = parsed.counterExample;
  if (parsed.why) entry.why = parsed.why;
  if (parsed.appliesTo && parsed.appliesTo.length > 0) entry.appliesTo = parsed.appliesTo;
  if (parsed.tier && VALID_TIERS.has(parsed.tier)) {
    entry.tier = parsed.tier as IntelligenceEntry['tier'];
  }
  if (parsed.origin && VALID_ORIGINS.has(parsed.origin)) {
    entry.origin = parsed.origin as IntelligenceEntry['origin'];
  }
  if (parsed.validFrom !== undefined) entry.validFrom = parsed.validFrom;
  if (parsed.validUntil !== undefined) entry.validUntil = parsed.validUntil;
  return entry;
}

/** Result of reading and validating a single canonical vault file. */
export interface ReadEntryResult {
  entry: IntelligenceEntry;
  /** content_hash recorded in frontmatter (may be undefined or stale after a hand edit). */
  frontmatterHash?: string;
  /** content_hash recomputed from the parsed entry — the authoritative value. */
  computedHash: string;
  /** Non-fatal issues (e.g. missing id, unknown/coerced type) — surfaced, never silent. */
  warnings: string[];
}

/** Read a canonical vault markdown file into an entry + its integrity hashes. */
export function readEntryFile(filePath: string, domainFallback = ''): ReadEntryResult {
  const content = readFileSync(filePath, 'utf-8');
  const parsed = fromObsidianMarkdown(content);
  const entry = parsedToEntry(parsed, domainFallback);
  const warnings: string[] = [];
  if (!entry.id) warnings.push('missing-id');
  if (parsed.type && !VALID_TYPES.has(parsed.type as IntelligenceEntry['type'])) {
    warnings.push(`unknown-type:${parsed.type} (coerced to '${entry.type}')`);
  }
  if (!parsed.severity) warnings.push(`missing-severity (defaulted to '${entry.severity}')`);
  return {
    entry,
    frontmatterHash: parsed.contentHash,
    computedHash: computeContentHash(entry),
    warnings,
  };
}

// ─── File scan ──────────────────────────────────────────────────────

/** A vault file discovered on disk with its cheap frontmatter identity. */
export interface ScannedFile {
  filePath: string;
  domain: string;
  /** Frontmatter id (or undefined if unreadable). */
  id?: string;
  /** Frontmatter content_hash (or undefined if absent). */
  frontmatterHash?: string;
  mtimeMs: number;
}

const ID_RE = /^id:\s*"([^"]+)"/m;
const HASH_RE = /^content_hash:\s*"([^"]+)"/m;

/**
 * Scan `knowledge/vault/<domain>/*.md`, reading only the frontmatter id +
 * content_hash from each file (no full parse). Skips `_index.md` and dotfiles.
 */
export function scanVaultFiles(knowledgeDir: string): ScannedFile[] {
  const vaultDir = join(knowledgeDir, 'vault');
  if (!existsSync(vaultDir)) return [];
  const out: ScannedFile[] = [];

  for (const dirent of readdirSync(vaultDir, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    if (dirent.name === '_archive') continue; // archived entries are not live index rows
    const domain = dirent.name === '_general' ? '' : dirent.name;
    const domainDir = join(vaultDir, dirent.name);
    for (const file of readdirSync(domainDir)) {
      if (!file.endsWith('.md') || file.startsWith('_') || file.startsWith('.')) continue;
      const filePath = join(domainDir, file);
      const content = readFileSync(filePath, 'utf-8');
      out.push({
        filePath,
        domain,
        id: content.match(ID_RE)?.[1],
        frontmatterHash: content.match(HASH_RE)?.[1],
        mtimeMs: statSync(filePath).mtimeMs,
      });
    }
  }
  return out;
}

// ─── Conflict detection (file wins) ─────────────────────────────────

/** A file whose content has drifted from the index row (file is authoritative). */
export interface FileConflict {
  id: string;
  filePath: string;
  domain: string;
  /** FIDELITY hash recomputed from the file's parsed content (covers all fields). */
  fileHash: string;
  /** FIDELITY hash of the indexed row, or null when the row is missing. */
  indexedHash: string | null;
  reason: 'missing-in-index' | 'hash-mismatch';
  /** True when the file's frontmatter content_hash was stale (a hand-edit signature). */
  handEdited: boolean;
}

/** Reindex scan mode. */
export type ReindexScanMode = 'full-scan' | 'fast';

/** Options controlling conflict detection / incremental reindex. */
export interface ConflictScanOptions {
  /**
   * - `'full-scan'` (default): parse and hash-verify EVERY file. This is the only
   *   correct default — the ruling's mtime signal is a SUFFICIENT trigger, not a
   *   necessary one, so a preserved-mtime change (rsync -a, tar, backup/restore,
   *   clock skew) must still be caught by recomputing the hash.
   * - `'fast'`: skip files whose `mtimeMs <= last_index_build`. Faster, but may
   *   silently miss preserved-mtime edits — opt-in only.
   */
  mode?: ReindexScanMode;
  /** Explicit build cutoff (ms) for `'fast'` mode; defaults to the stored last build. */
  since?: number;
}

/** Map of indexed entry id → full entry (live rows, including expired). */
function indexedEntries(vault: Vault): Map<string, IntelligenceEntry> {
  const map = new Map<string, IntelligenceEntry>();
  for (const e of vault.list({ includeExpired: true, limit: 1_000_000 })) map.set(e.id, e);
  return map;
}

/**
 * Detect files whose content has drifted from the index — the file always wins.
 *
 * The drift decision compares a FIDELITY hash (all canonical fields, including
 * tier/origin/valid_from/valid_until) recomputed from BOTH the file's parsed
 * content and the indexed row. This catches every kind of edit — including a
 * behaviorally load-bearing `valid_until` change — and, because it recomputes
 * rather than trusting the frontmatter-claimed hash, catches hand edits a human
 * could never re-hash. A stale frontmatter content_hash is surfaced as
 * `handEdited`. Pure detection; does not mutate the index.
 */
export function detectConflicts(
  vault: Vault,
  knowledgeDir: string,
  opts: ConflictScanOptions = {},
): FileConflict[] {
  const mode = opts.mode ?? 'full-scan';
  const since = mode === 'fast' ? (opts.since ?? getLastIndexBuild(vault.getProvider())) : 0;
  const indexed = indexedEntries(vault);
  const conflicts: FileConflict[] = [];
  for (const file of scanVaultFiles(knowledgeDir)) {
    if (!file.id) continue; // reported as a failure when the reindex applies changes
    if (since > 0 && file.mtimeMs <= since) continue; // fast mode only: unchanged mtime
    const {
      entry: fileEntry,
      frontmatterHash,
      computedHash,
    } = readEntryFile(file.filePath, file.domain);
    const handEdited = frontmatterHash !== computedHash;
    const fileFidelity = computeFidelityHash(fileEntry);
    const dbEntry = indexed.get(file.id);
    if (!dbEntry) {
      conflicts.push({
        id: file.id,
        filePath: file.filePath,
        domain: file.domain,
        fileHash: fileFidelity,
        indexedHash: null,
        reason: 'missing-in-index',
        handEdited,
      });
      continue;
    }
    const dbFidelity = computeFidelityHash(dbEntry);
    if (fileFidelity !== dbFidelity) {
      conflicts.push({
        id: file.id,
        filePath: file.filePath,
        domain: file.domain,
        fileHash: fileFidelity,
        indexedHash: dbFidelity,
        reason: 'hash-mismatch',
        handEdited,
      });
    }
  }
  return conflicts;
}

// ─── Reindex ────────────────────────────────────────────────────────

/** A file the reindex could not fully process (surfaced, never silently dropped). */
export interface ReindexIssue {
  filePath: string;
  reason: string;
}

export interface ReindexResult {
  scanned: number;
  reindexed: number;
  skipped: number;
  pruned: number;
  /** Files that could NOT be indexed (e.g. missing id) — skipped, but reported. */
  failures: ReindexIssue[];
  /** Files indexed with a coerced/defaulted field (e.g. unknown type) — reported. */
  warnings: ReindexIssue[];
}

/** Upsert an entry into the index ONLY (no file write — avoids write-through recursion). */
function upsertIndexRow(vault: Vault, entry: IntelligenceEntry): void {
  seedEntriesDb(vault.getProvider(), [entry], { linkManager: null, enabled: false, maxLinks: 0 });
}

/** Options for an incremental reindex. */
export interface ReindexOptions {
  /**
   * `'full-scan'` (default, correct) hash-verifies every file; `'fast'` uses the
   * mtime pre-filter and may miss preserved-mtime edits. See `ConflictScanOptions`.
   */
  mode?: ReindexScanMode;
}

/**
 * Incremental reindex (startup / post-merge trigger): reindex only files that
 * have drifted from the index. By DEFAULT it hash-verifies every scanned file
 * (parse + fidelity recompute) so a preserved-mtime change is never missed; pass
 * `mode: 'fast'` to opt into the mtime pre-filter. The file always wins.
 * Missing-id files are reported as failures, not silently dropped.
 */
export function reindexIncremental(
  vault: Vault,
  knowledgeDir: string,
  opts: ReindexOptions = {},
): ReindexResult {
  const provider = vault.getProvider();
  const mode = opts.mode ?? 'full-scan';
  const buildStart = Date.now();
  const scanned = scanVaultFiles(knowledgeDir).length;
  const conflicts = detectConflicts(vault, knowledgeDir, { mode });
  const failures: ReindexIssue[] = [];
  const warnings: ReindexIssue[] = [];
  let reindexed = 0;

  provider.transaction(() => {
    for (const conflict of conflicts) {
      const res = readEntryFile(conflict.filePath, conflict.domain);
      if (!res.entry.id) {
        failures.push({ filePath: conflict.filePath, reason: 'missing-id' });
        continue;
      }
      for (const w of res.warnings) warnings.push({ filePath: conflict.filePath, reason: w });
      upsertIndexRow(vault, res.entry);
      reindexed++;
    }
  });

  setLastIndexBuild(provider, buildStart);
  return { scanned, reindexed, skipped: scanned - reindexed, pruned: 0, failures, warnings };
}

/**
 * Full reindex (`vault reindex --full`): re-read every file into the index
 * (ignoring the mtime pre-filter) and prune index rows that no longer have a
 * backing file. Idempotent; preserves the Zettelkasten links table for surviving
 * entries (only removed entries cascade). Missing-id files are reported.
 */
export function reindexFull(vault: Vault, knowledgeDir: string): ReindexResult {
  const files = scanVaultFiles(knowledgeDir);
  const provider = vault.getProvider();
  const buildStart = Date.now();
  const fileIds = new Set<string>();
  const failures: ReindexIssue[] = [];
  const warnings: ReindexIssue[] = [];
  let reindexed = 0;

  provider.transaction(() => {
    for (const file of files) {
      const res = readEntryFile(file.filePath, file.domain);
      if (!res.entry.id) {
        failures.push({ filePath: file.filePath, reason: 'missing-id' });
        continue;
      }
      for (const w of res.warnings) warnings.push({ filePath: file.filePath, reason: w });
      fileIds.add(res.entry.id);
      upsertIndexRow(vault, res.entry);
      reindexed++;
    }
  });

  // Prune index rows with no backing file.
  const orphanIds = provider
    .all<{ id: string }>('SELECT id FROM entries')
    .map((r) => r.id)
    .filter((id) => !fileIds.has(id));
  let pruned = 0;
  if (orphanIds.length > 0) {
    pruned = bulkRemoveEntries(provider, orphanIds);
  }
  vault.rebuildFtsIndex();

  setLastIndexBuild(provider, buildStart);
  return { scanned: files.length, reindexed, skipped: 0, pruned, failures, warnings };
}

// ─── Migration ──────────────────────────────────────────────────────

export interface MigrationOptions {
  /**
   * Filesystem path to the vault SQLite database. Required for the mandatory
   * backup step; when omitted (e.g. an in-memory fixture), backup is skipped
   * and `backupPath` is null with a note.
   */
  dbPath?: string;
  /** Resolve Zettelkasten links per entry so edges survive in file frontmatter. */
  resolveLinks?: SyncAllOptions['resolveLinks'];
  /** Number of representative FTS queries to run for the parity spot-check. Default 5. */
  paritySampleSize?: number;
}

export interface MigrationReport {
  backupPath: string | null;
  totalEntries: number;
  /** Entries expected to produce a file (total minus empty-slug entries). */
  filesExpected: number;
  filesWritten: number;
  filesOnDisk: number;
  /** Entries whose title slugifies to empty (no file produced) — surfaced, not lost. */
  emptySlug: number;
  skipped: number;
  collisions: SlugCollision[];
  integrityOk: boolean;
  integrityMismatches: Array<{ filePath: string; frontmatterHash?: string; computedHash: string }>;
  hashParityOk: boolean;
  ftsParityOk: boolean;
  reindexFailures: ReindexIssue[];
  reindexWarnings: ReindexIssue[];
  sourceOfTruth: VaultSourceOfTruth;
  formatVersion: number;
  notes: string[];
}

/** Count `.md` entry files under `knowledge/vault/` (excludes `_index.md`). */
function countVaultFiles(knowledgeDir: string): number {
  return scanVaultFiles(knowledgeDir).length;
}

/**
 * Run the safe files-first migration for a vault. Steps mirror the ruling:
 *   1. Snapshot (copy the DB file) — the rollback point.
 *   2. Export all entries to markdown (`syncAllToMarkdown`).
 *   3. Verify count + content_hash integrity — throws loudly on any mismatch.
 *   4. Slug-collision audit (collisions are disambiguated during export).
 *   5. Flip canonicality (`source_of_truth = files`, bump format version 1 → 2).
 *   6. Full reindex from files + content-hash & FTS query parity spot-check.
 *   7. Keep the DB backup (returned as `backupPath`).
 *
 * SAFETY: run against fixtures only — never a live vault DB. The live migration
 * is executed later by the orchestrator/user.
 */
export async function runMigrationToFiles(
  vault: Vault,
  knowledgeDir: string,
  opts: MigrationOptions = {},
): Promise<MigrationReport> {
  const notes: string[] = [];
  const provider = vault.getProvider();

  // Step 1 — Snapshot (non-negotiable rollback point).
  let backupPath: string | null = null;
  if (opts.dbPath && existsSync(opts.dbPath)) {
    // Under WAL mode recent writes live in the -wal file, not yet in the main DB
    // file. Checkpoint first so the copied backup is complete (a plain file copy
    // of vault.db alone would silently miss un-checkpointed rows).
    try {
      provider.run('PRAGMA wal_checkpoint(TRUNCATE)');
    } catch {
      /* non-sqlite backend or checkpoint busy — copy what is on disk */
    }
    backupPath = `${opts.dbPath}.backup-${Date.now()}`;
    copyFileSync(opts.dbPath, backupPath);
  } else {
    notes.push(
      opts.dbPath
        ? `DB file not found at ${opts.dbPath}; backup skipped.`
        : 'No dbPath provided (in-memory vault); backup skipped.',
    );
  }

  // Pre-migration snapshot for step-6 parity, computed from entry CONTENT — never
  // from the stored content_hash column (which may have been written by an older
  // hash formula, stranding real rows and aborting the migration). Include expired
  // entries so nothing is dropped from the files-first store.
  const allEntries = vault.list({ includeExpired: true, limit: 1_000_000 });
  const preHashes = new Map<string, string>();
  for (const e of allEntries) preHashes.set(e.id, computeContentHash(e));
  const totalEntries = preHashes.size;

  // Pre-flight (MINOR 8): the export dir must not contain foreign vault files —
  // any existing .md whose id is not one of this vault's entries would be adopted
  // by the reindex and corrupt the migration. Fail loudly before touching disk.
  const knownIds = new Set(preHashes.keys());
  const foreign = scanVaultFiles(knowledgeDir).filter((f) => f.id && !knownIds.has(f.id));
  if (foreign.length > 0) {
    throw new Error(
      `Migration pre-flight failed: ${foreign.length} foreign .md file(s) under ${knowledgeDir}/vault ` +
        `do not belong to this vault. First: ${foreign[0].filePath}. Export into a clean directory.`,
    );
  }

  // Entries that will not produce a file (empty slug) — surfaced so nothing is lost silently.
  const emptySlug = allEntries.filter((e) => !titleToSlug(e.title)).length;
  const filesExpected = totalEntries - emptySlug;

  // Sample FTS queries from existing entry titles (parity spot-check corpus).
  const sampleSize = opts.paritySampleSize ?? 5;
  const sampleTitles = vault
    .list({ limit: sampleSize * 4 })
    .map((e) => e.title)
    .filter((t) => titleToSlug(t))
    .slice(0, sampleSize);
  const ftsBefore = new Map<string, string[]>();
  for (const title of sampleTitles) {
    ftsBefore.set(
      title,
      vault
        .search(title, { limit: 10 })
        .map((r) => r.entry.id)
        .sort(),
    );
  }

  // Step 2 — Export.
  const exportResult = await syncAllToMarkdown(vault, knowledgeDir, {
    resolveLinks: opts.resolveLinks,
  });
  const filesOnDisk = countVaultFiles(knowledgeDir);

  // Step 3 — Verify count + content_hash integrity (fail loudly).
  const integrityMismatches: MigrationReport['integrityMismatches'] = [];
  for (const file of scanVaultFiles(knowledgeDir)) {
    const { frontmatterHash, computedHash } = readEntryFile(file.filePath, file.domain);
    if (frontmatterHash !== computedHash) {
      integrityMismatches.push({ filePath: file.filePath, frontmatterHash, computedHash });
    }
  }
  if (exportResult.synced + exportResult.skipped !== exportResult.total) {
    throw new Error(
      `Migration count mismatch: synced(${exportResult.synced}) + skipped(${exportResult.skipped}) ` +
        `!= total(${exportResult.total}).`,
    );
  }
  // Every valid-slug entry must have produced exactly one file, and nothing foreign.
  if (filesOnDisk !== filesExpected) {
    throw new Error(
      `Migration file-count mismatch: ${filesOnDisk} file(s) on disk != ${filesExpected} expected ` +
        `(${totalEntries} entries − ${emptySlug} empty-slug). Export into a clean directory.`,
    );
  }
  if (integrityMismatches.length > 0) {
    throw new Error(
      `Migration integrity check failed: ${integrityMismatches.length} file(s) have a ` +
        `content_hash mismatch. First: ${integrityMismatches[0].filePath}`,
    );
  }
  const integrityOk = true;
  if (emptySlug > 0) {
    notes.push(`${emptySlug} entr(y/ies) have an empty slug and produced no file.`);
  }

  // Step 4 — Slug-collision audit (already disambiguated during export).
  if (exportResult.collisions.length > 0) {
    notes.push(`Disambiguated ${exportResult.collisions.length} slug collision(s).`);
  }

  // Step 5 — Flip canonicality, then IMMEDIATELY bind the file store so any later
  // mutation on this vault is file-first (the guard is now armed against DB-only writes).
  setSourceOfTruth(provider, 'files');
  setVaultFormatVersion(provider, VAULT_FORMAT_VERSION);
  vault.bindFileStore(knowledgeDir);

  // Step 6 — Rebuild index from files + parity spot-check. Recompute post-hashes
  // from content too, so the gate verifies the round-trip through files reproduced
  // identical content (independent of any stored-column formula).
  const reindexResult = reindexFull(vault, knowledgeDir);
  const postHashes = new Map<string, string>();
  for (const e of vault.list({ includeExpired: true, limit: 1_000_000 })) {
    postHashes.set(e.id, computeContentHash(e));
  }
  let hashParityOk = preHashes.size === postHashes.size;
  if (hashParityOk) {
    for (const [id, hash] of preHashes) {
      if (postHashes.get(id) !== hash) {
        hashParityOk = false;
        break;
      }
    }
  }
  if (!hashParityOk) {
    throw new Error(
      'Migration content-hash parity check failed: the reindexed set does not match ' +
        'the pre-migration index. Restore from the DB backup.',
    );
  }
  let ftsParityOk = true;
  const ftsDrift: string[] = [];
  for (const [title, beforeIds] of ftsBefore) {
    const afterIds = vault
      .search(title, { limit: 10 })
      .map((r) => r.entry.id)
      .sort();
    if (JSON.stringify(beforeIds) !== JSON.stringify(afterIds)) {
      ftsParityOk = false;
      ftsDrift.push(title);
    }
  }
  // FTS parity is fatal like hash parity — the reindexed index must answer queries
  // identically to the pre-migration index (same content ⇒ same result ids).
  if (!ftsParityOk) {
    throw new Error(
      `Migration FTS parity check failed: post-reindex search results diverge from the ` +
        `pre-migration index for ${ftsDrift.length} quer(y/ies) (e.g. "${ftsDrift[0]}"). ` +
        'Restore from the DB backup.',
    );
  }

  // Step 7 — Keep the DB backup (returned to caller).
  return {
    backupPath,
    totalEntries,
    filesExpected,
    filesWritten: exportResult.synced,
    filesOnDisk,
    emptySlug,
    skipped: exportResult.skipped,
    collisions: exportResult.collisions,
    integrityOk,
    integrityMismatches,
    hashParityOk,
    ftsParityOk,
    reindexFailures: reindexResult.failures,
    reindexWarnings: reindexResult.warnings,
    sourceOfTruth: 'files',
    formatVersion: getVaultFormatVersion(provider),
    notes,
  };
}
