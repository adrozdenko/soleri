/**
 * Loop operations — 7 ops for iterative validation loops.
 *
 * Ops: loop_start, loop_iterate, loop_status, loop_cancel,
 *      loop_history, loop_is_active, loop_complete.
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from './types.js';
import type { LoopMode } from '../loop/types.js';

const loopModeSchema = z.enum([
  'token-migration',
  'contrast-fix',
  'component-build',
  'plan-iteration',
  'custom',
]);

/**
 * Default max iterations per mode.
 */
const DEFAULT_MAX_ITERATIONS: Record<LoopMode, number> = {
  'token-migration': 20,
  'contrast-fix': 15,
  'component-build': 20,
  'plan-iteration': 10,
  custom: 20,
};

/**
 * Default target scores per mode.
 */
const DEFAULT_TARGET_SCORES: Partial<Record<LoopMode, number>> = {
  'token-migration': 95,
  'component-build': 90,
  'plan-iteration': 90,
};

/**
 * Create the 7 loop operations for an agent runtime.
 */
export function createLoopOps(runtime: AgentRuntime): OpDefinition[] {
  const { loop } = runtime;

  return [
    {
      name: 'loop_start',
      description:
        'Start an iterative validation loop. Modes: token-migration, contrast-fix, component-build, plan-iteration, custom.',
      auth: 'write',
      schema: z.object({
        mode: loopModeSchema,
        prompt: z.string().describe('Task description for the loop.'),
        maxIterations: z
          .number()
          .optional()
          .describe('Max iterations. Defaults vary by mode (10-20).'),
        targetScore: z
          .number()
          .optional()
          .describe('Target validation score (0-100). Defaults vary by mode.'),
      }),
      handler: async (params) => {
        const mode = params.mode as LoopMode;
        const prompt = params.prompt as string;
        const maxIterations =
          (params.maxIterations as number | undefined) ?? DEFAULT_MAX_ITERATIONS[mode];
        const targetScore =
          (params.targetScore as number | undefined) ?? DEFAULT_TARGET_SCORES[mode];

        const state = loop.startLoop({
          mode,
          prompt,
          maxIterations,
          targetScore,
        });

        return {
          started: true,
          loopId: state.id,
          mode,
          maxIterations,
          targetScore: targetScore ?? null,
        };
      },
    },
    {
      name: 'loop_iterate',
      description:
        'Record a validation iteration result. If max iterations reached on a failing result, the loop auto-closes.',
      auth: 'write',
      schema: z.object({
        passed: z.boolean().describe('Whether this iteration passed validation.'),
        validationScore: z
          .number()
          .optional()
          .describe('Numeric validation score (0-100).'),
        validationResult: z
          .string()
          .optional()
          .describe('Free-text validation result summary.'),
      }),
      handler: async (params) => {
        const iteration = loop.iterate({
          passed: params.passed as boolean,
          validationScore: params.validationScore as number | undefined,
          validationResult: params.validationResult as string | undefined,
        });

        const status = loop.getStatus();
        return {
          iteration: iteration.iteration,
          passed: iteration.passed,
          validationScore: iteration.validationScore ?? null,
          loopActive: loop.isActive(),
          loopStatus: status?.status ?? 'max-iterations',
        };
      },
    },
    {
      name: 'loop_status',
      description: 'Get current loop status, config, and iteration history.',
      auth: 'read',
      handler: async () => {
        const status = loop.getStatus();
        if (!status) {
          return { active: false, loop: null };
        }
        return {
          active: true,
          loop: status,
        };
      },
    },
    {
      name: 'loop_cancel',
      description: 'Cancel the active loop.',
      auth: 'write',
      handler: async () => {
        const cancelled = loop.cancelLoop();
        return {
          cancelled: true,
          loopId: cancelled.id,
          iterations: cancelled.iterations.length,
          status: cancelled.status,
        };
      },
    },
    {
      name: 'loop_history',
      description: 'Get history of all completed, cancelled, and max-iterations loops.',
      auth: 'read',
      handler: async () => {
        const history = loop.getHistory();
        return {
          count: history.length,
          loops: history.map((l) => ({
            id: l.id,
            mode: l.config.mode,
            prompt: l.config.prompt,
            status: l.status,
            iterations: l.iterations.length,
            startedAt: l.startedAt,
            completedAt: l.completedAt,
          })),
        };
      },
    },
    {
      name: 'loop_is_active',
      description: 'Check if a validation loop is currently running.',
      auth: 'read',
      handler: async () => {
        return { active: loop.isActive() };
      },
    },
    {
      name: 'loop_complete',
      description: 'Mark the active loop as completed (validation passed).',
      auth: 'write',
      handler: async () => {
        const completed = loop.completeLoop();
        return {
          completed: true,
          loopId: completed.id,
          iterations: completed.iterations.length,
          status: completed.status,
        };
      },
    },
  ];
}
