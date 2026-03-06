/**
 * Loop operations — 8 ops for iterative validation loops.
 *
 * Ops: loop_start, loop_iterate, loop_iterate_gate, loop_status,
 *      loop_cancel, loop_history, loop_is_active, loop_complete.
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from './types.js';
import type { LoopMode, LoopKnowledge } from '../loop/types.js';

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
 * Create the 8 loop operations for an agent runtime.
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
        targetGrade: z
          .string()
          .optional()
          .describe('Target grade for plan-iteration mode (e.g., "A", "A+").'),
        completionPromise: z
          .string()
          .optional()
          .describe('Completion promise text — loop completes when this appears in output.'),
        validationInstructions: z
          .string()
          .optional()
          .describe('Validation instructions appended to the prompt each iteration.'),
        intent: z
          .string()
          .optional()
          .describe('Detected intent for brain session recording (e.g., "BUILD", "FIX").'),
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
          targetGrade: params.targetGrade as string | undefined,
          completionPromise: params.completionPromise as string | undefined,
          validationInstructions: params.validationInstructions as string | undefined,
          intent: params.intent as string | undefined,
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
        validationScore: z.number().optional().describe('Numeric validation score (0-100).'),
        validationResult: z.string().optional().describe('Free-text validation result summary.'),
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
      name: 'loop_iterate_gate',
      description:
        'Gate-based loop iteration — accepts LLM output, scans for completion signals ' +
        '(promise tags, heuristic detection), and returns allow/block decision. ' +
        'Primary method for Stop hook integration.',
      auth: 'write',
      schema: z.object({
        lastOutput: z.string().describe('The LLM response to scan for completion signals.'),
        knowledge: z
          .object({
            items: z.array(z.string()).optional(),
            patternsApplied: z.array(z.string()).optional(),
            antiPatternsAvoided: z.array(z.string()).optional(),
          })
          .optional()
          .describe('Knowledge items discovered during this iteration.'),
      }),
      handler: async (params) => {
        const decision = loop.iterateWithGate(
          params.lastOutput as string,
          params.knowledge as LoopKnowledge | undefined,
        );
        return decision;
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
