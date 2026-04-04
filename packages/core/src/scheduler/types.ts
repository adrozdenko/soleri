/**
 * Cross-platform task scheduler types.
 * Enables Soleri agents to schedule autonomous background operations.
 */

export interface ScheduledTask {
  id: string;
  name: string;
  /** Standard cron expression (minute hour day month weekday). Minimum interval: 1 hour. */
  cronExpression: string;
  /** Prompt passed to `claude -p` when the task fires */
  prompt: string;
  /** Absolute path to the agent project directory */
  projectPath: string;
  /** OS-specific task identifier (plist label, systemd unit name, etc.) */
  platformId?: string;
  enabled: boolean;
  lastRunAt?: string;
  lastExitCode?: number;
  createdAt: string;
}

export interface CreateTaskInput {
  name: string;
  cronExpression: string;
  prompt: string;
  projectPath: string;
}

export interface TaskListEntry extends ScheduledTask {
  /** Whether the OS-level task exists and matches the DB record */
  platformSynced: boolean;
}

export interface SchedulerResult {
  success: boolean;
  error?: string;
}

/** Platform adapter interface — each OS implements this. */
export interface PlatformAdapter {
  /** Create or update the OS-level scheduled task. Returns the platform ID. */
  create(task: ScheduledTask): Promise<string>;
  /** Remove the OS-level scheduled task. */
  remove(platformId: string): Promise<void>;
  /** Check if the OS-level task exists. */
  exists(platformId: string): Promise<boolean>;
  /** Pause (disable) the OS-level scheduled task. */
  pause(platformId: string): Promise<void>;
  /** Resume (enable) the OS-level scheduled task. */
  resume(platformId: string): Promise<void>;
}
