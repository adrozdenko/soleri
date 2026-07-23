/**
 * Flow loader — reads and validates YAML flow files from a directory.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { flowSchema, type Flow } from './types.js';

/** Re-export for backward compat (tests import this). */
export const parseSimpleYaml = parseYaml;

/**
 * Raised when a flow declares `inputs.from_steps` references that cannot be
 * resolved statically (WS5). This is a LOAD error — surfaced before any step
 * runs, never silently swallowed (§3.3 fail-fast).
 */
export class FlowLoadError extends Error {
  readonly flowId: string;
  readonly errors: string[];

  constructor(flowId: string, errors: string[]) {
    super(`Flow "${flowId}" failed input validation:\n  - ${errors.join('\n  - ')}`);
    this.name = 'FlowLoadError';
    this.flowId = flowId;
    this.errors = errors;
  }
}

/**
 * Validate every step's `inputs.from_steps` references (WS5).
 *
 * A `from_steps` entry (`<stepId>.<outputKey>`) may reference ONLY a key
 * declared in an EARLIER step's `output[]`. Returns a list of human-readable
 * load-error messages (empty array ⇒ valid). The dependency graph this makes
 * explicit also drives incremental recompilation (§6.1).
 */
export function validateFlowInputs(flow: Flow): string[] {
  const errors: string[] = [];
  // stepId → declared output keys, populated in flow order so "earlier" is enforced.
  const declaredOutputs = new Map<string, Set<string>>();

  for (const step of flow.steps) {
    for (const ref of step.inputs?.from_steps ?? []) {
      const dot = ref.indexOf('.');
      if (dot <= 0 || dot === ref.length - 1) {
        errors.push(`Step "${step.id}": from_steps entry "${ref}" must be "<stepId>.<outputKey>".`);
        continue;
      }
      const refStepId = ref.slice(0, dot);
      const refKey = ref.slice(dot + 1);
      const earlier = declaredOutputs.get(refStepId);
      if (!earlier) {
        errors.push(
          `Step "${step.id}": from_steps "${ref}" references step "${refStepId}", which is not an earlier step.`,
        );
        continue;
      }
      if (!earlier.has(refKey)) {
        errors.push(
          `Step "${step.id}": from_steps "${ref}" references output "${refKey}" not declared in step "${refStepId}".output[].`,
        );
      }
    }
    // Register AFTER processing inputs so a step cannot reference its own / later outputs.
    declaredOutputs.set(step.id, new Set(step.output ?? []));
  }

  return errors;
}

/**
 * Load a single flow by its `id` field from *.flow.yaml files in a directory.
 * Returns `null` if not found. Malformed YAML / schema failures are skipped,
 * but a flow whose `inputs.from_steps` fail validation throws a FlowLoadError
 * (fail-fast — the error is never swallowed).
 */
export function loadFlowById(flowId: string, flowsDir: string): Flow | null {
  if (!existsSync(flowsDir)) return null;

  const files = readdirSync(flowsDir).filter((f) => f.endsWith('.flow.yaml'));
  for (const file of files) {
    let flow: Flow | undefined;
    try {
      const content = readFileSync(join(flowsDir, file), 'utf-8');
      const raw = parseYaml(content);
      const parsed = flowSchema.safeParse(raw);
      if (parsed.success && parsed.data.id === flowId) {
        flow = parsed.data;
      }
    } catch {
      // malformed YAML / read error — skip this file
      continue;
    }
    if (!flow) continue;
    const errors = validateFlowInputs(flow);
    if (errors.length > 0) throw new FlowLoadError(flow.id, errors);
    return flow;
  }
  return null;
}

/**
 * Load all valid flows from *.flow.yaml files in a directory.
 *
 * Resilient by design: this is called on hot routing/planning/boot paths, so a
 * single broken flow must NOT take down loading of every other flow. Malformed
 * files are skipped; a flow with invalid `inputs.from_steps` is skipped too,
 * but with a LOUD per-file error on stderr (never silent). Callers that need to
 * hard-fail on a specific broken flow use `loadFlowById`, which throws.
 */
export function loadAllFlows(flowsDir: string): Flow[] {
  if (!existsSync(flowsDir)) return [];

  const files = readdirSync(flowsDir).filter((f) => f.endsWith('.flow.yaml'));
  const flows: Flow[] = [];
  for (const file of files) {
    let flow: Flow | undefined;
    try {
      const content = readFileSync(join(flowsDir, file), 'utf-8');
      const raw = parseYaml(content);
      const parsed = flowSchema.safeParse(raw);
      if (parsed.success) {
        flow = parsed.data;
      }
    } catch {
      // malformed YAML / read error — skip this file
      continue;
    }
    if (!flow) continue;
    const errors = validateFlowInputs(flow);
    if (errors.length > 0) {
      // Skip the invalid flow but surface it loudly — the rest still load.
      console.error(
        `[soleri] Skipping flow "${flow.id}" (${file}) — invalid inputs.from_steps:\n  - ${errors.join('\n  - ')}`,
      );
      continue;
    }
    flows.push(flow);
  }
  return flows;
}
