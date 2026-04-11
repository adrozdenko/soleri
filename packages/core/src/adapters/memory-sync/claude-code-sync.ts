/**
 * Claude Code memory sync adapter.
 *
 * Writes vault memories as markdown files to ~/.claude/projects/{hash}/memory/
 * and maintains a MEMORY.md index. Tracks state via .sync-manifest.json for
 * idempotent diffing and cleanup.
 *
 * One-directional: vault → Claude Code auto-memory.
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type {
  MemorySyncAdapter,
  MemorySyncEntry,
  MemorySyncConfig,
  MemorySyncResult,
  SyncManifest,
} from './types.js';

const SYNC_SECTION_MARKER = '## Synced from Vault';
const MANIFEST_FILE = '.sync-manifest.json';

/** Sanitize an ID into a safe filename */
function toFileName(id: string): string {
  return `vault_${id.replace(/[^a-zA-Z0-9_-]/g, '_')}.md`;
}

/** Format a memory entry as a markdown file with frontmatter */
function formatEntryAsMarkdown(entry: MemorySyncEntry): string {
  const lines = [
    '---',
    `name: ${entry.title}`,
    `description: ${entry.oneLineHook}`,
    `type: ${entry.type}`,
    `source: vault-sync`,
    `sourceId: ${entry.sourceId}`,
    '---',
    '',
    entry.description,
    '',
  ];
  return lines.join('\n');
}

/** Build the sync section for MEMORY.md */
function buildSyncSection(
  entries: Array<{ fileName: string; oneLineHook: string; title: string }>,
  maxLines: number,
): string {
  const header = `${SYNC_SECTION_MARKER}\n`;
  const lines: string[] = [];

  for (const entry of entries) {
    const line = `- [${entry.title}](${entry.fileName}) — ${entry.oneLineHook}`;
    // Check if adding this line would exceed the budget
    // +2 accounts for the header line and a blank line
    if (lines.length + 2 >= maxLines) break;
    lines.push(line);
  }

  return header + lines.join('\n') + '\n';
}

/** Split MEMORY.md into the user section (above sync marker) and the rest */
function splitMemoryIndex(content: string): { userSection: string; syncSection: string } {
  const markerIndex = content.indexOf(SYNC_SECTION_MARKER);
  if (markerIndex === -1) {
    return { userSection: content.trimEnd(), syncSection: '' };
  }
  return {
    userSection: content.slice(0, markerIndex).trimEnd(),
    syncSection: content.slice(markerIndex),
  };
}

export class ClaudeCodeMemorySyncAdapter implements MemorySyncAdapter {
  readonly host = 'claude-code';
  private readonly memoryDir: string;

  constructor(memoryDir: string) {
    this.memoryDir = memoryDir;
  }

  detectSupport(): boolean {
    return existsSync(this.memoryDir);
  }

  sync(entries: MemorySyncEntry[], config: MemorySyncConfig): MemorySyncResult {
    const result: MemorySyncResult = { synced: 0, skipped: 0, removed: 0, errors: [], entries: [] };

    if (!this.detectSupport()) {
      result.errors.push(`Memory directory does not exist: ${this.memoryDir}`);
      return result;
    }

    // Read existing manifest for diffing
    const existingManifest = this.readManifest();
    const existingEntryMap = new Map<string, SyncManifest['entries'][number]>();
    if (existingManifest) {
      for (const e of existingManifest.entries) {
        existingEntryMap.set(e.id, e);
      }
    }

    // Track which entry IDs are in the new set
    const newEntryIds = new Set(entries.map((e) => e.id));

    // ─── Write/update entries ────────────────────────────────────
    const manifestEntries: SyncManifest['entries'] = [];

    for (const entry of entries) {
      const fileName = toFileName(entry.id);
      const filePath = join(this.memoryDir, fileName);
      const existing = existingEntryMap.get(entry.id);

      // Skip if content hash unchanged
      if (existing && existing.contentHash === entry.contentHash) {
        result.skipped++;
        manifestEntries.push(existing);
        continue;
      }

      try {
        const markdown = formatEntryAsMarkdown(entry);
        writeFileSync(filePath, markdown, 'utf-8');

        const action = existing ? 'updated' : 'created';
        result.synced++;
        result.entries.push({ id: entry.id, title: entry.title, action });
        manifestEntries.push({
          id: entry.id,
          sourceId: entry.sourceId,
          contentHash: entry.contentHash,
          syncedAt: entry.syncedAt,
          fileName,
        });
      } catch (err) {
        result.errors.push(`Failed to write ${fileName}: ${(err as Error).message}`);
      }
    }

    // ─── Remove stale entries ────────────────────────────────────
    if (existingManifest) {
      for (const old of existingManifest.entries) {
        if (!newEntryIds.has(old.id)) {
          const filePath = join(this.memoryDir, old.fileName);
          try {
            if (existsSync(filePath)) {
              unlinkSync(filePath);
            }
            result.removed++;
            result.entries.push({ id: old.id, title: old.id, action: 'removed' });
          } catch (err) {
            result.errors.push(`Failed to remove ${old.fileName}: ${(err as Error).message}`);
          }
        }
      }
    }

    // ─── Update MEMORY.md index ──────────────────────────────────
    this.updateMemoryIndex(entries, config.maxIndexLines);

    // ─── Write manifest ──────────────────────────────────────────
    const manifest: SyncManifest = {
      lastSyncedAt: Date.now(),
      host: this.host,
      entries: manifestEntries,
    };
    this.writeManifest(manifest);

    return result;
  }

  readManifest(): SyncManifest | null {
    const path = join(this.memoryDir, MANIFEST_FILE);
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, 'utf-8')) as SyncManifest;
    } catch {
      return null;
    }
  }

  clear(): MemorySyncResult {
    const result: MemorySyncResult = { synced: 0, skipped: 0, removed: 0, errors: [], entries: [] };
    const manifest = this.readManifest();

    if (!manifest) return result;

    // Remove synced files
    for (const entry of manifest.entries) {
      const filePath = join(this.memoryDir, entry.fileName);
      try {
        if (existsSync(filePath)) {
          unlinkSync(filePath);
          result.removed++;
          result.entries.push({ id: entry.id, title: entry.id, action: 'removed' });
        }
      } catch (err) {
        result.errors.push(`Failed to remove ${entry.fileName}: ${(err as Error).message}`);
      }
    }

    // Remove sync section from MEMORY.md
    const indexPath = join(this.memoryDir, 'MEMORY.md');
    if (existsSync(indexPath)) {
      const content = readFileSync(indexPath, 'utf-8');
      const { userSection } = splitMemoryIndex(content);
      if (userSection.trim()) {
        writeFileSync(indexPath, userSection + '\n', 'utf-8');
      }
    }

    // Remove manifest
    const manifestPath = join(this.memoryDir, MANIFEST_FILE);
    if (existsSync(manifestPath)) {
      unlinkSync(manifestPath);
    }

    return result;
  }

  // ─── Private helpers ───────────────────────────────────────────

  private updateMemoryIndex(entries: MemorySyncEntry[], maxIndexLines: number): void {
    const indexPath = join(this.memoryDir, 'MEMORY.md');

    let userSection = '';
    if (existsSync(indexPath)) {
      const content = readFileSync(indexPath, 'utf-8');
      ({ userSection } = splitMemoryIndex(content));
    }

    if (entries.length === 0) {
      // No entries to sync — just keep the user section
      if (userSection.trim()) {
        writeFileSync(indexPath, userSection + '\n', 'utf-8');
      }
      return;
    }

    // Calculate how many lines the user section takes
    const userLines = userSection ? userSection.split('\n').length : 0;
    const availableLines = Math.max(0, maxIndexLines - userLines - 2); // -2 for header + blank separator

    const syncEntries = entries.map((e) => ({
      fileName: toFileName(e.id),
      oneLineHook: e.oneLineHook,
      title: e.title,
    }));

    const syncSection = buildSyncSection(syncEntries, availableLines + 2);

    const separator = userSection.trim() ? '\n\n' : '';
    const output = userSection.trim() ? userSection + separator + syncSection : syncSection;

    writeFileSync(indexPath, output, 'utf-8');
  }

  private writeManifest(manifest: SyncManifest): void {
    const path = join(this.memoryDir, MANIFEST_FILE);
    writeFileSync(path, JSON.stringify(manifest, null, 2), 'utf-8');
  }
}
