import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  toObsidianMarkdown,
  fromObsidianMarkdown,
  titleToSlug,
  ObsidianSync,
} from './obsidian-sync.js';
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

// ─── Format Helpers ──────────────────────────────────────────────────

describe('toObsidianMarkdown', () => {
  it('produces valid frontmatter with id, type, domain', () => {
    const md = toObsidianMarkdown(makeEntry({ id: 'e1', type: 'pattern', domain: 'arch' }));
    expect(md).toContain('---');
    expect(md).toContain('id: "e1"');
    expect(md).toContain('type: "pattern"');
    expect(md).toContain('domain: "arch"');
  });

  it('includes tags array in frontmatter', () => {
    const md = toObsidianMarkdown(makeEntry({ tags: ['a', 'b'] }));
    expect(md).toContain('tags: ["a", "b"]');
  });

  it('includes severity when present', () => {
    const md = toObsidianMarkdown(makeEntry({ severity: 'critical' }));
    expect(md).toContain('severity: "critical"');
  });

  it('includes title as H1 heading', () => {
    const md = toObsidianMarkdown(makeEntry({ title: 'My Pattern' }));
    expect(md).toContain('# My Pattern');
  });

  it('includes description as body', () => {
    const md = toObsidianMarkdown(makeEntry({ description: 'Body text here.' }));
    expect(md).toContain('Body text here.');
  });

  it('omits tags line when tags are empty', () => {
    const md = toObsidianMarkdown(makeEntry({ tags: [] }));
    expect(md).not.toContain('tags:');
  });

  it('includes updated timestamp', () => {
    const md = toObsidianMarkdown(makeEntry());
    expect(md).toMatch(/updated: \d+/);
  });
});

describe('fromObsidianMarkdown', () => {
  it('parses frontmatter and body', () => {
    const md = [
      '---',
      'id: "e1"',
      'type: "pattern"',
      'domain: "arch"',
      'severity: "warning"',
      'tags: ["a", "b"]',
      'updated: 123456',
      '---',
      '',
      '# My Title',
      '',
      'Some description text.',
    ].join('\n');

    const parsed = fromObsidianMarkdown(md);
    expect(parsed.id).toBe('e1');
    expect(parsed.type).toBe('pattern');
    expect(parsed.domain).toBe('arch');
    expect(parsed.severity).toBe('warning');
    expect(parsed.tags).toEqual(['a', 'b']);
    expect(parsed.title).toBe('My Title');
    expect(parsed.description).toBe('Some description text.');
    expect(parsed.updated).toBe(123456);
  });

  it('handles missing frontmatter gracefully', () => {
    const parsed = fromObsidianMarkdown('# Just a Title\n\nSome text.');
    expect(parsed.title).toBe('Just a Title');
    expect(parsed.description).toBe('Some text.');
  });

  it('infers anti-pattern type from content', () => {
    const md = '# Test\n\nAvoid using inline styles — anti-pattern detected.';
    const parsed = fromObsidianMarkdown(md);
    expect(parsed.type).toBe('anti-pattern');
  });

  it('infers pattern type from content', () => {
    const md = '# Test\n\nAlways use semantic tokens in your components.';
    const parsed = fromObsidianMarkdown(md);
    expect(parsed.type).toBe('pattern');
  });

  it('infers rule type from content starting with Rule:', () => {
    // "Rule:" must not also match anti-pattern keywords like "never"
    const md = '# Test\n\nRule: keep components under 400 lines.';
    const parsed = fromObsidianMarkdown(md);
    expect(parsed.type).toBe('rule');
  });

  it('defaults to concept for ambiguous content', () => {
    const md = '# Test\n\nThis is a general explanation of something.';
    const parsed = fromObsidianMarkdown(md);
    expect(parsed.type).toBe('concept');
  });

  it('preserves explicit type from frontmatter over inference', () => {
    const md = '---\ntype: "rule"\n---\n# Test\n\nAvoid using inline styles.';
    const parsed = fromObsidianMarkdown(md);
    expect(parsed.type).toBe('rule');
  });
});

describe('titleToSlug', () => {
  it('converts to lowercase kebab-case', () => {
    expect(titleToSlug('Hello World')).toBe('hello-world');
  });

  it('removes special characters', () => {
    expect(titleToSlug('Use Semantic Tokens!')).toBe('use-semantic-tokens');
  });

  it('collapses multiple dashes', () => {
    expect(titleToSlug('A -- B')).toBe('a-b');
  });

  it('trims leading and trailing dashes', () => {
    expect(titleToSlug(' -Hello- ')).toBe('hello');
  });

  it('truncates to 80 characters', () => {
    const long = 'A'.repeat(100);
    expect(titleToSlug(long).length).toBeLessThanOrEqual(80);
  });

  it('returns empty string for empty input', () => {
    expect(titleToSlug('')).toBe('');
  });

  it('handles whitespace-only input', () => {
    expect(titleToSlug('   ')).toBe('');
  });
});

// ─── Sync Engine ─────────────────────────────────────────────────────

describe('ObsidianSync', () => {
  let tmpDir: string;
  let obsidianDir: string;

  function makeMockVault(entryList: IntelligenceEntry[] = []) {
    return {
      list: vi.fn().mockReturnValue(entryList),
      get: vi.fn().mockImplementation((id: string) => entryList.find((e) => e.id === id) ?? null),
      seed: vi.fn().mockReturnValue(1),
      update: vi.fn().mockReturnValue(null),
    } as unknown;
  }

  beforeEach(() => {
    tmpDir = join(tmpdir(), `obsidian-sync-${randomUUID().slice(0, 8)}`);
    obsidianDir = join(tmpDir, 'obsidian');
    mkdirSync(obsidianDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── export ──────────────────────────────────────────────────────────

  it('exports entries as markdown files', () => {
    const entries = [makeEntry({ id: 'e1', title: 'First', domain: 'arch' })];
    const sync = new ObsidianSync({ vault: makeMockVault(entries) });
    const result = sync.export(obsidianDir);
    expect(result.exported).toBe(1);
    expect(result.files).toHaveLength(1);
    expect(existsSync(join(obsidianDir, 'arch', 'first.md'))).toBe(true);
  });

  it('filters by types when specified', () => {
    const entries = [
      makeEntry({ id: 'e1', type: 'pattern' }),
      makeEntry({ id: 'e2', type: 'anti-pattern' }),
    ];
    const sync = new ObsidianSync({ vault: makeMockVault(entries) });
    const result = sync.export(obsidianDir, { types: ['pattern'] });
    expect(result.exported).toBe(1);
  });

  it('filters by domains when specified', () => {
    const entries = [
      makeEntry({ id: 'e1', domain: 'arch' }),
      makeEntry({ id: 'e2', domain: 'security' }),
    ];
    const sync = new ObsidianSync({ vault: makeMockVault(entries) });
    const result = sync.export(obsidianDir, { domains: ['security'] });
    expect(result.exported).toBe(1);
  });

  it('skips entries with empty slugs', () => {
    const entries = [makeEntry({ id: 'e1', title: '' })];
    const sync = new ObsidianSync({ vault: makeMockVault(entries) });
    const result = sync.export(obsidianDir);
    expect(result.exported).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('does not write files in dry run mode', () => {
    const entries = [makeEntry({ id: 'e1', title: 'DryRun', domain: 'test' })];
    const sync = new ObsidianSync({ vault: makeMockVault(entries) });
    const result = sync.export(obsidianDir, { dryRun: true });
    expect(result.exported).toBe(1);
    expect(existsSync(join(obsidianDir, 'test', 'dryrun.md'))).toBe(false);
  });

  // ── import ──────────────────────────────────────────────────────────

  it('imports markdown files into vault', () => {
    const md = [
      '---',
      'id: "new-entry"',
      'type: "pattern"',
      'domain: "test"',
      '---',
      '',
      '# Imported Pattern',
      '',
      'Description of imported pattern.',
    ].join('\n');
    mkdirSync(join(obsidianDir, 'test'), { recursive: true });
    writeFileSync(join(obsidianDir, 'test', 'imported.md'), md, 'utf-8');

    const mockVault = makeMockVault([]);
    const sync = new ObsidianSync({ vault: mockVault });
    const result = sync.import(obsidianDir);
    expect(result.imported).toBe(1);
    expect(mockVault.seed).toHaveBeenCalled();
  });

  it('updates existing entries on import', () => {
    const existing = makeEntry({ id: 'existing', domain: 'test' });
    const md = [
      '---',
      'id: "existing"',
      'type: "pattern"',
      '---',
      '',
      '# Updated Title',
      '',
      'Updated description.',
    ].join('\n');
    mkdirSync(join(obsidianDir, 'test'), { recursive: true });
    writeFileSync(join(obsidianDir, 'test', 'updated.md'), md, 'utf-8');

    const mockVault = makeMockVault([existing]);
    const sync = new ObsidianSync({ vault: mockVault });
    const result = sync.import(obsidianDir);
    expect(result.updated).toBe(1);
    expect(mockVault.update).toHaveBeenCalledWith('existing', expect.objectContaining({
      title: 'Updated Title',
    }));
  });

  it('skips files without title or description', () => {
    writeFileSync(join(obsidianDir, 'empty.md'), '---\nid: "x"\n---\n', 'utf-8');
    const sync = new ObsidianSync({ vault: makeMockVault([]) });
    const result = sync.import(obsidianDir);
    expect(result.skipped).toBe(1);
    expect(result.imported).toBe(0);
  });

  it('uses directory name as domain fallback', () => {
    const md = '# Title\n\nDescription text.';
    mkdirSync(join(obsidianDir, 'custom-domain'), { recursive: true });
    writeFileSync(join(obsidianDir, 'custom-domain', 'entry.md'), md, 'utf-8');

    const mockVault = makeMockVault([]);
    const sync = new ObsidianSync({ vault: mockVault });
    sync.import(obsidianDir);
    const seedCall = mockVault.seed.mock.calls[0][0][0];
    expect(seedCall.domain).toBe('custom-domain');
  });

  // ── sync ────────────────────────────────────────────────────────────

  it('push mode only exports', () => {
    const entries = [makeEntry({ id: 'e1', title: 'Push', domain: 'test' })];
    const sync = new ObsidianSync({ vault: makeMockVault(entries) });
    const result = sync.sync(obsidianDir, { mode: 'push' });
    expect(result.pushed).toBe(1);
    expect(result.pulled).toBe(0);
    expect(result.mode).toBe('push');
  });

  it('pull mode only imports', () => {
    const md = '# Pull Entry\n\nSome text.';
    mkdirSync(join(obsidianDir, 'test'), { recursive: true });
    writeFileSync(join(obsidianDir, 'test', 'pull.md'), md, 'utf-8');

    const sync = new ObsidianSync({ vault: makeMockVault([]) });
    const result = sync.sync(obsidianDir, { mode: 'pull' });
    expect(result.pulled).toBe(1);
    expect(result.pushed).toBe(0);
    expect(result.mode).toBe('pull');
  });

  it('bidirectional mode exports and imports', () => {
    const entries = [makeEntry({ id: 'e1', title: 'Bidir', domain: 'test' })];
    const sync = new ObsidianSync({ vault: makeMockVault(entries) });
    const result = sync.sync(obsidianDir, { mode: 'bidirectional' });
    expect(result.mode).toBe('bidirectional');
    expect(result.pushed).toBe(1);
  });

  it('defaults to bidirectional mode', () => {
    const sync = new ObsidianSync({ vault: makeMockVault([]) });
    const result = sync.sync(obsidianDir);
    expect(result.mode).toBe('bidirectional');
  });
});
