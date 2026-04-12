import { describe, it, expect } from 'vitest';
import { checkContradictions } from '../contradiction-check.js';
import type { ClassifiedItem } from '../types.js';
import { Vault } from '../../vault/vault.js';
import type { IntelligenceEntry } from '../../intelligence/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<IntelligenceEntry> = {}): IntelligenceEntry {
  return {
    id: overrides.id ?? `entry-${Math.random().toString(36).slice(2, 8)}`,
    type: 'pattern',
    domain: 'testing',
    title: 'Default Title',
    severity: 'suggestion',
    description: 'Default description for testing purposes.',
    tags: ['default'],
    ...overrides,
  };
}

function makeClassifiedItem(overrides: Partial<ClassifiedItem> = {}): ClassifiedItem {
  return {
    type: 'pattern',
    title: 'New Item',
    description: 'New description.',
    tags: ['new'],
    severity: 'suggestion',
    citation: 'test source',
    ...overrides,
  };
}

function seedVault(vault: Vault, entries: IntelligenceEntry[]): void {
  for (const entry of entries) {
    vault.add(entry);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('checkContradictions', () => {
  it('returns empty array for empty vault', () => {
    const vault = new Vault(':memory:');

    const items: ClassifiedItem[] = [
      makeClassifiedItem({ type: 'pattern', title: 'Use dependency injection' }),
    ];

    const flags = checkContradictions(items, vault);
    expect(flags).toEqual([]);
  });

  it('returns empty array when no items provided', () => {
    const vault = new Vault(':memory:');
    seedVault(vault, [makeEntry({ type: 'pattern', title: 'Always validate inputs' })]);

    const flags = checkContradictions([], vault);
    expect(flags).toEqual([]);
  });

  it('returns empty array when vault has only patterns and new items are also patterns', () => {
    const vault = new Vault(':memory:');
    seedVault(vault, [
      makeEntry({
        id: 'p1',
        type: 'pattern',
        title: 'Use dependency injection for services',
        description: 'Inject dependencies through constructors for testability.',
      }),
    ]);

    // New items are also patterns, so no cross-type contradiction
    const items: ClassifiedItem[] = [
      makeClassifiedItem({
        type: 'pattern',
        title: 'Use dependency injection for repositories',
        description: 'Inject repository dependencies through constructors for testability.',
      }),
    ];

    const flags = checkContradictions(items, vault);
    expect(flags).toEqual([]);
  });

  it('detects contradiction: new pattern similar to existing anti-pattern', () => {
    const vault = new Vault(':memory:');

    // Existing anti-pattern: "avoid global mutable state in application modules"
    seedVault(vault, [
      makeEntry({
        id: 'ap1',
        type: 'anti-pattern',
        title: 'Global mutable state in application modules',
        description:
          'Global mutable state in application modules causes unpredictable behavior and makes testing difficult. Avoid global mutable state in application modules.',
      }),
    ]);

    // New pattern that recommends something similar to the anti-pattern
    const items: ClassifiedItem[] = [
      makeClassifiedItem({
        type: 'pattern',
        title: 'Global mutable state in application modules',
        description:
          'Use global mutable state in application modules for shared configuration. Global mutable state in application modules provides convenient access.',
      }),
    ];

    const flags = checkContradictions(items, vault);

    expect(flags.length).toBeGreaterThanOrEqual(1);
    const flag = flags[0];
    expect(flag.newItemType).toBe('pattern');
    expect(flag.existingEntryType).toBe('anti-pattern');
    expect(flag.existingEntryId).toBe('ap1');
    expect(flag.similarity).toBeGreaterThanOrEqual(0.4);
  });

  it('detects contradiction: new anti-pattern similar to existing pattern', () => {
    const vault = new Vault(':memory:');

    // Existing pattern: "use immutable data structures"
    seedVault(vault, [
      makeEntry({
        id: 'p1',
        type: 'pattern',
        title: 'Immutable data structures for state management',
        description:
          'Use immutable data structures for state management to prevent accidental mutation and enable time-travel debugging. Immutable data structures for state management improve reliability.',
      }),
    ]);

    // New anti-pattern that overlaps significantly
    const items: ClassifiedItem[] = [
      makeClassifiedItem({
        type: 'anti-pattern',
        title: 'Immutable data structures for state management',
        description:
          'Immutable data structures for state management add unnecessary complexity and overhead in simple applications. Avoid immutable data structures for state management in small projects.',
      }),
    ];

    const flags = checkContradictions(items, vault);

    expect(flags.length).toBeGreaterThanOrEqual(1);
    const flag = flags[0];
    expect(flag.newItemType).toBe('anti-pattern');
    expect(flag.existingEntryType).toBe('pattern');
    expect(flag.existingEntryId).toBe('p1');
    expect(flag.similarity).toBeGreaterThanOrEqual(0.4);
  });

  it('does not flag low-similarity cross-type pairs (below threshold 0.4)', () => {
    const vault = new Vault(':memory:');

    // Existing anti-pattern about databases
    seedVault(vault, [
      makeEntry({
        id: 'ap1',
        type: 'anti-pattern',
        title: 'Storing passwords in plaintext database columns',
        description:
          'Never store passwords in plaintext. Always hash passwords with bcrypt or argon2 before storing in the database.',
      }),
    ]);

    // New pattern about something completely different
    const items: ClassifiedItem[] = [
      makeClassifiedItem({
        type: 'pattern',
        title: 'Responsive grid layout with CSS flexbox',
        description:
          'Use CSS flexbox containers for responsive grid layouts that adapt to viewport width changes seamlessly.',
      }),
    ];

    const flags = checkContradictions(items, vault);
    expect(flags).toEqual([]);
  });

  it('fast path: skips when vault has no patterns and no anti-patterns', () => {
    const vault = new Vault(':memory:');

    // Seed vault with entries that are neither patterns nor anti-patterns
    seedVault(vault, [
      makeEntry({
        id: 'r1',
        type: 'rule',
        title: 'Code review required before merge',
        description: 'All PRs must be reviewed by at least one team member.',
      }),
      makeEntry({
        id: 'pb1',
        type: 'playbook',
        title: 'Incident response playbook',
        description: 'Steps to follow during a production incident.',
      }),
    ]);

    const items: ClassifiedItem[] = [
      makeClassifiedItem({
        type: 'anti-pattern',
        title: 'Something that should not match anything',
        description: 'This anti-pattern should not trigger because vault has no patterns.',
      }),
    ];

    // The function checks: if patterns.length === 0 && antiPatterns.length === 0 -> return []
    // But 'rule' type IS included in the patterns filter (line 35 of source: type === 'pattern' || type === 'rule')
    // So this test needs vault entries that are ONLY playbooks (neither pattern, rule, nor anti-pattern)
    // Let's use a fresh vault with only playbooks
    const vault2 = new Vault(':memory:');
    seedVault(vault2, [
      makeEntry({
        id: 'pb2',
        type: 'playbook',
        title: 'Deploy process',
        description: 'Steps for deploying to production environment.',
      }),
    ]);

    const flags = checkContradictions(items, vault2);
    expect(flags).toEqual([]);
  });
});
