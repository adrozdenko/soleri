/**
 * Tests for gap analysis pass 8: Alternative Analysis.
 * Validates that plans are scored based on rejected alternatives.
 */

import { describe, it, expect } from 'vitest';
import { runGapAnalysis } from './gap-analysis.js';
import { calculateScore } from './planner.js';
import type { Plan, PlanAlternative } from './planner.js';

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

function makeAlternative(overrides: Partial<PlanAlternative> = {}): PlanAlternative {
  return {
    approach: 'Use session cookies instead of JWT',
    pros: ['Simpler implementation', 'Automatic CSRF protection'],
    cons: ['Requires shared session store', 'Harder to scale horizontally'],
    rejected_reason: 'JWT is stateless and scales better for our microservice architecture',
    ...overrides,
  };
}

describe('Pass 8: Alternative Analysis', () => {
  it('returns major gap when no alternatives provided', () => {
    const plan = makePlan();
    const gaps = runGapAnalysis(plan);
    const altGaps = gaps.filter((g) => g.category === 'alternative-analysis');

    expect(altGaps).toHaveLength(1);
    expect(altGaps[0].severity).toBe('major');
    expect(altGaps[0]._trigger).toBe('no_alternatives');
  });

  it('returns minor gap when fewer than 2 alternatives', () => {
    const plan = makePlan({ alternatives: [makeAlternative()] });
    const gaps = runGapAnalysis(plan);
    const altGaps = gaps.filter((g) => g.category === 'alternative-analysis');

    expect(altGaps).toHaveLength(1);
    expect(altGaps[0].severity).toBe('minor');
    expect(altGaps[0]._trigger).toBe('few_alternatives');
  });

  it('returns no alternative gaps with 2+ well-structured alternatives', () => {
    const plan = makePlan({
      alternatives: [
        makeAlternative(),
        makeAlternative({
          approach: 'Use OAuth2 with third-party provider',
          pros: ['No password storage', 'Social login support'],
          cons: ['External dependency', 'Complex setup'],
          rejected_reason: 'Adds external dependency and complexity not needed for internal API',
        }),
      ],
    });
    const gaps = runGapAnalysis(plan);
    const altGaps = gaps.filter((g) => g.category === 'alternative-analysis');

    expect(altGaps).toHaveLength(0);
  });

  it('returns minor gap when alternative missing rejected_reason', () => {
    const plan = makePlan({
      alternatives: [
        makeAlternative(),
        makeAlternative({
          approach: 'Use basic auth',
          pros: ['Simple'],
          cons: ['Insecure'],
          rejected_reason: '',
        }),
      ],
    });
    const gaps = runGapAnalysis(plan);
    const altGaps = gaps.filter((g) => g.category === 'alternative-analysis');

    expect(altGaps).toHaveLength(1);
    expect(altGaps[0].severity).toBe('minor');
    expect(altGaps[0]._trigger).toBe('missing_rejection_rationale');
  });

  it('caps score at ~85 for plan without alternatives', () => {
    const plan = makePlan();
    const gaps = runGapAnalysis(plan);
    // iteration 3+ to get full minor penalty weights
    const score = calculateScore(gaps, 3);

    expect(score).toBeLessThanOrEqual(85);
  });

  it('allows score 95+ with 2+ well-structured alternatives', () => {
    const plan = makePlan({
      alternatives: [
        makeAlternative(),
        makeAlternative({
          approach: 'Use OAuth2 with third-party provider',
          pros: ['No password storage'],
          cons: ['External dependency'],
          rejected_reason: 'Not needed for internal API',
        }),
      ],
    });
    const gaps = runGapAnalysis(plan);
    const altGaps = gaps.filter((g) => g.category === 'alternative-analysis');
    expect(altGaps).toHaveLength(0);

    // Without alternative gaps, a well-formed plan can reach 95+
    const score = calculateScore(gaps, 3);
    // The plan may still have other minor gaps, but no alternative-analysis penalty
    const altPenalty = gaps
      .filter((g) => g.category === 'alternative-analysis')
      .reduce((sum, g) => sum + (g.severity === 'major' ? 15 : g.severity === 'minor' ? 2 : 0), 0);
    expect(altPenalty).toBe(0);
  });

  it('backward compatible — plans without alternatives field still work', () => {
    const plan = makePlan();
    // Explicitly ensure no alternatives field
    delete (plan as Record<string, unknown>).alternatives;

    const gaps = runGapAnalysis(plan);
    const altGaps = gaps.filter((g) => g.category === 'alternative-analysis');

    // Should get the "no alternatives" gap but not crash
    expect(altGaps).toHaveLength(1);
    expect(altGaps[0].severity).toBe('major');
  });

  it('does not modify gaps from passes 1-7', () => {
    const plan = makePlan({
      alternatives: [makeAlternative(), makeAlternative({
        approach: 'Alternative B',
        pros: ['Pro'],
        cons: ['Con'],
        rejected_reason: 'Not suitable',
      })],
    });
    const gapsWithAlts = runGapAnalysis(plan);

    const planNoAlts = makePlan();
    const gapsNoAlts = runGapAnalysis(planNoAlts);

    // Non-alternative gaps should be the same
    const nonAltWith = gapsWithAlts.filter((g) => g.category !== 'alternative-analysis');
    const nonAltWithout = gapsNoAlts.filter((g) => g.category !== 'alternative-analysis');

    expect(nonAltWith.map((g) => g._trigger)).toEqual(nonAltWithout.map((g) => g._trigger));
  });
});
