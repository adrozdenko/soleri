/**
 * Flow executor — runs an orchestration plan step-by-step,
 * evaluating gates and handling branching.
 */

import type { OrchestrationPlan, ExecutionResult, StepResult } from './types.js';
import { evaluateGate } from './gate-evaluator.js';

/** Maximum iterations for BRANCH loops to prevent infinite cycles. */
const MAX_BRANCH_ITERATIONS = 10;

type DispatchFn = (
  toolName: string,
  params: Record<string, unknown>,
) => Promise<{ tool: string; status: string; data?: unknown; error?: string }>;

/**
 * Executes an orchestration plan sequentially (with parallel inner steps).
 */
export class FlowExecutor {
  private dispatch: DispatchFn;

  constructor(dispatch: DispatchFn) {
    this.dispatch = dispatch;
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
                error: err instanceof Error ? err.message : String(err),
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
