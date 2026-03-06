// ─── Intelligence ────────────────────────────────────────────────────
export type { IntelligenceEntry, IntelligenceBundle } from './intelligence/types.js';
export { loadIntelligenceData } from './intelligence/loader.js';

// ─── Vault ───────────────────────────────────────────────────────────
export { Vault } from './vault/vault.js';
export type { SearchResult, VaultStats, ProjectInfo, Memory, MemoryStats } from './vault/vault.js';
export { validatePlaybook, parsePlaybookFromEntry } from './vault/playbook.js';
export type { Playbook, PlaybookStep, PlaybookValidationResult } from './vault/playbook.js';

// ─── Playbook System (registry, matching, seeding) ─────────────────
export {
  getBuiltinPlaybook,
  getAllBuiltinPlaybooks,
  scorePlaybook,
  mergePlaybooks,
  matchPlaybooks,
  seedDefaultPlaybooks,
  playbookDefinitionToEntry,
  entryToPlaybookDefinition,
} from './playbooks/index.js';
export type {
  PlaybookTier,
  PlaybookIntent,
  BrainstormSection,
  PlaybookGate,
  PlaybookTaskTemplate,
  PlaybookDefinition,
  MergedPlaybook,
  PlaybookMatchResult,
} from './playbooks/index.js';
export { createPlaybookOps } from './runtime/playbook-ops.js';

// ─── Text Utilities ─────────────────────────────────────────────────
export {
  tokenize,
  calculateTf,
  calculateTfIdf,
  cosineSimilarity,
  jaccardSimilarity,
} from './text/similarity.js';
export type { SparseVector } from './text/similarity.js';

// ─── Curator ────────────────────────────────────────────────────────
export { Curator } from './curator/curator.js';
export type {
  EntryStatus,
  EntrySource,
  TagNormalizationResult,
  CanonicalTag,
  DuplicateCandidate,
  DuplicateDetectionResult,
  Contradiction,
  ContradictionStatus,
  GroomResult,
  GroomAllResult,
  ConsolidationOptions,
  ConsolidationResult,
  ChangelogEntry,
  HealthMetrics,
  HealthAuditResult,
  CuratorStatus,
} from './curator/types.js';

// ─── Governance ─────────────────────────────────────────────────────
export { Governance } from './governance/governance.js';
export type {
  PolicyType,
  PolicyPreset,
  PolicyAction,
  QuotaPolicy,
  RetentionPolicy,
  AutoCapturePolicy,
  VaultPolicy,
  QuotaStatus,
  PolicyDecision,
  BatchDecision,
  PolicyAuditEntry,
  ProposalStatus,
  Proposal,
  ProposalStats,
  GovernanceDashboard,
} from './governance/types.js';

// ─── Brain ───────────────────────────────────────────────────────────
export { Brain } from './brain/brain.js';
export { BrainIntelligence } from './brain/intelligence.js';
export type {
  ScoringWeights,
  ScoreBreakdown,
  RankedResult,
  SearchOptions,
  CaptureResult,
  BrainStats,
  QueryContext,
  FeedbackType,
  FeedbackSource,
  FeedbackInput,
  FeedbackEntry,
  FeedbackStats,
  PatternStrength,
  StrengthsQuery,
  BrainSession,
  SessionLifecycleInput,
  KnowledgeProposal,
  ExtractionResult,
  GlobalPattern,
  DomainProfile,
  BuildIntelligenceResult,
  BrainIntelligenceStats,
  SessionContext,
  BrainExportData,
  BrainImportResult,
} from './brain/types.js';

// ─── Cognee ─────────────────────────────────────────────────────────
export { CogneeClient } from './cognee/client.js';
export type {
  CogneeConfig,
  CogneeSearchResult,
  CogneeSearchType,
  CogneeStatus,
  CogneeAddResult,
  CogneeCognifyResult,
} from './cognee/types.js';

// ─── Planning ────────────────────────────────────────────────────────
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
} from './planning/planner.js';
export type {
  PlanStatus,
  TaskStatus,
  TaskEvidence,
  PlanTask,
  PlanDecision,
  Plan,
  PlanStore,
  DriftItem,
  ReconciliationReport,
  ReviewEvidence,
  PlanGrade,
  PlanCheck,
} from './planning/planner.js';

// ─── Plan Gap Analysis ──────────────────────────────────────────────
export {
  runGapAnalysis,
  createToolFeasibilityPass,
  createFlowAlignmentPass,
  createAntiPatternPass,
} from './planning/gap-analysis.js';
export type { GapAnalysisOptions, GapAnalysisPass } from './planning/gap-analysis.js';
export {
  SEVERITY_WEIGHTS,
  CATEGORY_PENALTY_CAPS,
  MIN_OBJECTIVE_LENGTH,
  MIN_SCOPE_LENGTH,
  MIN_DECISION_LENGTH,
  generateGapId,
} from './planning/gap-types.js';
export type { GapSeverity, GapCategory, PlanGap } from './planning/gap-types.js';

// ─── Loop ────────────────────────────────────────────────────────────
export { LoopManager, extractPromise, detectImplicitCompletion } from './loop/loop-manager.js';
export type {
  LoopMode,
  LoopConfig,
  LoopIteration,
  LoopStatus,
  LoopState,
  LoopKnowledge,
  LoopHistoryEntry,
  LoopIterateDecision,
} from './loop/types.js';

// ─── LLM Types ───────────────────────────────────────────────────────
export { SecretString, LLMError } from './llm/types.js';
export type {
  LLMCallOptions,
  LLMCallResult,
  CircuitState,
  CircuitBreakerConfig,
  CircuitBreakerSnapshot,
  KeyPoolConfig,
  KeyStatus,
  RouteEntry,
  RoutingConfig,
  RateLimitInfo,
  RetryConfig,
} from './llm/types.js';

// ─── LLM Utils ───────────────────────────────────────────────────────
export {
  CircuitBreaker,
  CircuitOpenError,
  computeDelay,
  retry,
  parseRateLimitHeaders,
} from './llm/utils.js';

// ─── LLM Key Pool ───────────────────────────────────────────────────
export { KeyPool, loadKeyPoolConfig } from './llm/key-pool.js';
export type { KeyPoolFiles } from './llm/key-pool.js';

// ─── Facades ─────────────────────────────────────────────────────────
export { registerFacade, registerAllFacades } from './facades/facade-factory.js';
export { facadeInputSchema } from './facades/types.js';
export type {
  OpHandler,
  AuthLevel,
  OpDefinition,
  FacadeConfig,
  FacadeResponse,
  FacadeInput,
} from './facades/types.js';

// ─── LLM Client ─────────────────────────────────────────────────────
export { LLMClient } from './llm/llm-client.js';

// ─── Control ────────────────────────────────────────────────────────
export { IdentityManager } from './control/identity-manager.js';
export { IntentRouter } from './control/intent-router.js';
export type {
  GuidelineCategory,
  Guideline,
  AgentIdentity,
  IdentityVersion,
  IdentityUpdateInput,
  GuidelineInput,
  IntentType,
  OperationalMode,
  IntentClassification,
  ModeConfig,
  MorphResult,
} from './control/types.js';

// ─── Project Registry ──────────────────────────────────────────────
export { ProjectRegistry } from './project/project-registry.js';
export type { RegisteredProject, ProjectRule, LinkType, ProjectLink } from './project/types.js';

// ─── Telemetry ─────────────────────────────────────────────────────
export { Telemetry } from './telemetry/telemetry.js';
export type { FacadeCall, TelemetryStats } from './telemetry/telemetry.js';

// ─── Logging ────────────────────────────────────────────────────────
export { Logger, createLogger } from './logging/logger.js';
export type { LogLevel, LogEntry, LogContext, LoggerConfig } from './logging/types.js';

// ─── Runtime Factory ────────────────────────────────────────────────
export { createAgentRuntime } from './runtime/runtime.js';
export { createCoreOps } from './runtime/core-ops.js';
export { createDomainFacade, createDomainFacades } from './runtime/domain-ops.js';
export { createPlanningExtraOps } from './runtime/planning-extra-ops.js';
export { createMemoryExtraOps } from './runtime/memory-extra-ops.js';
export { createVaultExtraOps } from './runtime/vault-extra-ops.js';
export { createAdminOps } from './runtime/admin-ops.js';
export { createAdminExtraOps } from './runtime/admin-extra-ops.js';
export { createLoopOps } from './runtime/loop-ops.js';
export { createOrchestrateOps } from './runtime/orchestrate-ops.js';
export { createGradingOps } from './runtime/grading-ops.js';
export { createCaptureOps } from './runtime/capture-ops.js';
export { createCuratorExtraOps } from './runtime/curator-extra-ops.js';
export { createProjectOps } from './runtime/project-ops.js';
export { createMemoryCrossProjectOps } from './runtime/memory-cross-project-ops.js';
export type { AgentRuntimeConfig, AgentRuntime } from './runtime/types.js';
