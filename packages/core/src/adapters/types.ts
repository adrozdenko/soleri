/**
 * Runtime adapter abstraction — dispatch work to any AI CLI.
 *
 * SEPARATE from enforcement HostAdapter (which translates rules).
 * This is about executing tasks on different runtimes (Claude Code, Codex, Cursor, etc.)
 *
 * Inspired by Paperclip AI's ServerAdapterModule pattern.
 */

import type { SkillEntry } from '../skills/sync-skills.js';

// ─── Execution Context ──────────────────────────────────────────────

/** Context passed to an adapter when executing a task */
export interface AdapterExecutionContext {
  /** Unique run identifier */
  runId: string;
  /** The prompt or task description to execute */
  prompt: string;
  /** Working directory for execution */
  workspace: string;
  /** Session state from previous run (adapter-specific format) */
  session?: AdapterSessionState;
  /** Skills to inject into the runtime */
  skills?: SkillEntry[];
  /** Adapter-specific configuration overrides */
  config?: Record<string, unknown>;
  /** Callback for streaming log output */
  onLog?: (message: string) => void;
  /** Callback for metadata events (tokens used, model, etc.) */
  onMeta?: (meta: Record<string, unknown>) => void;
}

/** Opaque session state — each adapter defines its own shape */
export interface AdapterSessionState {
  /** Adapter type that created this state */
  adapterType: string;
  /** Serialized session data (adapter-specific) */
  data: Record<string, unknown>;
}

// ─── Execution Result ───────────────────────────────────────────────

/** Result returned after adapter execution */
export interface AdapterExecutionResult {
  /** Exit code (0 = success) */
  exitCode: number;
  /** Whether execution timed out */
  timedOut?: boolean;
  /** Token usage */
  usage?: AdapterTokenUsage;
  /** Session state to persist for next run */
  sessionState?: AdapterSessionState;
  /** Human-readable summary of what was done */
  summary?: string;
  /** Structured result data */
  resultData?: Record<string, unknown>;
  /** Provider and model info */
  provider?: string;
  model?: string;
}

/** Token usage reported by the adapter */
export interface AdapterTokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

// ─── Session Codec ──────────────────────────────────────────────────

/** Per-adapter session serialization — each runtime stores different session data */
export interface AdapterSessionCodec {
  /** Serialize session state for persistence */
  serialize(state: AdapterSessionState): string;
  /** Deserialize persisted session state */
  deserialize(serialized: string): AdapterSessionState;
  /** Get a human-readable display ID for the session */
  getDisplayId(state: AdapterSessionState): string;
}

// ─── Environment Test ───────────────────────────────────────────────

/** Result of testing whether a runtime is available */
export interface AdapterEnvironmentTestResult {
  /** Whether the runtime CLI is available */
  available: boolean;
  /** Runtime version (if detected) */
  version?: string;
  /** Additional details (path, capabilities, etc.) */
  details?: Record<string, unknown>;
  /** Error message if not available */
  error?: string;
}

// ─── Runtime Adapter Interface ──────────────────────────────────────

/** Core adapter interface — implement this for each AI runtime */
export interface RuntimeAdapter {
  /** Adapter type identifier (e.g., 'claude-code', 'codex', 'cursor') */
  readonly type: string;

  /** Execute a task in this runtime */
  execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult>;

  /** Test whether this runtime is available in the current environment */
  testEnvironment(): Promise<AdapterEnvironmentTestResult>;

  /** Optional: session codec for persisting runtime-specific session state */
  sessionCodec?: AdapterSessionCodec;

  /** Optional: sync skills into the runtime's expected format */
  syncSkills?(skills: SkillEntry[]): Promise<void>;
}
