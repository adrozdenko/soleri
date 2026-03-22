import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Vault } from '../vault/vault.js';
import {
  seedDefaultPlaybooks,
  playbookDefinitionToEntry,
  entryToPlaybookDefinition,
} from './playbook-seeder.js';
import { getAllBuiltinPlaybooks } from './playbook-registry.js';

describe('playbookDefinitionToEntry', () => {
  it('maps fields correctly', () => {
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

  it('embeds full definition JSON in context field', () => {
    const def = getAllBuiltinPlaybooks()[0];
    const entry = playbookDefinitionToEntry(def);

    expect(entry.context).toContain('__PLAYBOOK_DEF__');
    expect(entry.context).toContain('__END_DEF__');
    expect(entry.context).toContain(def.trigger);
  });
});

describe('entryToPlaybookDefinition', () => {
  it('round-trips through entry and back', () => {
    const original = getAllBuiltinPlaybooks()[0];
    const entry = playbookDefinitionToEntry(original);
    const restored = entryToPlaybookDefinition(entry);

    expect(restored).not.toBeNull();
    expect(restored!.id).toBe(original.id);
    expect(restored!.tier).toBe(original.tier);
    expect(restored!.title).toBe(original.title);
  });

  it('returns null for non-playbook type', () => {
    expect(
      entryToPlaybookDefinition({
        id: 'p1',
        type: 'pattern',
        domain: 'test',
        title: 'Test',
        severity: 'warning',
        description: 'Not a playbook',
        tags: [],
      }),
    ).toBeNull();
  });

  it('returns null when context lacks markers', () => {
    expect(
      entryToPlaybookDefinition({
        id: 'p1',
        type: 'playbook',
        domain: 'test',
        title: 'Test',
        severity: 'suggestion',
        description: 'No markers',
        context: 'plain text',
        tags: [],
      }),
    ).toBeNull();
  });

  it('returns null for malformed JSON between markers', () => {
    expect(
      entryToPlaybookDefinition({
        id: 'p1',
        type: 'playbook',
        domain: 'test',
        title: 'Test',
        severity: 'suggestion',
        description: 'Bad JSON',
        context: '__PLAYBOOK_DEF__{invalid__END_DEF__',
        tags: [],
      }),
    ).toBeNull();
  });

  it('returns null when JSON lacks essential fields', () => {
    expect(
      entryToPlaybookDefinition({
        id: 'p1',
        type: 'playbook',
        domain: 'test',
        title: 'Test',
        severity: 'suggestion',
        description: 'Missing fields',
        context: '__PLAYBOOK_DEF__{"foo":"bar"}__END_DEF__',
        tags: [],
      }),
    ).toBeNull();
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

  it('seeds all built-in playbooks into empty vault', () => {
    const result = seedDefaultPlaybooks(vault);
    expect(result.seeded).toBeGreaterThanOrEqual(6);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
  });

  it('is idempotent — second run skips all', () => {
    const first = seedDefaultPlaybooks(vault);
    const second = seedDefaultPlaybooks(vault);
    expect(second.seeded).toBe(0);
    expect(second.skipped).toBe(first.seeded);
  });

  it('does not overwrite user-modified entries', () => {
    seedDefaultPlaybooks(vault);

    const builtins = getAllBuiltinPlaybooks();
    vault.remove(builtins[0].id);
    vault.add({
      id: builtins[0].id,
      type: 'playbook',
      domain: 'custom',
      title: 'User Override',
      severity: 'suggestion',
      description: 'Modified',
      tags: [],
    });

    seedDefaultPlaybooks(vault);

    const entry = vault.get(builtins[0].id);
    expect(entry?.title).toBe('User Override');
  });
});
