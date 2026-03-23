/**
 * Tests for gap-patterns.ts — helpers, constants, and passes 1-4.
 */

import { describe, it, expect } from 'vitest';
import type { Plan } from './planner.js';
import {
  gap,
  taskText,
  decisionText,
  decisionsText,
  containsAny,
  analyzeStructure,
  analyzeCompleteness,
  analyzeFeasibility,
  analyzeRisk,
  METRIC_PATTERNS,
  EXCLUSION_KEYWORDS,
  OVERLY_BROAD_PATTERNS,
  DEPENDENCY_KEYWORDS,
  BREAKING_CHANGE_KEYWORDS,
  MITIGATION_KEYWORDS,
  VERIFICATION_KEYWORDS,
} from './gap-patterns.js';

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'plan-test',
    objective: 'Implement user authentication with JWT tokens and session management',
    scope: 'Auth module, middleware, and user service. Does not include OAuth providers.',
    status: 'draft',
    decisions: [
      { decision: 'Use JWT for stateless auth', rationale: 'Because it scales horizontally without shared session store' },
    ],
    tasks: [
      { id: 'task-1', title: 'Add JWT signing', description: 'Implement JWT sign/verify using built-in crypto module', status: 'pending', updatedAt: Date.now() },
      { id: 'task-2', title: 'Add auth middleware', description: 'Create Express middleware that validates JWT from Authorization header', status: 'pending', updatedAt: Date.now() },
      { id: 'task-3', title: 'Add login endpoint', description: 'POST /auth/login returns JWT after verifying credentials', status: 'pending', updatedAt: Date.now() },
      { id: 'task-4', title: 'Add test coverage', description: 'Test JWT signing, middleware rejection, and login flow end-to-end', status: 'pending', updatedAt: Date.now() },
    ],
    checks: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('Helper functions', () => {
  describe('gap()', () => {
    it('creates a PlanGap with auto-generated id', () => {
      const result = gap('critical', 'structure', 'desc', 'rec');
      expect(result.id).toMatch(/^gap_/);
      expect(result.severity).toBe('critical');
      expect(result.category).toBe('structure');
      expect(result.description).toBe('desc');
      expect(result.recommendation).toBe('rec');
    });

    it('includes location when provided', () => {
      const result = gap('minor', 'clarity', 'd', 'r', 'objective');
      expect(result.location).toBe('objective');
    });

    it('excludes location when undefined', () => {
      const result = gap('minor', 'clarity', 'd', 'r');
      expect(result).not.toHaveProperty('location');
    });

    it('includes _trigger when provided', () => {
      const result = gap('minor', 'clarity', 'd', 'r', undefined, 'test_trigger');
      expect(result._trigger).toBe('test_trigger');
    });

    it('excludes _trigger when undefined', () => {
      const result = gap('minor', 'clarity', 'd', 'r');
      expect(result).not.toHaveProperty('_trigger');
    });
  });

  describe('taskText()', () => {
    it('combines task titles and descriptions', () => {
      const plan = makePlan();
      const text = taskText(plan);
      expect(text).toContain('Add JWT signing');
      expect(text).toContain('Implement JWT sign/verify');
    });

    it('returns empty string for plan with no tasks', () => {
      const plan = makePlan({ tasks: [] });
      expect(taskText(plan)).toBe('');
    });
  });

  describe('decisionText()', () => {
    it('extracts text from string decision', () => {
      expect(decisionText('Use JWT')).toBe('Use JWT');
    });

    it('extracts text from structured decision', () => {
      const result = decisionText({ decision: 'Use JWT', rationale: 'scales well' });
      expect(result).toBe('Use JWT scales well');
    });
  });

  describe('decisionsText()', () => {
    it('combines all decisions', () => {
      const plan = makePlan();
      const text = decisionsText(plan);
      expect(text).toContain('Use JWT for stateless auth');
      expect(text).toContain('scales horizontally');
    });
  });

  describe('containsAny()', () => {
    it('returns true when text contains a pattern', () => {
      expect(containsAny('rewrite everything from scratch', ['from scratch'])).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(containsAny('FROM SCRATCH', ['from scratch'])).toBe(true);
    });

    it('returns false when no patterns match', () => {
      expect(containsAny('simple change', ['everything', 'rewrite'])).toBe(false);
    });

    it('returns false for empty text', () => {
      expect(containsAny('', ['test'])).toBe(false);
    });

    it('returns false for empty patterns', () => {
      expect(containsAny('hello world', [])).toBe(false);
    });
  });
});

describe('Pattern constants', () => {
  it('METRIC_PATTERNS matches numbers', () => {
    expect(METRIC_PATTERNS.some((p) => p.test('reduce latency by 50%'))).toBe(true);
  });

  it('EXCLUSION_KEYWORDS includes common exclusion words', () => {
    expect(EXCLUSION_KEYWORDS).toContain('exclude');
    expect(EXCLUSION_KEYWORDS).toContain('not');
  });

  it('OVERLY_BROAD_PATTERNS includes dangerous scope terms', () => {
    expect(OVERLY_BROAD_PATTERNS).toContain('complete rewrite');
  });

  it('DEPENDENCY_KEYWORDS includes ordering terms', () => {
    expect(DEPENDENCY_KEYWORDS).toContain('depends');
    expect(DEPENDENCY_KEYWORDS).toContain('prerequisite');
  });

  it('BREAKING_CHANGE_KEYWORDS includes migration terms', () => {
    expect(BREAKING_CHANGE_KEYWORDS).toContain('breaking change');
    expect(BREAKING_CHANGE_KEYWORDS).toContain('database migration');
  });

  it('MITIGATION_KEYWORDS includes safety terms', () => {
    expect(MITIGATION_KEYWORDS).toContain('rollback');
    expect(MITIGATION_KEYWORDS).toContain('feature flag');
  });

  it('VERIFICATION_KEYWORDS includes testing terms', () => {
    expect(VERIFICATION_KEYWORDS).toContain('test');
    expect(VERIFICATION_KEYWORDS).toContain('coverage');
  });
});

describe('Pass 1: Structure', () => {
  it('returns no gaps for a well-structured plan', () => {
    const gaps = analyzeStructure(makePlan());
    expect(gaps).toHaveLength(0);
  });

  it('returns critical gap for missing objective', () => {
    const gaps = analyzeStructure(makePlan({ objective: '' }));
    expect(gaps.some((g) => g._trigger === 'missing_or_short_objective')).toBe(true);
    expect(gaps.find((g) => g._trigger === 'missing_or_short_objective')?.severity).toBe('critical');
  });

  it('returns critical gap for short objective', () => {
    const gaps = analyzeStructure(makePlan({ objective: 'Fix' }));
    expect(gaps.some((g) => g._trigger === 'missing_or_short_objective')).toBe(true);
  });

  it('returns critical gap for missing scope', () => {
    const gaps = analyzeStructure(makePlan({ scope: '' }));
    expect(gaps.some((g) => g._trigger === 'missing_or_short_scope')).toBe(true);
  });

  it('returns critical gap for no tasks', () => {
    const gaps = analyzeStructure(makePlan({ tasks: [] }));
    expect(gaps.some((g) => g._trigger === 'no_tasks')).toBe(true);
  });

  it('returns multiple gaps for completely empty plan', () => {
    const gaps = analyzeStructure(makePlan({ objective: '', scope: '', tasks: [] }));
    expect(gaps.length).toBe(3);
    expect(gaps.every((g) => g.severity === 'critical')).toBe(true);
  });
});

describe('Pass 2: Completeness', () => {
  it('flags objective without measurable metrics', () => {
    const plan = makePlan({ objective: 'Improve the login experience for all users globally' });
    const gaps = analyzeCompleteness(plan);
    expect(gaps.some((g) => g._trigger === 'no_metrics_in_objective')).toBe(true);
  });

  it('does not flag objective with numbers', () => {
    const plan = makePlan({ objective: 'Reduce login latency to under 200ms for 95% of users' });
    const gaps = analyzeCompleteness(plan);
    expect(gaps.some((g) => g._trigger === 'no_metrics_in_objective')).toBe(false);
  });

  it('flags short decisions', () => {
    const plan = makePlan({ decisions: [{ decision: 'JWT', rationale: '' }] });
    const gaps = analyzeCompleteness(plan);
    expect(gaps.some((g) => g._trigger === 'short_decision')).toBe(true);
  });

  it('flags scope without exclusions', () => {
    const plan = makePlan({ scope: 'Auth module and middleware for the API layer' });
    const gaps = analyzeCompleteness(plan);
    expect(gaps.some((g) => g._trigger === 'no_exclusions_in_scope')).toBe(true);
  });

  it('does not flag scope with exclusion keywords', () => {
    const plan = makePlan({ scope: 'Auth module. Does not include OAuth providers.' });
    const gaps = analyzeCompleteness(plan);
    expect(gaps.some((g) => g._trigger === 'no_exclusions_in_scope')).toBe(false);
  });
});

describe('Pass 3: Feasibility', () => {
  it('flags overly broad scope', () => {
    const plan = makePlan({ scope: 'Complete rewrite of the entire codebase' });
    const gaps = analyzeFeasibility(plan);
    expect(gaps.some((g) => g._trigger === 'overly_broad_scope')).toBe(true);
  });

  it('does not flag reasonable scope', () => {
    const plan = makePlan();
    const gaps = analyzeFeasibility(plan);
    expect(gaps.some((g) => g._trigger === 'overly_broad_scope')).toBe(false);
  });

  it('flags missing dependencies for 4+ tasks', () => {
    const plan = makePlan();
    // Default plan has 4 tasks, no dependency keywords
    const gaps = analyzeFeasibility(plan);
    expect(gaps.some((g) => g._trigger === 'no_dependency_awareness')).toBe(true);
  });

  it('does not flag when tasks have dependsOn', () => {
    const plan = makePlan({
      tasks: [
        { id: 't1', title: 'Setup', description: 'Setup project', status: 'pending', updatedAt: Date.now() },
        { id: 't2', title: 'Build', description: 'Build feature', status: 'pending', dependsOn: ['t1'], updatedAt: Date.now() },
        { id: 't3', title: 'Test', description: 'Test feature', status: 'pending', dependsOn: ['t2'], updatedAt: Date.now() },
        { id: 't4', title: 'Deploy', description: 'Deploy to prod', status: 'pending', dependsOn: ['t3'], updatedAt: Date.now() },
      ],
    });
    const gaps = analyzeFeasibility(plan);
    expect(gaps.some((g) => g._trigger === 'no_dependency_awareness')).toBe(false);
  });

  it('does not flag when 3 or fewer tasks', () => {
    const plan = makePlan({
      tasks: [
        { id: 't1', title: 'Task 1', description: 'Do something', status: 'pending', updatedAt: Date.now() },
        { id: 't2', title: 'Task 2', description: 'Do another thing', status: 'pending', updatedAt: Date.now() },
      ],
    });
    const gaps = analyzeFeasibility(plan);
    expect(gaps.some((g) => g._trigger === 'no_dependency_awareness')).toBe(false);
  });
});

describe('Pass 4: Risk', () => {
  it('flags breaking changes without mitigation', () => {
    const plan = makePlan({
      objective: 'Database migration to new schema with breaking changes',
      scope: 'All tables and models. Does not include frontend.',
    });
    const gaps = analyzeRisk(plan);
    expect(gaps.some((g) => g._trigger === 'breaking_without_mitigation')).toBe(true);
  });

  it('does not flag when mitigation is mentioned', () => {
    const plan = makePlan({
      objective: 'Database migration with breaking changes and rollback plan',
      scope: 'All tables. Not including frontend.',
    });
    const gaps = analyzeRisk(plan);
    expect(gaps.some((g) => g._trigger === 'breaking_without_mitigation')).toBe(false);
  });

  it('flags missing verification', () => {
    const plan = makePlan({
      objective: 'Refactor the authentication module for better performance',
      scope: 'Auth module only. Not including user service.',
      decisions: [{ decision: 'Use new pattern', rationale: 'Because it is cleaner code' }],
      tasks: [
        { id: 't1', title: 'Refactor auth', description: 'Change the auth flow implementation', status: 'pending', updatedAt: Date.now() },
      ],
    });
    const gaps = analyzeRisk(plan);
    expect(gaps.some((g) => g._trigger === 'no_verification_mentioned')).toBe(true);
  });

  it('does not flag when testing is mentioned', () => {
    const plan = makePlan(); // default plan has "test" in task descriptions
    const gaps = analyzeRisk(plan);
    expect(gaps.some((g) => g._trigger === 'no_verification_mentioned')).toBe(false);
  });
});
