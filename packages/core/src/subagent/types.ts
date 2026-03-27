/**
 * Subagent runtime engine — types for spawning, managing, and aggregating
 * results from child agent processes.
 *
 * The SubagentDispatcher composes: TaskCheckout, WorkspaceResolver,
 * ConcurrencyManager, OrphanReaper, and RuntimeAdapterRegistry.
 */

import type { AdapterSessionState, AdapterTokenUsage } from '../adapters/types.js';

// ─── Task ───────────────────────────────────────────────────────────

/** A task to be dispatched to a subagent */
export interface SubagentTask {
  /** Unique task identifier */
  taskId: string;
  /** The prompt or task description for the subagent */
  prompt: string;
  /** Working directory for execution */
  workspace: string;
  /** Runtime adapter type (e.g., 'claude-code', 'codex'). Falls back to registry default. */
  runtime?: string;
  /** Task IDs this task depends on (must complete first) */
  dependencies?: string[];
  /** Timeout in milliseconds. Default: 300_000 (5 min) */
  timeout?: number;
  /** Additional context to pass to the adapter */
  config?: Record<string, unknown>;
}

// ─── Status ─────────────────────────────────────────────────────────

/** Lifecycle status of a subagent task */
export type SubagentStatus = 'queued' | 'claimed' | 'running' | 'completed' | 'failed' | 'orphaned';

// ─── Result ─────────────────────────────────────────────────────────

/** Result from a single subagent execution */
export interface SubagentResult {
  /** Task ID this result belongs to */
  taskId: string;
  /** Final status */
  status: SubagentStatus;
  /** Exit code from the adapter (0 = success) */
  exitCode: number;
  /** Human-readable summary of what the subagent did */
  summary?: string;
  /** Token usage */
  usage?: AdapterTokenUsage;
  /** Session state for potential resume */
  sessionState?: AdapterSessionState;
  /** Files changed by this subagent */
  filesChanged?: string[];
  /** Error message if failed */
  error?: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** PID of the child process (if spawned) */
  pid?: number;
}

// ─── Dispatch Options ───────────────────────────────────────────────

/** Options controlling how tasks are dispatched */
export interface DispatchOptions {
  /** Run tasks in parallel (default: true) */
  parallel?: boolean;
  /** Max concurrent subagents (default: 3) */
  maxConcurrent?: number;
  /** Isolate each task in a git worktree (default: false) */
  worktreeIsolation?: boolean;
  /** Global timeout per task in ms (default: 300_000) */
  timeout?: number;
  /** Callback for per-task status updates */
  onTaskUpdate?: (taskId: string, status: SubagentStatus) => void;
}

// ─── Aggregated Result ──────────────────────────────────────────────

/** Aggregated result from multiple subagent executions */
export interface AggregatedResult {
  /** Overall status */
  status: 'all-passed' | 'partial' | 'all-failed';
  /** Total tasks dispatched */
  totalTasks: number;
  /** Count of completed tasks */
  completed: number;
  /** Count of failed tasks */
  failed: number;
  /** Sum of all token usage */
  totalUsage: AdapterTokenUsage;
  /** Deduplicated list of all files changed */
  filesChanged: string[];
  /** Combined summary from all tasks */
  combinedSummary: string;
  /** Total duration in milliseconds */
  durationMs: number;
  /** Per-task results */
  results: SubagentResult[];
}

// ─── Claim Info ─────────────────────────────────────────────────────

/** Information about a task claim */
export interface ClaimInfo {
  /** Task ID */
  taskId: string;
  /** Agent/process that claimed this task */
  claimerId: string;
  /** When the claim was made */
  claimedAt: number;
}

// ─── Worktree Info ──────────────────────────────────────────────────

/** Information about an active git worktree */
export interface WorktreeInfo {
  /** Task ID this worktree is for */
  taskId: string;
  /** Absolute path to the worktree */
  path: string;
  /** Branch name (if created) */
  branch?: string;
  /** When the worktree was created */
  createdAt: number;
}

// ─── Tracked Process ────────────────────────────────────────────────

/** A tracked child process for orphan detection */
export interface TrackedProcess {
  /** Process ID */
  pid: number;
  /** Task ID this process is executing */
  taskId: string;
  /** When the process was registered */
  registeredAt: number;
}
