/**
 * Chain types — composable multi-step workflows with data flow.
 */

import { z } from 'zod';

// ─── Chain Definition (YAML schema) ──────────────────────────────────

export const chainStepSchema = z.object({
  id: z.string(),
  op: z.string().describe('Facade op to call'),
  params: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Params — use $input.x or $stepId.field for data flow'),
  output: z.string().optional().describe('Key to store step result under'),
  gate: z.enum(['user-approval', 'auto-test', 'vault-check', 'none']).optional(),
  description: z.string().optional(),
});

export const chainDefSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  steps: z.array(chainStepSchema).min(1),
});

export type ChainDef = z.infer<typeof chainDefSchema>;
export type ChainStep = z.infer<typeof chainStepSchema>;

// ─── Chain Instance (runtime state) ──────────────────────────────────

export type ChainStatus = 'running' | 'paused' | 'completed' | 'failed';

export interface StepOutput {
  stepId: string;
  op: string;
  result: unknown;
  status: 'completed' | 'failed' | 'skipped';
  durationMs: number;
}

export interface ChainInstance {
  id: string;
  chainId: string;
  chainName: string;
  status: ChainStatus;
  currentStep: string | null;
  pausedAtGate: string | null;
  input: Record<string, unknown>;
  context: Record<string, unknown>;
  stepOutputs: StepOutput[];
  stepsCompleted: number;
  totalSteps: number;
  createdAt: string;
  updatedAt: string;
}
