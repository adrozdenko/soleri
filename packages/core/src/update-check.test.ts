import { describe, it, expect } from 'vitest';
import { buildChangelogUrl, detectBreakingChanges } from './update-check.js';

describe('buildChangelogUrl', () => {
  it('generates correct URL for a standard version', () => {
    expect(buildChangelogUrl('1.2.3')).toBe(
      'https://github.com/adrozdenko/soleri/releases/tag/v1.2.3',
    );
  });

  it('generates correct URL for a major version', () => {
    expect(buildChangelogUrl('2.0.0')).toBe(
      'https://github.com/adrozdenko/soleri/releases/tag/v2.0.0',
    );
  });

  it('generates correct URL for a patch-only bump', () => {
    expect(buildChangelogUrl('0.1.15')).toBe(
      'https://github.com/adrozdenko/soleri/releases/tag/v0.1.15',
    );
  });

  it('handles single-digit versions', () => {
    expect(buildChangelogUrl('0.0.1')).toBe(
      'https://github.com/adrozdenko/soleri/releases/tag/v0.0.1',
    );
  });
});

describe('detectBreakingChanges', () => {
  it('returns no warnings when versions share the same major and minor delta < 2', () => {
    const result = detectBreakingChanges('1.2.0', '1.3.0');
    expect(result.hasBreakingChanges).toBe(false);
    expect(result.hasMultipleReleases).toBe(false);
  });

  it('detects breaking changes when major version differs (upgrade)', () => {
    const result = detectBreakingChanges('1.5.0', '2.0.0');
    expect(result.hasBreakingChanges).toBe(true);
    expect(result.hasMultipleReleases).toBe(false);
  });

  it('detects breaking changes when major version differs (large jump)', () => {
    const result = detectBreakingChanges('1.0.0', '3.0.0');
    expect(result.hasBreakingChanges).toBe(true);
    expect(result.hasMultipleReleases).toBe(false);
  });

  it('does not flag hasMultipleReleases when major differs', () => {
    // Even though minor jumped by 2+, breaking change takes priority
    const result = detectBreakingChanges('1.0.0', '2.5.0');
    expect(result.hasBreakingChanges).toBe(true);
    expect(result.hasMultipleReleases).toBe(false);
  });

  it('detects multiple releases when minor jumps by 2+', () => {
    const result = detectBreakingChanges('1.0.0', '1.2.0');
    expect(result.hasBreakingChanges).toBe(false);
    expect(result.hasMultipleReleases).toBe(true);
  });

  it('detects multiple releases when minor jumps by 5', () => {
    const result = detectBreakingChanges('1.1.0', '1.6.0');
    expect(result.hasBreakingChanges).toBe(false);
    expect(result.hasMultipleReleases).toBe(true);
  });

  it('returns no warnings for identical versions', () => {
    const result = detectBreakingChanges('1.2.3', '1.2.3');
    expect(result.hasBreakingChanges).toBe(false);
    expect(result.hasMultipleReleases).toBe(false);
  });

  it('returns no warnings for patch-only bumps', () => {
    const result = detectBreakingChanges('1.2.0', '1.2.5');
    expect(result.hasBreakingChanges).toBe(false);
    expect(result.hasMultipleReleases).toBe(false);
  });

  it('handles 0.x versions correctly', () => {
    const result = detectBreakingChanges('0.1.0', '0.3.0');
    expect(result.hasBreakingChanges).toBe(false);
    expect(result.hasMultipleReleases).toBe(true);
  });

  it('detects breaking change from 0.x to 1.x', () => {
    const result = detectBreakingChanges('0.9.0', '1.0.0');
    expect(result.hasBreakingChanges).toBe(true);
    expect(result.hasMultipleReleases).toBe(false);
  });
});
