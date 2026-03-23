/**
 * Gate evaluator — checks step gates against tool results to decide
 * whether execution should CONTINUE, STOP, or BRANCH.
 */

import type { PlanStep, GateVerdict } from './types.js';

/**
 * Evaluate a plan step's gate against collected tool results.
 * If no gate is defined, returns CONTINUE (passed).
 */
export function evaluateGate(
  gate: PlanStep['gate'],
  toolResults: Record<string, unknown>,
): GateVerdict {
  if (!gate) {
    return { passed: true, action: 'CONTINUE' };
  }

  switch (gate.type) {
    case 'GATE': {
      const passed = gate.condition ? evaluateCondition(gate.condition, toolResults) : true;
      if (passed) return { passed: true, action: 'CONTINUE' };
      return {
        passed: false,
        action: (gate.onFail?.action as GateVerdict['action']) ?? 'STOP',
        goto: gate.onFail?.goto,
        message: gate.onFail?.message,
      };
    }

    case 'SCORE': {
      const score = extractScore(toolResults);
      const minScore = gate.min ?? 0;
      const passed = score >= minScore;
      if (passed) return { passed: true, action: 'CONTINUE', score };
      return {
        passed: false,
        action: (gate.onFail?.action as GateVerdict['action']) ?? 'STOP',
        goto: gate.onFail?.goto,
        message: gate.onFail?.message ?? `Score ${score} below minimum ${minScore}`,
        score,
      };
    }

    case 'CHECKPOINT': {
      const passed = gate.condition ? evaluateCondition(gate.condition, toolResults) : true;
      if (passed) return { passed: true, action: 'CONTINUE' };
      return {
        passed: false,
        action: (gate.onFail?.action as GateVerdict['action']) ?? 'CONTINUE',
        goto: gate.onFail?.goto,
        message: gate.onFail?.message,
      };
    }

    case 'BRANCH': {
      // BRANCH gates always trigger branching
      return {
        passed: true,
        action: 'BRANCH',
        goto: gate.onFail?.goto,
        message: gate.onFail?.message,
      };
    }

    case 'VERIFY': {
      const hasVerification = evaluateVerifyGate(toolResults);
      if (hasVerification) return { passed: true, action: 'CONTINUE' };
      // Advisory only — always continues, just warns
      return {
        passed: true,
        action: 'CONTINUE',
        message:
          gate.onFail?.message ??
          'Advisory: task modifies existing code without verification evidence.',
      };
    }

    default:
      return { passed: true, action: 'CONTINUE' };
  }
}

/**
 * Evaluate a simple condition string: "lhs op rhs".
 * Supported operators: ==, !=, >=, <=, >, <
 * lhs is resolved as a dotted path from data, rhs is a literal.
 */
export function evaluateCondition(condition: string, data: Record<string, unknown>): boolean {
  const operators = ['>=', '<=', '!=', '==', '>', '<'] as const;
  for (const op of operators) {
    const idx = condition.indexOf(op);
    if (idx === -1) continue;

    const lhsPath = condition.slice(0, idx).trim();
    const rhsRaw = condition.slice(idx + op.length).trim();
    const lhsValue = resolvePath(data, lhsPath);
    const rhsValue = parseConditionValue(rhsRaw);

    const lNum = typeof lhsValue === 'number' ? lhsValue : Number(lhsValue);
    const rNum = typeof rhsValue === 'number' ? rhsValue : Number(rhsValue);
    const useNumeric = !Number.isNaN(lNum) && !Number.isNaN(rNum);

    switch (op) {
      case '==':
        return useNumeric ? lNum === rNum : String(lhsValue) === String(rhsValue);
      case '!=':
        return useNumeric ? lNum !== rNum : String(lhsValue) !== String(rhsValue);
      case '>=':
        return useNumeric ? lNum >= rNum : false;
      case '<=':
        return useNumeric ? lNum <= rNum : false;
      case '>':
        return useNumeric ? lNum > rNum : false;
      case '<':
        return useNumeric ? lNum < rNum : false;
    }
  }

  // No operator found — check if value is truthy
  const val = resolvePath(data, condition.trim());
  return !!val;
}

/**
 * Extract a numeric score from tool results.
 * Looks for common score field names.
 */
export function extractScore(data: Record<string, unknown>): number {
  // Direct score fields
  for (const key of ['score', 'validationScore', 'total']) {
    if (typeof data[key] === 'number') return data[key] as number;
  }

  // Search within nested result objects
  for (const val of Object.values(data)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const nested = val as Record<string, unknown>;
      for (const key of ['score', 'validationScore', 'total']) {
        if (typeof nested[key] === 'number') return nested[key] as number;
      }
      // One more level: data property
      if (nested.data && typeof nested.data === 'object') {
        const deep = nested.data as Record<string, unknown>;
        for (const key of ['score', 'validationScore', 'total']) {
          if (typeof deep[key] === 'number') return deep[key] as number;
        }
      }
    }
  }

  return 0;
}

/**
 * Resolve a dotted path like "result.data.score" against an object.
 */
export function resolvePath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

/**
 * Check if tool results contain verification evidence.
 * Looks for a verification object with at least one proven finding.
 */
function evaluateVerifyGate(data: Record<string, unknown>): boolean {
  const verification = data.verification as { findings?: Array<{ proven?: boolean }> } | undefined;
  if (!verification?.findings?.length) return false;
  return verification.findings.some((f) => f.proven === true);
}

function parseConditionValue(raw: string): string | number | boolean {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return 0;
  // Strip quotes
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }
  const num = Number(raw);
  if (!Number.isNaN(num)) return num;
  return raw;
}
