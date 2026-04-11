/**
 * OpenCode memory sync adapter.
 *
 * Writes a consolidated markdown context file to .opencode/memory/soleri-context.md.
 * Simpler than Claude Code's per-file approach because OpenCode doesn't have
 * an auto-loaded individual memory file system (yet).
 *
 * One-directional: vault → OpenCode context file.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type {
  MemorySyncAdapter,
  MemorySyncEntry,
  MemorySyncConfig,
  MemorySyncResult,
  SyncManifest,
} from './types.js';

const CONTEXT_FILE = 'soleri-context.md';
const MANIFEST_FILE = '.sync-manifest.json';
const MEMORY_DIR = '.opencode/memory';

/** Group entries by type for sectioned output */
function groupByType(entries: MemorySyncEntry[]): Map<string, MemorySyncEntry[]> {
  const groups = new Map<string, MemorySyncEntry[]>();
  for (const entry of entries) {
    const existing = groups.get(entry.type) ?? [];
    existing.push(entry);
    groups.set(entry.type, existing);
  }
  return groups;
}

/** Format all entries as a single consolidated markdown file */
function formatConsolidatedMarkdown(entries: MemorySyncEntry[]): string {
  const now = new Date().toISOString();
  const lines: string[] = [
    '---',
    'synced_by: soleri',
    `synced_at: ${now}`,
    `entry_count: ${entries.length}`,
    '---',
    '',
    '# Soleri Context',
    '',
    'Auto-synced from vault. Do not edit manually.',
    '',
  ];

  const typeLabels: Record<string, string> = {
    user: 'User',
    feedback: 'Feedback',
    project: 'Project',
    reference: 'Reference',
  };

  const grouped = groupByType(entries);
  for (const [type, groupEntries] of grouped) {
    const label = typeLabels[type] ?? type;
    lines.push(`## ${label}`, '');
    for (const entry of groupEntries) {
      lines.push(`### ${entry.title}`, '', entry.description, '');
    }
  }

  return lines.join('\n');
}

/** Compute a simple content hash for the whole file */
function computeCollectiveHash(entries: MemorySyncEntry[]): string {
  const content = entries.map((e) => `${e.id}:${e.contentHash}`).join('|');
  // Simple hash — no crypto dependency needed
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const chr = content.charCodeAt(i);
    hash = ((hash << 5) - hash + chr) | 0;
  }
  return Math.abs(hash).toString(36);
}

export class OpenCodeMemorySyncAdapter implements MemorySyncAdapter {
  readonly host = 'opencode';
  private readonly projectDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
  }

  private get memoryDir(): string {
    return join(this.projectDir, MEMORY_DIR);
  }

  private get contextPath(): string {
    return join(this.memoryDir, CONTEXT_FILE);
  }

  private get manifestPath(): string {
    return join(this.memoryDir, MANIFEST_FILE);
  }

  detectSupport(): boolean {
    return existsSync(join(this.projectDir, '.opencode'));
  }

  sync(entries: MemorySyncEntry[], _config: MemorySyncConfig): MemorySyncResult {
    const result: MemorySyncResult = { synced: 0, skipped: 0, removed: 0, errors: [], entries: [] };

    if (!this.detectSupport()) {
      result.errors.push(
        `OpenCode directory does not exist: ${join(this.projectDir, '.opencode')}`,
      );
      return result;
    }

    // Ensure memory directory exists
    mkdirSync(this.memoryDir, { recursive: true });

    // Check if content changed since last sync
    const existingManifest = this.readManifest();
    const newHash = computeCollectiveHash(entries);

    if (existingManifest) {
      const oldHash = computeCollectiveHash(
        existingManifest.entries.map((e) => ({
          id: e.id,
          contentHash: e.contentHash,
        })) as MemorySyncEntry[],
      );
      if (oldHash === newHash && entries.length === existingManifest.entries.length) {
        result.skipped = entries.length;
        return result;
      }
    }

    // Write consolidated markdown
    try {
      const markdown = formatConsolidatedMarkdown(entries);
      writeFileSync(this.contextPath, markdown, 'utf-8');

      result.synced = entries.length;
      for (const entry of entries) {
        result.entries.push({ id: entry.id, title: entry.title, action: 'created' });
      }
    } catch (err) {
      result.errors.push(`Failed to write context file: ${(err as Error).message}`);
    }

    // Write manifest
    const manifest: SyncManifest = {
      lastSyncedAt: Date.now(),
      host: this.host,
      entries: entries.map((e) => ({
        id: e.id,
        sourceId: e.sourceId,
        contentHash: e.contentHash,
        syncedAt: e.syncedAt,
        fileName: CONTEXT_FILE,
      })),
    };
    this.writeManifest(manifest);

    return result;
  }

  readManifest(): SyncManifest | null {
    if (!existsSync(this.manifestPath)) return null;
    try {
      return JSON.parse(readFileSync(this.manifestPath, 'utf-8')) as SyncManifest;
    } catch {
      return null;
    }
  }

  clear(): MemorySyncResult {
    const result: MemorySyncResult = { synced: 0, skipped: 0, removed: 0, errors: [], entries: [] };
    const manifest = this.readManifest();

    if (existsSync(this.contextPath)) {
      unlinkSync(this.contextPath);
      result.removed = manifest?.entries.length ?? 1;
    }

    if (existsSync(this.manifestPath)) {
      unlinkSync(this.manifestPath);
    }

    return result;
  }

  private writeManifest(manifest: SyncManifest): void {
    writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  }
}
