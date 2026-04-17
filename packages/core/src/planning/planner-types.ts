/**
 * Shared type definitions for the planning module.
 * Extracted to avoid circular imports between planner.ts and its extracted modules.
 */

import type { PlanStatus, PlanGrade } from './plan-lifecycle.js';
import type { PlanGap } from './gap-types.js';
import type { GapAnalysisOptions } from './gap-analysis.js';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'failed';

export interface TaskEvidence {
  /** What the evidence proves (maps to an acceptance criterion). */
  criterion: string;
  /** Evidence content — command output, URL, file path, description. */
  content: string;
  /** Evidence type. */
  type: 'command_output' | 'url' | 'file' | 'description';
  submittedAt: number;
}

export interface TaskMetrics {
  durationMs?: number;
  iterations?: number;
  toolCalls?: number;
  modelTier?: string;
  estimatedCostUsd?: number;
}

export interface TaskDeliverable {
  type: 'file' | 'vault_entry' | 'url';
  path: string;
  hash?: string;
  verifiedAt?: number;
  stale?: boolean;
}

export interface ExecutionSummary {
  totalDurationMs: number;
  tasksCompleted: number;
  tasksSkipped: number;
  tasksFailed: number;
  avgTaskDurationMs: number;
}

export interface VerificationFinding {
  /** What was found (bug, issue, code smell). */
  description: string;
  /** How severe the finding is. */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Whether the finding was proven reproducible before fixing. */
  proven: boolean;
  /** How the finding was proven (test case, reproduction steps, stack trace). */
  proof?: string;
}

export interface TaskVerification {
  /** Findings that motivated changes to existing code. */
  findings: VerificationFinding[];
}

export interface PlanTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  /** Optional dependency IDs — tasks that must complete before this one. */
  dependsOn?: string[];
  /** Phase this task belongs to (e.g., "wave-1", "discovery", "implementation"). */
  phase?: string;
  /** Milestone this task contributes to (e.g., "v1.0", "mvp", "beta"). */
  milestone?: string;
  /** Parent task ID — enables sub-task hierarchy within a plan. */
  parentTaskId?: string;
  /** Evidence submitted for task acceptance criteria. */
  evidence?: TaskEvidence[];
  /** Whether this task has been verified (all evidence checked + reviews passed). */
  verified?: boolean;
  /** Task-level acceptance criteria (for verification checking). */
  acceptanceCriteria?: string[];
  /** Timestamp when task was first moved to in_progress. */
  startedAt?: number;
  /** Timestamp when task reached a terminal state (completed/skipped/failed). */
  completedAt?: number;
  /** Per-task execution metrics. */
  metrics?: TaskMetrics;
  /** Deliverables produced by this task. */
  deliverables?: TaskDeliverable[];
  /** Verification findings for tasks that modify existing code. Advisory only. */
  verification?: TaskVerification;
  /** Number of rework cycles. 0 = clean first pass. Incremented when task reverts from completed/failed back to in_progress/pending. */
  fixIterations?: number;
  updatedAt: number;
}

export interface DriftItem {
  /** Type of drift */
  type: 'skipped' | 'added' | 'modified' | 'reordered';
  /** What drifted */
  description: string;
  /** How much this affected the plan */
  impact: 'low' | 'medium' | 'high';
  /** Why the drift occurred */
  rationale: string;
}

export interface ReconciliationReport {
  planId: string;
  /** Accuracy score: 100 = perfect execution, 0 = total drift. Impact-weighted. */
  accuracy: number;
  driftItems: DriftItem[];
  /** Human-readable summary of the drift */
  summary: string;
  reconciledAt: number;
}

export interface ReviewEvidence {
  planId: string;
  taskId?: string;
  reviewer: string;
  outcome: 'approved' | 'rejected' | 'needs_changes';
  comments: string;
  reviewedAt: number;
}

export interface PlanCheck {
  checkId: string;
  planId: string;
  grade: PlanGrade;
  score: number; // 0-100
  gaps: PlanGap[];
  iteration: number;
  checkedAt: number;
}

/**
 * A structured decision with rationale.
 * Ported from Salvador's PlanContent.decisions.
 */
export interface PlanDecision {
  decision: string;
  rationale: string;
}

/**
 * A rejected alternative approach considered during planning.
 * Plans with 2+ alternatives score higher — forced alternative analysis
 * prevents tunnel vision and strengthens decision rationale.
 */
export interface PlanAlternative {
  approach: string;
  pros: string[];
  cons: string[];
  rejected_reason: string;
}

export interface Plan {
  id: string;
  objective: string;
  scope: string;
  status: PlanStatus;
  /**
   * Decisions can be flat strings (backward compat) or structured {decision, rationale}.
   * New plans should prefer PlanDecision[].
   */
  decisions: (string | PlanDecision)[];
  tasks: PlanTask[];
  /** High-level approach description. Ported from Salvador's PlanContent. */
  approach?: string;
  /** Additional context for the plan. */
  context?: string;
  /** Measurable success criteria. */
  success_criteria?: string[];
  /** Tools to use in execution order. */
  tool_chain?: string[];
  /** Flow definition to follow (e.g., 'developer', 'reviewer', 'designer'). */
  flow?: string;
  /** Target operational mode (e.g., 'build', 'review', 'fix'). */
  target_mode?: string;
  /** Rejected alternative approaches — plans with 2+ alternatives score higher. */
  alternatives?: PlanAlternative[];
  /** Reconciliation report — populated by reconcile(). */
  reconciliation?: ReconciliationReport;
  /** Review evidence — populated by addReview(). */
  reviews?: ReviewEvidence[];
  /** Latest grading check. */
  latestCheck?: PlanCheck;
  /** All check history. */
  checks: PlanCheck[];
  /** Matched playbook info (set by orchestration layer via playbook_match). */
  playbookMatch?: {
    label: string;
    genericId?: string;
    domainId?: string;
  };
  /** Active playbook executor session ID — used to enforce gates during task updates and plan completion. */
  playbookSessionId?: string;
  /** Source GitHub issue this plan was created from (e.g., #NNN in prompt). */
  githubIssue?: { owner: string; repo: string; number: number };
  /** GitHub issue projection — populated by orchestrate_project_to_github. */
  githubProjection?: {
    repo: string;
    milestone?: number;
    issues: Array<{
      taskId: string;
      issueNumber: number;
    }>;
    projectedAt: number;
  };
  /** Aggregate execution metrics — populated by reconcile() and complete(). */
  executionSummary?: ExecutionSummary;
  /** Goal ID linking this plan to the goal hierarchy. */
  goalId?: string;
  /** Audit trail of all constraint evaluations (grading + task execution). */
  constraintAudit?: ConstraintAuditEntry[];
  createdAt: number;
  updatedAt: number;
}

export interface PlanStore {
  version: string;
  plans: Plan[];
}

// ─── Constraint-Aware Planning Types ────────────────────────────

/**
 * A constraint definition sourced from vault entries with domain:constraint.
 * Evaluated during plan grading to block plans that match anti-patterns.
 */
export interface ConstraintDefinition {
  /** Vault entry ID or inline identifier. */
  id: string;
  /** Human-readable constraint name. */
  name: string;
  /** How severe a violation is — maps to existing gap severity weights. */
  severity: 'critical' | 'major' | 'minor';
  /** Regex pattern to match against plan text fields. */
  pattern: string;
  /** What this constraint prevents. */
  description: string;
  /** Domain tag from vault (e.g. 'security', 'architecture'). */
  domain?: string;
}

/**
 * Result of evaluating a single constraint against a plan or task.
 */
export interface ConstraintResult {
  constraintId: string;
  passed: boolean;
  severity: 'critical' | 'major' | 'minor';
  message: string;
  /** What text matched the constraint pattern. */
  evidence?: string;
}

/**
 * Audit entry recording a constraint evaluation (pass, fail, or skip).
 */
export interface ConstraintAuditEntry {
  constraintId: string;
  /** Which task was being evaluated, if task-level. Undefined for plan-level. */
  taskId?: string;
  result: 'pass' | 'fail' | 'skip';
  severity: 'critical' | 'major' | 'minor';
  message: string;
  timestamp: number;
  /** Where the constraint came from. */
  source: 'vault' | 'inline' | 'skipped';
}

/**
 * A composition rule requiring certain tasks to exist when a trigger matches.
 * E.g., "migration tasks must have a companion rollback task."
 */
export interface CompositionRule {
  /** Regex pattern to match against task titles and descriptions. */
  trigger: string;
  /** Task title patterns that must exist when trigger matches. */
  requires: string[];
  /** How severe a missing companion is. */
  severity: 'critical' | 'major' | 'minor';
  /** Human-readable description of the rule. */
  description?: string;
}

export interface PlannerOptions {
  gapOptions?: GapAnalysisOptions;
  /** Minimum grade required for plan approval. Default: 'A'. Set to undefined to disable. */
  minGradeForApproval?: PlanGrade;
  /** TTL in ms for executing/validating/reconciling plans in closeStale(). Default: 24h (86400000). */
  executingTtlMs?: number;
  /** TTL in ms for draft/approved plans in closeStale(). Default: 30 min (1800000). */
  draftTtlMs?: number;
}
