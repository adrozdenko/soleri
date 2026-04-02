/**
 * Flow executor — runs an orchestration plan step-by-step,
 * evaluating gates and handling branching.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { OrchestrationPlan, ExecutionResult, StepResult, PlanRunManifest } from './types.js';
import { evaluateGate } from './gate-evaluator.js';

/** Maximum iterations for BRANCH loops to prevent infinite cycles. */
const MAX_BRANCH_ITERATIONS = 10;

type DispatchFn = (
  toolName: string,
  params: Record<string, unknown>,
) => Promise<{ tool: string; status: string; data?: unknown; error?: string }>;

// ---------------------------------------------------------------------------
// Step persistence helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the persistence directory for a plan run.
 * Returns `{persistDir}/.soleri/plan-runs/{planId}/`.
 */
export function getPlanRunDir(persistDir: string, planId: string): string {
  return path.join(persistDir, '.soleri', 'plan-runs', planId);
}

/**
 * Load or create a PlanRunManifest from disk.
 */
export function loadManifest(runDir: string, planId: string): PlanRunManifest {
  const manifestPath = path.join(runDir, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as PlanRunManifest;
  }
  const now = new Date().toISOString();
  return { planId, steps: {}, lastRun: now, createdAt: now };
}

/**
 * Write a PlanRunManifest to disk.
 */
export function saveManifest(runDir: string, manifest: PlanRunManifest): void {
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

/**
 * Persist a single step's output to disk and update the manifest.
 */
export function persistStepOutput(
  runDir: string,
  manifest: PlanRunManifest,
  stepIndex: number,
  stepId: string,
  output: unknown,
): void {
  fs.mkdirSync(runDir, { recursive: true });
  const fileName = `step-${stepIndex}-${stepId}.json`;
  fs.writeFileSync(path.join(runDir, fileName), JSON.stringify(output, null, 2));

  const existing = manifest.steps[stepId];
  const now = new Date().toISOString();

  manifest.steps[stepId] = {
    status: 'completed',
    output,
    timestamp: now,
    rerunCount: existing ? existing.rerunCount + 1 : 0,
    rerunReason: existing?.rerunReason,
  };
  manifest.lastRun = now;
  saveManifest(runDir, manifest);
}

/**
 * Executes an orchestration plan sequentially (with parallel inner steps).
 */
export class FlowExecutor {
  private dispatch: DispatchFn;
  private persistDir: string | undefined;

  constructor(dispatch: DispatchFn, persistDir?: string) {
    this.dispatch = dispatch;
    this.persistDir = persistDir;
  }

  /**
   * Execute a full orchestration plan. Returns an ExecutionResult
   * summarizing what happened.
   */
  async execute(plan: OrchestrationPlan): Promise<ExecutionResult> {
    const startTime = Date.now();
    const stepResults: StepResult[] = [];
    const toolsCalled: string[] = [];
    let branchIterations = 0;
    let currentIndex = 0;

    // Set up persistence if configured
    let runDir: string | undefined;
    let manifest: PlanRunManifest | undefined;
    if (this.persistDir) {
      runDir = getPlanRunDir(this.persistDir, plan.planId);
      manifest = loadManifest(runDir, plan.planId);
    }

    while (currentIndex < plan.steps.length) {
      const step = plan.steps[currentIndex];
      const stepStart = Date.now();
      step.status = 'running';

      const toolResults: StepResult['toolResults'] = {};

      try {
        if (step.parallel && step.tools.length > 1) {
          // Execute tools in parallel
          const results = await Promise.allSettled(
            step.tools.map((tool) => this.dispatch(tool, { stepId: step.id, planId: plan.planId })),
          );
          for (let i = 0; i < step.tools.length; i++) {
            const toolName = step.tools[i];
            const result = results[i];
            if (result.status === 'fulfilled') {
              toolResults[toolName] = result.value;
            } else {
              toolResults[toolName] = {
                tool: toolName,
                status: 'error',
                error:
                  result.reason instanceof Error ? result.reason.message : String(result.reason),
              };
            }
            toolsCalled.push(toolName);
          }
        } else {
          // Execute tools sequentially
          for (const toolName of step.tools) {
            try {
              toolResults[toolName] = await this.dispatch(toolName, {
                stepId: step.id,
                planId: plan.planId,
              });
            } catch (_err) {
              toolResults[toolName] = {
                tool: toolName,
                status: 'error',
                error: _err instanceof Error ? _err.message : String(_err),
              };
            }
            toolsCalled.push(toolName);
          }
        }
      } catch (_err) {
        // Entire step failed
        const stepResult: StepResult = {
          stepId: step.id,
          status: 'failed',
          toolResults,
          durationMs: Date.now() - stepStart,
        };
        stepResults.push(stepResult);
        step.status = 'failed';
        break;
      }

      // Evaluate gate
      const flatData: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(toolResults)) {
        flatData[key] = val;
        if (val.data && typeof val.data === 'object') {
          Object.assign(flatData, val.data as Record<string, unknown>);
        }
      }

      const verdict = evaluateGate(step.gate, flatData);

      const stepResult: StepResult = {
        stepId: step.id,
        status: verdict.passed ? 'passed' : 'failed',
        toolResults,
        durationMs: Date.now() - stepStart,
      };

      if (!verdict.passed || verdict.action !== 'CONTINUE') {
        stepResult.gateResult = {
          action: verdict.action,
          message: verdict.message,
        };
      }

      stepResults.push(stepResult);

      // Persist step output to disk if configured
      if (runDir && manifest) {
        try {
          persistStepOutput(runDir, manifest, currentIndex, step.id, {
            toolResults,
            gateResult: stepResult.gateResult,
            status: stepResult.status,
            durationMs: stepResult.durationMs,
          });
        } catch {
          // Persistence is best-effort — never blocks execution
        }
      }

      // Handle gate action
      switch (verdict.action) {
        case 'STOP':
          step.status = 'failed';
          // Stop execution
          return buildResult(plan, stepResults, toolsCalled, startTime, 'partial');

        case 'BRANCH': {
          step.status = verdict.passed ? 'passed' : 'gate-paused';
          branchIterations++;
          if (branchIterations >= MAX_BRANCH_ITERATIONS) {
            return buildResult(plan, stepResults, toolsCalled, startTime, 'partial');
          }
          if (verdict.goto) {
            const targetIdx = plan.steps.findIndex((s) => s.id === verdict.goto);
            if (targetIdx >= 0) {
              currentIndex = targetIdx;
              continue;
            }
          }
          // No valid goto — continue to next step
          step.status = 'passed';
          currentIndex++;
          break;
        }

        case 'CONTINUE':
        default:
          step.status = verdict.passed ? 'passed' : 'failed';
          currentIndex++;
          break;
      }
    }

    const allPassed = stepResults.every((r) => r.status === 'passed');
    const anyFailed = stepResults.some((r) => r.status === 'failed');
    const status = allPassed ? 'completed' : anyFailed ? 'partial' : 'completed';

    return buildResult(plan, stepResults, toolsCalled, startTime, status);
  }
}

function buildResult(
  plan: OrchestrationPlan,
  stepResults: StepResult[],
  toolsCalled: string[],
  startTime: number,
  status: ExecutionResult['status'],
): ExecutionResult {
  return {
    planId: plan.planId,
    status,
    stepsCompleted: stepResults.filter((r) => r.status === 'passed').length,
    totalSteps: plan.steps.length,
    toolsCalled: [...new Set(toolsCalled)],
    durationMs: Date.now() - startTime,
    stepResults,
  };
}
