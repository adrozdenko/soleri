/**
 * Plan grading operations — 5 ops for iterative plan quality scoring.
 *
 * Ops: plan_grade, plan_check_history, plan_latest_check,
 *      plan_meets_grade, plan_auto_improve.
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from './types.js';

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
        'Grade a plan — scores 0-100 across 10 criteria, returns grade + gaps.',
      auth: 'read',
      schema: z.object({
        planId: z.string().describe('The plan ID to grade.'),
      }),
      handler: async (params) => {
        const planId = params.planId as string;
        return planner.grade(planId);
      },
    },

    {
      name: 'plan_check_history',
      description: 'Get all grading checks for a plan (history).',
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
        'Check if a plan meets a target grade. Grades the plan and returns boolean + check.',
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
        'Grade a plan and return the worst gaps sorted by severity, with improvement suggestions.',
      auth: 'read',
      schema: z.object({
        planId: z.string().describe('The plan ID.'),
      }),
      handler: async (params) => {
        const planId = params.planId as string;
        const check = planner.grade(planId);

        // Sort gaps by severity: critical > major > minor
        const severityOrder: Record<string, number> = { critical: 0, major: 1, minor: 2 };
        const worstGaps = [...check.gaps].sort(
          (a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3),
        );

        const suggestions = worstGaps.map(
          (g) => `[${g.severity.toUpperCase()}] ${g.category}: ${g.suggestion}`,
        );

        return { check, worstGaps, suggestions };
      },
    },
  ];
}
