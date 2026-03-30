import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  entryToMarkdown,
  syncEntryToMarkdown,
  syncAllToMarkdown,
  generateIndex,
  titleToSlug,
} from './vault-markdown-sync.js';
import { Vault } from './vault.js';
import type { IntelligenceEntry } from '../intelligence/types.js';

function makeEntry(overrides: Partial<IntelligenceEntry> = {}): IntelligenceEntry {
  return {
    id: `test-${randomUUID().slice(0, 8)}`,
    type: 'pattern',
    domain: 'architecture',
    title: 'Test Pattern',
    severity: 'suggestion',
    description: 'A test pattern description.',
    tags: ['testing', 'unit'],
    ...overrides,
  };
}

describe('vault-markdown-sync', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `vault-md-sync-${randomUUID().slice(0, 8)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── titleToSlug ──────────────────────────────────────────────────

  describe('titleToSlug', () => {
    it('should slugify titles', () => {
      expect(titleToSlug('Hello World')).toBe('hello-world');
      expect(titleToSlug('Use Semantic Tokens!')).toBe('use-semantic-tokens');
      expect(titleToSlug('  spaces  and -- dashes  ')).toBe('spaces-and-dashes');
    });

    it('should truncate long titles', () => {
      const long = 'a'.repeat(200);
      expect(titleToSlug(long).length).toBeLessThanOrEqual(80);
    });
  });

  // ── entryToMarkdown ──────────────────────────────────────────────

  describe('entryToMarkdown', () => {
    it('should produce valid frontmatter', () => {
      const entry = makeEntry({ title: 'My Pattern', domain: 'design' });
      const md = entryToMarkdown(entry);

      expect(md).toMatch(/^---\n/);
      expect(md).toMatch(/\n---\n/);
      expect(md).toContain(`id: "${entry.id}"`);
      expect(md).toContain('type: "pattern"');
      expect(md).toContain('domain: "design"');
      expect(md).toContain('tags: ["testing", "unit"]');
      expect(md).toContain('content_hash:');
      expect(md).toContain('# My Pattern');
      expect(md).toContain('A test pattern description.');
    });

    it('should include optional sections', () => {
      const entry = makeEntry({
        context: 'Some context.',
        example: 'An example.',
        counterExample: 'A counter-example.',
        why: 'Because reasons.',
      });
      const md = entryToMarkdown(entry);

      expect(md).toContain('## Context');
      expect(md).toContain('Some context.');
      expect(md).toContain('## Example');
      expect(md).toContain('An example.');
      expect(md).toContain('## Counter-Example');
      expect(md).toContain('A counter-example.');
      expect(md).toContain('## Why');
      expect(md).toContain('Because reasons.');
    });

    it('should include tier and origin when present', () => {
      const entry = makeEntry({ tier: 'project', origin: 'user' });
      const md = entryToMarkdown(entry);
      expect(md).toContain('tier: "project"');
      expect(md).toContain('origin: "user"');
    });
  });

  // ── syncEntryToMarkdown ──────────────────────────────────────────

  describe('syncEntryToMarkdown', () => {
    it('should create file in correct directory', async () => {
      const entry = makeEntry({ domain: 'design', title: 'Color Tokens' });
      await syncEntryToMarkdown(entry, tmpDir);

      const filePath = join(tmpDir, 'vault', 'design', 'color-tokens.md');
      expect(existsSync(filePath)).toBe(true);

      const content = readFileSync(filePath, 'utf-8');
      expect(content).toContain('# Color Tokens');
    });

    it('should handle entries without domain', async () => {
      const entry = makeEntry({ domain: '', title: 'No Domain Entry' });
      await syncEntryToMarkdown(entry, tmpDir);

      const filePath = join(tmpDir, 'vault', '_general', 'no-domain-entry.md');
      expect(existsSync(filePath)).toBe(true);
    });

    it('should create missing knowledge dir automatically', async () => {
      const deepDir = join(tmpDir, 'nested', 'deep');
      const entry = makeEntry({ title: 'Deep Entry' });
      await syncEntryToMarkdown(entry, deepDir);

      const filePath = join(deepDir, 'vault', 'architecture', 'deep-entry.md');
      expect(existsSync(filePath)).toBe(true);
    });

    it('should skip rewrite when content hash matches (dedup)', async () => {
      const entry = makeEntry({ domain: 'design', title: 'Stable Token' });

      // First write
      const first = await syncEntryToMarkdown(entry, tmpDir);
      expect(first.written).toBe(true);

      const filePath = join(tmpDir, 'vault', 'design', 'stable-token.md');
      const mtimeBefore = readFileSync(filePath, 'utf-8');

      // Second write with same content — should skip
      const second = await syncEntryToMarkdown(entry, tmpDir);
      expect(second.written).toBe(false);

      // File content should be identical (not rewritten)
      const mtimeAfter = readFileSync(filePath, 'utf-8');
      expect(mtimeAfter).toBe(mtimeBefore);
    });

    it('should rewrite when content changes', async () => {
      const entry = makeEntry({ domain: 'design', title: 'Changing Token' });
      const first = await syncEntryToMarkdown(entry, tmpDir);
      expect(first.written).toBe(true);

      // Modify the entry
      entry.description = 'Updated description that changes the hash.';
      const second = await syncEntryToMarkdown(entry, tmpDir);
      expect(second.written).toBe(true);

      const filePath = join(tmpDir, 'vault', 'design', 'changing-token.md');
      const content = readFileSync(filePath, 'utf-8');
      expect(content).toContain('Updated description');
    });

    it('should return written:false for empty slug', async () => {
      const entry = makeEntry({ title: '!!!' }); // slugifies to empty
      const result = await syncEntryToMarkdown(entry, tmpDir);
      expect(result.written).toBe(false);
    });
  });

  // ── syncAllToMarkdown ────────────────────────────────────────────

  describe('syncAllToMarkdown', () => {
    let vault: Vault;

    beforeEach(() => {
      vault = new Vault(':memory:');
    });

    afterEach(() => {
      vault.close();
    });

    it('should sync all entries', async () => {
      vault.seed([
        makeEntry({ title: 'Entry One', domain: 'design' }),
        makeEntry({ title: 'Entry Two', domain: 'code' }),
      ]);

      const result = await syncAllToMarkdown(vault, tmpDir);
      expect(result.synced).toBe(2);
      expect(result.skipped).toBe(0);

      expect(existsSync(join(tmpDir, 'vault', 'design', 'entry-one.md'))).toBe(true);
      expect(existsSync(join(tmpDir, 'vault', 'code', 'entry-two.md'))).toBe(true);
    });

    it('should skip entries with existing up-to-date .md files', async () => {
      const entry = makeEntry({ title: 'Stable Entry', domain: 'arch' });
      vault.seed([entry]);

      // First sync
      const first = await syncAllToMarkdown(vault, tmpDir);
      expect(first.synced).toBe(1);

      // Second sync — should skip
      const second = await syncAllToMarkdown(vault, tmpDir);
      expect(second.skipped).toBe(1);
      expect(second.synced).toBe(0);
    });
  });

  // ── generateIndex ────────────────────────────────────────────────

  describe('generateIndex', () => {
    it('should count entries per domain', async () => {
      // Set up vault directory structure
      const vaultDir = join(tmpDir, 'vault');
      mkdirSync(join(vaultDir, 'design'), { recursive: true });
      mkdirSync(join(vaultDir, 'code'), { recursive: true });

      writeFileSync(join(vaultDir, 'design', 'a.md'), '# A', 'utf-8');
      writeFileSync(join(vaultDir, 'design', 'b.md'), '# B', 'utf-8');
      writeFileSync(join(vaultDir, 'code', 'c.md'), '# C', 'utf-8');

      await generateIndex(tmpDir);

      const index = readFileSync(join(vaultDir, '_index.md'), 'utf-8');
      expect(index).toContain('3 entries across 2 domains');
      expect(index).toContain('design');
      expect(index).toContain('code');
    });

    it('should handle missing knowledge dir gracefully', async () => {
      const nonExistent = join(tmpDir, 'does-not-exist');
      await generateIndex(nonExistent);
      // Should not throw
      expect(existsSync(join(nonExistent, 'vault', '_index.md'))).toBe(false);
    });
  });
});
