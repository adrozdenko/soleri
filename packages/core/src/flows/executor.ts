/**
 * Flow executor — runs an orchestration plan step-by-step,
 * evaluating gates and handling branching.
 */

import fs from 'node:fs';
import path from 'node:path';
import type {
  OrchestrationPlan,
  ExecutionResult,
  StepResult,
  PlanRunManifest,
  PlanStep,
  FlowEnforcement,
} from './types.js';
import { evaluateGate } from './gate-evaluator.js';

/** Maximum iterations for BRANCH loops to prevent infinite cycles. */
const MAX_BRANCH_ITERATIONS = 10;

type DispatchFn = (
  toolName: string,
  params: Record<string, unknown>,
) => Promise<{ tool: string; status: string; data?: unknown; error?: string }>;

/**
 * A vault hit returned by an injected input-vault resolver. Opaque to the
 * executor — forwarded verbatim to the dispatched step — so any resolver
 * return shape (e.g. the vault's `SearchResult[]`) is accepted.
 */
export type VaultInputHit = unknown;

/** Resolver for `inputs.vault[]` queries — injected so the executor stays vault-agnostic. */
export type VaultInputResolver = (
  query: string,
  opts: { domain?: string; limit?: number },
) => Promise<VaultInputHit[]> | VaultInputHit[];

export interface FlowExecutorOptions {
  /**
   * Root for resolving workspace-relative `inputs.files[]` paths.
   * Defaults to the persistDir, then process.cwd().
   */
  workspaceRoot?: string;
  /**
   * Resolver for `inputs.vault[]` queries. When absent, non-mandatory vault
   * inputs are delivered as unresolved descriptors; a `mandatory: true` vault
   * input, however, is treated as a missing input in strict mode (it cannot be
   * satisfied without a resolver) so it can never silently vanish.
   */
  vaultSearch?: VaultInputResolver;
  /** Read declared file contents into the bundle. Default false (descriptors only). */
  readFiles?: boolean;
}

// ---------------------------------------------------------------------------
// Context assembly (WS5 — scoped stage-contract inputs)
// ---------------------------------------------------------------------------

/** A resolved file input delivered to a step. */
interface AssembledFile {
  path: string;
  layer: 3 | 4;
  present: boolean;
  content?: string;
}

/** A resolved vault input delivered to a step. */
interface AssembledVault {
  query: string;
  domain?: string;
  limit?: number;
  mandatory: boolean;
  hits?: VaultInputHit[];
}

/** The per-step context bundle produced by the assembly pass. */
interface AssembledContext {
  /** Flat prior-output map delivered to the step (scoped in strict mode, full otherwise). */
  context: Record<string, unknown>;
  /** Declared input descriptors delivered to a scoped step (undefined for unscoped steps). */
  inputs?: {
    files: AssembledFile[];
    vault: AssembledVault[];
    fromSteps: string[];
  };
  /** Missing declared inputs — drives on-missing-input handling. */
  missing: string[];
  /** Scoping warnings surfaced to the ExecutionResult. */
  warnings: string[];
}

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
    try {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as PlanRunManifest;
    } catch {
      // Malformed manifest — return fresh one
    }
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
  const safeStepId = stepId.replace(/[/\\:*?"<>|.]/g, '_');
  const fileName = `step-${stepIndex}-${safeStepId}.json`;
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
  private workspaceRoot: string;
  private vaultSearch: VaultInputResolver | undefined;
  private readFiles: boolean;

  constructor(dispatch: DispatchFn, persistDir?: string, options?: FlowExecutorOptions) {
    this.dispatch = dispatch;
    this.persistDir = persistDir;
    this.workspaceRoot = options?.workspaceRoot ?? persistDir ?? process.cwd();
    this.vaultSearch = options?.vaultSearch;
    this.readFiles = options?.readFiles ?? false;
  }

  /**
   * Assemble the per-step context bundle from the step's declared `inputs` (WS5).
   *
   * - Unscoped step (no `inputs`): keeps today's behavior — receives the full
   *   accumulated context — but warns in strict mode that it is unscoped.
   * - Scoped step, strict mode: receives ONLY the declared inputs; `from_steps`
   *   are resolved against `stepContext`, files are checked for presence, and
   *   `vault` queries are run through the injected resolver. Undeclared context
   *   is silently absent.
   * - Scoped step, advisory mode: the scoped bundle is recorded for
   *   observability, but the full accumulated context is still delivered.
   */
  private async assembleContext(
    step: PlanStep,
    stepContext: Record<string, unknown>,
    enforcement: FlowEnforcement,
  ): Promise<AssembledContext> {
    const warnings: string[] = [];
    const missing: string[] = [];

    // Unscoped step — backward compatible full-context delivery.
    if (!step.inputs) {
      if (enforcement === 'strict') {
        warnings.push(
          `Step "${step.id}" is unscoped (no inputs: block) — receives full accumulated context.`,
        );
      }
      return { context: { ...stepContext }, missing, warnings };
    }

    // --- Scoped step: build the declared bundle. ---

    // Files — resolve workspace-relative paths and check presence.
    // NOTE (Phase 1 limitation): unless `readFiles` is enabled, files are
    // delivered as descriptors (path/layer/present) WITHOUT their content — the
    // executing agent reads the declared paths itself. Strict scoping still
    // holds: undeclared prior outputs are withheld regardless of file content.
    const files: AssembledFile[] = (step.inputs.files ?? []).map((f) => {
      const abs = path.isAbsolute(f.path) ? f.path : path.join(this.workspaceRoot, f.path);
      const present = fs.existsSync(abs);
      if (!present) missing.push(`file:${f.path}`);
      const resolved: AssembledFile = { path: f.path, layer: f.layer, present };
      if (present && this.readFiles) {
        try {
          resolved.content = fs.readFileSync(abs, 'utf-8');
        } catch {
          resolved.present = false;
          missing.push(`file:${f.path}`);
        }
      }
      return resolved;
    });

    // Vault — run scoped queries through the injected resolver when available.
    const vault: AssembledVault[] = [];
    for (const v of step.inputs.vault ?? []) {
      const mandatory = v.mandatory ?? false;
      const resolved: AssembledVault = {
        query: v.query,
        mandatory,
        ...(v.domain !== undefined ? { domain: v.domain } : {}),
        ...(v.limit !== undefined ? { limit: v.limit } : {}),
      };
      if (this.vaultSearch) {
        const hits = await this.vaultSearch(v.query, { domain: v.domain, limit: v.limit });
        resolved.hits = hits;
        if (mandatory && (!hits || hits.length === 0)) {
          missing.push(`vault:${v.query}`);
        }
      } else if (mandatory) {
        // Safety net: a mandatory vault input cannot be satisfied without a
        // resolver. Treat it as missing (on-missing-input applies) rather than
        // silently dropping the requirement.
        missing.push(`vault:${v.query}`);
      }
      vault.push(resolved);
    }

    // from_steps — scope prior-step outputs to the declared keys only.
    const scopedContext: Record<string, unknown> = {};
    const fromSteps = step.inputs.from_steps ?? [];
    for (const ref of fromSteps) {
      const key = ref.slice(ref.indexOf('.') + 1);
      if (key in stepContext) {
        scopedContext[key] = stepContext[key];
      } else {
        // Declared but not produced in this execution (e.g. the source step was
        // skipped or branched over) — a missing declared input.
        missing.push(`from_steps:${ref}`);
      }
    }

    // Advisory escape hatch: record the scoped bundle but deliver full context.
    let context: Record<string, unknown>;
    if (enforcement === 'advisory') {
      context = { ...stepContext };
      warnings.push(
        `Step "${step.id}" advisory mode: scoped inputs recorded for observability but full context delivered.`,
      );
    } else {
      context = scopedContext;
    }

    return { context, inputs: { files, vault, fromSteps }, missing, warnings };
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

    // Accumulated outputs from completed steps — passed as context to subsequent dispatches
    const stepContext: Record<string, unknown> = {};

    // WS5: scoping mode + accumulated scoping warnings surfaced on the result.
    const enforcement: FlowEnforcement = plan.enforcement ?? 'strict';
    const warnings: string[] = [];

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

      // WS5: assemble the per-step context bundle from declared inputs only.
      const assembled = await this.assembleContext(step, stepContext, enforcement);
      warnings.push(...assembled.warnings);

      // Handle missing declared inputs per the step's on-missing-input policy
      // (default: fail). Strict scoping only — advisory mode delivers full
      // context, so a "missing" declared input is not a hard failure there.
      if (assembled.missing.length > 0 && enforcement === 'strict') {
        const policy = step.onMissingInput ?? 'fail';
        const detail = assembled.missing.join(', ');

        if (policy === 'fail') {
          const message = `Step "${step.id}" missing required input(s): ${detail}`;
          warnings.push(message);
          const stepResult: StepResult = {
            stepId: step.id,
            status: 'failed',
            toolResults,
            durationMs: Date.now() - stepStart,
            gateResult: { action: 'STOP', message },
          };
          stepResults.push(stepResult);
          step.status = 'failed';
          return buildResult(plan, stepResults, toolsCalled, startTime, 'partial', warnings);
        }

        if (policy === 'skip-with-warning') {
          const message = `Step "${step.id}" skipped — missing input(s): ${detail}`;
          warnings.push(message);
          stepResults.push({
            stepId: step.id,
            status: 'skipped',
            toolResults,
            durationMs: Date.now() - stepStart,
          });
          step.status = 'skipped';
          currentIndex++;
          continue;
        }

        // ask-user: pause execution so the human can supply the missing input.
        const message = `Step "${step.id}" paused — missing input(s): ${detail}. Provide them, then resume.`;
        warnings.push(message);
        stepResults.push({
          stepId: step.id,
          status: 'gate-paused',
          toolResults,
          durationMs: Date.now() - stepStart,
          gateResult: { action: 'STOP', message },
        });
        step.status = 'gate-paused';
        return buildResult(plan, stepResults, toolsCalled, startTime, 'partial', warnings);
      }

      const dispatchParams: Record<string, unknown> = {
        stepId: step.id,
        planId: plan.planId,
        context: assembled.context,
      };
      if (assembled.inputs) {
        // Deliver the declared input descriptors (files + vault) alongside the
        // scoped prior-output context.
        dispatchParams.inputs = assembled.inputs;
      }

      try {
        if (step.parallel && step.tools.length > 1) {
          // Execute tools in parallel
          const results = await Promise.allSettled(
            step.tools.map((tool) => this.dispatch(tool, dispatchParams)),
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
              toolResults[toolName] = await this.dispatch(toolName, dispatchParams);
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

      // Accumulate declared step outputs into stepContext for subsequent steps
      if (step.output) {
        for (const outputKey of step.output) {
          if (outputKey in flatData) {
            stepContext[outputKey] = flatData[outputKey];
          }
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
          return buildResult(plan, stepResults, toolsCalled, startTime, 'partial', warnings);

        case 'BRANCH': {
          step.status = verdict.passed ? 'passed' : 'gate-paused';
          branchIterations++;
          if (branchIterations >= MAX_BRANCH_ITERATIONS) {
            return buildResult(plan, stepResults, toolsCalled, startTime, 'partial', warnings);
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

    return buildResult(plan, stepResults, toolsCalled, startTime, status, warnings);
  }
}

function buildResult(
  plan: OrchestrationPlan,
  stepResults: StepResult[],
  toolsCalled: string[],
  startTime: number,
  status: ExecutionResult['status'],
  warnings: string[] = [],
): ExecutionResult {
  return {
    planId: plan.planId,
    status,
    stepsCompleted: stepResults.filter((r) => r.status === 'passed').length,
    totalSteps: plan.steps.length,
    toolsCalled: [...new Set(toolsCalled)],
    durationMs: Date.now() - startTime,
    stepResults,
    warnings,
  };
}
