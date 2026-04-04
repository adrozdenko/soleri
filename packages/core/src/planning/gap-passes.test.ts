/**
 * Tests for gap-passes.ts — passes 5-8 (clarity, semantic quality,
 * knowledge depth, alternative analysis).
 */

import { describe, it, expect } from 'vitest';
import type { Plan, PlanAlternative } from './planner.js';
import {
  analyzeClarity,
  analyzeSemanticQuality,
  analyzeKnowledgeDepth,
  analyzeAlternatives,
} from './gap-passes.js';

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'plan-test',
    objective: 'Implement user authentication with JWT tokens and session management',
    scope: 'Auth module, middleware, and user service. Does not include OAuth providers.',
    status: 'draft',
    decisions: [
      {
        decision: 'Use JWT for stateless auth',
        rationale: 'Because it scales horizontally without shared session store',
      },
    ],
    tasks: [
      {
        id: 'task-1',
        title: 'Add JWT signing',
        description: 'Implement JWT sign/verify using built-in crypto module',
        status: 'pending',
        updatedAt: Date.now(),
      },
      {
        id: 'task-2',
        title: 'Add auth middleware',
        description: 'Create Express middleware that validates JWT from Authorization header',
        status: 'pending',
        updatedAt: Date.now(),
      },
      {
        id: 'task-3',
        title: 'Add login endpoint',
        description: 'POST /auth/login returns JWT after verifying credentials',
        status: 'pending',
        updatedAt: Date.now(),
      },
      {
        id: 'task-4',
        title: 'Add test coverage',
        description: 'Test JWT signing, middleware rejection, and login flow end-to-end',
        status: 'pending',
        updatedAt: Date.now(),
      },
    ],
    checks: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeAlternative(overrides: Partial<PlanAlternative> = {}): PlanAlternative {
  return {
    approach: 'Use session cookies instead of JWT',
    pros: ['Simpler implementation'],
    cons: ['Requires shared session store'],
    rejected_reason: 'JWT is stateless and scales better for our architecture',
    ...overrides,
  };
}

describe('Pass 5: Clarity', () => {
  it('flags ambiguous language in objective', () => {
    const plan = makePlan({
      objective: 'Maybe implement some authentication features probably with JWT',
      scope: 'Auth module. Not including OAuth.',
    });
    const gaps = analyzeClarity(plan);
    expect(gaps.some((g) => g._trigger?.startsWith('ambiguous_words:'))).toBe(true);
  });

  it('does not flag clear language', () => {
    const plan = makePlan();
    const gaps = analyzeClarity(plan);
    expect(gaps.some((g) => g._trigger?.startsWith('ambiguous_words:'))).toBe(false);
  });

  it('flags tasks with very short descriptions', () => {
    const plan = makePlan({
      tasks: [
        {
          id: 't1',
          title: 'Do thing',
          description: 'Short',
          status: 'pending',
          updatedAt: Date.now(),
        },
        { id: 't2', title: 'Do other', description: '', status: 'pending', updatedAt: Date.now() },
      ],
    });
    const gaps = analyzeClarity(plan);
    expect(gaps.some((g) => g._trigger === 'short_task_descriptions')).toBe(true);
  });

  it('does not flag tasks with adequate descriptions', () => {
    const plan = makePlan();
    const gaps = analyzeClarity(plan);
    expect(gaps.some((g) => g._trigger === 'short_task_descriptions')).toBe(false);
  });

  it('limits ambiguous words shown to 5', () => {
    const plan = makePlan({
      objective:
        'Maybe perhaps we might could possibly somehow probably do various several things soon with some easy simple appropriate changes etc',
      scope: 'Everything. Not limited.',
    });
    const gaps = analyzeClarity(plan);
    const ambiguousGap = gaps.find((g) => g._trigger?.startsWith('ambiguous_words:'));
    expect(ambiguousGap).toBeDefined();
    // Description should mention (+N more) when more than 5 words found
    if (ambiguousGap) {
      expect(ambiguousGap.description).toContain('+');
    }
  });
});

describe('Pass 6: Semantic Quality', () => {
  it('flags generic objective', () => {
    const plan = makePlan({ objective: 'Create something' });
    const gaps = analyzeSemanticQuality(plan);
    expect(gaps.some((g) => g._trigger === 'generic_objective')).toBe(true);
  });

  it('flags short objective (< 5 words)', () => {
    const plan = makePlan({ objective: 'Fix the auth bug' });
    const gaps = analyzeSemanticQuality(plan);
    expect(gaps.some((g) => g._trigger === 'generic_objective')).toBe(true);
  });

  it('does not flag detailed objective', () => {
    const plan = makePlan();
    const gaps = analyzeSemanticQuality(plan);
    expect(gaps.some((g) => g._trigger === 'generic_objective')).toBe(false);
  });

  it('flags too few tasks', () => {
    const plan = makePlan({
      tasks: [
        {
          id: 't1',
          title: 'Single task',
          description: 'Do everything in one task',
          status: 'pending',
          updatedAt: Date.now(),
        },
      ],
    });
    const gaps = analyzeSemanticQuality(plan);
    expect(gaps.some((g) => g._trigger === 'too_few_tasks')).toBe(true);
  });

  it('flags too many tasks (> 20)', () => {
    const tasks = Array.from({ length: 21 }, (_, i) => ({
      id: `t${i}`,
      title: `Task ${i}`,
      description: `Description for task ${i} with enough detail`,
      status: 'pending' as const,
      updatedAt: Date.now(),
    }));
    const plan = makePlan({ tasks });
    const gaps = analyzeSemanticQuality(plan);
    expect(gaps.some((g) => g._trigger === 'too_many_tasks')).toBe(true);
  });

  it('flags shallow rationale in decisions', () => {
    const plan = makePlan({
      decisions: [{ decision: 'This approach is better', rationale: 'It is good and nice' }],
    });
    const gaps = analyzeSemanticQuality(plan);
    expect(gaps.some((g) => g._trigger === 'shallow_rationale')).toBe(true);
  });

  it('does not flag decisions with proper rationale', () => {
    const plan = makePlan({
      decisions: [
        { decision: 'Use JWT', rationale: 'This is better because it scales horizontally' },
      ],
    });
    const gaps = analyzeSemanticQuality(plan);
    expect(gaps.some((g) => g._trigger === 'shallow_rationale')).toBe(false);
  });

  it('flags duplicate task titles', () => {
    const plan = makePlan({
      tasks: [
        {
          id: 't1',
          title: 'Implement feature',
          description: 'First implementation',
          status: 'pending',
          updatedAt: Date.now(),
        },
        {
          id: 't2',
          title: 'Implement feature',
          description: 'Duplicate title',
          status: 'pending',
          updatedAt: Date.now(),
        },
        {
          id: 't3',
          title: 'Test feature',
          description: 'Test the feature with assertions',
          status: 'pending',
          updatedAt: Date.now(),
        },
      ],
    });
    const gaps = analyzeSemanticQuality(plan);
    expect(gaps.some((g) => g._trigger === 'duplicate_task_titles')).toBe(true);
  });

  it('flags no decisions for multi-task plans', () => {
    const plan = makePlan({ decisions: [] });
    const gaps = analyzeSemanticQuality(plan);
    expect(gaps.some((g) => g._trigger === 'no_decisions')).toBe(true);
  });

  it('does not flag no decisions for < 3 tasks', () => {
    const plan = makePlan({
      decisions: [],
      tasks: [
        {
          id: 't1',
          title: 'Single task',
          description: 'Do the thing',
          status: 'pending',
          updatedAt: Date.now(),
        },
      ],
    });
    const gaps = analyzeSemanticQuality(plan);
    expect(gaps.some((g) => g._trigger === 'no_decisions')).toBe(false);
  });
});

describe('Pass 7: Knowledge Depth', () => {
  it('awards bonus for 5+ vault pattern references', () => {
    const plan = makePlan({
      tasks: [
        {
          id: 't1',
          title: 'Apply patterns',
          description: 'Use zod-form-validation and react-query-caching and error-boundary-pattern',
          status: 'pending',
          updatedAt: Date.now(),
        },
        {
          id: 't2',
          title: 'More patterns',
          description:
            'Use accessibility-focus-ring and semantic-token-usage and component-variant-pattern',
          status: 'pending',
          updatedAt: Date.now(),
        },
        {
          id: 't3',
          title: 'Testing',
          description: 'Test with vitest-snapshot-testing approach',
          status: 'pending',
          updatedAt: Date.now(),
        },
      ],
    });
    const gaps = analyzeKnowledgeDepth(plan);
    expect(gaps.some((g) => g._trigger === 'vault_pattern_refs_high')).toBe(true);
    expect(gaps.some((g) => g._trigger === 'vault_pattern_density')).toBe(true);
  });

  it('awards bonus for 2-4 vault pattern references', () => {
    const plan = makePlan({
      tasks: [
        {
          id: 't1',
          title: 'Apply patterns',
          description: 'Use zod-form-validation and react-query-caching',
          status: 'pending',
          updatedAt: Date.now(),
        },
        {
          id: 't2',
          title: 'Build',
          description: 'Build the component',
          status: 'pending',
          updatedAt: Date.now(),
        },
        {
          id: 't3',
          title: 'Test',
          description: 'Run the test suite',
          status: 'pending',
          updatedAt: Date.now(),
        },
      ],
    });
    const gaps = analyzeKnowledgeDepth(plan);
    expect(gaps.some((g) => g._trigger === 'vault_pattern_refs_medium')).toBe(true);
  });

  it('awards bonus for high acceptance criteria coverage', () => {
    const plan = makePlan({
      tasks: [
        {
          id: 't1',
          title: 'T1',
          description: 'Desc 1',
          status: 'pending',
          updatedAt: Date.now(),
          acceptanceCriteria: ['Criteria A'],
        },
        {
          id: 't2',
          title: 'T2',
          description: 'Desc 2',
          status: 'pending',
          updatedAt: Date.now(),
          acceptanceCriteria: ['Criteria B'],
        },
        {
          id: 't3',
          title: 'T3',
          description: 'Desc 3',
          status: 'pending',
          updatedAt: Date.now(),
          acceptanceCriteria: ['Criteria C'],
        },
        {
          id: 't4',
          title: 'T4',
          description: 'Desc 4',
          status: 'pending',
          updatedAt: Date.now(),
          acceptanceCriteria: ['Criteria D'],
        },
        {
          id: 't5',
          title: 'T5',
          description: 'Desc 5',
          status: 'pending',
          updatedAt: Date.now(),
          acceptanceCriteria: ['Criteria E'],
        },
      ],
    });
    const gaps = analyzeKnowledgeDepth(plan);
    expect(gaps.some((g) => g._trigger === 'high_acceptance_criteria')).toBe(true);
  });

  it('does not award acceptance criteria bonus below 80% threshold', () => {
    const plan = makePlan({
      tasks: [
        {
          id: 't1',
          title: 'T1',
          description: 'Desc',
          status: 'pending',
          updatedAt: Date.now(),
          acceptanceCriteria: ['A'],
        },
        { id: 't2', title: 'T2', description: 'Desc', status: 'pending', updatedAt: Date.now() },
        { id: 't3', title: 'T3', description: 'Desc', status: 'pending', updatedAt: Date.now() },
      ],
    });
    const gaps = analyzeKnowledgeDepth(plan);
    expect(gaps.some((g) => g._trigger === 'high_acceptance_criteria')).toBe(false);
  });

  it('awards bonus for rich task descriptions (avg >= 80 chars)', () => {
    const longDesc =
      'This is a very detailed task description that provides specific technical context about what needs to be implemented.';
    const plan = makePlan({
      tasks: [
        { id: 't1', title: 'T1', description: longDesc, status: 'pending', updatedAt: Date.now() },
        { id: 't2', title: 'T2', description: longDesc, status: 'pending', updatedAt: Date.now() },
        { id: 't3', title: 'T3', description: longDesc, status: 'pending', updatedAt: Date.now() },
      ],
    });
    const gaps = analyzeKnowledgeDepth(plan);
    expect(gaps.some((g) => g._trigger === 'rich_task_descriptions')).toBe(true);
  });

  it('awards bonus for domain knowledge indicators', () => {
    const plan = makePlan({
      tasks: [
        {
          id: 't1',
          title: 'A11y audit',
          description: 'Check WCAG 2.1 compliance and aria-label usage with vault patterns',
          status: 'pending',
          updatedAt: Date.now(),
        },
        {
          id: 't2',
          title: 'Contrast',
          description: '4.5:1 contrast ratio for all text, anti-pattern detection',
          status: 'pending',
          updatedAt: Date.now(),
        },
        {
          id: 't3',
          title: 'Touch',
          description: '44px touch target minimum, acceptance criteria for all buttons',
          status: 'pending',
          updatedAt: Date.now(),
        },
      ],
    });
    const gaps = analyzeKnowledgeDepth(plan);
    expect(gaps.some((g) => g._trigger === 'domain_knowledge_indicators')).toBe(true);
  });

  it('returns no bonuses for basic plan', () => {
    const plan = makePlan({
      tasks: [
        {
          id: 't1',
          title: 'Do thing',
          description: 'Do it',
          status: 'pending',
          updatedAt: Date.now(),
        },
      ],
    });
    const gaps = analyzeKnowledgeDepth(plan);
    const bonuses = gaps.filter((g) => g.severity === 'bonus');
    expect(bonuses).toHaveLength(0);
  });

  it('excludes common hyphenated words from pattern refs', () => {
    const plan = makePlan({
      tasks: [
        {
          id: 't1',
          title: 'T1',
          description: 'Use front-end and back-end and real-time and client-side and server-side',
          status: 'pending',
          updatedAt: Date.now(),
        },
      ],
    });
    const gaps = analyzeKnowledgeDepth(plan);
    expect(gaps.some((g) => g._trigger === 'vault_pattern_refs_medium')).toBe(false);
    expect(gaps.some((g) => g._trigger === 'vault_pattern_refs_high')).toBe(false);
  });
});

describe('Pass 8: Alternative Analysis', () => {
  it('flags no alternatives', () => {
    const plan = makePlan();
    const gaps = analyzeAlternatives(plan);
    expect(gaps.some((g) => g._trigger === 'no_alternatives')).toBe(true);
    expect(gaps[0].severity).toBe('major');
  });

  it('flags fewer than 2 alternatives', () => {
    const plan = makePlan({ alternatives: [makeAlternative()] });
    const gaps = analyzeAlternatives(plan);
    expect(gaps.some((g) => g._trigger === 'few_alternatives')).toBe(true);
  });

  it('returns no gaps for 2+ well-formed alternatives', () => {
    const plan = makePlan({
      alternatives: [
        makeAlternative(),
        makeAlternative({ approach: 'Use OAuth2', rejected_reason: 'Too complex' }),
      ],
    });
    const gaps = analyzeAlternatives(plan);
    expect(gaps).toHaveLength(0);
  });

  it('flags missing rejection rationale', () => {
    const plan = makePlan({
      alternatives: [
        makeAlternative(),
        makeAlternative({ approach: 'Basic auth', rejected_reason: '' }),
      ],
    });
    const gaps = analyzeAlternatives(plan);
    expect(gaps.some((g) => g._trigger === 'missing_rejection_rationale')).toBe(true);
  });

  it('handles undefined alternatives', () => {
    const plan = makePlan();
    delete (plan as Record<string, unknown>).alternatives;
    const gaps = analyzeAlternatives(plan);
    expect(gaps.some((g) => g._trigger === 'no_alternatives')).toBe(true);
  });

  it('returns early after no-alternatives gap', () => {
    const plan = makePlan();
    const gaps = analyzeAlternatives(plan);
    // Should only have the one "no alternatives" gap, not also "few alternatives"
    expect(gaps).toHaveLength(1);
  });
});
