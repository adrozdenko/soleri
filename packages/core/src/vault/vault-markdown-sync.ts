/**
 * Vault Markdown Sync — auto-sync vault entries to browsable markdown files.
 *
 * Writes entries as markdown with YAML frontmatter to knowledge/vault/{domain}/{slug}.md
 * for offline browsability. Reuses patterns from obsidian-sync.ts.
 */

import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  rmSync,
  renameSync,
} from 'node:fs';
import { join, basename } from 'node:path';
import type { IntelligenceEntry } from '../intelligence/types.js';
import { computeContentHash } from './content-hash.js';
import {
  titleToSlug,
  buildFrontmatterLinks,
  buildRelatedSection,
  escapeFieldBody,
  type ResolvedLinks,
} from './obsidian-sync.js';
import type { Vault } from './vault.js';

export { titleToSlug } from './obsidian-sync.js';
export type { ResolvedLinks } from './obsidian-sync.js';

// ─── Format ─────────────────────────────────────────────────────────

/**
 * Convert a vault entry to canonical markdown (WS4 files-first schema).
 *
 * Frontmatter: id, type, domain, severity, tags, tier, origin, applies_to,
 * valid_from/valid_until, links (`[[linktype::slug]]`), created, updated,
 * content_hash. Body: title, description, and the optional Context / Example /
 * Counter-Example / Why sections, plus a human-facing `## Related` section when
 * links are supplied.
 *
 * `applies_to` and `valid_from/valid_until` are serialized additively (beyond
 * the ruling's required field list) so the file store is lossless for the full
 * IntelligenceEntry shape — no field is dropped on the files-first flip.
 */
export function entryToMarkdown(entry: IntelligenceEntry, resolvedLinks?: ResolvedLinks): string {
  const lines: string[] = ['---'];
  lines.push(`id: "${entry.id}"`);
  lines.push(`type: "${entry.type}"`);
  lines.push(`domain: "${entry.domain}"`);
  if (entry.severity) lines.push(`severity: "${entry.severity}"`);
  if (entry.tags && entry.tags.length > 0) {
    lines.push(`tags: [${entry.tags.map((t) => `"${t}"`).join(', ')}]`);
  }
  if (entry.tier) lines.push(`tier: "${entry.tier}"`);
  if (entry.origin) lines.push(`origin: "${entry.origin}"`);
  if (entry.appliesTo && entry.appliesTo.length > 0) {
    lines.push(`applies_to: [${entry.appliesTo.map((t) => `"${t}"`).join(', ')}]`);
  }
  if (entry.validFrom !== undefined) lines.push(`valid_from: ${entry.validFrom}`);
  if (entry.validUntil !== undefined) lines.push(`valid_until: ${entry.validUntil}`);
  if (resolvedLinks) {
    lines.push(...buildFrontmatterLinks(resolvedLinks));
  }
  const created = entry.validFrom
    ? new Date(entry.validFrom * 1000).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  lines.push(`created: ${created}`);
  lines.push(`updated: ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`content_hash: "${computeContentHash(entry)}"`);
  lines.push('---');
  lines.push('');
  lines.push(`# ${entry.title}`);
  lines.push('');
  // Field bodies are escaped so an embedded `## ` line can't break section parsing.
  lines.push(escapeFieldBody(entry.description));
  if (entry.context) {
    lines.push('');
    lines.push('## Context');
    lines.push('');
    lines.push(escapeFieldBody(entry.context));
  }
  if (entry.example) {
    lines.push('');
    lines.push('## Example');
    lines.push('');
    lines.push(escapeFieldBody(entry.example));
  }
  if (entry.counterExample) {
    lines.push('');
    lines.push('## Counter-Example');
    lines.push('');
    lines.push(escapeFieldBody(entry.counterExample));
  }
  if (entry.why) {
    lines.push('');
    lines.push('## Why');
    lines.push('');
    lines.push(escapeFieldBody(entry.why));
  }
  if (resolvedLinks) {
    const related = buildRelatedSection(resolvedLinks);
    if (related) {
      lines.push('');
      lines.push(related);
    }
  }
  lines.push('');
  return lines.join('\n');
}

// ─── Slug collision handling ────────────────────────────────────────

/**
 * Compute the canonical filename for an entry within its domain folder.
 * When `disambiguate` is set (the entry's slug collides with another entry in
 * the same domain), a short id suffix is appended: `<slug>-<id[:6]>.md`.
 * `titleToSlug` truncates at 80 chars, so collisions are real at scale.
 * Returns an empty string when the title produces no slug.
 */
export function entryFilename(entry: IntelligenceEntry, disambiguate = false): string {
  const slug = titleToSlug(entry.title);
  if (!slug) return '';
  return disambiguate ? `${slug}-${entry.id.slice(0, 6)}.md` : `${slug}.md`;
}

/**
 * Detect slug collisions across a set of entries. Two entries in the same
 * domain that slugify to the same value collide on one path. Returns the set of
 * entry ids that must be disambiguated (every member of a colliding group, so
 * the rule is deterministic regardless of iteration order).
 */
export function detectSlugCollisions(entries: IntelligenceEntry[]): Set<string> {
  const byKey = new Map<string, string[]>();
  for (const entry of entries) {
    const slug = titleToSlug(entry.title);
    if (!slug) continue;
    const domain = entry.domain || '_general';
    const key = `${domain}/${slug}`;
    const list = byKey.get(key) ?? [];
    list.push(entry.id);
    byKey.set(key, list);
  }
  const collisions = new Set<string>();
  for (const ids of byKey.values()) {
    if (ids.length > 1) for (const id of ids) collisions.add(id);
  }
  return collisions;
}

// ─── Sync ───────────────────────────────────────────────────────────

/** Options for a single entry markdown write. */
export interface SyncEntryOptions {
  /** Append the id suffix to the filename to resolve a same-domain slug collision. */
  disambiguate?: boolean;
  /** Resolved Zettelkasten links to embed in frontmatter + a Related section. */
  resolvedLinks?: ResolvedLinks;
  /**
   * Rewrite even when the on-disk content hash matches. Explicit mutations use
   * this so a change to a non-hashed field (tier/origin/temporal window) still
   * refreshes the file — the content-hash dedup skip is only a bulk-sync optimization.
   */
  force?: boolean;
}

/**
 * Synchronously write one entry to `knowledge/vault/{domain}/{filename}` (file-first
 * primitive used by the write-through path). Skips the write when the on-disk
 * content hash already matches (dedup). Auto-disambiguates when the base `<slug>.md`
 * is occupied by a different entry id.
 */
export function writeEntryFileSync(
  entry: IntelligenceEntry,
  knowledgeDir: string,
  opts: SyncEntryOptions = {},
): { written: boolean; filePath: string | null } {
  const slug = titleToSlug(entry.title);
  if (!slug) return { written: false, filePath: null };
  const domain = entry.domain || '_general';
  const dir = join(knowledgeDir, 'vault', domain);
  mkdirSync(dir, { recursive: true });

  let filePath = join(dir, `${slug}.md`);
  if (opts.disambiguate) {
    filePath = join(dir, `${slug}-${entry.id.slice(0, 6)}.md`);
  } else if (existsSync(filePath)) {
    // Auto-disambiguate when the base path already belongs to a different entry.
    const existing = readFileSync(filePath, 'utf-8');
    const idMatch = existing.match(/^id:\s*"([^"]+)"/m);
    if (idMatch && idMatch[1] !== entry.id) {
      filePath = join(dir, `${slug}-${entry.id.slice(0, 6)}.md`);
    }
  }

  // Content-hash dedup: skip rewrite when file content hasn't changed (unless forced).
  const contentHash = computeContentHash(entry);
  if (!opts.force && existsSync(filePath)) {
    const existing = readFileSync(filePath, 'utf-8');
    const hashMatch = existing.match(/^content_hash:\s*"([^"]+)"/m);
    if (hashMatch && hashMatch[1] === contentHash) {
      return { written: false, filePath };
    }
  }

  writeFileSync(filePath, entryToMarkdown(entry, opts.resolvedLinks), 'utf-8');
  return { written: true, filePath };
}

/**
 * Locate an entry's `.md` within a directory: the disambiguated `<slug>-<id6>.md`
 * first, then the base `<slug>.md` (only when its frontmatter id matches). Returns
 * the absolute path, or null when no matching file exists.
 */
function locateEntryFile(dir: string, slug: string, id: string): string | null {
  const disambiguated = join(dir, `${slug}-${id.slice(0, 6)}.md`);
  if (existsSync(disambiguated)) return disambiguated;
  const base = join(dir, `${slug}.md`);
  if (existsSync(base)) {
    const idMatch = readFileSync(base, 'utf-8').match(/^id:\s*"([^"]+)"/m);
    if (!idMatch || idMatch[1] === id) return base;
  }
  return null;
}

/**
 * Remove an entry's markdown file (file-first delete). Checks the disambiguated
 * name first, then the base `<slug>.md` (only when it belongs to this entry id).
 * Returns the removed path, or null when no matching file was found.
 */
export function removeEntryFileSync(
  entry: Pick<IntelligenceEntry, 'id' | 'title' | 'domain'>,
  knowledgeDir: string,
): string | null {
  const slug = titleToSlug(entry.title);
  if (!slug) return null;
  const dir = join(knowledgeDir, 'vault', entry.domain || '_general');
  const path = locateEntryFile(dir, slug, entry.id);
  if (path) {
    rmSync(path, { force: true });
    return path;
  }
  return null;
}

/**
 * Move an entry's `.md` from its domain folder to `vault/_archive/<domain>/`
 * (file-first archive). Archived files live outside the scanned tree, so a
 * reindex will not resurrect them. Returns the new path, or null when no file.
 */
export function archiveEntryFileSync(
  entry: Pick<IntelligenceEntry, 'id' | 'title' | 'domain'>,
  knowledgeDir: string,
): string | null {
  const slug = titleToSlug(entry.title);
  if (!slug) return null;
  const domain = entry.domain || '_general';
  const src = locateEntryFile(join(knowledgeDir, 'vault', domain), slug, entry.id);
  if (!src) return null;
  const destDir = join(knowledgeDir, 'vault', '_archive', domain);
  mkdirSync(destDir, { recursive: true });
  const dest = join(destDir, basename(src));
  renameSync(src, dest);
  return dest;
}

/**
 * Move an entry's `.md` back from `vault/_archive/<domain>/` to its live domain
 * folder (file-first restore). Returns the restored path, or null when the
 * archived file is absent (the caller should then write a fresh file).
 */
export function restoreEntryFileSync(
  entry: Pick<IntelligenceEntry, 'id' | 'title' | 'domain'>,
  knowledgeDir: string,
): string | null {
  const slug = titleToSlug(entry.title);
  if (!slug) return null;
  const domain = entry.domain || '_general';
  const src = locateEntryFile(join(knowledgeDir, 'vault', '_archive', domain), slug, entry.id);
  if (!src) return null;
  const destDir = join(knowledgeDir, 'vault', domain);
  mkdirSync(destDir, { recursive: true });
  const dest = join(destDir, basename(src));
  renameSync(src, dest);
  return dest;
}

/** Write a single entry as a markdown file to knowledge/vault/{domain}/{slug}.md.
 *  Skips the write if the file already exists with a matching content hash (dedup). */
export async function syncEntryToMarkdown(
  entry: IntelligenceEntry,
  knowledgeDir: string,
  opts: SyncEntryOptions = {},
): Promise<{ written: boolean; filePath: string | null }> {
  return writeEntryFileSync(entry, knowledgeDir, opts);
}

/** Options controlling a full vault → markdown export. */
export interface SyncAllOptions {
  /** Resolve Zettelkasten links per entry so edges survive in frontmatter. */
  resolveLinks?: (entry: IntelligenceEntry) => ResolvedLinks | undefined;
}

/** A slug collision detected and disambiguated during export. */
export interface SlugCollision {
  id: string;
  domain: string;
  slug: string;
  filename: string;
}

/** Sync all vault entries to markdown, skipping entries whose content hash matches. */
export async function syncAllToMarkdown(
  vault: Vault,
  knowledgeDir: string,
  opts: SyncAllOptions = {},
): Promise<{ synced: number; skipped: number; total: number; collisions: SlugCollision[] }> {
  // Include expired entries — expiry is a query-time filter, not deletion, so the
  // files-first store must still carry them (else a reindex would drop them).
  const entries = vault.list({ includeExpired: true, limit: 1_000_000 });
  const collidingIds = detectSlugCollisions(entries);
  let synced = 0;
  let skipped = 0;
  const collisions: SlugCollision[] = [];

  for (const entry of entries) {
    const disambiguate = collidingIds.has(entry.id);
    const filename = entryFilename(entry, disambiguate);
    if (!filename) {
      skipped++;
      continue;
    }
    if (disambiguate) {
      collisions.push({
        id: entry.id,
        domain: entry.domain || '_general',
        slug: titleToSlug(entry.title),
        filename,
      });
    }

    const domain = entry.domain || '_general';
    const filePath = join(knowledgeDir, 'vault', domain, filename);
    if (existsSync(filePath)) {
      const existing = readFileSync(filePath, 'utf-8');
      const hashMatch = existing.match(/^content_hash:\s*"([^"]+)"/m);
      if (hashMatch && hashMatch[1] === computeContentHash(entry)) {
        skipped++;
        continue;
      }
    }

    const result = writeEntryFileSync(entry, knowledgeDir, {
      disambiguate,
      resolvedLinks: opts.resolveLinks?.(entry),
    });
    if (result.written) synced++;
    else skipped++;
  }

  await generateIndex(knowledgeDir);
  return { synced, skipped, total: entries.length, collisions };
}

// ─── Index ──────────────────────────────────────────────────────────

/** Generate _index.md with entry counts per domain. */
export async function generateIndex(knowledgeDir: string): Promise<void> {
  const vaultDir = join(knowledgeDir, 'vault');
  if (!existsSync(vaultDir)) return;

  const domains: Array<{ name: string; count: number }> = [];
  const entries = readdirSync(vaultDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const domainDir = join(vaultDir, entry.name);
    const files = readdirSync(domainDir).filter((f) => f.endsWith('.md'));
    domains.push({ name: entry.name, count: files.length });
  }

  domains.sort((a, b) => b.count - a.count);
  const total = domains.reduce((sum, d) => sum + d.count, 0);

  const lines: string[] = [
    '# Vault Knowledge Index',
    '',
    `> Auto-generated. ${total} entries across ${domains.length} domains.`,
    '',
    '| Domain | Entries |',
    '|--------|---------|',
    ...domains.map((d) => `| [${d.name}](./${d.name}/) | ${d.count} |`),
    '',
  ];

  writeFileSync(join(vaultDir, '_index.md'), lines.join('\n'), 'utf-8');
}
