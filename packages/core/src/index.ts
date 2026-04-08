// ─── @soleri/core — Public API ──────────────────────────────────────
//
// This barrel exports symbols needed by pack authors and external consumers.
// Internal module details are available via subpath imports:
//   import { ... } from '@soleri/core/brain'
//   import { ... } from '@soleri/core/planning'
//   import { ... } from '@soleri/core/vault'
//   import { ... } from '@soleri/core/chat'
//   etc.
//
// See package.json "exports" for the full list of subpath entry points.
// ────────────────────────────────────────────────────────────────────

// ─── Runtime Factory (core public API) ─────────────────────────────
export {
  createAgentRuntime,
  createSemanticFacades,
  createDomainFacade,
  createDomainFacades,
  loadAgentConfig,
  DEFAULT_AGENT_CONFIG,
  FeatureFlags,
  syncHooksToClaudeSettings,
} from './runtime/index.js';
export type { AgentConfig, AgentRuntime, AgentRuntimeConfig } from './runtime/index.js';

// ─── Facades (pack authors need these) ─────────────────────────────
export { registerFacade, registerAllFacades } from './facades/facade-factory.js';
export type { RegisterOptions } from './facades/facade-factory.js';
export { facadeInputSchema } from './facades/types.js';
export type {
  OpHandler,
  OpSchema,
  OpDefinition,
  OpVisibility,
  FacadeConfig,
  FacadeResponse,
  FacadeInput,
} from './facades/types.js';

// ─── Engine (v7 direct registration) ───────────────────────────────
export { registerEngine } from './engine/register-engine.js';
export type {
  EngineRegistrationOptions,
  EngineRegistrationResult,
} from './engine/register-engine.js';
export {
  resolveModules,
  ENGINE_PROFILES,
  PROFILE_MODULES,
  ALL_MODULE_SUFFIXES,
} from './engine/module-registry.js';
export type { EngineProfile } from './engine/module-registry.js';

// ─── Vault ─────────────────────────────────────────────────────────
export { syncAllToMarkdown, syncEntryToMarkdown, entryToMarkdown } from './vault/index.js';
export { Vault } from './vault/index.js';
export type { SearchResult, VaultStats, ProjectInfo, Memory, MemoryStats } from './vault/index.js';
export { VaultManager, type ConnectedVault } from './vault/index.js';
export { TIER_WEIGHTS } from './vault/index.js';
export { VaultBranching } from './vault/index.js';
export { GitVaultSync } from './vault/index.js';
export type { GitVaultSyncConfig } from './vault/index.js';
export {
  ObsidianSync,
  toObsidianMarkdown,
  fromObsidianMarkdown,
  titleToSlug,
} from './vault/index.js';
export type {
  ObsidianSyncConfig,
  ObsidianExportOptions,
  ObsidianImportOptions,
  ObsidianSyncMode,
  ObsidianSyncOptions,
  ObsidianExportResult,
  ObsidianImportResult,
  ObsidianSyncResult,
  ConflictInfo,
} from './vault/index.js';
export type { BranchAction, BranchEntry, BranchSummary, MergeResult } from './vault/index.js';
export type {
  VaultTier,
  VaultTierConfig,
  VaultManagerConfig,
  VaultTierInfo,
} from './vault/index.js';
export { validatePlaybook, parsePlaybookFromEntry } from './vault/index.js';
export type { Playbook, PlaybookStep, PlaybookValidationResult } from './vault/index.js';
export { DEFAULT_CANONICAL_TAGS } from './vault/index.js';
export {
  baseNormalizeTag,
  normalizeTagCanonical,
  normalizeTagsCanonical,
  isMetadataTag,
  computeEditDistance,
} from './vault/index.js';
export { detectScope } from './vault/index.js';
export type {
  ScopeTier,
  ConfidenceLevel,
  ScopeSignal,
  ScopeDetectionResult,
  ScopeInput,
} from './vault/index.js';
export { KnowledgeReview } from './vault/index.js';
export type { ReviewStatus, ReviewEntry, ReviewSubmission, ReviewDecision } from './vault/index.js';
export { computeContentHash } from './vault/index.js';
export type { HashableEntry } from './vault/index.js';

// ─── Brain ─────────────────────────────────────────────────────────
export { Brain } from './brain/index.js';
export { BrainIntelligence } from './brain/index.js';
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
  SessionListQuery,
  SessionQuality,
  SessionReplay,
} from './brain/index.js';

// ─── Planning ──────────────────────────────────────────────────────
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
} from './planning/index.js';
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
} from './planning/index.js';
export {
  runGapAnalysis,
  createToolFeasibilityPass,
  createFlowAlignmentPass,
  createAntiPatternPass,
} from './planning/index.js';
export type { GapAnalysisOptions, GapAnalysisPass } from './planning/index.js';
export {
  SEVERITY_WEIGHTS,
  CATEGORY_PENALTY_CAPS,
  MIN_OBJECTIVE_LENGTH,
  MIN_SCOPE_LENGTH,
  MIN_DECISION_LENGTH,
  generateGapId,
} from './planning/index.js';
export type { GapSeverity, GapCategory, PlanGap } from './planning/index.js';
export { GoalAncestry, JsonGoalRepository, generateGoalId } from './planning/index.js';
export type { GoalLevel, GoalStatus, Goal, GoalStore, GoalRepository } from './planning/index.js';
export { assessTaskComplexity } from './planning/index.js';
export type { AssessmentInput, AssessmentSignal, AssessmentResult } from './planning/index.js';
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
} from './planning/index.js';
export type {
  GitHubRepo,
  GitHubMilestone,
  GitHubIssue,
  GitHubLabel,
  GitHubContext,
  GitHubProjection,
  ProjectedIssue,
  PlanMetadataForIssue,
} from './planning/index.js';

// ─── Scheduler ─────────────────────────────────────────────────────
export { Scheduler, InMemorySchedulerStore } from './scheduler/index.js';
export type { SchedulerStore } from './scheduler/index.js';
export { createSchedulerOps } from './scheduler/index.js';
export { validateCron, estimateMinIntervalHours } from './scheduler/index.js';
export type {
  ScheduledTask,
  CreateTaskInput,
  TaskListEntry,
  PlatformAdapter,
} from './scheduler/index.js';

// ─── Capabilities ──────────────────────────────────────────────────
export { CapabilityRegistry } from './capabilities/index.js';
export type { FlowForValidation } from './capabilities/index.js';
export { chainToCapability } from './capabilities/index.js';
export type {
  CapabilityDefinition,
  CapabilityHandler,
  CapabilityContext,
  CapabilityResult,
  KnowledgeContext,
  BrainRecommendation,
  RegisteredCapability,
  ResolvedCapability,
  PackSuggestion,
  FlowValidation,
} from './capabilities/index.js';

// ─── Errors ────────────────────────────────────────────────────────
export {
  SoleriErrorCode,
  SoleriError,
  ok,
  err,
  isOk,
  isErr,
  classifyError,
} from './errors/index.js';
export type { ErrorClassification, Result, SoleriErrorOptions } from './errors/index.js';

// ─── Logging ───────────────────────────────────────────────────────
export { Logger, createLogger } from './logging/logger.js';
export type { LogLevel, LogEntry, LogContext, LoggerConfig } from './logging/types.js';

// ─── Paths ─────────────────────────────────────────────────────────
export {
  SOLERI_HOME,
  agentHome,
  agentVaultPath,
  agentPlansPath,
  agentKeysPath,
  agentFlagsPath,
  agentKnowledgeDir,
  projectKnowledgeDir,
  findProjectRoot,
  sharedVaultPath,
} from './paths.js';

// ─── Domain Packs ──────────────────────────────────────────────────
export {
  validateDomainPack,
  loadDomainPack,
  loadDomainPacksFromConfig,
  createPackRuntime,
  resolveToken,
  listProjectTokens,
  buildReverseIndex,
} from './domain-packs/index.js';
export type {
  DomainPack,
  DomainPackManifest,
  DomainPackRef,
  DomainPackTier,
  PackRuntime,
  PackProjectContext,
  PackCheckContext,
} from './domain-packs/index.js';

// ─── Knowledge Packs ───────────────────────────────────────────────
export {
  PackInstaller,
  PackLifecycleManager,
  packManifestSchema,
  PackLockfile,
  resolvePack,
  checkNpmVersion,
  checkVersionCompat,
  getBuiltinKnowledgePacksDirs,
} from './packs/index.js';
export type {
  PackManifest,
  PackStatus,
  InstalledPack,
  InstallResult,
  LockEntry,
  PackSource,
  PackType,
  ResolvedPack,
} from './packs/index.js';

// ─── Skills ────────────────────────────────────────────────────────
export { classifyTrust, TrustClassifier } from './skills/trust-classifier.js';
export {
  discoverSkills,
  syncSkillsToClaudeCode,
  classifySkills,
  checkSkillCompatibility,
  ApprovalRequiredError,
} from './skills/sync-skills.js';
export type { SkillEntry, SyncResult, SyncOptions } from './skills/sync-skills.js';

// ─── Plugins ───────────────────────────────────────────────────────
export { PluginRegistry, loadPlugins } from './plugins/index.js';
export type {
  PluginManifest,
  PluginStatus,
  LoadedPlugin,
  RegisteredPlugin,
  PluginContext,
  LoadResult as PluginLoadResult,
} from './plugins/index.js';

// ─── Persistence ───────────────────────────────────────────────────
export { SQLitePersistenceProvider } from './persistence/index.js';
export type { PersistenceProvider, PersistenceConfig } from './persistence/index.js';

// ─── Extensions ────────────────────────────────────────────────────
export type { AgentExtensions, OpMiddleware, MiddlewareContext } from './extensions/index.js';
export { wrapWithMiddleware } from './extensions/index.js';

// ─── CLAUDE.md Composition ────────────────────────────────────────
export {
  composeCLAUDEmd,
  injectCLAUDEmd,
  removeCLAUDEmd,
  hasCLAUDEmdBlock,
} from './claudemd/index.js';
export type {
  ComposeOptions,
  AgentMeta,
  InjectionResult,
  RemovalResult,
} from './claudemd/index.js';

// ─── Migrations ────────────────────────────────────────────────────
export { MigrationRunner } from './migrations/index.js';
export type { Migration, MigrationResult, MigrationState } from './migrations/index.js';

// ─── Health ────────────────────────────────────────────────────────
export { HealthRegistry, withDegradation, checkVaultIntegrity } from './health/index.js';
export type { SubsystemHealth, HealthSnapshot, IntegrityResult } from './health/index.js';

// ─── Intelligence ──────────────────────────────────────────────────
export type { IntelligenceEntry, IntelligenceBundle } from './intelligence/types.js';
export { loadIntelligenceData, loadPacks } from './intelligence/loader.js';

// ─── Playbooks ─────────────────────────────────────────────────────
export { seedDefaultPlaybooks, PlaybookExecutor, matchPlaybooks } from './playbooks/index.js';
export type { PlaybookDefinition, PlaybookMatchResult } from './playbooks/index.js';

// ─── Persona ───────────────────────────────────────────────────────
export type { PersonaConfig } from './persona/types.js';
export { loadPersona } from './persona/loader.js';
export { generatePersonaInstructions } from './persona/prompt-generator.js';

// ─── LLM Client ────────────────────────────────────────────────────
export { LLMClient } from './llm/llm-client.js';
export { SecretString, LLMError } from './llm/types.js';
export { KeyPool, loadKeyPoolConfig } from './llm/key-pool.js';
export type { LLMCallOptions, LLMCallResult } from './llm/types.js';

// ─── Streams ───────────────────────────────────────────────────────
export { ReplayableStream, fanOut, normalize, collect } from './streams/index.js';

// ─── Workflows ─────────────────────────────────────────────────────
export { loadAgentWorkflows, getWorkflowForIntent } from './workflows/index.js';
export type { WorkflowGate, WorkflowOverride } from './workflows/index.js';

// ─── Update Check ──────────────────────────────────────────────────
export { checkForUpdate } from './update-check.js';
export type { UpdateInfo } from './update-check.js';

// ─── Prompts ───────────────────────────────────────────────────────
export { TemplateManager } from './prompts/index.js';
export type { PromptTemplate, TemplateVariable, RenderOptions } from './prompts/index.js';

// ─── Project Registry ──────────────────────────────────────────────
export { ProjectRegistry } from './project/project-registry.js';
export type { RegisteredProject } from './project/types.js';

// ─── Telemetry ─────────────────────────────────────────────────────
export { Telemetry } from './telemetry/telemetry.js';

// ─── Chat Transport ────────────────────────────────────────────────
export {
  ChatSessionManager,
  FragmentBuffer,
  ChatAuthManager,
  TaskCancellationManager,
  SelfUpdateManager,
  NotificationEngine,
  chunkResponse,
  runAgentLoop,
  McpToolBridge,
  createOutputCompressor,
} from './chat/index.js';
export type {
  ChatMessage,
  AgentTool,
  ToolResult,
  AgentLoopConfig,
  AgentCallbacks,
  AgentLoopResult,
  McpToolRegistration,
  OutputCompressor,
  Fragment,
  FileInfo,
} from './chat/index.js';

// ─── Subagent ──────────────────────────────────────────────────────
export { SubagentDispatcher } from './subagent/dispatcher.js';
export { TaskCheckout } from './subagent/task-checkout.js';
export { WorkspaceResolver } from './subagent/workspace-resolver.js';
export type {
  SubagentTask,
  SubagentResult,
  DispatchOptions,
  AggregatedResult,
} from './subagent/types.js';

// ─── Curator ───────────────────────────────────────────────────────
export { Curator } from './curator/curator.js';
export type { HealthMetrics, HealthAuditResult, CuratorStatus } from './curator/types.js';

// ─── Governance ────────────────────────────────────────────────────
export { Governance } from './governance/governance.js';

// ─── Agency Mode ───────────────────────────────────────────────────
export { AgencyManager } from './agency/index.js';
export type { AgencyConfig, AgencyStatus, WarningDetector } from './agency/index.js';

// ─── Context Engine ────────────────────────────────────────────────
export { ContextEngine } from './context/index.js';

// ─── Control ───────────────────────────────────────────────────────
export { IdentityManager } from './control/identity-manager.js';
export { IntentRouter } from './control/intent-router.js';

// ─── Enforcement ───────────────────────────────────────────────────
export { EnforcementRegistry, ClaudeCodeAdapter } from './enforcement/index.js';

// ─── Session Compaction ────────────────────────────────────────────
export { shouldCompact, resolvePolicy, renderHandoff } from './session/index.js';
export type { CompactionPolicy, HandoffNote } from './session/index.js';

// ─── Intake Pipeline ──────────────────────────────────────────────
export { IntakePipeline } from './intake/intake-pipeline.js';

// ─── Transport ─────────────────────────────────────────────────────
export {
  HttpMcpServer,
  WsMcpServer,
  LspServer,
  RateLimiter,
  SessionManager,
} from './transport/index.js';

// ─── Loop ──────────────────────────────────────────────────────────
export { LoopManager } from './loop/loop-manager.js';
export type { LoopMode, LoopConfig, LoopStatus } from './loop/types.js';

// ─── Dream ─────────────────────────────────────────────────────────
export { DreamEngine, createDreamOps } from './dream/index.js';

// ─── Operator Context (Adaptive Persona) ───────────────────────────
export { OperatorContextStore } from './operator/operator-context-store.js';
export { OperatorProfileStore } from './operator/operator-profile.js';

// ─── Flow Engine ───────────────────────────────────────────────────
export { FlowExecutor, createDispatcher, loadAllFlows } from './flows/index.js';
export type { Flow, FlowStep, OrchestrationPlan, ExecutionResult } from './flows/index.js';

// ─── Packs (CLI needs these) ─────────────────────────────────────
export { inferPackType } from './packs/lockfile.js';

// ─── Dream (CLI needs these) ─────────────────────────────────────
export { ensureDreamSchema } from './dream/schema.js';
export {
  schedule as scheduleDream,
  unschedule as unscheduleDream,
  getSchedule as getDreamSchedule,
} from './dream/cron-manager.js';

// ─── Adapters ──────────────────────────────────────────────────────
export { RuntimeAdapterRegistry } from './adapters/registry.js';
export type { RuntimeAdapter } from './adapters/types.js';
