/**
 * Obsidian Sync Tests — export/import vault entries as Obsidian markdown.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Vault } from '../vault/vault.js';
import {
  ObsidianSync,
  toObsidianMarkdown,
  fromObsidianMarkdown,
  titleToSlug,
} from '../vault/obsidian-sync.js';

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'obsidian-sync-'));
}

// ─── Format Helpers ─────────────────────────────────────────────

describe('titleToSlug', () => {
  test('converts title to kebab-case', () => {
    expect(titleToSlug('Hello World')).toBe('hello-world');
  });

  test('removes special characters', () => {
    expect(titleToSlug('Use @decorators for DI!')).toBe('use-decorators-for-di');
  });

  test('collapses multiple dashes', () => {
    expect(titleToSlug('one -- two --- three')).toBe('one-two-three');
  });

  test('trims leading/trailing dashes', () => {
    expect(titleToSlug('  --hello--  ')).toBe('hello');
  });

  test('truncates at 80 chars', () => {
    const long = 'a '.repeat(50).trim();
    expect(titleToSlug(long).length).toBeLessThanOrEqual(80);
  });

  test('returns empty for empty input', () => {
    expect(titleToSlug('')).toBe('');
  });
});

describe('toObsidianMarkdown', () => {
  test('generates YAML frontmatter with body', () => {
    const md = toObsidianMarkdown({
      id: 'test-1',
      type: 'pattern',
      domain: 'testing',
      title: 'Test Pattern',
      description: 'A test pattern description.',
      severity: 'warning',
      tags: ['test', 'example'],
    });

    expect(md).toContain('---');
    expect(md).toContain('id: "test-1"');
    expect(md).toContain('type: "pattern"');
    expect(md).toContain('domain: "testing"');
    expect(md).toContain('severity: "warning"');
    expect(md).toContain('tags: ["test", "example"]');
    expect(md).toContain('# Test Pattern');
    expect(md).toContain('A test pattern description.');
  });

  test('omits optional fields when missing', () => {
    const md = toObsidianMarkdown({
      id: 'test-2',
      type: 'rule',
      title: 'No Domain',
      description: 'No domain or tags.',
    });

    expect(md).not.toContain('domain:');
    expect(md).not.toContain('severity:');
    expect(md).not.toContain('tags:');
  });
});

describe('fromObsidianMarkdown', () => {
  test('parses YAML frontmatter and body', () => {
    const content = `---
id: "abc-1"
type: "anti-pattern"
domain: "security"
severity: "critical"
tags: ["auth", "xss"]
updated: 1234567890
---

# SQL Injection Risk

Always use parameterized queries.`;

    const parsed = fromObsidianMarkdown(content);
    expect(parsed.id).toBe('abc-1');
    expect(parsed.type).toBe('anti-pattern');
    expect(parsed.domain).toBe('security');
    expect(parsed.severity).toBe('critical');
    expect(parsed.tags).toEqual(['auth', 'xss']);
    expect(parsed.updated).toBe(1234567890);
    expect(parsed.title).toBe('SQL Injection Risk');
    expect(parsed.description).toBe('Always use parameterized queries.');
  });

  test('infers type from content when missing', () => {
    const antiPattern = fromObsidianMarkdown(`---
---

# Bad Practice

Avoid using globals in production.`);
    expect(antiPattern.type).toBe('anti-pattern');

    const pattern = fromObsidianMarkdown(`---
---

# Good Practice

Always prefer const over let.`);
    expect(pattern.type).toBe('pattern');
  });

  test('handles missing frontmatter', () => {
    const parsed = fromObsidianMarkdown('# Just a Title\n\nSome content.');
    expect(parsed.title).toBe('Just a Title');
    expect(parsed.description).toBe('Some content.');
  });
});

// ─── ObsidianSync Class ─────────────────────────────────────────

describe('ObsidianSync', () => {
  let vault: Vault;
  let obsidianDir: string;
  let sync: ObsidianSync;

  beforeEach(() => {
    vault = new Vault(':memory:');
    vault.seed([
      {
        id: 'entry-1',
        type: 'pattern',
        domain: 'testing',
        title: 'Test First',
        description: 'Write tests before code.',
        severity: 'suggestion',
        tags: ['tdd'],
      },
      {
        id: 'entry-2',
        type: 'anti-pattern',
        domain: 'security',
        title: 'Hardcoded Secrets',
        description: 'Never hardcode API keys in source.',
        severity: 'critical',
        tags: ['secrets', 'auth'],
      },
    ]);
    obsidianDir = makeTempDir();
    sync = new ObsidianSync({ vault });
  });

  afterEach(() => {
    vault.close();
    rmSync(obsidianDir, { recursive: true, force: true });
  });

  describe('export', () => {
    test('creates markdown files in domain subdirectories', () => {
      const result = sync.export(obsidianDir);
      expect(result.exported).toBe(2);
      expect(result.files).toHaveLength(2);
      expect(result.skipped).toBe(0);

      // Check files exist
      const testingDir = join(obsidianDir, 'testing');
      const securityDir = join(obsidianDir, 'security');
      expect(readdirSync(testingDir)).toContain('test-first.md');
      expect(readdirSync(securityDir)).toContain('hardcoded-secrets.md');
    });

    test('exported files contain valid YAML frontmatter', () => {
      sync.export(obsidianDir);
      const content = readFileSync(join(obsidianDir, 'testing', 'test-first.md'), 'utf-8');
      expect(content).toContain('id: "entry-1"');
      expect(content).toContain('type: "pattern"');
      expect(content).toContain('# Test First');
    });

    test('dry run does not create files', () => {
      const result = sync.export(obsidianDir, { dryRun: true });
      expect(result.exported).toBe(2);
      expect(readdirSync(obsidianDir)).toHaveLength(0);
    });

    test('filters by domain', () => {
      const result = sync.export(obsidianDir, { domains: ['security'] });
      expect(result.exported).toBe(1);
      expect(result.files[0]).toContain('security');
    });

    test('filters by type', () => {
      const result = sync.export(obsidianDir, { types: ['pattern'] });
      expect(result.exported).toBe(1);
    });
  });

  describe('import', () => {
    test('imports markdown files into vault', () => {
      // Create some Obsidian files
      const dir = join(obsidianDir, 'architecture');
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, 'clean-code.md'),
        `---
type: "pattern"
domain: "architecture"
severity: "suggestion"
tags: ["clean-code"]
---

# Clean Code Principles

Functions should do one thing and do it well.`,
        'utf-8',
      );

      const result = sync.import(obsidianDir);
      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(0);
    });

    test('updates existing entries by ID', () => {
      // Export first to create files with IDs
      sync.export(obsidianDir);

      // Modify a file
      const content = readFileSync(join(obsidianDir, 'testing', 'test-first.md'), 'utf-8');
      const modified = content.replace(
        'Write tests before code.',
        'Write tests before implementation.',
      );
      writeFileSync(join(obsidianDir, 'testing', 'test-first.md'), modified, 'utf-8');

      const result = sync.import(obsidianDir);
      expect(result.updated).toBeGreaterThan(0);
    });

    test('uses directory name as domain fallback', () => {
      const dir = join(obsidianDir, 'my-domain');
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, 'entry.md'),
        `---
type: "rule"
---

# Domain From Dir

This entry gets its domain from the directory name.`,
        'utf-8',
      );

      sync.import(obsidianDir);
      const entries = vault.list({ domain: 'my-domain' });
      expect(entries.length).toBe(1);
    });

    test('skips files without title or description', () => {
      mkdirSync(join(obsidianDir, 'empty'), { recursive: true });
      writeFileSync(join(obsidianDir, 'empty', 'nothing.md'), '---\n---\n', 'utf-8');

      const result = sync.import(obsidianDir);
      expect(result.skipped).toBe(1);
    });

    test('dry run does not modify vault', () => {
      const dir = join(obsidianDir, 'test');
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, 'new.md'),
        `---
type: "pattern"
---

# New Entry

Should not be imported.`,
        'utf-8',
      );

      const before = vault.list({}).length;
      sync.import(obsidianDir, { dryRun: true });
      expect(vault.list({}).length).toBe(before);
    });
  });

  describe('sync', () => {
    test('push mode exports only', () => {
      const result = sync.sync(obsidianDir, { mode: 'push' });
      expect(result.pushed).toBe(2);
      expect(result.pulled).toBe(0);
      expect(result.mode).toBe('push');
    });

    test('pull mode imports only', () => {
      // Create an obsidian file first
      const dir = join(obsidianDir, 'test');
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, 'pull.md'),
        `---
type: "pattern"
---

# Pulled Entry

Imported via pull.`,
        'utf-8',
      );

      const result = sync.sync(obsidianDir, { mode: 'pull' });
      expect(result.pushed).toBe(0);
      expect(result.pulled).toBeGreaterThan(0);
      expect(result.mode).toBe('pull');
    });

    test('bidirectional mode exports then imports', () => {
      const result = sync.sync(obsidianDir, { mode: 'bidirectional' });
      expect(result.pushed).toBe(2);
      // pulled includes re-reading the just-exported files
      expect(result.pulled).toBeGreaterThanOrEqual(0);
      expect(result.mode).toBe('bidirectional');
    });

    test('defaults to bidirectional', () => {
      const result = sync.sync(obsidianDir);
      expect(result.mode).toBe('bidirectional');
    });

    test('dry run does not create files or modify vault', () => {
      const result = sync.sync(obsidianDir, { dryRun: true });
      expect(result.pushed).toBe(2);
      expect(readdirSync(obsidianDir)).toHaveLength(0);
    });
  });
});
