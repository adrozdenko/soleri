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
  PlaybookExecutor,
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
  PlaybookSession,
  PlaybookStepState,
  PlaybookStepStatus,
  StartResult,
  StepResult,
  CompleteResult,
} from './playbooks/index.js';
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

// ─── Cognee Sync ──────────────────────────────────────────────────────
export { CogneeSyncManager } from './cognee/sync-manager.js';
export type { SyncOp, SyncStatus, SyncQueueItem, SyncManagerStats } from './cognee/sync-manager.js';

// ─── Intake Pipeline ──────────────────────────────────────────────────
export { IntakePipeline } from './intake/intake-pipeline.js';
export { classifyChunk, VALID_TYPES, CLASSIFICATION_PROMPT } from './intake/content-classifier.js';
export { dedupItems, DEDUP_THRESHOLD } from './intake/dedup-gate.js';
export type {
  IntakeConfig,
  IntakeChunk,
  IntakeJobRecord,
  IntakeJobStatus,
  IntakeChunkStatus,
  KnowledgeType,
  ClassifiedItem,
  IntakePreviewResult,
} from './intake/types.js';
export type { DedupResult } from './intake/dedup-gate.js';

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
  TaskMetrics,
  TaskDeliverable,
  ExecutionSummary,
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
export {
  LoopManager,
  extractPromise,
  detectImplicitCompletion,
  detectAnomaly,
} from './loop/loop-manager.js';
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

// ─── Extensions ──────────────────────────────────────────────────────
export type { AgentExtensions, OpMiddleware, MiddlewareContext } from './extensions/index.js';
export { wrapWithMiddleware } from './extensions/index.js';

// ─── Facades ─────────────────────────────────────────────────────────
export { registerFacade, registerAllFacades } from './facades/facade-factory.js';
export type { RegisterOptions } from './facades/facade-factory.js';
export { facadeInputSchema, AUTH_LEVEL_RANK } from './facades/types.js';
export type {
  OpHandler,
  AuthLevel,
  AuthMode,
  AuthPolicy,
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

// ─── Scope Detection ────────────────────────────────────────────────
export { detectScope } from './vault/scope-detector.js';
export type {
  ScopeTier,
  ConfidenceLevel,
  ScopeSignal,
  ScopeDetectionResult,
  ScopeInput,
} from './vault/scope-detector.js';

// ─── Enforcement ────────────────────────────────────────────────────
export { EnforcementRegistry, ClaudeCodeAdapter } from './enforcement/index.js';
export type {
  EnforcementTrigger,
  EnforcementAction,
  EnforcementRule,
  EnforcementConfig,
  HostAdapterResult,
  HostAdapter,
} from './enforcement/index.js';

// ─── CLAUDE.md Composition ──────────────────────────────────────────
export {
  composeCLAUDEmd,
  FORMAT_VERSION,
  OPEN_MARKER,
  CLOSE_MARKER,
  USER_ZONE_OPEN,
  USER_ZONE_CLOSE,
  injectCLAUDEmd,
  removeCLAUDEmd,
  hasCLAUDEmdBlock,
  extractUserZone,
} from './claudemd/index.js';
export type {
  ComposeOptions,
  AgentMeta,
  GlobalInstruction,
  FacadeInstructions,
  InjectionResult,
  RemovalResult,
} from './claudemd/index.js';

// ─── Health ─────────────────────────────────────────────────────────
export { HealthRegistry, withDegradation, checkVaultIntegrity } from './health/index.js';
export type {
  SubsystemStatus,
  SubsystemHealth,
  StatusChangeListener,
  RecoveryHook,
  HealthSnapshot,
  IntegrityResult,
} from './health/index.js';

// ─── Runtime Factory ────────────────────────────────────────────────
export { createAgentRuntime } from './runtime/runtime.js';
export { createSemanticFacades } from './runtime/facades/index.js';
export { createDomainFacade, createDomainFacades } from './runtime/domain-ops.js';
export { FeatureFlags } from './runtime/feature-flags.js';
export type { FlagDefinition } from './runtime/feature-flags.js';
export type { AgentRuntimeConfig, AgentRuntime } from './runtime/types.js';

// ─── Errors ────────────────────────────────────────────────────────────
export {
  SoleriErrorCode,
  SoleriError,
  ok,
  err,
  isOk,
  isErr,
  classifyError,
  retryWithPreset,
  shouldRetry,
  getRetryDelay,
  RETRY_PRESETS,
} from './errors/index.js';
export type {
  ErrorClassification,
  Result,
  SoleriErrorOptions,
  RetryPreset,
  RetryConfig as SoleriRetryConfig,
  RetryOptions,
} from './errors/index.js';

// ─── Persistence ───────────────────────────────────────────────────────
export { SQLitePersistenceProvider } from './persistence/index.js';
export { PostgresPersistenceProvider, translateSql } from './persistence/index.js';
export type {
  PersistenceProvider,
  PersistenceParams,
  RunResult,
  PersistenceConfig,
  FtsSearchOptions,
} from './persistence/index.js';

// ─── Streams ──────────────────────────────────────────────────────────
export { ReplayableStream, fanOut } from './streams/index.js';
export { normalize, collect } from './streams/index.js';
export type { NestableInput } from './streams/index.js';

// ─── Content Hashing ──────────────────────────────────────────────────
export { computeContentHash } from './vault/content-hash.js';
export type { HashableEntry } from './vault/content-hash.js';

// ─── Prompts ───────────────────────────────────────────────────────────
export { TemplateManager, parseVariables, resolveIncludes } from './prompts/index.js';
export type { PromptTemplate, TemplateVariable, RenderOptions } from './prompts/index.js';
