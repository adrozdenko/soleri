/**
 * Obsidian Bidirectional Sync — export/import vault entries as Obsidian markdown.
 *
 * Supports three modes:
 * - Push (vault → Obsidian)
 * - Pull (Obsidian → vault)
 * - Bidirectional (timestamp-based merge with conflict detection)
 *
 * Format: YAML frontmatter + body content + wikilinks for related entries.
 */

import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, extname, relative, dirname } from 'node:path';
import type { Vault } from './vault.js';
import type { IntelligenceEntry } from '../intelligence/types.js';
import type { LinkManager } from './linking.js';
import type { VaultLink } from './vault-types.js';

// ─── Types ────────────────────────────────────────────────────────────

export interface ObsidianSyncConfig {
  vault: Vault;
  linkManager?: LinkManager;
}

export interface ExportOptions {
  types?: string[];
  domains?: string[];
  dryRun?: boolean;
}

export interface ImportOptions {
  defaultType?: string;
  defaultDomain?: string;
  dryRun?: boolean;
}

export type SyncMode = 'push' | 'pull' | 'bidirectional';

export interface SyncOptions {
  mode?: SyncMode;
  dryRun?: boolean;
}

export interface ExportResult {
  exported: number;
  files: string[];
  skipped: number;
}

export interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  conflicts: ConflictInfo[];
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  conflicts: ConflictInfo[];
  mode: SyncMode;
}

export interface ConflictInfo {
  title: string;
  id: string;
  vaultUpdated: number;
  obsidianUpdated: number;
  vaultSnippet: string;
  obsidianSnippet: string;
}

// ─── Format Helpers ──────────────────────────────────────────────────

/** Resolved link info for wikilink generation. */
export interface ResolvedLinks {
  outgoing: VaultLink[];
  incoming: VaultLink[];
  titleMap: Map<string, string>;
}

/**
 * Convert a vault entry to Obsidian-compatible markdown with YAML frontmatter.
 * When resolvedLinks is provided, appends a ## Related section with [[wikilinks]].
 */
export function toObsidianMarkdown(
  entry: IntelligenceEntry,
  resolvedLinks?: ResolvedLinks,
): string {
  const lines: string[] = ['---'];

  lines.push(`id: "${entry.id}"`);
  lines.push(`type: "${entry.type}"`);
  if (entry.domain) lines.push(`domain: "${entry.domain}"`);
  if (entry.severity) lines.push(`severity: "${entry.severity}"`);
  if (entry.tags && entry.tags.length > 0) {
    lines.push(`tags: [${entry.tags.map((t) => `"${t}"`).join(', ')}]`);
  }
  lines.push(`updated: ${Date.now()}`);
  lines.push('---');
  lines.push('');
  lines.push(`# ${entry.title}`);
  lines.push('');
  lines.push(entry.description);

  // Append wikilinks for related entries
  if (resolvedLinks) {
    const section = buildRelatedSection(resolvedLinks);
    if (section) {
      lines.push('');
      lines.push(section);
    }
  }

  return lines.join('\n');
}

/** A wikilink parsed from frontmatter or a Related section: `[[linktype::slug]]` or `[[slug]]`. */
export interface ParsedWikilink {
  linkType?: string;
  slug: string;
}

/**
 * Parse a wikilink string into its edge kind and slug.
 * Accepts `[[linktype::slug]]` (edge kind preserved) and `[[slug]]` (untyped).
 * The surrounding `[[ ]]` are optional.
 */
export function parseWikilink(raw: string): ParsedWikilink | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const inner = trimmed.replace(/^\[\[/, '').replace(/\]\]$/, '').trim();
  if (!inner) return null;
  const sep = inner.indexOf('::');
  if (sep !== -1) {
    const linkType = inner.slice(0, sep).trim();
    const slug = inner.slice(sep + 2).trim();
    if (!slug) return null;
    return linkType ? { linkType, slug } : { slug };
  }
  return { slug: inner };
}

/**
 * Serialize resolved links into a frontmatter `links:` block as `[[linktype::slug]]`
 * wikilinks. The edge kind is promoted into the wikilink so it survives round-trips
 * (WS4: edges live in file frontmatter, not only the SQLite links table).
 * Returns the frontmatter lines (empty when there are no links).
 */
export function buildFrontmatterLinks(links: ResolvedLinks): string[] {
  const wikilinks: string[] = [];
  const seen = new Set<string>();
  const push = (linkType: string, id: string) => {
    const title = links.titleMap.get(id);
    if (!title) return;
    const slug = titleToSlug(title);
    if (!slug) return;
    const wl = `[[${linkType}::${slug}]]`;
    if (seen.has(wl)) return;
    seen.add(wl);
    wikilinks.push(wl);
  };
  for (const link of links.outgoing) push(link.linkType, link.targetId);
  for (const link of links.incoming) push(link.linkType, link.sourceId);
  if (wikilinks.length === 0) return [];
  return ['links:', ...wikilinks.map((wl) => `  - "${wl}"`)];
}

/**
 * Build a ## Related section grouping wikilinks by link type.
 * Returns null if the entry has no links.
 */
export function buildRelatedSection(links: ResolvedLinks): string | null {
  // Group by link type. For outgoing links, the related entry is the target.
  // For incoming links, the related entry is the source.
  const grouped = new Map<string, string[]>();

  for (const link of links.outgoing) {
    const title = links.titleMap.get(link.targetId);
    if (!title) continue;
    const slug = titleToSlug(title);
    if (!slug) continue;
    const list = grouped.get(link.linkType) ?? [];
    list.push(`[[${slug}]]`);
    grouped.set(link.linkType, list);
  }

  for (const link of links.incoming) {
    const title = links.titleMap.get(link.sourceId);
    if (!title) continue;
    const slug = titleToSlug(title);
    if (!slug) continue;
    const list = grouped.get(link.linkType) ?? [];
    list.push(`[[${slug}]]`);
    grouped.set(link.linkType, list);
  }

  if (grouped.size === 0) return null;

  const lines: string[] = ['## Related', ''];
  for (const [linkType, wikilinks] of grouped) {
    const label = linkType.charAt(0).toUpperCase() + linkType.slice(1);
    lines.push(`**${label}:** ${wikilinks.join(', ')}`);
  }

  return lines.join('\n');
}

/** Full canonical parse of a vault markdown file (WS4 files-first schema). */
export interface ParsedMarkdownEntry {
  id?: string;
  type?: string;
  domain?: string;
  severity?: string;
  tags?: string[];
  tier?: string;
  origin?: string;
  appliesTo?: string[];
  links?: ParsedWikilink[];
  title?: string;
  description?: string;
  context?: string;
  example?: string;
  counterExample?: string;
  why?: string;
  created?: string;
  updated?: number | string;
  contentHash?: string;
  validFrom?: number;
  validUntil?: number;
}

/** Parse an inline YAML array like `["a", "b"]` into a string[]. */
function parseInlineArray(value: string): string[] {
  const arrMatch = value.match(/\[([^\]]*)\]/);
  if (!arrMatch) return [];
  return arrMatch[1]
    .split(',')
    .map((t) => t.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

/** Strip a single layer of surrounding quotes. */
function unquote(value: string): string {
  return value.replace(/^["']|["']$/g, '');
}

// ─── Body heading escaping ──────────────────────────────────────────
//
// Field bodies (description / context / example / counter-example / why) are
// embedded under `## Section` headers. A line inside a body that itself begins
// with `## ` would collide with the section splitter and silently truncate or
// abort parsing. We reversibly escape such lines by prepending a backslash; the
// escape ladders (`## ` → `\## `, `\## ` → `\\## `) so ANY hostile content —
// including literal backslash-hash lines — round-trips byte-exact.

/** True when a line would be (mis)read as an H2 section boundary. */
const H2_LINE_RE = /^\\*##(?:\s|$)/;

/** Escape a field body so embedded `## ` heading lines cannot break section parsing. */
export function escapeFieldBody(body: string): string {
  return body
    .split('\n')
    .map((line) => (H2_LINE_RE.test(line) ? `\\${line}` : line))
    .join('\n');
}

/** Reverse `escapeFieldBody`: strip one backslash from escaped heading lines. */
export function unescapeFieldBody(body: string): string {
  return body
    .split('\n')
    .map((line) => (/^\\+##(?:\s|$)/.test(line) ? line.slice(1) : line))
    .join('\n');
}

/**
 * Parse the YAML frontmatter block of a canonical vault file.
 * Handles scalars, inline arrays (`tags`, `applies_to`), and the multi-line
 * `links:` list of `[[linktype::slug]]` wikilinks. Keys are normalized to camelCase.
 */
function parseFrontmatter(yaml: string): ParsedMarkdownEntry {
  const result: ParsedMarkdownEntry = {};
  const lines = yaml.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const value = kv[2];

    if (key === 'links') {
      const items: ParsedWikilink[] = [];
      // Inline form `links: [[a::b]], [[c::d]]` is tolerated; list form is canonical.
      if (value.trim()) {
        for (const part of value.split(',')) {
          const parsed = parseWikilink(unquote(part.trim()));
          if (parsed) items.push(parsed);
        }
      }
      while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) {
        const item = unquote(lines[i + 1].replace(/^\s*-\s+/, '').trim());
        const parsed = parseWikilink(item);
        if (parsed) items.push(parsed);
        i++;
      }
      if (items.length > 0) result.links = items;
      continue;
    }
    if (key === 'tags') {
      result.tags = parseInlineArray(value);
      continue;
    }
    if (key === 'applies_to') {
      result.appliesTo = parseInlineArray(value);
      continue;
    }
    if (key === 'updated') {
      const raw = unquote(value.trim());
      result.updated = /^\d+$/.test(raw) ? parseInt(raw, 10) : raw;
      continue;
    }
    if (key === 'valid_from' || key === 'valid_until') {
      const num = parseInt(value, 10);
      if (Number.isFinite(num)) {
        if (key === 'valid_from') result.validFrom = num;
        else result.validUntil = num;
      }
      continue;
    }
    if (key === 'content_hash') {
      result.contentHash = unquote(value);
      continue;
    }
    if (key === 'created') {
      result.created = unquote(value);
      continue;
    }
    // Remaining scalars: id, type, domain, severity, tier, origin.
    (result as Record<string, unknown>)[key] = unquote(value);
  }
  return result;
}

/**
 * Split a markdown body (title removed) into its canonical sections.
 * Text before the first `## ` header is the description; recognized headers
 * (Context / Example / Counter-Example / Why) map to their fields. The
 * `## Related` section is link metadata and is skipped here (links live in
 * frontmatter for round-trips).
 */
function parseBodySections(
  text: string,
): Pick<ParsedMarkdownEntry, 'description' | 'context' | 'example' | 'counterExample' | 'why'> {
  const out: Pick<
    ParsedMarkdownEntry,
    'description' | 'context' | 'example' | 'counterExample' | 'why'
  > = {};
  const parts = text.split(/^##\s+/m);
  const description = unescapeFieldBody(parts[0].trim());
  if (description) out.description = description;
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i];
    const nl = seg.indexOf('\n');
    const header = (nl === -1 ? seg : seg.slice(0, nl)).trim().toLowerCase();
    const body = unescapeFieldBody((nl === -1 ? '' : seg.slice(nl + 1)).trim());
    switch (header) {
      case 'context':
        if (body) out.context = body;
        break;
      case 'example':
        if (body) out.example = body;
        break;
      case 'counter-example':
        if (body) out.counterExample = body;
        break;
      case 'why':
        if (body) out.why = body;
        break;
      // 'related' and any unknown headers are intentionally ignored.
    }
  }
  return out;
}

/**
 * Parse a canonical vault markdown file with YAML frontmatter into its fields.
 *
 * Hardened for WS4 files-first: round-trips id, type, domain, severity, tags,
 * tier, origin, applies_to, links (as `[[linktype::slug]]`), created, updated,
 * content_hash, valid_from/valid_until, and the body sections
 * (description / Context / Example / Counter-Example / Why).
 *
 * Type inference is retained only as a fallback when frontmatter omits `type`
 * (legacy Obsidian imports); canonical files always carry an explicit `type`.
 */
export function fromObsidianMarkdown(content: string): ParsedMarkdownEntry {
  let result: ParsedMarkdownEntry = {};

  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    result = parseFrontmatter(fmMatch[1]);
  }

  // Parse body: strip frontmatter, extract H1 title, split remaining sections.
  const body = content.replace(/^---\n[\s\S]*?\n---\n*/, '');
  const titleMatch = body.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    result.title = titleMatch[1].trim();
  }
  const afterTitle = body.replace(/^#\s+.+\n?/m, '');
  Object.assign(result, parseBodySections(afterTitle));

  // Type inference when missing (legacy Obsidian imports only).
  if (!result.type && result.description) {
    const lower = result.description.toLowerCase();
    if (/\b(don't|avoid|never|anti-pattern)\b/.test(lower)) {
      result.type = 'anti-pattern';
    } else if (/\b(always|prefer|use|pattern)\b/.test(lower)) {
      result.type = 'pattern';
    } else if (/^rule:/i.test(result.description)) {
      result.type = 'rule';
    } else {
      result.type = 'concept';
    }
  }

  return result;
}

/**
 * Slugify a title for use as a filename.
 */
export function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

// ─── Sync Engine ─────────────────────────────────────────────────────

export class ObsidianSync {
  private vault: Vault;
  private linkManager?: LinkManager;

  constructor(config: ObsidianSyncConfig) {
    this.vault = config.vault;
    this.linkManager = config.linkManager;
  }

  /**
   * Export vault entries to Obsidian markdown files.
   */
  export(obsidianDir: string, opts: ExportOptions = {}): ExportResult {
    let entries = this.vault.list({});

    // Filter by types and domains (vault.list takes singular, we support arrays)
    if (opts.types && opts.types.length > 0) {
      entries = entries.filter((e) => opts.types!.includes(e.type));
    }
    if (opts.domains && opts.domains.length > 0) {
      entries = entries.filter((e) => opts.domains!.includes(e.domain || ''));
    }

    // Build a title lookup map for wikilink resolution
    const titleMap = new Map<string, string>();
    for (const e of entries) {
      titleMap.set(e.id, e.title);
    }

    const files: string[] = [];
    let skipped = 0;

    for (const entry of entries) {
      const domain = entry.domain || 'general';
      const slug = titleToSlug(entry.title);
      if (!slug) {
        skipped++;
        continue;
      }

      const dir = join(obsidianDir, domain);
      const filePath = join(dir, `${slug}.md`);
      const relPath = relative(obsidianDir, filePath);

      // Resolve links for wikilink generation
      let resolvedLinks: ResolvedLinks | undefined;
      if (this.linkManager) {
        const outgoing = this.linkManager.getLinks(entry.id);
        const incoming = this.linkManager.getBacklinks(entry.id);
        if (outgoing.length > 0 || incoming.length > 0) {
          resolvedLinks = { outgoing, incoming, titleMap };
        }
      }

      if (!opts.dryRun) {
        mkdirSync(dir, { recursive: true });
        writeFileSync(filePath, toObsidianMarkdown(entry, resolvedLinks), 'utf-8');
      }

      files.push(relPath);
    }

    return { exported: files.length, files, skipped };
  }

  /**
   * Import Obsidian markdown files into the vault.
   */
  import(obsidianDir: string, opts: ImportOptions = {}): ImportResult {
    const mdFiles = this.findMarkdownFiles(obsidianDir);
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const conflicts: ConflictInfo[] = [];

    for (const file of mdFiles) {
      const content = readFileSync(file, 'utf-8');
      const parsed = fromObsidianMarkdown(content);

      if (!parsed.title || !parsed.description) {
        skipped++;
        continue;
      }

      // Use directory name as domain fallback
      const relDir = dirname(relative(obsidianDir, file));
      const domain = parsed.domain || (relDir !== '.' ? relDir : opts.defaultDomain || 'general');
      const type = parsed.type || opts.defaultType || 'concept';

      // Check if exists by ID
      if (parsed.id) {
        const existing = this.vault.get(parsed.id);
        if (existing) {
          if (!opts.dryRun) {
            this.vault.update(parsed.id, {
              title: parsed.title,
              description: parsed.description,
              domain,
              tags: parsed.tags || [],
            });
          }
          updated++;
          continue;
        }
      }

      // New entry
      if (!opts.dryRun) {
        this.vault.seed([
          {
            id: parsed.id || `obsidian-${titleToSlug(parsed.title)}-${Date.now()}`,
            type: type as 'pattern' | 'anti-pattern' | 'rule',
            domain,
            title: parsed.title,
            description: parsed.description,
            severity: (parsed.severity as 'critical' | 'warning' | 'suggestion') || 'suggestion',
            tags: parsed.tags || [],
          },
        ]);
      }
      imported++;
    }

    return { imported, updated, skipped, conflicts };
  }

  /**
   * Bidirectional sync between vault and Obsidian directory.
   */
  sync(obsidianDir: string, opts: SyncOptions = {}): SyncResult {
    const mode = opts.mode || 'bidirectional';

    if (mode === 'push') {
      const result = this.export(obsidianDir, { dryRun: opts.dryRun });
      return { pushed: result.exported, pulled: 0, conflicts: [], mode };
    }

    if (mode === 'pull') {
      const result = this.import(obsidianDir, { dryRun: opts.dryRun });
      return {
        pushed: 0,
        pulled: result.imported + result.updated,
        conflicts: result.conflicts,
        mode,
      };
    }

    // Bidirectional: export first, then import new entries
    const exportResult = this.export(obsidianDir, { dryRun: opts.dryRun });
    const importResult = this.import(obsidianDir, { dryRun: opts.dryRun });

    return {
      pushed: exportResult.exported,
      pulled: importResult.imported + importResult.updated,
      conflicts: importResult.conflicts,
      mode,
    };
  }

  private findMarkdownFiles(dir: string): string[] {
    const results: string[] = [];
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...this.findMarkdownFiles(fullPath));
        } else if (extname(entry.name) === '.md') {
          results.push(fullPath);
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }
    return results;
  }
}
