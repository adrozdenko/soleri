import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Vault } from '../vault/vault.js';
import {
  seedDefaultPlaybooks,
  playbookDefinitionToEntry,
  entryToPlaybookDefinition,
} from '../playbooks/playbook-seeder.js';
import { getAllBuiltinPlaybooks } from '../playbooks/playbook-registry.js';

describe('playbookDefinitionToEntry', () => {
  it('should convert a PlaybookDefinition to IntelligenceEntry', () => {
    const def = getAllBuiltinPlaybooks()[0];
    const entry = playbookDefinitionToEntry(def);

    expect(entry.id).toBe(def.id);
    expect(entry.type).toBe('playbook');
    expect(entry.domain).toBe(def.category);
    expect(entry.title).toBe(def.title);
    expect(entry.severity).toBe('suggestion');
    expect(entry.description).toBe(def.description);
    expect(entry.example).toBe(def.steps);
    expect(entry.why).toBe(def.expectedOutcome);
    expect(entry.tags).toEqual(def.tags);
  });

  it('should embed the full definition in context', () => {
    const def = getAllBuiltinPlaybooks()[0];
    const entry = playbookDefinitionToEntry(def);
    expect(entry.context).toContain('__PLAYBOOK_DEF__');
    expect(entry.context).toContain('__END_DEF__');
    expect(entry.context).toContain(def.trigger);
  });
});

describe('entryToPlaybookDefinition', () => {
  it('should round-trip through entry and back', () => {
    const original = getAllBuiltinPlaybooks()[0];
    const entry = playbookDefinitionToEntry(original);
    const restored = entryToPlaybookDefinition(entry);

    expect(restored).not.toBeNull();
    expect(restored!.id).toBe(original.id);
    expect(restored!.tier).toBe(original.tier);
    expect(restored!.title).toBe(original.title);
    expect(restored!.matchIntents).toEqual(original.matchIntents);
    expect(restored!.matchKeywords).toEqual(original.matchKeywords);
    expect(restored!.gates).toEqual(original.gates);
    expect(restored!.taskTemplates).toEqual(original.taskTemplates);
  });

  it('should return null for non-playbook entry', () => {
    const result = entryToPlaybookDefinition({
      id: 'pat-1',
      type: 'pattern',
      domain: 'test',
      title: 'Test',
      severity: 'warning',
      description: 'Test',
      tags: [],
    });
    expect(result).toBeNull();
  });

  it('should return null for playbook entry without metadata', () => {
    const result = entryToPlaybookDefinition({
      id: 'pb-1',
      type: 'playbook',
      domain: 'test',
      title: 'Test',
      severity: 'suggestion',
      description: 'Test',
      context: 'plain text without markers',
      tags: [],
    });
    expect(result).toBeNull();
  });

  it('should return null for malformed JSON in metadata', () => {
    const result = entryToPlaybookDefinition({
      id: 'pb-1',
      type: 'playbook',
      domain: 'test',
      title: 'Test',
      severity: 'suggestion',
      description: 'Test',
      context: '__PLAYBOOK_DEF__{not valid json}__END_DEF__',
      tags: [],
    });
    expect(result).toBeNull();
  });
});

describe('seedDefaultPlaybooks', () => {
  let vault: Vault;

  beforeEach(() => {
    vault = new Vault(':memory:');
  });

  afterEach(() => {
    vault.close();
  });

  it('should seed built-in playbooks into empty vault', () => {
    const result = seedDefaultPlaybooks(vault);
    expect(result.seeded).toBeGreaterThanOrEqual(6);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.details.length).toBe(result.seeded);
    expect(result.details.every((d) => d.action === 'seeded')).toBe(true);

    // Verify they're in the vault
    const entries = vault.list({ type: 'playbook' });
    expect(entries.length).toBe(result.seeded);
  });

  it('should be idempotent — second call skips all', () => {
    const first = seedDefaultPlaybooks(vault);
    const result = seedDefaultPlaybooks(vault);

    expect(result.seeded).toBe(0);
    expect(result.skipped).toBe(first.seeded);
    expect(result.errors).toBe(0);
    expect(result.details.every((d) => d.action === 'skipped')).toBe(true);
  });

  it('should not overwrite user modifications', () => {
    // Seed first
    const first = seedDefaultPlaybooks(vault);

    // Simulate user modifying a playbook by removing and re-adding with different content
    const builtins = getAllBuiltinPlaybooks();
    vault.remove(builtins[0].id);
    vault.add({
      id: builtins[0].id,
      type: 'playbook',
      domain: 'user-custom',
      title: 'User Modified Playbook',
      severity: 'suggestion',
      description: 'Modified by user',
      tags: ['custom'],
    });

    // Re-seed should skip this one
    const result = seedDefaultPlaybooks(vault);
    expect(result.skipped).toBe(first.seeded); // all exist, including user-modified one

    // Verify user's version is preserved
    const entry = vault.get(builtins[0].id);
    expect(entry?.title).toBe('User Modified Playbook');
  });

  it('should report correct counts in details', () => {
    const result = seedDefaultPlaybooks(vault);
    const ids = result.details.map((d) => d.id);
    expect(ids).toContain('generic-tdd');
    expect(ids).toContain('generic-brainstorming');
    expect(ids).toContain('generic-code-review');
    expect(ids).toContain('generic-subagent-execution');
    expect(ids).toContain('generic-systematic-debugging');
    expect(ids).toContain('generic-verification');
  });
});
