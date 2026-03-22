import { describe, it, expect } from 'vitest';
import {
  scorePlaybook,
  matchPlaybooks,
  mergePlaybooks,
  getBuiltinPlaybook,
  getAllBuiltinPlaybooks,
} from './playbook-registry.js';
import type { PlaybookDefinition } from './playbook-types.js';

function makePlaybook(overrides: Partial<PlaybookDefinition> = {}): PlaybookDefinition {
  return {
    id: 'test-pb',
    tier: 'generic',
    title: 'Test',
    trigger: 'test',
    description: 'Test playbook',
    steps: '1. Step one\n2. Step two',
    expectedOutcome: 'Done',
    category: 'test',
    tags: [],
    matchIntents: ['BUILD'],
    matchKeywords: ['implement', 'build'],
    gates: [],
    taskTemplates: [],
    toolInjections: ['tool_a'],
    verificationCriteria: ['Tests pass'],
    ...overrides,
  };
}

describe('scorePlaybook', () => {
  it('returns 10 for intent match', () => {
    const pb = makePlaybook({ matchIntents: ['BUILD'] });
    expect(scorePlaybook(pb, 'BUILD', '')).toBe(10);
  });

  it('returns 5 per keyword match', () => {
    const pb = makePlaybook({ matchKeywords: ['build', 'create'] });
    expect(scorePlaybook(pb, undefined, 'build and create')).toBe(10);
  });

  it('combines intent and keyword scores', () => {
    const pb = makePlaybook({ matchIntents: ['FIX'], matchKeywords: ['bug'] });
    expect(scorePlaybook(pb, 'FIX', 'fix the bug')).toBe(15);
  });

  it('returns 0 for no matches', () => {
    const pb = makePlaybook({ matchIntents: ['BUILD'], matchKeywords: ['implement'] });
    expect(scorePlaybook(pb, 'REVIEW', 'nothing here')).toBe(0);
  });

  it('is case-insensitive for keywords', () => {
    const pb = makePlaybook({ matchKeywords: ['bug'] });
    expect(scorePlaybook(pb, undefined, 'Fix the BUG')).toBe(5);
  });

  it('handles undefined intent', () => {
    const pb = makePlaybook({ matchIntents: ['BUILD'], matchKeywords: ['build'] });
    expect(scorePlaybook(pb, undefined, 'build something')).toBe(5);
  });
});

describe('getBuiltinPlaybook', () => {
  it('returns TDD playbook by ID', () => {
    const pb = getBuiltinPlaybook('generic-tdd');
    expect(pb).toBeDefined();
    expect(pb!.title).toBe('Test-Driven Development');
  });

  it('returns undefined for unknown ID', () => {
    expect(getBuiltinPlaybook('nonexistent')).toBeUndefined();
  });
});

describe('getAllBuiltinPlaybooks', () => {
  it('returns at least 6 built-in playbooks', () => {
    expect(getAllBuiltinPlaybooks().length).toBeGreaterThanOrEqual(6);
  });

  it('all playbooks are generic tier', () => {
    expect(getAllBuiltinPlaybooks().every((p) => p.tier === 'generic')).toBe(true);
  });

  it('all IDs are unique', () => {
    const ids = getAllBuiltinPlaybooks().map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('matchPlaybooks', () => {
  it('matches TDD for BUILD intent', () => {
    const result = matchPlaybooks('BUILD', 'implement a feature');
    expect(result.playbook).not.toBeNull();
    expect(result.genericMatch?.id).toBe('generic-tdd');
  });

  it('matches systematic-debugging for FIX intent', () => {
    const result = matchPlaybooks('FIX', 'fix the broken login bug');
    expect(result.playbook).not.toBeNull();
    expect(result.genericMatch?.id).toBe('generic-systematic-debugging');
  });

  it('returns null playbook for unrelated input', () => {
    const result = matchPlaybooks(undefined, 'xyz random unrelated text');
    expect(result.playbook).toBeNull();
  });

  it('prefers vault playbooks over builtins when higher score', () => {
    const vaultPb: PlaybookDefinition = makePlaybook({
      id: 'vault-custom',
      matchIntents: ['BUILD'],
      matchKeywords: ['implement', 'build', 'create', 'custom-special-keyword'],
    });

    const result = matchPlaybooks('BUILD', 'implement and build with custom-special-keyword', [
      vaultPb,
    ]);
    expect(result.genericMatch?.id).toBe('vault-custom');
  });

  it('resolves domain extends to the correct generic', () => {
    const domain: PlaybookDefinition = makePlaybook({
      id: 'domain-component',
      tier: 'domain',
      title: 'Component Build',
      extends: 'generic-tdd',
      matchIntents: ['BUILD'],
      matchKeywords: ['component'],
    });

    const result = matchPlaybooks('BUILD', 'build a component', [domain]);
    expect(result.domainMatch?.id).toBe('domain-component');
    expect(result.genericMatch?.id).toBe('generic-tdd');
  });
});

describe('mergePlaybooks', () => {
  it('concatenates gates from generic then domain', () => {
    const generic = makePlaybook({
      gates: [{ phase: 'completion', requirement: 'G gate', checkType: 'g' }],
    });
    const domain = makePlaybook({
      tier: 'domain',
      gates: [{ phase: 'completion', requirement: 'D gate', checkType: 'd' }],
    });

    const merged = mergePlaybooks(generic, domain);
    expect(merged.mergedGates).toHaveLength(2);
    expect(merged.mergedGates[0].checkType).toBe('g');
    expect(merged.mergedGates[1].checkType).toBe('d');
  });

  it('deduplicates tool injections', () => {
    const generic = makePlaybook({ toolInjections: ['shared', 'generic_only'] });
    const domain = makePlaybook({ tier: 'domain', toolInjections: ['shared', 'domain_only'] });

    const merged = mergePlaybooks(generic, domain);
    expect(merged.mergedTools).toHaveLength(3);
    expect(new Set(merged.mergedTools).size).toBe(3);
  });

  it('deduplicates verification criteria', () => {
    const generic = makePlaybook({ verificationCriteria: ['Tests pass', 'Build succeeds'] });
    const domain = makePlaybook({
      tier: 'domain',
      verificationCriteria: ['Tests pass', 'Tokens valid'],
    });

    const merged = mergePlaybooks(generic, domain);
    expect(merged.mergedVerification).toHaveLength(3);
  });

  it('overrides task templates at same order+taskType', () => {
    const generic = makePlaybook({
      taskTemplates: [
        {
          taskType: 'test',
          titleTemplate: 'Generic',
          acceptanceCriteria: [],
          tools: [],
          order: 'before-implementation',
        },
      ],
    });
    const domain = makePlaybook({
      tier: 'domain',
      taskTemplates: [
        {
          taskType: 'test',
          titleTemplate: 'Domain',
          acceptanceCriteria: [],
          tools: [],
          order: 'before-implementation',
        },
      ],
    });

    const merged = mergePlaybooks(generic, domain);
    expect(merged.mergedTasks).toHaveLength(1);
    expect(merged.mergedTasks[0].titleTemplate).toBe('Domain');
  });

  it('builds label for generic+domain', () => {
    const generic = makePlaybook({ title: 'TDD' });
    const domain = makePlaybook({ tier: 'domain', title: 'Component Build' });

    const merged = mergePlaybooks(generic, domain);
    expect(merged.label).toBe('Component Build (extends TDD)');
  });

  it('handles generic-only merge', () => {
    const generic = makePlaybook({ title: 'TDD' });
    const merged = mergePlaybooks(generic, undefined);
    expect(merged.label).toBe('TDD');
    expect(merged.generic).toBe(generic);
    expect(merged.domain).toBeUndefined();
  });

  it('handles domain-only merge', () => {
    const domain = makePlaybook({ tier: 'domain', title: 'Domain Only' });
    const merged = mergePlaybooks(undefined, domain);
    expect(merged.label).toBe('Domain Only');
    expect(merged.generic).toBeUndefined();
    expect(merged.domain).toBe(domain);
  });

  it('returns Unknown label when both are undefined', () => {
    const merged = mergePlaybooks(undefined, undefined);
    expect(merged.label).toBe('Unknown');
  });
});
