import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OpenCodeMemorySyncAdapter } from './opencode-sync.js';
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

// ─── OpenCode Memory Sync Adapter ───────────────────────────────────

describe('OpenCodeMemorySyncAdapter', () => {
  let tmpDir: string;
  let projectDir: string;
  let adapter: OpenCodeMemorySyncAdapter;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'soleri-opencode-sync-test-'));
    projectDir = tmpDir;
    mkdirSync(join(projectDir, '.opencode', 'memory'), { recursive: true });
    adapter = new OpenCodeMemorySyncAdapter(projectDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('host', () => {
    it('should identify as opencode', () => {
      expect(adapter.host).toBe('opencode');
    });
  });

  describe('detectSupport', () => {
    it('should return true when .opencode directory exists', () => {
      expect(adapter.detectSupport()).toBe(true);
    });

    it('should return false when .opencode does not exist', () => {
      const bad = new OpenCodeMemorySyncAdapter('/nonexistent/path');
      expect(bad.detectSupport()).toBe(false);
    });
  });

  describe('sync', () => {
    it('should write a consolidated markdown file', () => {
      adapter.sync([createEntry()], createConfig());

      const filePath = join(projectDir, '.opencode', 'memory', 'soleri-context.md');
      expect(existsSync(filePath)).toBe(true);
    });

    it('should include YAML frontmatter', () => {
      adapter.sync([createEntry()], createConfig());

      const content = readFileSync(
        join(projectDir, '.opencode', 'memory', 'soleri-context.md'),
        'utf-8',
      );
      expect(content).toContain('---');
      expect(content).toContain('synced_by: soleri');
    });

    it('should group entries by type in sections', () => {
      const entries = [
        createEntry({ id: 'e1', type: 'user', title: 'User info', contentHash: 'h1' }),
        createEntry({ id: 'e2', type: 'feedback', title: 'Feedback info', contentHash: 'h2' }),
        createEntry({ id: 'e3', type: 'project', title: 'Project info', contentHash: 'h3' }),
      ];
      adapter.sync(entries, createConfig());

      const content = readFileSync(
        join(projectDir, '.opencode', 'memory', 'soleri-context.md'),
        'utf-8',
      );
      expect(content).toContain('## User');
      expect(content).toContain('## Feedback');
      expect(content).toContain('## Project');
    });

    it('should be idempotent', () => {
      const entries = [createEntry()];
      const config = createConfig();

      const first = adapter.sync(entries, config);
      const second = adapter.sync(entries, config);

      expect(first.synced).toBe(1);
      expect(second.skipped).toBe(1);
    });

    it('should write manifest for tracking', () => {
      adapter.sync([createEntry()], createConfig());

      const manifest = adapter.readManifest();
      expect(manifest).not.toBeNull();
      expect(manifest!.host).toBe('opencode');
    });
  });

  describe('clear', () => {
    it('should remove context file and manifest', () => {
      adapter.sync([createEntry()], createConfig());
      const result = adapter.clear();

      expect(result.removed).toBeGreaterThan(0);
      expect(existsSync(join(projectDir, '.opencode', 'memory', 'soleri-context.md'))).toBe(false);
    });
  });
});
