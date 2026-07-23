/**
 * Plan grading operations — 5 ops for iterative plan quality scoring.
 * Uses 7-pass gap analysis with severity-weighted scoring + substance bonuses.
 *
 * Ops: plan_grade, plan_check_history, plan_latest_check,
 *      plan_meets_grade, plan_auto_improve.
 */

import { z } from 'zod';
import type { OpDefinition } from '../../../facades/types.js';
import type { AgentRuntime } from '../../types.js';
import type { GapAnalysisOptions } from '../../../planning/gap-analysis.js';
import { loadVaultConstraints } from '../../../planning/vault-constraints.js';
import { PlanGradeRejectionError } from '../../../planning/planner.js';

const planGradeSchema = z.enum(['A+', 'A', 'B', 'C', 'D', 'F']);

/**
 * Create the 5 plan grading operations for an agent runtime.
 */
export function createGradingOps(runtime: AgentRuntime): OpDefinition[] {
  const { planner } = runtime;

  return [
    {
      name: 'plan_grade',
      description:
        'Grade a plan using 8-pass gap analysis — severity-weighted scoring (critical=30, major=15, minor=2) with substance bonuses for vault-informed depth. Includes alternative analysis (pass 8) — plans without alternatives cap at ~85. Returns grade, score, gaps with recommendations, and iteration number.',
      auth: 'read',
      schema: z.object({
        planId: z.string().describe('The plan ID to grade.'),
      }),
      handler: async (params) => {
        const planId = params.planId as string;

        // Fetch vault constraints for grading (graceful degradation)
        const runtimeOptions: GapAnalysisOptions = {};
        if (runtime.vault) {
          const { constraints, compositionRules } = loadVaultConstraints(runtime.vault);
          if (constraints.length > 0) runtimeOptions.constraints = constraints;
          if (compositionRules.length > 0) runtimeOptions.compositionRules = compositionRules;
        }

        const check = planner.grade(planId, runtimeOptions);

        // Ceremony 'light' collapses Gate 1 into the grading step: a passing
        // plan auto-approves (draft→approved) so the human's single remaining
        // touchpoint is Gate 2 (plan_split). A failing grade leaves the plan in
        // draft, surfaced as needing explicit approval — this never crashes the
        // grade op. 'full'/'off' return the raw check unchanged.
        if (planner.getCeremony() === 'light' && planner.get(planId)?.status === 'draft') {
          try {
            const { autoApproved, plan } = planner.autoApprove(planId);
            if (autoApproved) {
              return { ...check, ceremony: 'light', autoApproved: true, planStatus: plan.status };
            }
          } catch (err) {
            if (err instanceof PlanGradeRejectionError) {
              return {
                ...check,
                ceremony: 'light',
                autoApproved: false,
                planStatus: 'draft',
                needsApproval: true,
                message:
                  `Grade ${err.grade} (${err.score}) is below the ${err.minGrade} gate — ` +
                  'plan stays in draft. Iterate (`op:plan_iterate`) and re-grade, or approve explicitly.',
              };
            }
            throw err;
          }
        }

        return check;
      },
    },

    {
      name: 'plan_check_history',
      description:
        'Get all grading checks for a plan (history). Shows score progression across iterations.',
      auth: 'read',
      schema: z.object({
        planId: z.string().describe('The plan ID.'),
      }),
      handler: async (params) => {
        const planId = params.planId as string;
        const checks = planner.getCheckHistory(planId);
        return { planId, count: checks.length, checks };
      },
    },

    {
      name: 'plan_latest_check',
      description: 'Get the latest grading check for a plan.',
      auth: 'read',
      schema: z.object({
        planId: z.string().describe('The plan ID.'),
      }),
      handler: async (params) => {
        const planId = params.planId as string;
        const check = planner.getLatestCheck(planId);
        return check ?? { planId, check: null, message: 'No checks found for this plan.' };
      },
    },

    {
      name: 'plan_meets_grade',
      description:
        'Check if a plan meets a target grade. Thresholds: A+=95, A=90, B=80, C=70, D=60.',
      auth: 'read',
      schema: z.object({
        planId: z.string().describe('The plan ID.'),
        targetGrade: planGradeSchema.describe('Target grade: A+, A, B, C, D, or F.'),
      }),
      handler: async (params) => {
        const planId = params.planId as string;
        const targetGrade = params.targetGrade as 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
        return planner.meetsGrade(planId, targetGrade);
      },
    },

    {
      name: 'plan_auto_improve',
      description:
        'Grade a plan and return gaps grouped by severity with actionable recommendations. Critical gaps first.',
      auth: 'read',
      schema: z.object({
        planId: z.string().describe('The plan ID.'),
      }),
      handler: async (params) => {
        const planId = params.planId as string;
        // plan_auto_improve uses grade() without vault constraints for speed
        const check = planner.grade(planId);

        // Sort gaps by severity: critical > major > minor > info
        const severityOrder: Record<string, number> = { critical: 0, major: 1, minor: 2, info: 3 };
        const sortedGaps = [...check.gaps].sort(
          (a, b) => (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4),
        );

        // Group by severity for structured output
        const grouped: Record<
          string,
          Array<{
            category: string;
            description: string;
            recommendation: string;
            location?: string;
          }>
        > = {};
        for (const g of sortedGaps) {
          if (!grouped[g.severity]) grouped[g.severity] = [];
          grouped[g.severity].push({
            category: g.category,
            description: g.description,
            recommendation: g.recommendation,
            ...(g.location ? { location: g.location } : {}),
          });
        }

        return {
          grade: check.grade,
          score: check.score,
          iteration: check.iteration,
          totalGaps: check.gaps.length,
          gapsBySeverity: grouped,
          nextAction: check.score >= 90 ? 'approve' : 'iterate',
        };
      },
    },
  ];
}
