import { describe, it, expect } from 'vitest';
import {
  scorePlaybook,
  matchPlaybooks,
  mergePlaybooks,
  getBuiltinPlaybook,
  getAllBuiltinPlaybooks,
} from '../playbooks/playbook-registry.js';
import type { PlaybookDefinition } from '../playbooks/playbook-types.js';

describe('scorePlaybook', () => {
  it('should add 10 for intent match', () => {
    const pb = getBuiltinPlaybook('generic-tdd')!;
    expect(scorePlaybook(pb, 'BUILD', '')).toBe(10);
  });

  it('should add 5 per keyword match', () => {
    const pb = getBuiltinPlaybook('generic-tdd')!;
    // 'implement' and 'build' are keywords
    expect(scorePlaybook(pb, undefined, 'implement and build')).toBe(10);
  });

  it('should combine intent + keyword scores', () => {
    const pb = getBuiltinPlaybook('generic-tdd')!;
    // BUILD intent (10) + 'implement' (5) + 'feature' (5) = 20
    expect(scorePlaybook(pb, 'BUILD', 'implement a feature')).toBe(20);
  });

  it('should return 0 for unrelated content', () => {
    const pb = getBuiltinPlaybook('generic-tdd')!;
    expect(scorePlaybook(pb, 'REVIEW', 'nothing related here')).toBe(0);
  });

  it('should be case-insensitive for keywords', () => {
    const pb = getBuiltinPlaybook('generic-systematic-debugging')!;
    expect(scorePlaybook(pb, undefined, 'FIX THE BUG')).toBeGreaterThan(0);
  });
});

describe('matchPlaybooks', () => {
  it('should match TDD for BUILD intent with "implement"', () => {
    const result = matchPlaybooks('BUILD', 'implement the new feature');
    expect(result.playbook).not.toBeNull();
    expect(result.genericMatch?.id).toBe('generic-tdd');
  });

  it('should match systematic-debugging for FIX intent', () => {
    const result = matchPlaybooks('FIX', 'fix the broken authentication bug');
    expect(result.playbook).not.toBeNull();
    expect(result.genericMatch?.id).toBe('generic-systematic-debugging');
  });

  it('should match brainstorming for PLAN intent', () => {
    const result = matchPlaybooks('PLAN', 'design a new architecture from scratch');
    expect(result.playbook).not.toBeNull();
    expect(result.genericMatch?.id).toBe('generic-brainstorming');
  });

  it('should match code-review for REVIEW intent', () => {
    const result = matchPlaybooks('REVIEW', 'review this pull request');
    expect(result.playbook).not.toBeNull();
    expect(result.genericMatch?.id).toBe('generic-code-review');
  });

  it('should return null playbook for unrelated text with no intent', () => {
    const result = matchPlaybooks(undefined, 'random unrelated text xyz');
    expect(result.playbook).toBeNull();
  });

  it('should prefer vault playbooks over builtins', () => {
    const vaultPlaybook: PlaybookDefinition = {
      id: 'custom-tdd',
      tier: 'generic',
      title: 'Custom TDD',
      trigger: 'Custom TDD trigger',
      description: 'Custom TDD description',
      steps: 'Custom steps',
      expectedOutcome: 'Custom outcome',
      category: 'methodology',
      tags: ['tdd'],
      matchIntents: ['BUILD', 'FIX'],
      matchKeywords: [
        'implement',
        'build',
        'create',
        'add',
        'fix',
        'refactor',
        'feature',
        'code',
        'custom-unique-keyword',
      ],
      gates: [],
      taskTemplates: [],
      toolInjections: [],
      verificationCriteria: [],
    };

    // The vault playbook should score higher because it has more keyword matches
    const result = matchPlaybooks(
      'BUILD',
      'implement and build and create with custom-unique-keyword',
      [vaultPlaybook],
    );
    expect(result.genericMatch?.id).toBe('custom-tdd');
  });

  it('should resolve domain extends to correct generic', () => {
    const domainPlaybook: PlaybookDefinition = {
      id: 'domain-component-build',
      tier: 'domain',
      title: 'Component Build',
      trigger: 'Build a component',
      description: 'Build with design tokens',
      steps: 'Domain steps',
      expectedOutcome: 'Component built with tokens',
      extends: 'generic-tdd',
      category: 'design-system',
      tags: ['component', 'build'],
      matchIntents: ['BUILD'],
      matchKeywords: ['component', 'build'],
      gates: [{ phase: 'completion', requirement: 'Tokens validated', checkType: 'token-check' }],
      taskTemplates: [],
      toolInjections: ['validate_tokens'],
      verificationCriteria: ['All tokens are semantic'],
    };

    const result = matchPlaybooks('BUILD', 'build a component', [domainPlaybook]);
    expect(result.domainMatch?.id).toBe('domain-component-build');
    // Should resolve the extended generic
    expect(result.genericMatch?.id).toBe('generic-tdd');
    expect(result.playbook?.label).toContain('extends');
  });
});

describe('mergePlaybooks', () => {
  it('should concatenate gates (generic first, then domain)', () => {
    const generic = getBuiltinPlaybook('generic-tdd')!;
    const domain: PlaybookDefinition = {
      id: 'domain-test',
      tier: 'domain',
      title: 'Domain Test',
      trigger: '',
      description: '',
      steps: '',
      expectedOutcome: '',
      category: 'test',
      tags: [],
      matchIntents: [],
      matchKeywords: [],
      gates: [{ phase: 'completion', requirement: 'Domain gate', checkType: 'domain-gate' }],
      taskTemplates: [],
      toolInjections: [],
      verificationCriteria: [],
    };

    const merged = mergePlaybooks(generic, domain);
    expect(merged.mergedGates.length).toBe(generic.gates.length + 1);
    expect(merged.mergedGates[0]).toEqual(generic.gates[0]);
    expect(merged.mergedGates[merged.mergedGates.length - 1].checkType).toBe('domain-gate');
  });

  it('should override tasks at same order+taskType', () => {
    const generic: PlaybookDefinition = {
      id: 'g',
      tier: 'generic',
      title: 'G',
      trigger: '',
      description: '',
      steps: '',
      expectedOutcome: '',
      category: 'test',
      tags: [],
      matchIntents: [],
      matchKeywords: [],
      gates: [],
      taskTemplates: [
        {
          taskType: 'test',
          titleTemplate: 'Generic test',
          acceptanceCriteria: ['generic'],
          tools: [],
          order: 'before-implementation',
        },
      ],
      toolInjections: [],
      verificationCriteria: [],
    };

    const domain: PlaybookDefinition = {
      ...generic,
      id: 'd',
      tier: 'domain',
      title: 'D',
      taskTemplates: [
        {
          taskType: 'test',
          titleTemplate: 'Domain test',
          acceptanceCriteria: ['domain'],
          tools: ['custom_tool'],
          order: 'before-implementation',
        },
      ],
    };

    const merged = mergePlaybooks(generic, domain);
    // Domain should override the same order+taskType
    expect(merged.mergedTasks).toHaveLength(1);
    expect(merged.mergedTasks[0].titleTemplate).toBe('Domain test');
  });

  it('should deduplicate tools', () => {
    const generic: PlaybookDefinition = {
      id: 'g',
      tier: 'generic',
      title: 'G',
      trigger: '',
      description: '',
      steps: '',
      expectedOutcome: '',
      category: 'test',
      tags: [],
      matchIntents: [],
      matchKeywords: [],
      gates: [],
      taskTemplates: [],
      toolInjections: ['search_intelligent', 'shared_tool'],
      verificationCriteria: [],
    };

    const domain: PlaybookDefinition = {
      ...generic,
      id: 'd',
      tier: 'domain',
      title: 'D',
      toolInjections: ['shared_tool', 'domain_tool'],
    };

    const merged = mergePlaybooks(generic, domain);
    expect(merged.mergedTools).toHaveLength(3);
    expect(merged.mergedTools).toContain('search_intelligent');
    expect(merged.mergedTools).toContain('shared_tool');
    expect(merged.mergedTools).toContain('domain_tool');
  });

  it('should deduplicate verification criteria', () => {
    const generic: PlaybookDefinition = {
      id: 'g',
      tier: 'generic',
      title: 'G',
      trigger: '',
      description: '',
      steps: '',
      expectedOutcome: '',
      category: 'test',
      tags: [],
      matchIntents: [],
      matchKeywords: [],
      gates: [],
      taskTemplates: [],
      toolInjections: [],
      verificationCriteria: ['Tests pass', 'Build succeeds'],
    };

    const domain: PlaybookDefinition = {
      ...generic,
      id: 'd',
      tier: 'domain',
      title: 'D',
      verificationCriteria: ['Tests pass', 'Tokens validated'],
    };

    const merged = mergePlaybooks(generic, domain);
    expect(merged.mergedVerification).toHaveLength(3);
  });

  it('should build correct label for generic + domain', () => {
    const generic = getBuiltinPlaybook('generic-tdd')!;
    const domain: PlaybookDefinition = {
      id: 'd',
      tier: 'domain',
      title: 'Component Build',
      trigger: '',
      description: '',
      steps: '',
      expectedOutcome: '',
      category: 'test',
      tags: [],
      matchIntents: [],
      matchKeywords: [],
      gates: [],
      taskTemplates: [],
      toolInjections: [],
      verificationCriteria: [],
    };

    const merged = mergePlaybooks(generic, domain);
    expect(merged.label).toBe('Component Build (extends Test-Driven Development)');
  });

  it('should handle generic-only merge', () => {
    const generic = getBuiltinPlaybook('generic-tdd')!;
    const merged = mergePlaybooks(generic, undefined);
    expect(merged.label).toBe(generic.title);
    expect(merged.generic).toBe(generic);
    expect(merged.domain).toBeUndefined();
  });
});

describe('getAllBuiltinPlaybooks', () => {
  it('should return all built-in playbooks', () => {
    const all = getAllBuiltinPlaybooks();
    expect(all.length).toBeGreaterThanOrEqual(6);
  });

  it('should all be generic tier', () => {
    const all = getAllBuiltinPlaybooks();
    expect(all.every((p) => p.tier === 'generic')).toBe(true);
  });

  it('should have unique IDs', () => {
    const all = getAllBuiltinPlaybooks();
    const ids = all.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
