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

/**
 * Build a ## Related section grouping wikilinks by link type.
 * Returns null if the entry has no links.
 */
function buildRelatedSection(links: ResolvedLinks): string | null {
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

/**
 * Parse Obsidian markdown with YAML frontmatter back to vault entry fields.
 */
export function fromObsidianMarkdown(content: string): {
  id?: string;
  type?: string;
  domain?: string;
  severity?: string;
  tags?: string[];
  title?: string;
  description?: string;
  updated?: number;
} {
  const result: Record<string, unknown> = {};

  // Parse YAML frontmatter
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const yaml = fmMatch[1];
    for (const line of yaml.split('\n')) {
      const kv = line.match(/^(\w+):\s*(.+)$/);
      if (!kv) continue;
      const [, key, value] = kv;
      if (key === 'tags') {
        const tagMatch = value.match(/\[([^\]]*)\]/);
        if (tagMatch) {
          result.tags = tagMatch[1]
            .split(',')
            .map((t) => t.trim().replace(/^"|"$/g, ''))
            .filter(Boolean);
        }
      } else if (key === 'updated') {
        result.updated = parseInt(value, 10);
      } else {
        result[key] = value.replace(/^"|"$/g, '');
      }
    }
  }

  // Parse body
  const body = content.replace(/^---\n[\s\S]*?\n---\n*/, '');
  const titleMatch = body.match(/^# (.+)$/m);
  if (titleMatch) {
    result.title = titleMatch[1];
  }

  const description = body.replace(/^# .+\n*/, '').trim();
  if (description) {
    result.description = description;
  }

  // Type inference when missing
  if (!result.type && description) {
    const lower = description.toLowerCase();
    if (/\b(don't|avoid|never|anti-pattern)\b/.test(lower)) {
      result.type = 'anti-pattern';
    } else if (/\b(always|prefer|use|pattern)\b/.test(lower)) {
      result.type = 'pattern';
    } else if (/^rule:/i.test(description)) {
      result.type = 'rule';
    } else {
      result.type = 'concept';
    }
  }

  return result as {
    id?: string;
    type?: string;
    domain?: string;
    severity?: string;
    tags?: string[];
    title?: string;
    description?: string;
    updated?: number;
  };
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
