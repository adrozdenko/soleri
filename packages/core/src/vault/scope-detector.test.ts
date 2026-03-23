import { describe, it, expect } from 'vitest';
import { detectScope, type ScopeInput } from './scope-detector.js';

function makeInput(overrides: Partial<ScopeInput> = {}): ScopeInput {
  return {
    title: 'Test Entry',
    description: 'A generic description.',
    ...overrides,
  };
}

describe('detectScope', () => {
  // ── Default behavior ──────────────────────────────────────────────

  it('defaults to agent tier when no signals detected', () => {
    const result = detectScope(makeInput());
    expect(result.tier).toBe('agent');
    expect(result.confidence).toBe('LOW');
    expect(result.reason).toContain('defaulting to agent');
  });

  // ── Team detection via content ─────────────────────────────────────

  it('detects team tier for accessibility content', () => {
    const result = detectScope(
      makeInput({ description: 'Always use ARIA labels for screen reader support' }),
    );
    expect(result.tier).toBe('team');
    expect(result.signals.some((s) => s.tier === 'team' && s.source === 'content')).toBe(true);
  });

  it('detects team tier for WCAG/contrast content', () => {
    const result = detectScope(
      makeInput({ description: 'Ensure contrast ratio meets WCAG AA standard' }),
    );
    expect(result.tier).toBe('team');
  });

  it('detects team tier for design system content', () => {
    const result = detectScope(
      makeInput({ description: 'Use semantic token from the design system' }),
    );
    expect(result.tier).toBe('team');
  });

  it('detects team tier for security content', () => {
    const result = detectScope(
      makeInput({ description: 'Sanitize all user input to prevent XSS attacks' }),
    );
    expect(result.tier).toBe('team');
  });

  it('detects team tier for touch target / UX content', () => {
    const result = detectScope(
      makeInput({ description: 'Touch target must be 44px minimum per Fitts law' }),
    );
    expect(result.tier).toBe('team');
  });

  // ── Project detection via content ──────────────────────────────────

  it('detects project tier for scoped package references', () => {
    const result = detectScope(
      makeInput({ description: 'Import from @soleri/core for vault operations' }),
    );
    expect(result.tier).toBe('project');
  });

  it('detects project tier for monorepo path references', () => {
    const result = detectScope(
      makeInput({ description: 'The module lives in packages/core/src/vault.ts' }),
    );
    expect(result.tier).toBe('project');
  });

  it('detects project tier for explicit project references', () => {
    const result = detectScope(
      makeInput({ description: 'This project uses a custom build pipeline' }),
    );
    expect(result.tier).toBe('project');
  });

  // ── Agent detection via content ────────────────────────────────────

  it('detects agent tier for personal preferences', () => {
    const result = detectScope(
      makeInput({ description: 'I prefer using vim keybindings in my editor' }),
    );
    expect(result.tier).toBe('agent');
  });

  it('detects agent tier for home directory paths', () => {
    const result = detectScope(makeInput({ description: 'Config lives in ~/dotfiles/zshrc' }));
    expect(result.tier).toBe('agent');
  });

  // ── Category signals ───────────────────────────────────────────────

  it('boosts team tier for team categories', () => {
    const result = detectScope(makeInput({ category: 'accessibility' }));
    expect(result.tier).toBe('team');
    expect(result.signals.some((s) => s.source === 'category')).toBe(true);
  });

  it('boosts project tier for project categories', () => {
    const result = detectScope(makeInput({ category: 'infrastructure' }));
    expect(result.tier).toBe('project');
  });

  it('produces no category signal for unknown categories', () => {
    const result = detectScope(makeInput({ category: 'random' }));
    expect(result.signals.filter((s) => s.source === 'category')).toEqual([]);
  });

  // ── Tag signals ────────────────────────────────────────────────────

  it('boosts team tier for team tags', () => {
    const result = detectScope(makeInput({ tags: ['universal', 'best-practice'] }));
    expect(result.tier).toBe('team');
  });

  it('boosts project tier for project tags', () => {
    const result = detectScope(makeInput({ tags: ['project-specific', 'internal'] }));
    expect(result.tier).toBe('project');
  });

  it('boosts agent tier for agent tags', () => {
    const result = detectScope(makeInput({ tags: ['personal', 'preference'] }));
    expect(result.tier).toBe('agent');
  });

  it('handles empty tags array', () => {
    const result = detectScope(makeInput({ tags: [] }));
    expect(result.tier).toBe('agent'); // default
  });

  // ── Confidence levels ──────────────────────────────────────────────

  it('returns HIGH confidence when strong signals with no competition', () => {
    const result = detectScope(
      makeInput({
        description: 'Accessibility a11y ARIA screen reader WCAG contrast ratio',
        category: 'accessibility',
        tags: ['a11y', 'wcag'],
      }),
    );
    expect(result.tier).toBe('team');
    expect(result.confidence).toBe('HIGH');
  });

  it('returns MEDIUM confidence for moderate signal competition', () => {
    // Mix of team and project signals
    const result = detectScope(
      makeInput({
        description: 'This project uses type safety patterns from @soleri/core',
        tags: ['pattern'],
      }),
    );
    expect(['HIGH', 'MEDIUM']).toContain(result.confidence);
  });

  // ── Signal structure ───────────────────────────────────────────────

  it('includes signals with expected shape', () => {
    const result = detectScope(
      makeInput({ description: 'Use focus ring for keyboard navigation' }),
    );
    for (const signal of result.signals) {
      expect(signal).toHaveProperty('tier');
      expect(signal).toHaveProperty('source');
      expect(signal).toHaveProperty('indicator');
      expect(signal).toHaveProperty('weight');
      expect(signal.weight).toBeGreaterThan(0);
      expect(signal.weight).toBeLessThanOrEqual(1);
    }
  });

  it('reason summarizes top signals', () => {
    const result = detectScope(
      makeInput({ description: 'Accessibility best practice for a11y compliance' }),
    );
    expect(result.reason.length).toBeGreaterThan(0);
    expect(result.reason).not.toContain('defaulting');
  });
});
