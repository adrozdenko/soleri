import { describe, it, expect } from 'vitest';
import { computeContentHash } from '../vault/content-hash.js';

describe('computeContentHash', () => {
  const base = {
    type: 'pattern',
    domain: 'testing',
    title: 'Test Pattern',
    description: 'A test pattern.',
    tags: ['a', 'b'],
  };

  it('returns 40-char hex string', () => {
    const hash = computeContentHash(base);
    expect(hash).toMatch(/^[0-9a-f]{40}$/);
  });

  it('is deterministic', () => {
    expect(computeContentHash(base)).toBe(computeContentHash(base));
  });

  it('normalizes tag order', () => {
    const a = computeContentHash({ ...base, tags: ['b', 'a'] });
    const b = computeContentHash({ ...base, tags: ['a', 'b'] });
    expect(a).toBe(b);
  });

  it('normalizes whitespace', () => {
    const a = computeContentHash(base);
    const b = computeContentHash({
      ...base,
      title: '  Test Pattern  ',
      description: '  A test pattern.  ',
    });
    expect(a).toBe(b);
  });

  it('normalizes domain case', () => {
    const a = computeContentHash(base);
    const b = computeContentHash({ ...base, domain: 'TESTING' });
    expect(a).toBe(b);
  });

  it('different content produces different hash', () => {
    const a = computeContentHash(base);
    const b = computeContentHash({ ...base, title: 'Different' });
    expect(a).not.toBe(b);
  });

  it('handles missing optional fields', () => {
    const hash = computeContentHash({ type: 'rule', domain: 'd', title: 't', description: 'd' });
    expect(hash).toMatch(/^[0-9a-f]{40}$/);
  });

  it('example and counterExample affect hash', () => {
    const a = computeContentHash({ ...base, example: 'do this' });
    const b = computeContentHash({ ...base, example: 'do that' });
    expect(a).not.toBe(b);
  });
});
