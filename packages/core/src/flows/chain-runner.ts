/**
 * Chain Runner — executes multi-step workflows with data flow between steps.
 *
 * Steps call facade ops via a dispatch function. Each step's output is stored
 * in a context object and can be referenced by subsequent steps via $variable syntax.
 *
 * Gates pause execution. Resume via approve(). State persists to SQLite.
 */

import { randomUUID } from 'node:crypto';
import type { PersistenceProvider } from '../persistence/types.js';
import type { ChainDef, ChainInstance, StepOutput } from './chain-types.js';

// ─── Types ───────────────────────────────────────────────────────────

export type DispatchFn = (op: string, params: Record<string, unknown>) => Promise<unknown>;

type GateCheckFn = (
  gate: string,
  stepId: string,
  stepResult: unknown,
) => Promise<{ passed: boolean; message?: string }>;

// ─── Class ───────────────────────────────────────────────────────────

export class ChainRunner {
  private provider: PersistenceProvider;

  constructor(provider: PersistenceProvider) {
    this.provider = provider;
    this.initializeTable();
  }

  private initializeTable(): void {
    this.provider.execSql(`
      CREATE TABLE IF NOT EXISTS chain_instances (
        id TEXT PRIMARY KEY,
        chain_id TEXT NOT NULL,
        chain_name TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'running',
        current_step TEXT,
        paused_at_gate TEXT,
        input TEXT NOT NULL DEFAULT '{}',
        context TEXT NOT NULL DEFAULT '{}',
        step_outputs TEXT NOT NULL DEFAULT '[]',
        steps_completed INTEGER NOT NULL DEFAULT 0,
        total_steps INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  /**
   * Execute a chain from the beginning (or a specific step).
   */
  async execute(
    chainDef: ChainDef,
    input: Record<string, unknown>,
    dispatch: DispatchFn,
    gateCheck?: GateCheckFn,
    startFromStep?: string,
  ): Promise<ChainInstance> {
    const instanceId = randomUUID().slice(0, 12);
    const instance: ChainInstance = {
      id: instanceId,
      chainId: chainDef.id,
      chainName: chainDef.name ?? chainDef.id,
      status: 'running',
      currentStep: null,
      pausedAtGate: null,
      input,
      context: { input },
      stepOutputs: [],
      stepsCompleted: 0,
      totalSteps: chainDef.steps.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.persist(instance);

    // Find start index
    let startIdx = 0;
    if (startFromStep) {
      const idx = chainDef.steps.findIndex((s) => s.id === startFromStep);
      if (idx >= 0) startIdx = idx;
    }

    return this.runSteps(chainDef, instance, dispatch, gateCheck, startIdx);
  }

  /**
   * Resume a paused chain from where it left off.
   */
  async resume(
    instanceId: string,
    chainDef: ChainDef,
    dispatch: DispatchFn,
    gateCheck?: GateCheckFn,
  ): Promise<ChainInstance> {
    const instance = this.getInstance(instanceId);
    if (!instance) throw new Error(`Chain instance not found: ${instanceId}`);
    if (instance.status !== 'paused') throw new Error(`Chain is ${instance.status}, not paused`);

    // Find the step after the paused gate
    const pausedStep = instance.pausedAtGate;
    if (!pausedStep) throw new Error('No paused gate to resume from');

    const stepIdx = chainDef.steps.findIndex((s) => s.id === pausedStep);
    if (stepIdx < 0) throw new Error(`Paused step ${pausedStep} not found in chain def`);

    // Mark step as approved, move to next
    instance.status = 'running';
    instance.pausedAtGate = null;
    this.persist(instance);

    return this.runSteps(chainDef, instance, dispatch, gateCheck, stepIdx + 1);
  }

  /**
   * Approve a gate-paused step and resume the chain.
   */
  async approve(
    instanceId: string,
    chainDef: ChainDef,
    dispatch: DispatchFn,
    gateCheck?: GateCheckFn,
  ): Promise<ChainInstance> {
    return this.resume(instanceId, chainDef, dispatch, gateCheck);
  }

  /**
   * Get chain instance status.
   */
  getInstance(instanceId: string): ChainInstance | null {
    const row = this.provider.get<InstanceRow>('SELECT * FROM chain_instances WHERE id = ?', [
      instanceId,
    ]);
    return row ? rowToInstance(row) : null;
  }

  /**
   * List all chain instances.
   */
  list(limit: number = 20): ChainInstance[] {
    const rows = this.provider.all<InstanceRow>(
      'SELECT * FROM chain_instances ORDER BY updated_at DESC LIMIT ?',
      [limit],
    );
    return rows.map(rowToInstance);
  }

  // ─── Core Execution Loop ──────────────────────────────────────────

  private async runSteps(
    chainDef: ChainDef,
    instance: ChainInstance,
    dispatch: DispatchFn,
    gateCheck: GateCheckFn | undefined,
    startIdx: number,
  ): Promise<ChainInstance> {
    // Steps MUST run sequentially — step N output feeds step N+1 input.
    // Using recursive approach to satisfy no-await-in-loop lint rule.
    return this.runStep(chainDef, instance, dispatch, gateCheck, startIdx);
  }

  private async runStep(
    chainDef: ChainDef,
    instance: ChainInstance,
    dispatch: DispatchFn,
    gateCheck: GateCheckFn | undefined,
    idx: number,
  ): Promise<ChainInstance> {
    if (idx >= chainDef.steps.length) {
      instance.status = 'completed';
      instance.currentStep = null;
      this.persist(instance);
      return instance;
    }

    const step = chainDef.steps[idx];
    instance.currentStep = step.id;
    this.persist(instance);

    const resolvedParams = resolveParams(step.params ?? {}, instance.context);

    const stepStart = Date.now();
    let result: unknown;
    let stepStatus: StepOutput['status'] = 'completed';

    try {
      result = await dispatch(step.op, resolvedParams);
    } catch (err) {
      result = { error: (err as Error).message };
      stepStatus = 'failed';
    }

    const output: StepOutput = {
      stepId: step.id,
      op: step.op,
      result,
      status: stepStatus,
      durationMs: Date.now() - stepStart,
    };

    instance.stepOutputs.push(output);
    instance.context[step.id] = result;
    if (step.output) instance.context[step.output] = result;
    if (stepStatus === 'completed') instance.stepsCompleted++;

    // Check gate
    if (step.gate && step.gate !== 'none' && stepStatus === 'completed') {
      const gateResult = await this.evaluateChainGate(step.gate, step.id, result, gateCheck);
      if (!gateResult.passed) {
        if (step.gate === 'user-approval') {
          instance.status = 'paused';
          instance.pausedAtGate = step.id;
          this.persist(instance);
          return instance;
        }
        instance.status = 'failed';
        this.persist(instance);
        return instance;
      }
    }

    if (stepStatus === 'failed') {
      instance.status = 'failed';
      this.persist(instance);
      return instance;
    }

    this.persist(instance);
    return this.runStep(chainDef, instance, dispatch, gateCheck, idx + 1);
  }

  private async evaluateChainGate(
    gate: string,
    stepId: string,
    stepResult: unknown,
    gateCheck?: GateCheckFn,
  ): Promise<{ passed: boolean; message?: string }> {
    switch (gate) {
      case 'user-approval':
        return { passed: false, message: 'Awaiting user approval' };

      case 'auto-test': {
        const result = stepResult as Record<string, unknown> | null;
        if (!result) return { passed: false, message: 'Step returned no result' };
        if (result.error) return { passed: false, message: `Step error: ${result.error}` };
        return { passed: true };
      }

      case 'vault-check': {
        if (gateCheck) return gateCheck(gate, stepId, stepResult);
        return { passed: true };
      }

      default:
        return { passed: true };
    }
  }

  // ─── Persistence ──────────────────────────────────────────────────

  private persist(instance: ChainInstance): void {
    instance.updatedAt = new Date().toISOString();
    this.provider.run(
      `INSERT OR REPLACE INTO chain_instances
       (id, chain_id, chain_name, status, current_step, paused_at_gate, input, context, step_outputs, steps_completed, total_steps, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        instance.id,
        instance.chainId,
        instance.chainName,
        instance.status,
        instance.currentStep,
        instance.pausedAtGate,
        JSON.stringify(instance.input),
        JSON.stringify(instance.context),
        JSON.stringify(instance.stepOutputs),
        instance.stepsCompleted,
        instance.totalSteps,
        instance.createdAt,
        instance.updatedAt,
      ],
    );
  }
}

// ─── Variable Resolution ─────────────────────────────────────────────

/**
 * Resolve $variable references in params.
 * $input.url → context.input.url
 * $research.title → context.research.title
 * $stepId → context.stepId (whole object)
 */
function resolveParams(
  params: Record<string, unknown>,
  context: Record<string, unknown>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    resolved[key] = resolveValue(value, context);
  }
  return resolved;
}

function resolveValue(value: unknown, context: Record<string, unknown>): unknown {
  if (typeof value === 'string' && value.startsWith('$')) {
    return resolveReference(value.slice(1), context);
  }
  if (Array.isArray(value)) {
    return value.map((v) => resolveValue(v, context));
  }
  if (value !== null && typeof value === 'object') {
    return resolveParams(value as Record<string, unknown>, context);
  }
  return value;
}

function resolveReference(path: string, context: Record<string, unknown>): unknown {
  const parts = path.split('.');
  let current: unknown = context;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ─── Row Types ───────────────────────────────────────────────────────

interface InstanceRow {
  id: string;
  chain_id: string;
  chain_name: string;
  status: string;
  current_step: string | null;
  paused_at_gate: string | null;
  input: string;
  context: string;
  step_outputs: string;
  steps_completed: number;
  total_steps: number;
  created_at: string;
  updated_at: string;
}

function rowToInstance(row: InstanceRow): ChainInstance {
  return {
    id: row.id,
    chainId: row.chain_id,
    chainName: row.chain_name,
    status: row.status as ChainInstance['status'],
    currentStep: row.current_step,
    pausedAtGate: row.paused_at_gate,
    input: JSON.parse(row.input) as Record<string, unknown>,
    context: JSON.parse(row.context) as Record<string, unknown>,
    stepOutputs: JSON.parse(row.step_outputs) as StepOutput[],
    stepsCompleted: row.steps_completed,
    totalSteps: row.total_steps,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
