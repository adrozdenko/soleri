// ─── Adapters ────────────────────────────────────────────────────────
export { RuntimeAdapterRegistry } from './adapters/registry.js';
export { ClaudeCodeRuntimeAdapter } from './adapters/claude-code-adapter.js';
export type {
  RuntimeAdapter,
  AdapterExecutionContext,
  AdapterExecutionResult,
  AdapterTokenUsage,
  AdapterSessionState,
  AdapterSessionCodec,
  AdapterEnvironmentTestResult,
} from './adapters/types.js';

// ─── Subagent ────────────────────────────────────────────────────────
export { SubagentDispatcher } from './subagent/dispatcher.js';
export { TaskCheckout } from './subagent/task-checkout.js';
export { WorkspaceResolver } from './subagent/workspace-resolver.js';
export { ConcurrencyManager } from './subagent/concurrency-manager.js';
export { OrphanReaper } from './subagent/orphan-reaper.js';
export type { ReapResult } from './subagent/orphan-reaper.js';
export { worktreeReap, worktreeStatus } from './utils/worktree-reaper.js';
export type { ReapReport, WorktreeStatus } from './utils/worktree-reaper.js';
export { aggregate as aggregateResults } from './subagent/result-aggregator.js';
export type {
  SubagentTask,
  SubagentStatus,
  SubagentResult,
  DispatchOptions,
  AggregatedResult,
  ClaimInfo,
  WorktreeInfo,
  TrackedProcess,
} from './subagent/types.js';

// ─── Paths ──────────────────────────────────────────────────────────
export {
  SOLERI_HOME,
  agentHome,
  legacyAgentHome,
  usedLegacyFallback,
  agentVaultPath,
  agentPlansPath,
  agentKeysPath,
  agentTemplatesDir,
  agentFlagsPath,
  agentKnowledgeDir,
  projectKnowledgeDir,
  findProjectRoot,
  sharedVaultPath,
} from './paths.js';

// ─── Intelligence ────────────────────────────────────────────────────
export type {
  IntelligenceEntry,
  IntelligenceBundle,
  IntelligenceBundleLink,
} from './intelligence/types.js';
export { loadIntelligenceData, loadPacks } from './intelligence/loader.js';

// ─── Vault ───────────────────────────────────────────────────────────
export * from './vault/index.js';

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

// ─── Dream ──────────────────────────────────────────────────────────
export { DreamEngine, ensureDreamSchema, createDreamOps } from './dream/index.js';
export {
  getSchedule as getDreamSchedule,
  schedule as scheduleDream,
  unschedule as unscheduleDream,
} from './dream/index.js';
export type { DreamReport, DreamStatus } from './dream/dream-engine.js';
export type { CronSchedule } from './dream/cron-manager.js';

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
export * from './brain/index.js';

// ─── Agency Mode ────────────────────────────────────────────────────
export { AgencyManager } from './agency/index.js';
export type {
  ChangeType,
  FileChange,
  FileChangeListener,
  WarningSeverity,
  Warning,
  WarningDetector,
  SurfacedPattern,
  ClarificationQuestion,
  AgencyConfig,
  AgencyStatus,
} from './agency/index.js';

// ─── Context Engine ─────────────────────────────────────────────────
export { ContextEngine } from './context/index.js';
export type {
  EntityType,
  ExtractedEntity,
  EntityExtractionResult,
  KnowledgeItem,
  KnowledgeRetrievalResult,
  ConfidenceLevel as ContextConfidenceLevel,
  ContextAnalysis,
  ContextEngineConfig,
} from './context/index.js';

// ─── Chat Transport ─────────────────────────────────────────────────
export { ChatSessionManager, FragmentBuffer, ChatAuthManager } from './chat/index.js';
export { TaskCancellationManager } from './chat/index.js';
export { SelfUpdateManager, RESTART_EXIT_CODE } from './chat/index.js';
export { NotificationEngine } from './chat/index.js';
export {
  detectFileIntent,
  buildMultimodalContent,
  saveTempFile,
  cleanupTempFiles,
  sanitizeForPersistence,
  MAX_FILE_SIZE,
  TEXT_EXTENSIONS,
  IMAGE_MIME_TYPES,
  INTAKE_KEYWORDS,
} from './chat/index.js';
export { transcribeAudio, synthesizeSpeech } from './chat/index.js';
export { MessageQueue } from './chat/index.js';
export { BrowserSessionManager } from './chat/index.js';
export { chunkResponse, convertMarkup, markdownToHtml } from './chat/index.js';
export { runAgentLoop } from './chat/index.js';
export { McpToolBridge } from './chat/index.js';
export { createOutputCompressor, registerCompressor, clearCompressors } from './chat/index.js';
export type {
  ChatRole,
  ChatMessage,
  ChatSession,
  ChatSessionConfig,
  Fragment,
  FragmentBufferConfig,
  MarkupFormat,
  ChunkConfig,
  ChatAuthConfig,
  AuthRecord,
  AuthState,
  ChatManagerConfig,
  ChatManagerStatus,
  AgentTool,
  ToolResult,
  ToolExecutor,
  AgentLoopConfig,
  AgentCallbacks,
  AgentLoopResult,
  McpToolRegistration,
  OutputCompressor,
  CancellationInfo,
  RestartContext,
  RestartResult,
  NotificationCheck,
  NotificationEngineConfig,
  NotificationStats,
  FileIntent,
  FileInfo,
  MultimodalContent,
  VoiceConfig,
  TranscriptionResult,
  SpeechResult,
  QueuedMessage,
  QueuedResponse,
  QueueConfig,
  BrowserSessionConfig,
  BrowserSession,
  BrowserTool,
  BrowserToolResult,
} from './chat/index.js';

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
export * from './planning/index.js';

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
  OpVisibility,
  AuthLevel,
  AuthMode,
  AuthPolicy,
  OpSchema,
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

// ─── Persona ──────────────────────────────────────────────────────────
export type {
  PersonaConfig,
  ArchivedPersona,
  PersonaCreateInput,
  PersonaSystemInstructions,
} from './persona/types.js';
export {
  ITALIAN_CRAFTSPERSON,
  NEUTRAL_PERSONA,
  PERSONA_TEMPLATES,
  createDefaultPersona,
} from './persona/defaults.js';
export { loadPersona } from './persona/loader.js';
export { generatePersonaInstructions, getRandomSignoff } from './persona/prompt-generator.js';

// ─── Runtime Factory ────────────────────────────────────────────────
export * from './runtime/index.js';

// ─── Engine (v7 — direct registration, replaces facade factory) ───────
export { registerEngine } from './engine/register-engine.js';
export type {
  EngineRegistrationOptions,
  EngineRegistrationResult,
} from './engine/register-engine.js';
export { captureOps, executeOp } from './engine/test-helpers.js';
export type { CapturedOp } from './engine/test-helpers.js';

// ─── Migrations ────────────────────────────────────────────────────────
export { MigrationRunner } from './migrations/index.js';
export type { Migration, MigrationResult, MigrationState } from './migrations/index.js';

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

// ─── Knowledge Packs ────────────────────────────────────────────────────
export {
  PackInstaller,
  PackLifecycleManager,
  packManifestSchema,
  VALID_TRANSITIONS,
} from './packs/index.js';
export type { PackState, PackTransition } from './packs/index.js';
export { PackLockfile, inferPackType } from './packs/index.js';
export {
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
  ValidateResult,
  LockEntry,
  PackType,
  PackSource,
  PackTier,
  LockfileData,
  ResolvedPack,
  ResolveOptions,
  TrustLevel,
  SourceType,
  SkillInventoryItem,
  SkillMetadata,
} from './packs/index.js';

// ─── Skill Trust & Sync ─────────────────────────────────────────────────
export { classifyTrust, TrustClassifier } from './skills/trust-classifier.js';
export {
  discoverSkills,
  syncSkillsToClaudeCode,
  classifySkills,
  checkSkillCompatibility,
  ApprovalRequiredError,
} from './skills/sync-skills.js';
export type {
  SkillEntry,
  SyncResult,
  SyncOptions,
  ClassifySkillsOptions,
} from './skills/sync-skills.js';

// ─── Plugin System ──────────────────────────────────────────────────────
export {
  PluginRegistry,
  loadPlugins,
  validateDependencies,
  sortByDependencies,
  pluginManifestSchema,
} from './plugins/index.js';
export type {
  PluginManifest,
  PluginStatus,
  PluginProvenance,
  LoadedPlugin,
  RegisteredPlugin,
  PluginFacadeBuilder,
  PluginContext,
  LoadResult as PluginLoadResult,
} from './plugins/index.js';

// ─── Transport ─────────────────────────────────────────────────────────
export type {
  TransportMode,
  HttpTransportConfig,
  WsTransportConfig,
  LspTransportConfig,
  LspCapabilities,
  TransportConfig,
} from './transport/index.js';
export {
  generateToken,
  loadToken,
  saveToken,
  getOrGenerateToken,
  validateBearerToken,
  authenticateRequest,
} from './transport/index.js';
export { RateLimiter } from './transport/index.js';
export type { RateLimitResult } from './transport/index.js';
export { SessionManager } from './transport/index.js';
export type { Session, SessionManagerConfig } from './transport/index.js';
export { HttpMcpServer } from './transport/index.js';
export type { HttpServerCallbacks, HttpServerStats } from './transport/index.js';
export { WsMcpServer } from './transport/index.js';
export type { WsConnection, WsServerCallbacks, WsServerStats } from './transport/index.js';
export { LspServer } from './transport/index.js';
export type {
  LspRequest,
  LspNotification,
  LspResponse,
  LspPosition,
  LspRange,
  LspDiagnostic,
  LspCompletionItem,
  LspHover,
  LspCodeAction,
  LspServerCallbacks,
} from './transport/index.js';

// ─── Prompts ───────────────────────────────────────────────────────────
export { TemplateManager, parseVariables, resolveIncludes } from './prompts/index.js';
export type { PromptTemplate, TemplateVariable, RenderOptions } from './prompts/index.js';

// ─── Domain Packs ──────────────────────────────────────────────────────
export {
  validateDomainPack,
  SEMANTIC_FACADE_NAMES,
  loadDomainPack,
  loadDomainPacksFromConfig,
  resolveDependencies,
} from './domain-packs/index.js';
export type {
  DomainPack,
  DomainPackManifest,
  DomainPackRef,
  DomainPackTier,
  KnowledgeManifest,
  PackSkillDefinition,
  ValidateResult as DomainPackValidateResult,
  PackRuntime,
  PackProjectContext,
  PackCheckContext,
} from './domain-packs/index.js';
export {
  createPackRuntime,
  resolveToken,
  listProjectTokens,
  buildReverseIndex,
} from './domain-packs/index.js';

// ─── Capabilities ───────────────────────────────────────────────────────
export * from './capabilities/index.js';

// ─── Flow Engine ───────────────────────────────────────────────────────
export type {
  Flow,
  FlowStep,
  ProbeName,
  ProbeResults,
  PlanStep,
  SkippedStep,
  OrchestrationPlan,
  OrchestrationContext,
  StepResult as FlowStepResult,
  ExecutionResult,
  GateVerdict,
} from './flows/index.js';
export {
  loadFlowById,
  loadAllFlows,
  runProbes,
  resolveFlowByIntent,
  chainToToolName,
  buildPlan,
  pruneSteps,
  evaluateGate,
  evaluateCondition,
  FlowExecutor,
  createDispatcher,
  runEpilogue,
} from './flows/index.js';

// ─── Operator Profile ───────────────────────────────────────────────
export { OperatorProfileStore } from './operator/operator-profile.js';
export { SignalType } from './operator/operator-types.js';
export {
  extractFromSession,
  extractFromRadar,
  extractFromBrainStrengths,
} from './operator/operator-signals.js';
export type { SessionCaptureData } from './operator/operator-signals.js';
export type {
  CommandStyleData,
  WorkRhythmData,
  ToolPreferenceData,
  SessionDepthData,
  DomainExpertiseData,
  CorrectionData,
  FrustrationData,
  PersonalShareData,
  CommunicationPrefData,
  ReactionToOutputData,
  SignalDataMap,
  OperatorSignal,
  ProfileEvidence,
  IdentitySection,
  CognitivePattern,
  CognitiveDerivation,
  CognitionSection,
  CommunicationAdaptationRule,
  CommunicationSection,
  WorkingRule,
  WorkingRulesSection,
  TrustEvent,
  TrustModelSection,
  TasteEntry,
  TasteProfileSection,
  GrowthEdge,
  GrowthEdgesSection,
  TechnicalTool,
  TechnicalBlindSpot,
  TechnicalContextSection,
  ProfileSection,
  ProfileSectionKey,
  OperatorProfile,
  SynthesisCheckResult,
  ProfileSnapshot,
  OperatorProfileHistory,
} from './operator/operator-types.js';

// ─── Session Compaction ─────────────────────────────────────────────
export type {
  CompactionPolicy,
  CompactionResult,
  SessionState,
  HandoffNote,
} from './session/index.js';
export {
  ENGINE_DEFAULTS,
  shouldCompact,
  parseDuration,
  resolvePolicy,
  renderHandoff,
} from './session/index.js';

// ─── Operator Context (Adaptive Persona) ────────────────────────────
export { OperatorContextStore } from './operator/operator-context-store.js';
export { DECLINED_CATEGORIES } from './operator/operator-context-types.js';
export type {
  OperatorSignals,
  ExpertiseSignal,
  CorrectionSignal,
  InterestSignal,
  WorkPatternSignal,
  OperatorContext,
  ExpertiseItem,
  CorrectionItem,
  InterestItem,
  WorkPatternItem,
  ExpertiseLevel,
  SignalScope,
  PatternFrequency,
  ContextItemType,
  DeclinedCategory,
} from './operator/operator-context-types.js';

// ─── Workflows ─────────────────────────────────────────────────────────
export {
  WorkflowGateSchema,
  WorkflowOverrideSchema,
  WORKFLOW_TO_INTENT,
  loadAgentWorkflows,
  getWorkflowForIntent,
} from './workflows/index.js';
export type { WorkflowGate, WorkflowOverride } from './workflows/index.js';

// ─── Update Check ────────────────────────────────────────────────────
export { checkForUpdate, buildChangelogUrl, detectBreakingChanges } from './update-check.js';
export type { UpdateInfo } from './update-check.js';

// ─── Scheduler ───────────────────────────────────────────────────────
export * from './scheduler/index.js';
