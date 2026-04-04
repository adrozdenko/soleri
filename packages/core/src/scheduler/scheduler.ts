/**
 * Cross-platform task scheduler for autonomous agent operations.
 *
 * Detects the OS and delegates to the appropriate platform adapter:
 * - macOS: launchd (LaunchAgents)
 * - Linux: systemd user timers
 *
 * Tasks are stored in SQLite (agent vault adjacent DB) and synced
 * to the OS-level scheduler on create/delete/pause/resume.
 */

import { platform } from 'node:os';
import type { PlatformAdapter, ScheduledTask, CreateTaskInput, TaskListEntry } from './types.js';
import { validateCron, estimateMinIntervalHours } from './cron-validator.js';

export const MAX_TASKS = 10;
export const MIN_INTERVAL_HOURS = 1;

/** Resolve the platform adapter for the current OS. Throws on unsupported OS. */
export function resolvePlatformAdapter(): PlatformAdapter {
  const os = platform();
  if (os === 'darwin') {
    // Dynamic import avoids loading macOS-specific code on other platforms
    const { MacOSAdapter } = require('./platform-macos.js') as typeof import('./platform-macos.js');
    return new MacOSAdapter();
  }
  if (os === 'linux') {
    const { LinuxAdapter } = require('./platform-linux.js') as typeof import('./platform-linux.js');
    return new LinuxAdapter();
  }
  throw new Error(`Unsupported OS for task scheduler: ${os}. Supported: darwin, linux.`);
}

/**
 * Scheduler — manages CRUD for scheduled tasks against a task store and
 * the OS-level platform adapter.
 */
export class Scheduler {
  private readonly adapter: PlatformAdapter;
  private readonly store: SchedulerStore;

  constructor(adapter?: PlatformAdapter, store?: SchedulerStore) {
    this.adapter = adapter ?? resolvePlatformAdapter();
    this.store = store ?? new InMemorySchedulerStore();
  }

  async create(input: CreateTaskInput): Promise<ScheduledTask | { error: string }> {
    // Validate cron
    const cronError = validateCron(input.cronExpression);
    if (cronError) return { error: cronError };

    // Enforce minimum interval
    const intervalHours = estimateMinIntervalHours(input.cronExpression);
    if (intervalHours < MIN_INTERVAL_HOURS) {
      return { error: `Minimum scheduling interval is ${MIN_INTERVAL_HOURS} hour(s)` };
    }

    // Enforce max tasks limit
    const existing = await this.store.list();
    if (existing.length >= MAX_TASKS) {
      return { error: `Maximum ${MAX_TASKS} scheduled tasks per agent` };
    }

    // Check for duplicate name
    if (existing.some((t) => t.name === input.name)) {
      return { error: `Task "${input.name}" already exists` };
    }

    const task: ScheduledTask = {
      id: `sched-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: input.name,
      cronExpression: input.cronExpression,
      prompt: input.prompt,
      projectPath: input.projectPath,
      enabled: true,
      createdAt: new Date().toISOString(),
    };

    // Create OS-level task
    const platformId = await this.adapter.create(task);
    task.platformId = platformId;

    await this.store.save(task);
    return task;
  }

  async list(): Promise<TaskListEntry[]> {
    const tasks = await this.store.list();
    const entries: TaskListEntry[] = [];

    for (const task of tasks) {
      const platformSynced = task.platformId ? await this.adapter.exists(task.platformId) : false;
      entries.push({ ...task, platformSynced });
    }

    return entries;
  }

  async delete(id: string): Promise<{ deleted: boolean; error?: string }> {
    const task = await this.store.get(id);
    if (!task) return { deleted: false, error: `Task "${id}" not found` };

    if (task.platformId) {
      try {
        await this.adapter.remove(task.platformId);
      } catch {
        // Best-effort — remove from DB even if OS cleanup fails
      }
    }

    await this.store.delete(id);
    return { deleted: true };
  }

  async pause(id: string): Promise<{ paused: boolean; error?: string }> {
    const task = await this.store.get(id);
    if (!task) return { paused: false, error: `Task "${id}" not found` };
    if (!task.enabled) return { paused: false, error: 'Task is already paused' };
    if (!task.platformId) return { paused: false, error: 'Task has no platform ID' };

    await this.adapter.pause(task.platformId);
    task.enabled = false;
    await this.store.save(task);
    return { paused: true };
  }

  async resume(id: string): Promise<{ resumed: boolean; error?: string }> {
    const task = await this.store.get(id);
    if (!task) return { resumed: false, error: `Task "${id}" not found` };
    if (task.enabled) return { resumed: false, error: 'Task is already running' };
    if (!task.platformId) return { resumed: false, error: 'Task has no platform ID' };

    await this.adapter.resume(task.platformId);
    task.enabled = true;
    await this.store.save(task);
    return { resumed: true };
  }
}

// ---------------------------------------------------------------------------
// Store interface + in-memory implementation for testing
// ---------------------------------------------------------------------------

export interface SchedulerStore {
  list(): Promise<ScheduledTask[]>;
  get(id: string): Promise<ScheduledTask | null>;
  save(task: ScheduledTask): Promise<void>;
  delete(id: string): Promise<void>;
}

export class InMemorySchedulerStore implements SchedulerStore {
  private readonly tasks = new Map<string, ScheduledTask>();

  async list(): Promise<ScheduledTask[]> {
    return [...this.tasks.values()];
  }

  async get(id: string): Promise<ScheduledTask | null> {
    return this.tasks.get(id) ?? null;
  }

  async save(task: ScheduledTask): Promise<void> {
    this.tasks.set(task.id, { ...task });
  }

  async delete(id: string): Promise<void> {
    this.tasks.delete(id);
  }
}
