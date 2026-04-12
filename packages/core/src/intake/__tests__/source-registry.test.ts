import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SourceRegistry } from '../source-registry.js';
import { SQLitePersistenceProvider } from '../../persistence/sqlite-provider.js';
import type { PersistenceProvider } from '../../persistence/types.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function createProvider(): SQLitePersistenceProvider {
  return new SQLitePersistenceProvider(':memory:');
}

// ── Suite ────────────────────────────────────────────────────────────────

describe('SourceRegistry', () => {
  let provider: PersistenceProvider;
  let registry: SourceRegistry;

  beforeEach(() => {
    provider = createProvider();
    registry = new SourceRegistry(provider);
  });

  afterEach(() => {
    provider.close();
  });

  // ── createSource ───────────────────────────────────────────────────

  it('creates a source with all fields', () => {
    const id = registry.createSource({
      title: 'Full Source',
      url: 'https://example.com/article',
      sourceType: 'url',
      author: 'Jane Doe',
      domain: 'engineering',
      contentHash: 'abc123',
    });

    expect(id).toMatch(/^src-/);

    const source = registry.getSource(id);
    expect(source).not.toBeNull();
    expect(source!.title).toBe('Full Source');
    expect(source!.url).toBe('https://example.com/article');
    expect(source!.sourceType).toBe('url');
    expect(source!.author).toBe('Jane Doe');
    expect(source!.domain).toBe('engineering');
    expect(source!.contentHash).toBe('abc123');
    expect(source!.entryCount).toBe(0);
    expect(source!.ingestedAt).toBeGreaterThan(0);
  });

  it('creates a source with minimal fields (only required)', () => {
    const id = registry.createSource({
      title: 'Minimal Source',
      sourceType: 'text',
    });

    const source = registry.getSource(id);
    expect(source).not.toBeNull();
    expect(source!.title).toBe('Minimal Source');
    expect(source!.sourceType).toBe('text');
    expect(source!.url).toBeNull();
    expect(source!.author).toBeNull();
    expect(source!.domain).toBe('general');
    expect(source!.contentHash).toBeNull();
    expect(source!.entryCount).toBe(0);
  });

  // ── linkEntry / linkEntries ────────────────────────────────────────

  it('links entries to a source and updates entry_count', () => {
    const id = registry.createSource({ title: 'Link Test', sourceType: 'url' });

    registry.linkEntry(id, 'entry-1');
    expect(registry.getSource(id)!.entryCount).toBe(1);

    registry.linkEntry(id, 'entry-2');
    expect(registry.getSource(id)!.entryCount).toBe(2);

    // Linking the same entry again should not increase the count (INSERT OR IGNORE)
    registry.linkEntry(id, 'entry-1');
    expect(registry.getSource(id)!.entryCount).toBe(2);
  });

  it('linkEntries batch links multiple entries', () => {
    const id = registry.createSource({ title: 'Batch Link', sourceType: 'pdf' });

    registry.linkEntries(id, ['e-a', 'e-b', 'e-c']);
    expect(registry.getSource(id)!.entryCount).toBe(3);

    const entries = registry.getSourceEntries(id);
    expect(entries).toHaveLength(3);
    expect(entries).toContain('e-a');
    expect(entries).toContain('e-b');
    expect(entries).toContain('e-c');
  });

  // ── getSource ──────────────────────────────────────────────────────

  it('getSource returns null for non-existent ID', () => {
    expect(registry.getSource('src-nonexistent')).toBeNull();
  });

  // ── listSources ────────────────────────────────────────────────────

  it('listSources returns sources ordered by ingested_at DESC', () => {
    // Insert three sources with staggered timestamps via direct SQL
    const id1 = registry.createSource({ title: 'First', sourceType: 'text' });
    const id2 = registry.createSource({ title: 'Second', sourceType: 'text' });
    const id3 = registry.createSource({ title: 'Third', sourceType: 'text' });

    // Override ingested_at so ordering is deterministic
    provider.run('UPDATE intake_sources SET ingested_at = 100 WHERE id = @id', { id: id1 });
    provider.run('UPDATE intake_sources SET ingested_at = 300 WHERE id = @id', { id: id2 });
    provider.run('UPDATE intake_sources SET ingested_at = 200 WHERE id = @id', { id: id3 });

    const sources = registry.listSources();
    expect(sources).toHaveLength(3);
    expect(sources[0].title).toBe('Second'); // 300
    expect(sources[1].title).toBe('Third'); // 200
    expect(sources[2].title).toBe('First'); // 100
  });

  it('listSources filters by domain', () => {
    registry.createSource({ title: 'Eng A', sourceType: 'text', domain: 'engineering' });
    registry.createSource({ title: 'Eng B', sourceType: 'text', domain: 'engineering' });
    registry.createSource({ title: 'Design A', sourceType: 'text', domain: 'design' });

    const engSources = registry.listSources({ domain: 'engineering' });
    expect(engSources).toHaveLength(2);
    expect(engSources.every((s) => s.domain === 'engineering')).toBe(true);

    const designSources = registry.listSources({ domain: 'design' });
    expect(designSources).toHaveLength(1);
    expect(designSources[0].title).toBe('Design A');
  });

  // ── getSourceEntries ───────────────────────────────────────────────

  it('getSourceEntries returns entry IDs for a source', () => {
    const id = registry.createSource({ title: 'Entries Test', sourceType: 'url' });
    registry.linkEntries(id, ['x-1', 'x-2']);

    const entries = registry.getSourceEntries(id);
    expect(entries).toHaveLength(2);
    expect(entries).toContain('x-1');
    expect(entries).toContain('x-2');
  });

  it('getSourceEntries returns empty array for unknown source', () => {
    const entries = registry.getSourceEntries('src-unknown');
    expect(entries).toEqual([]);
  });

  // ── findByUrl ──────────────────────────────────────────────────────

  it('findByUrl returns matching source', () => {
    const url = 'https://example.com/unique-article';
    registry.createSource({ title: 'URL Test', sourceType: 'url', url });

    const found = registry.findByUrl(url);
    expect(found).not.toBeNull();
    expect(found!.title).toBe('URL Test');
    expect(found!.url).toBe(url);
  });

  it('findByUrl returns null for unknown URL', () => {
    expect(registry.findByUrl('https://nowhere.example.com')).toBeNull();
  });

  // ── Idempotency ────────────────────────────────────────────────────

  it('table creation is idempotent (create two instances)', () => {
    // The first instance already created the tables in beforeEach.
    // Creating a second registry on the same provider should not throw.
    const registry2 = new SourceRegistry(provider);

    const id = registry2.createSource({ title: 'Idempotent', sourceType: 'text' });
    expect(registry2.getSource(id)).not.toBeNull();
  });
});
