import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ClaudeCodeMemorySyncAdapter } from './claude-code-sync.js';
import type { MemorySyncEntry, MemorySyncConfig } from './types.js';
import { DEFAULT_SYNC_CONFIG } from './types.js';

// ─── Test Factories ─────────────────────────────────────────────────

function createEntry(overrides: Partial<MemorySyncEntry> = {}): MemorySyncEntry {
  return {
    id: 'test-entry-1',
    type: 'feedback',
    title: 'Test Feedback Entry',
    description: 'Always run tests before committing.',
    oneLineHook: 'Run tests before committing',
    sourceId: 'mem-123',
    sourceTable: 'memory',
    syncedAt: Date.now(),
    contentHash: 'abc123',
    ...overrides,
  };
}

function createConfig(overrides: Partial<MemorySyncConfig> = {}): MemorySyncConfig {
  return { ...DEFAULT_SYNC_CONFIG, ...overrides };
}

// ─── Claude Code Memory Sync Adapter ────────────────────────────────

describe('ClaudeCodeMemorySyncAdapter', () => {
  let tmpDir: string;
  let memoryDir: string;
  let adapter: ClaudeCodeMemorySyncAdapter;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'soleri-sync-test-'));
    memoryDir = join(tmpDir, 'memory');
    mkdirSync(memoryDir, { recursive: true });
    adapter = new ClaudeCodeMemorySyncAdapter(memoryDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('host', () => {
    it('should identify as claude-code', () => {
      expect(adapter.host).toBe('claude-code');
    });
  });

  describe('detectSupport', () => {
    it('should return true when memory directory exists', () => {
      expect(adapter.detectSupport()).toBe(true);
    });

    it('should return false when memory directory does not exist', () => {
      const bad = new ClaudeCodeMemorySyncAdapter('/nonexistent/path/memory');
      expect(bad.detectSupport()).toBe(false);
    });
  });

  describe('sync', () => {
    it('should write a markdown file for each entry', () => {
      const entries = [createEntry()];
      const result = adapter.sync(entries, createConfig());

      expect(result.synced).toBe(1);
      expect(result.errors).toHaveLength(0);

      const files = existsSync(join(memoryDir, 'vault_test-entry-1.md'));
      expect(files).toBe(true);
    });

    it('should write markdown with correct frontmatter format', () => {
      const entries = [
        createEntry({ type: 'feedback', title: 'My Title', description: 'My content.' }),
      ];
      adapter.sync(entries, createConfig());

      const content = readFileSync(join(memoryDir, 'vault_test-entry-1.md'), 'utf-8');
      expect(content).toContain('---');
      expect(content).toContain('name: My Title');
      expect(content).toContain('type: feedback');
      expect(content).toContain('My content.');
    });

    it('should update MEMORY.md index with synced entries', () => {
      const entries = [createEntry()];
      adapter.sync(entries, createConfig());

      const index = readFileSync(join(memoryDir, 'MEMORY.md'), 'utf-8');
      expect(index).toContain('## Synced from Vault');
      expect(index).toContain('vault_test-entry-1.md');
      expect(index).toContain('Run tests before committing');
    });

    it('should preserve existing MEMORY.md content above the sync section', () => {
      writeFileSync(
        join(memoryDir, 'MEMORY.md'),
        '# Project Memory\n\n## Feedback\n- [manual.md](manual.md) — User wrote this manually\n',
      );

      adapter.sync([createEntry()], createConfig());

      const index = readFileSync(join(memoryDir, 'MEMORY.md'), 'utf-8');
      expect(index).toContain('## Feedback');
      expect(index).toContain('manual.md');
      expect(index).toContain('## Synced from Vault');
    });

    it('should be idempotent — double sync produces same result', () => {
      const entries = [createEntry()];
      const config = createConfig();

      const first = adapter.sync(entries, config);
      const second = adapter.sync(entries, config);

      expect(first.synced).toBe(1);
      expect(second.synced).toBe(0);
      expect(second.skipped).toBe(1);
    });

    it('should update entry when content hash changes', () => {
      const config = createConfig();
      adapter.sync([createEntry({ contentHash: 'hash-v1' })], config);
      const result = adapter.sync([createEntry({ contentHash: 'hash-v2' })], config);

      expect(result.synced).toBe(1);
      expect(result.entries[0].action).toBe('updated');
    });

    it('should remove stale entries not in new sync set', () => {
      const config = createConfig();
      adapter.sync([createEntry({ id: 'entry-a' }), createEntry({ id: 'entry-b' })], config);
      const result = adapter.sync([createEntry({ id: 'entry-a' })], config);

      expect(result.removed).toBe(1);
      expect(existsSync(join(memoryDir, 'vault_entry-b.md'))).toBe(false);
    });

    it('should write .sync-manifest.json', () => {
      adapter.sync([createEntry()], createConfig());

      const manifest = JSON.parse(readFileSync(join(memoryDir, '.sync-manifest.json'), 'utf-8'));
      expect(manifest.host).toBe('claude-code');
      expect(manifest.entries).toHaveLength(1);
      expect(manifest.entries[0].id).toBe('test-entry-1');
    });

    it('should respect maxIndexLines by truncating entries', () => {
      const entries = Array.from({ length: 200 }, (_, i) =>
        createEntry({ id: `entry-${i}`, oneLineHook: `Hook line ${i}`, contentHash: `hash-${i}` }),
      );
      const config = createConfig({ maxIndexLines: 20 });
      adapter.sync(entries, config);

      const index = readFileSync(join(memoryDir, 'MEMORY.md'), 'utf-8');
      const lines = index.split('\n');
      expect(lines.length).toBeLessThanOrEqual(20);
    });

    it('should handle entries with special characters in titles', () => {
      const entry = createEntry({
        id: 'special-chars',
        title: 'Fix: "quotes" & <angle> brackets',
        contentHash: 'special-hash',
      });
      const result = adapter.sync([entry], createConfig());

      expect(result.synced).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle empty entries array', () => {
      // First sync some entries, then sync empty to clear
      adapter.sync([createEntry()], createConfig());
      const result = adapter.sync([], createConfig());

      expect(result.removed).toBe(1);
      expect(result.synced).toBe(0);
    });
  });

  describe('readManifest', () => {
    it('should return null when no manifest exists', () => {
      expect(adapter.readManifest()).toBeNull();
    });

    it('should return manifest after sync', () => {
      adapter.sync([createEntry()], createConfig());
      const manifest = adapter.readManifest();

      expect(manifest).not.toBeNull();
      expect(manifest!.host).toBe('claude-code');
      expect(manifest!.entries).toHaveLength(1);
    });
  });

  describe('clear', () => {
    it('should remove all synced files and manifest', () => {
      adapter.sync([createEntry()], createConfig());
      const result = adapter.clear();

      expect(result.removed).toBeGreaterThan(0);
      expect(existsSync(join(memoryDir, 'vault_test-entry-1.md'))).toBe(false);
      expect(existsSync(join(memoryDir, '.sync-manifest.json'))).toBe(false);
    });

    it('should remove sync section from MEMORY.md but preserve the rest', () => {
      writeFileSync(
        join(memoryDir, 'MEMORY.md'),
        '# Memory\n\n## Manual\n- [foo.md](foo.md) — bar\n',
      );
      adapter.sync([createEntry()], createConfig());
      adapter.clear();

      const index = readFileSync(join(memoryDir, 'MEMORY.md'), 'utf-8');
      expect(index).toContain('## Manual');
      expect(index).not.toContain('## Synced from Vault');
    });

    it('should return zero removed when nothing was synced', () => {
      const result = adapter.clear();
      expect(result.removed).toBe(0);
    });
  });
});
