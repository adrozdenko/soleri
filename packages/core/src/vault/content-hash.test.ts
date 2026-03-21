import { describe, it, expect } from 'vitest';
import { computeContentHash, type HashableEntry } from './content-hash.js';

function makeEntry(overrides: Partial<HashableEntry> = {}): HashableEntry {
  return {
    type: 'pattern',
    domain: 'architecture',
    title: 'Test Pattern',
    description: 'A test pattern description.',
    tags: ['testing'],
    ...overrides,
  };
}

describe('computeContentHash', () => {
  it('returns a 40-char hex string', () => {
    const hash = computeContentHash(makeEntry());
    expect(hash).toMatch(/^[0-9a-f]{40}$/);
  });

  it('is deterministic for identical inputs', () => {
    const entry = makeEntry();
    expect(computeContentHash(entry)).toBe(computeContentHash(entry));
  });

  it('produces different hashes for different titles', () => {
    const a = computeContentHash(makeEntry({ title: 'Alpha' }));
    const b = computeContentHash(makeEntry({ title: 'Beta' }));
    expect(a).not.toBe(b);
  });

  it('normalizes domain to lowercase', () => {
    const a = computeContentHash(makeEntry({ domain: 'Architecture' }));
    const b = computeContentHash(makeEntry({ domain: 'architecture' }));
    expect(a).toBe(b);
  });

  it('trims whitespace from fields', () => {
    const a = computeContentHash(makeEntry({ title: '  Test Pattern  ' }));
    const b = computeContentHash(makeEntry({ title: 'Test Pattern' }));
    expect(a).toBe(b);
  });

  it('sorts tags for deterministic output', () => {
    const a = computeContentHash(makeEntry({ tags: ['b', 'a', 'c'] }));
    const b = computeContentHash(makeEntry({ tags: ['a', 'b', 'c'] }));
    expect(a).toBe(b);
  });

  it('handles missing optional fields', () => {
    const entry: HashableEntry = {
      type: 'rule',
      domain: 'testing',
      title: 'Minimal',
      description: 'Desc',
    };
    const hash = computeContentHash(entry);
    expect(hash).toMatch(/^[0-9a-f]{40}$/);
  });

  it('treats undefined tags as empty array', () => {
    const a = computeContentHash(makeEntry({ tags: undefined }));
    const b = computeContentHash(makeEntry({ tags: [] }));
    expect(a).toBe(b);
  });

  it('treats undefined example/counterExample as empty string', () => {
    const a = computeContentHash(makeEntry({ example: undefined, counterExample: undefined }));
    const b = computeContentHash(makeEntry({ example: '', counterExample: '' }));
    expect(a).toBe(b);
  });

  it('produces different hashes for different types', () => {
    const a = computeContentHash(makeEntry({ type: 'pattern' }));
    const b = computeContentHash(makeEntry({ type: 'anti-pattern' }));
    expect(a).not.toBe(b);
  });
});
