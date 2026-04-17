/**
 * Task-level constraint gate.
 * Evaluates constraints against a task before execution starts.
 * Critical violations block execution; major/minor are advisory.
 */

import type {
  PlanTask,
  Plan,
  ConstraintDefinition,
  ConstraintResult,
  ConstraintAuditEntry,
} from './planner-types.js';

/**
 * Error thrown when a critical constraint blocks task execution.
 */
export class TaskConstraintError extends Error {
  public readonly constraintId: string;
  public readonly taskId: string;

  constructor(constraintId: string, taskId: string, message: string) {
    super(message);
    this.name = 'TaskConstraintError';
    this.constraintId = constraintId;
    this.taskId = taskId;
  }
}

/**
 * Evaluate constraints against a task.
 * Returns all constraint results (pass + fail).
 * Throws TaskConstraintError if any critical constraint fails.
 *
 * @param task - The task being evaluated
 * @param constraints - Constraint definitions to check against
 * @returns Array of constraint results (pass and fail)
 * @throws TaskConstraintError if a critical constraint is violated
 */
export function evaluateTaskConstraints(
  task: PlanTask,
  constraints: ConstraintDefinition[],
): ConstraintResult[] {
  if (!constraints || constraints.length === 0) return [];

  const results: ConstraintResult[] = [];
  const taskText = `${task.title} ${task.description}`.toLowerCase();

  for (const constraint of constraints) {
    let regex: RegExp;
    try {
      regex = new RegExp(constraint.pattern, 'i');
    } catch {
      // Skip malformed patterns
      results.push({
        constraintId: constraint.id,
        passed: true,
        severity: constraint.severity,
        message: `Skipped: malformed pattern "${constraint.pattern}"`,
      });
      continue;
    }

    const match = regex.test(taskText);
    if (match) {
      const result: ConstraintResult = {
        constraintId: constraint.id,
        passed: false,
        severity: constraint.severity,
        message: `Constraint "${constraint.name}" violated: ${constraint.description}`,
        evidence: taskText.substring(0, 200),
      };
      results.push(result);

      // Critical violations block execution
      if (constraint.severity === 'critical') {
        throw new TaskConstraintError(
          constraint.id,
          task.id,
          `Task "${task.title}" blocked by critical constraint "${constraint.name}": ${constraint.description}`,
        );
      }
    } else {
      results.push({
        constraintId: constraint.id,
        passed: true,
        severity: constraint.severity,
        message: `Constraint "${constraint.name}" satisfied`,
      });
    }
  }

  return results;
}

/**
 * Append constraint audit entries to a plan, deduplicating by constraintId + taskId + timestamp.
 * Mutates plan.constraintAudit in place.
 */
export function appendConstraintAudit(plan: Plan, entries: ConstraintAuditEntry[]): void {
  if (!entries || entries.length === 0) return;
  if (!plan.constraintAudit) plan.constraintAudit = [];

  for (const entry of entries) {
    const isDuplicate = plan.constraintAudit.some(
      (existing) =>
        existing.constraintId === entry.constraintId &&
        existing.taskId === entry.taskId &&
        existing.timestamp === entry.timestamp,
    );
    if (!isDuplicate) {
      plan.constraintAudit.push(entry);
    }
  }
}
