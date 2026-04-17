export {
  Planner,
  calculateScore,
  calculateDriftScore,
  isValidTransition,
  getValidNextStatuses,
  shouldExpire,
  LIFECYCLE_TRANSITIONS,
  NON_EXPIRING_STATUSES,
  DRIFT_WEIGHTS,
  PlanGradeRejectionError,
} from './planner.js';
export type {
  PlanStatus,
  TaskStatus,
  TaskEvidence,
  TaskMetrics,
  TaskDeliverable,
  ExecutionSummary,
  VerificationFinding,
  TaskVerification,
  PlanTask,
  PlanDecision,
  Plan,
  PlanStore,
  DriftItem,
  ReconciliationReport,
  ReviewEvidence,
  PlanGrade,
  PlanCheck,
  PlannerOptions,
  PlanAlternative,
  ConstraintDefinition,
  ConstraintResult,
  ConstraintAuditEntry,
  CompositionRule,
} from './planner.js';
export {
  runGapAnalysis,
  createToolFeasibilityPass,
  createFlowAlignmentPass,
  createAntiPatternPass,
  createConstraintPass,
  validateCompositionRules,
} from './gap-analysis.js';
export type { GapAnalysisOptions, GapAnalysisPass } from './gap-analysis.js';
export {
  SEVERITY_WEIGHTS,
  CATEGORY_PENALTY_CAPS,
  MIN_OBJECTIVE_LENGTH,
  MIN_SCOPE_LENGTH,
  MIN_DECISION_LENGTH,
  generateGapId,
} from './gap-types.js';
export type { GapSeverity, GapCategory, PlanGap } from './gap-types.js';
export {
  evaluateTaskConstraints,
  TaskConstraintError,
  appendConstraintAudit,
} from './constraint-gate.js';
export { loadVaultConstraints } from './vault-constraints.js';
export type { ConstraintSeverity } from './planner-types.js';
export { MAX_CONSTRAINT_PATTERN_LENGTH } from './planner-types.js';
export { GoalAncestry, JsonGoalRepository, generateGoalId } from './goal-ancestry.js';
export type { GoalLevel, GoalStatus, Goal, GoalStore, GoalRepository } from './goal-ancestry.js';
export { assessTaskComplexity } from './task-complexity-assessor.js';
export type {
  AssessmentInput,
  AssessmentSignal,
  AssessmentResult,
} from './task-complexity-assessor.js';
export {
  parseGitHubRemote,
  detectGitHubRemote,
  isGhAuthenticated,
  detectGitHubContext,
  findMatchingMilestone,
  findDuplicateIssue,
  formatIssueBody,
  createGitHubIssue,
  updateGitHubIssueBody,
  listMilestones,
  listOpenIssues,
  listLabels,
} from './github-projection.js';
export type {
  GitHubRepo,
  GitHubMilestone,
  GitHubIssue,
  GitHubLabel,
  GitHubContext,
  GitHubProjection,
  ProjectedIssue,
  PlanMetadataForIssue,
} from './github-projection.js';
