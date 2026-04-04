/**
 * Tests for all generic playbook definitions.
 *
 * These are pure data exports — tests validate structural integrity,
 * required fields, correct types, and cross-definition consistency.
 */

import { describe, it, expect } from 'vitest';
import { brainstormingPlaybook } from './brainstorming.js';
import { codeReviewPlaybook } from './code-review.js';
import { onboardingPlaybook } from './onboarding.js';
import { subagentExecutionPlaybook } from './subagent-execution.js';
import { systematicDebuggingPlaybook } from './systematic-debugging.js';
import { tddPlaybook } from './tdd.js';
import { verificationPlaybook } from './verification.js';
import type {
  PlaybookDefinition,
  PlaybookTier,
  PlaybookIntent,
  PlaybookGate,
  PlaybookTaskTemplate,
} from '../playbook-types.js';

const ALL_PLAYBOOKS: PlaybookDefinition[] = [
  brainstormingPlaybook,
  codeReviewPlaybook,
  onboardingPlaybook,
  subagentExecutionPlaybook,
  systematicDebuggingPlaybook,
  tddPlaybook,
  verificationPlaybook,
];

const VALID_TIERS: PlaybookTier[] = ['generic', 'domain'];
const VALID_INTENTS: PlaybookIntent[] = ['BUILD', 'FIX', 'REVIEW', 'PLAN', 'IMPROVE', 'DELIVER'];
const VALID_GATE_PHASES: PlaybookGate['phase'][] = [
  'brainstorming',
  'pre-execution',
  'post-task',
  'completion',
];
const VALID_TASK_TYPES: PlaybookTaskTemplate['taskType'][] = [
  'implementation',
  'test',
  'story',
  'documentation',
  'verification',
];
const VALID_TASK_ORDERS: PlaybookTaskTemplate['order'][] = [
  'before-implementation',
  'after-implementation',
  'parallel',
];

// ─── Shared structural validation ─────────────────────────────────

describe('All generic playbooks', () => {
  it('should all have unique IDs', () => {
    const ids = ALL_PLAYBOOKS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should all be generic tier', () => {
    for (const pb of ALL_PLAYBOOKS) {
      expect(pb.tier).toBe('generic');
    }
  });

  it('should all have IDs prefixed with "generic-"', () => {
    for (const pb of ALL_PLAYBOOKS) {
      expect(pb.id).toMatch(/^generic-/);
    }
  });

  it('should none have an extends field', () => {
    for (const pb of ALL_PLAYBOOKS) {
      expect(pb.extends).toBeUndefined();
    }
  });

  it('should all have non-empty required string fields', () => {
    for (const pb of ALL_PLAYBOOKS) {
      expect(pb.title.length).toBeGreaterThan(0);
      expect(pb.trigger.length).toBeGreaterThan(0);
      expect(pb.description.length).toBeGreaterThan(0);
      expect(pb.steps.length).toBeGreaterThan(0);
      expect(pb.expectedOutcome.length).toBeGreaterThan(0);
      expect(pb.category.length).toBeGreaterThan(0);
    }
  });

  it('should all have valid tier values', () => {
    for (const pb of ALL_PLAYBOOKS) {
      expect(VALID_TIERS).toContain(pb.tier);
    }
  });

  it('should all have valid matchIntents values', () => {
    for (const pb of ALL_PLAYBOOKS) {
      expect(pb.matchIntents.length).toBeGreaterThan(0);
      for (const intent of pb.matchIntents) {
        expect(VALID_INTENTS).toContain(intent);
      }
    }
  });

  it('should all have at least one matchKeyword', () => {
    for (const pb of ALL_PLAYBOOKS) {
      expect(pb.matchKeywords.length).toBeGreaterThan(0);
    }
  });

  it('should all have non-empty matchKeywords strings', () => {
    for (const pb of ALL_PLAYBOOKS) {
      for (const kw of pb.matchKeywords) {
        expect(kw.length).toBeGreaterThan(0);
        expect(kw.trim()).toBe(kw);
      }
    }
  });

  it('should all have tags as an array', () => {
    for (const pb of ALL_PLAYBOOKS) {
      expect(Array.isArray(pb.tags)).toBe(true);
    }
  });

  it('should all include "generic" in tags', () => {
    for (const pb of ALL_PLAYBOOKS) {
      expect(pb.tags).toContain('generic');
    }
  });

  it('should all have gates as an array', () => {
    for (const pb of ALL_PLAYBOOKS) {
      expect(Array.isArray(pb.gates)).toBe(true);
    }
  });

  it('should have valid gate phases', () => {
    for (const pb of ALL_PLAYBOOKS) {
      for (const gate of pb.gates) {
        expect(VALID_GATE_PHASES).toContain(gate.phase);
        expect(gate.requirement.length).toBeGreaterThan(0);
        expect(gate.checkType.length).toBeGreaterThan(0);
      }
    }
  });

  it('should have valid task template fields', () => {
    for (const pb of ALL_PLAYBOOKS) {
      for (const tmpl of pb.taskTemplates) {
        expect(VALID_TASK_TYPES).toContain(tmpl.taskType);
        expect(VALID_TASK_ORDERS).toContain(tmpl.order);
        expect(tmpl.titleTemplate.length).toBeGreaterThan(0);
        expect(Array.isArray(tmpl.acceptanceCriteria)).toBe(true);
        expect(Array.isArray(tmpl.tools)).toBe(true);
      }
    }
  });

  it('should all have toolInjections as an array', () => {
    for (const pb of ALL_PLAYBOOKS) {
      expect(Array.isArray(pb.toolInjections)).toBe(true);
    }
  });

  it('should all have verificationCriteria as an array', () => {
    for (const pb of ALL_PLAYBOOKS) {
      expect(Array.isArray(pb.verificationCriteria)).toBe(true);
    }
  });

  it('should all have numbered steps in steps text', () => {
    for (const pb of ALL_PLAYBOOKS) {
      expect(pb.steps).toMatch(/\d+\.\s+/);
    }
  });
});

// ─── Individual playbook tests ────────────────────────────────────

describe('brainstormingPlaybook', () => {
  it('should match BUILD and PLAN intents', () => {
    expect(brainstormingPlaybook.matchIntents).toContain('BUILD');
    expect(brainstormingPlaybook.matchIntents).toContain('PLAN');
  });

  it('should have brainstormSections defined', () => {
    expect(brainstormingPlaybook.brainstormSections).toBeDefined();
    expect(brainstormingPlaybook.brainstormSections!.length).toBeGreaterThan(0);
  });

  it('should have valid brainstormSection structure', () => {
    for (const section of brainstormingPlaybook.brainstormSections!) {
      expect(section.title.length).toBeGreaterThan(0);
      expect(section.description.length).toBeGreaterThan(0);
      expect(section.questions.length).toBeGreaterThan(0);
      for (const q of section.questions) {
        expect(q.length).toBeGreaterThan(0);
      }
    }
  });

  it('should have a brainstorming gate', () => {
    expect(brainstormingPlaybook.gates).toHaveLength(1);
    expect(brainstormingPlaybook.gates[0].phase).toBe('brainstorming');
  });

  it('should have no task templates', () => {
    expect(brainstormingPlaybook.taskTemplates).toHaveLength(0);
  });

  it('should inject search_intelligent tool', () => {
    expect(brainstormingPlaybook.toolInjections).toContain('search_intelligent');
  });
});

describe('codeReviewPlaybook', () => {
  it('should match REVIEW intent only', () => {
    expect(codeReviewPlaybook.matchIntents).toEqual(['REVIEW']);
  });

  it('should have three gates covering different phases', () => {
    expect(codeReviewPlaybook.gates).toHaveLength(3);
    const phases = codeReviewPlaybook.gates.map((g) => g.phase);
    expect(phases).toContain('pre-execution');
    expect(phases).toContain('post-task');
    expect(phases).toContain('completion');
  });

  it('should have two verification task templates', () => {
    expect(codeReviewPlaybook.taskTemplates).toHaveLength(2);
    expect(codeReviewPlaybook.taskTemplates[0].taskType).toBe('verification');
    expect(codeReviewPlaybook.taskTemplates[1].taskType).toBe('verification');
  });

  it('should have before and after implementation task orders', () => {
    const orders = codeReviewPlaybook.taskTemplates.map((t) => t.order);
    expect(orders).toContain('before-implementation');
    expect(orders).toContain('after-implementation');
  });

  it('should have no brainstormSections', () => {
    expect(codeReviewPlaybook.brainstormSections).toBeUndefined();
  });

  it('should include review-related keywords', () => {
    expect(codeReviewPlaybook.matchKeywords).toContain('review');
    expect(codeReviewPlaybook.matchKeywords).toContain('pull request');
  });
});

describe('onboardingPlaybook', () => {
  it('should match PLAN intent', () => {
    expect(onboardingPlaybook.matchIntents).toContain('PLAN');
  });

  it('should have no gates', () => {
    expect(onboardingPlaybook.gates).toHaveLength(0);
  });

  it('should have no task templates', () => {
    expect(onboardingPlaybook.taskTemplates).toHaveLength(0);
  });

  it('should include help-related keywords', () => {
    expect(onboardingPlaybook.matchKeywords).toContain('help');
    expect(onboardingPlaybook.matchKeywords).toContain('what can you do');
    expect(onboardingPlaybook.matchKeywords).toContain('getting started');
  });

  it('should inject tool ops for demonstration', () => {
    expect(onboardingPlaybook.toolInjections.length).toBeGreaterThan(0);
  });
});

describe('subagentExecutionPlaybook', () => {
  it('should match BUILD and IMPROVE intents', () => {
    expect(subagentExecutionPlaybook.matchIntents).toContain('BUILD');
    expect(subagentExecutionPlaybook.matchIntents).toContain('IMPROVE');
  });

  it('should have two post-task gates', () => {
    expect(subagentExecutionPlaybook.gates).toHaveLength(2);
    expect(subagentExecutionPlaybook.gates.every((g) => g.phase === 'post-task')).toBe(true);
  });

  it('should have spec-review and quality-review check types', () => {
    const checkTypes = subagentExecutionPlaybook.gates.map((g) => g.checkType);
    expect(checkTypes).toContain('spec-review');
    expect(checkTypes).toContain('quality-review');
  });

  it('should have no task templates', () => {
    expect(subagentExecutionPlaybook.taskTemplates).toHaveLength(0);
  });
});

describe('systematicDebuggingPlaybook', () => {
  it('should match FIX intent only', () => {
    expect(systematicDebuggingPlaybook.matchIntents).toEqual(['FIX']);
  });

  it('should have pre-execution and completion gates', () => {
    expect(systematicDebuggingPlaybook.gates).toHaveLength(2);
    const phases = systematicDebuggingPlaybook.gates.map((g) => g.phase);
    expect(phases).toContain('pre-execution');
    expect(phases).toContain('completion');
  });

  it('should have root-cause check gate', () => {
    const rootCause = systematicDebuggingPlaybook.gates.find((g) => g.checkType === 'root-cause');
    expect(rootCause).toBeDefined();
    expect(rootCause!.phase).toBe('pre-execution');
  });

  it('should have regression-test completion gate', () => {
    const regression = systematicDebuggingPlaybook.gates.find(
      (g) => g.checkType === 'regression-test',
    );
    expect(regression).toBeDefined();
    expect(regression!.phase).toBe('completion');
  });

  it('should have a test task template ordered before implementation', () => {
    expect(systematicDebuggingPlaybook.taskTemplates).toHaveLength(1);
    expect(systematicDebuggingPlaybook.taskTemplates[0].taskType).toBe('test');
    expect(systematicDebuggingPlaybook.taskTemplates[0].order).toBe('before-implementation');
  });

  it('should inject search_intelligent tool', () => {
    expect(systematicDebuggingPlaybook.toolInjections).toContain('search_intelligent');
  });

  it('should include bug-related keywords', () => {
    expect(systematicDebuggingPlaybook.matchKeywords).toContain('bug');
    expect(systematicDebuggingPlaybook.matchKeywords).toContain('broken');
    expect(systematicDebuggingPlaybook.matchKeywords).toContain('fix');
  });
});

describe('tddPlaybook', () => {
  it('should match BUILD and FIX intents', () => {
    expect(tddPlaybook.matchIntents).toContain('BUILD');
    expect(tddPlaybook.matchIntents).toContain('FIX');
  });

  it('should have post-task and completion gates', () => {
    expect(tddPlaybook.gates).toHaveLength(2);
    const phases = tddPlaybook.gates.map((g) => g.phase);
    expect(phases).toContain('post-task');
    expect(phases).toContain('completion');
  });

  it('should have tdd-red and tdd-green check types', () => {
    const checkTypes = tddPlaybook.gates.map((g) => g.checkType);
    expect(checkTypes).toContain('tdd-red');
    expect(checkTypes).toContain('tdd-green');
  });

  it('should have a test task template ordered before implementation', () => {
    expect(tddPlaybook.taskTemplates).toHaveLength(1);
    expect(tddPlaybook.taskTemplates[0].taskType).toBe('test');
    expect(tddPlaybook.taskTemplates[0].order).toBe('before-implementation');
  });

  it('should have {objective} placeholder in task title template', () => {
    expect(tddPlaybook.taskTemplates[0].titleTemplate).toContain('{objective}');
  });

  it('should inject search_intelligent tool', () => {
    expect(tddPlaybook.toolInjections).toContain('search_intelligent');
  });
});

describe('verificationPlaybook', () => {
  it('should match BUILD, FIX, IMPROVE, and DELIVER intents', () => {
    expect(verificationPlaybook.matchIntents).toContain('BUILD');
    expect(verificationPlaybook.matchIntents).toContain('FIX');
    expect(verificationPlaybook.matchIntents).toContain('IMPROVE');
    expect(verificationPlaybook.matchIntents).toContain('DELIVER');
  });

  it('should have a single completion gate', () => {
    expect(verificationPlaybook.gates).toHaveLength(1);
    expect(verificationPlaybook.gates[0].phase).toBe('completion');
    expect(verificationPlaybook.gates[0].checkType).toBe('verification-evidence');
  });

  it('should have a verification task template ordered after implementation', () => {
    expect(verificationPlaybook.taskTemplates).toHaveLength(1);
    expect(verificationPlaybook.taskTemplates[0].taskType).toBe('verification');
    expect(verificationPlaybook.taskTemplates[0].order).toBe('after-implementation');
  });

  it('should have {objective} placeholder in task title template', () => {
    expect(verificationPlaybook.taskTemplates[0].titleTemplate).toContain('{objective}');
  });

  it('should include completion-related keywords', () => {
    expect(verificationPlaybook.matchKeywords).toContain('done');
    expect(verificationPlaybook.matchKeywords).toContain('complete');
    expect(verificationPlaybook.matchKeywords).toContain('ship');
  });

  it('should have no brainstormSections', () => {
    expect(verificationPlaybook.brainstormSections).toBeUndefined();
  });
});
