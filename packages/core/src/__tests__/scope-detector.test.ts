import { describe, it, expect } from 'vitest';
import { detectScope } from '../vault/scope-detector.js';
import type { ScopeInput } from '../vault/scope-detector.js';

describe('detectScope', () => {
  it('classifies project-specific paths as project tier with HIGH confidence', () => {
    const input: ScopeInput = {
      title: 'Monorepo package structure',
      description: 'In packages/core/src/vault.ts, we use SQLite for persistence.',
      tags: ['project-specific'],
    };
    const result = detectScope(input);
    expect(result.tier).toBe('project');
    expect(result.confidence).toBe('HIGH');
  });

  it('classifies universal TypeScript patterns as team tier', () => {
    const input: ScopeInput = {
      title: 'Type safety best practice',
      description: 'Always use type guards instead of type assertions for runtime safety.',
      tags: ['typescript', 'best-practice'],
    };
    const result = detectScope(input);
    expect(result.tier).toBe('team');
  });

  it('classifies personal preferences as agent tier', () => {
    const input: ScopeInput = {
      title: 'My editor setup',
      description: 'I prefer using vim keybindings in my IDE. My workflow involves ~/projects.',
      tags: ['preference'],
    };
    const result = detectScope(input);
    expect(result.tier).toBe('agent');
  });

  it('classifies accessibility concepts as team tier', () => {
    const input: ScopeInput = {
      title: 'WCAG contrast requirements',
      description: 'All text must meet WCAG AA contrast ratio of 4.5:1 for accessibility.',
      category: 'accessibility',
    };
    const result = detectScope(input);
    expect(result.tier).toBe('team');
    expect(result.confidence).toBe('HIGH');
  });

  it('returns LOW confidence for mixed signals', () => {
    const input: ScopeInput = {
      title: 'Clean code in our codebase',
      description: 'Our project follows clean code principles. In packages/core we enforce SOLID.',
      tags: ['best-practice', 'project-specific'],
    };
    const result = detectScope(input);
    // Should have LOW or MEDIUM confidence due to conflicting signals
    expect(['LOW', 'MEDIUM']).toContain(result.confidence);
  });

  it('defaults to agent tier with LOW confidence when no signals', () => {
    const input: ScopeInput = {
      title: 'Random note',
      description: 'Something happened today.',
    };
    const result = detectScope(input);
    expect(result.tier).toBe('agent');
    expect(result.confidence).toBe('LOW');
    expect(result.reason).toContain('No clear signals');
  });

  it('detects scoped packages as project-specific', () => {
    const input: ScopeInput = {
      title: 'Package usage',
      description: 'Use @soleri/core for all vault operations, not direct SQLite.',
    };
    const result = detectScope(input);
    expect(result.tier).toBe('project');
  });

  it('detects security patterns as team tier', () => {
    const input: ScopeInput = {
      title: 'XSS prevention',
      description: 'Sanitize all user input to prevent XSS injection attacks.',
      category: 'security',
      tags: ['security'],
    };
    const result = detectScope(input);
    expect(result.tier).toBe('team');
    expect(result.confidence).toBe('HIGH');
  });

  it('includes signals in result', () => {
    const input: ScopeInput = {
      title: 'Focus ring pattern',
      description:
        'All interactive elements must have a visible focus ring for keyboard navigation.',
    };
    const result = detectScope(input);
    expect(result.signals.length).toBeGreaterThan(0);
    expect(result.signals.some((s) => s.source === 'content')).toBe(true);
  });

  it('category signal boosts classification', () => {
    const input: ScopeInput = {
      title: 'Color palette choice',
      description: 'Use harmonious color palettes for UI consistency.',
      category: 'design',
    };
    const result = detectScope(input);
    expect(result.tier).toBe('team');
  });

  it('agent tags classify as agent', () => {
    const input: ScopeInput = {
      title: 'Terminal config',
      description: 'Set up zsh with custom prompt.',
      tags: ['personal', 'workflow'],
    };
    const result = detectScope(input);
    expect(result.tier).toBe('agent');
  });
});
