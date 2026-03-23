/**
 * Vault Markdown Sync — auto-sync vault entries to browsable markdown files.
 *
 * Writes entries as markdown with YAML frontmatter to knowledge/vault/{domain}/{slug}.md
 * for offline browsability. Reuses patterns from obsidian-sync.ts.
 */

import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { IntelligenceEntry } from '../intelligence/types.js';
import { computeContentHash } from './content-hash.js';
import type { Vault } from './vault.js';

// ─── Format ─────────────────────────────────────────────────────────

/** Slugify a title for use as a filename. */
export function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

/** Convert a vault entry to markdown string with YAML frontmatter. */
export function entryToMarkdown(entry: IntelligenceEntry): string {
  const lines: string[] = ['---'];
  lines.push(`id: "${entry.id}"`);
  lines.push(`type: "${entry.type}"`);
  if (entry.domain) lines.push(`domain: "${entry.domain}"`);
  if (entry.tags && entry.tags.length > 0) {
    lines.push(`tags: [${entry.tags.map((t) => `"${t}"`).join(', ')}]`);
  }
  if (entry.severity) lines.push(`severity: "${entry.severity}"`);
  if (entry.tier) lines.push(`tier: "${entry.tier}"`);
  if (entry.origin) lines.push(`origin: "${entry.origin}"`);
  const created = entry.validFrom
    ? new Date(entry.validFrom * 1000).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  lines.push(`created: ${created}`);
  lines.push(`content_hash: "${computeContentHash(entry)}"`);
  lines.push('---');
  lines.push('');
  lines.push(`# ${entry.title}`);
  lines.push('');
  lines.push(entry.description);
  if (entry.context) {
    lines.push('');
    lines.push('## Context');
    lines.push('');
    lines.push(entry.context);
  }
  if (entry.example) {
    lines.push('');
    lines.push('## Example');
    lines.push('');
    lines.push(entry.example);
  }
  if (entry.counterExample) {
    lines.push('');
    lines.push('## Counter-Example');
    lines.push('');
    lines.push(entry.counterExample);
  }
  if (entry.why) {
    lines.push('');
    lines.push('## Why');
    lines.push('');
    lines.push(entry.why);
  }
  lines.push('');
  return lines.join('\n');
}

// ─── Sync ───────────────────────────────────────────────────────────

/** Write a single entry as a markdown file to knowledge/vault/{domain}/{slug}.md */
export async function syncEntryToMarkdown(
  entry: IntelligenceEntry,
  knowledgeDir: string,
): Promise<void> {
  const domain = entry.domain || '_general';
  const slug = titleToSlug(entry.title);
  if (!slug) return;

  const dir = join(knowledgeDir, 'vault', domain);
  mkdirSync(dir, { recursive: true });

  const filePath = join(dir, `${slug}.md`);
  const content = entryToMarkdown(entry);
  writeFileSync(filePath, content, 'utf-8');
}

/** Sync all vault entries to markdown, skipping entries whose content hash matches. */
export async function syncAllToMarkdown(
  vault: Vault,
  knowledgeDir: string,
): Promise<{ synced: number; skipped: number }> {
  const entries = vault.list({ limit: 10000 });
  let synced = 0;
  let skipped = 0;

  for (const entry of entries) {
    const domain = entry.domain || '_general';
    const slug = titleToSlug(entry.title);
    if (!slug) {
      skipped++;
      continue;
    }

    const filePath = join(knowledgeDir, 'vault', domain, `${slug}.md`);
    if (existsSync(filePath)) {
      const existing = readFileSync(filePath, 'utf-8');
      const hashMatch = existing.match(/^content_hash:\s*"([^"]+)"/m);
      if (hashMatch && hashMatch[1] === computeContentHash(entry)) {
        skipped++;
        continue;
      }
    }

    await syncEntryToMarkdown(entry, knowledgeDir);
    synced++;
  }

  await generateIndex(knowledgeDir);
  return { synced, skipped };
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
