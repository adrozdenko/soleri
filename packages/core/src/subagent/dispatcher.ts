/**
 * SubagentDispatcher — the core orchestrator for subagent execution.
 *
 * Composes: TaskCheckout, WorkspaceResolver, ConcurrencyManager,
 * OrphanReaper, and RuntimeAdapterRegistry to dispatch tasks to
 * child agent processes.
 */

import type { RuntimeAdapterRegistry } from '../adapters/registry.js';
import type {
  SubagentTask,
  SubagentResult,
  SubagentStatus,
  DispatchOptions,
  AggregatedResult,
} from './types.js';
import { TaskCheckout } from './task-checkout.js';
import { WorkspaceResolver } from './workspace-resolver.js';
import { ConcurrencyManager } from './concurrency-manager.js';
import { OrphanReaper } from './orphan-reaper.js';
import type { ReapResult } from './orphan-reaper.js';
import { aggregate } from './result-aggregator.js';
import type { GoalRepository } from '../planning/goal-ancestry.js';
import { GoalAncestry } from '../planning/goal-ancestry.js';

const DEFAULT_TIMEOUT = 300_000; // 5 minutes
const DEFAULT_MAX_CONCURRENT = 3;

export interface SubagentDispatcherConfig {
  /** RuntimeAdapterRegistry for looking up adapters by type */
  adapterRegistry: RuntimeAdapterRegistry;
  /** Base directory for git worktree isolation */
  baseDir?: string;
  /** Optional goal repository for injecting goal ancestry context */
  goalRepository?: GoalRepository;
}

export class SubagentDispatcher {
  private readonly checkout = new TaskCheckout();
  private readonly workspace: WorkspaceResolver;
  private readonly concurrency = new ConcurrencyManager();
  private readonly reaper: OrphanReaper;
  private readonly adapterRegistry: RuntimeAdapterRegistry;
  private readonly goalAncestry?: GoalAncestry;

  constructor(config: SubagentDispatcherConfig) {
    this.adapterRegistry = config.adapterRegistry;
    if (config.goalRepository) {
      this.goalAncestry = new GoalAncestry(config.goalRepository);
    }
    this.workspace = new WorkspaceResolver(config.baseDir ?? process.cwd());
    this.reaper = new OrphanReaper((taskId, pid) => {
      // On orphan: kill the process group, release the task claim, and clean up workspace
      this.reaper.killProcessGroup(pid);
      this.checkout.release(taskId);
      this.workspace.cleanup(taskId);
    });
  }

  /**
   * Dispatch one or more tasks to subagents.
   *
   * Tasks run in parallel by default (controlled by options.parallel).
   * Each task goes through: claim → resolve workspace → acquire slot →
   * execute via adapter → collect result.
   */
  async dispatch(tasks: SubagentTask[], options: DispatchOptions = {}): Promise<AggregatedResult> {
    const {
      parallel = true,
      maxConcurrent = DEFAULT_MAX_CONCURRENT,
      worktreeIsolation = false,
      timeout = DEFAULT_TIMEOUT,
      onTaskUpdate,
    } = options;

    if (tasks.length === 0) {
      return aggregate([]);
    }

    // Resolve dependency order
    const ordered = this.resolveDependencies(tasks);

    try {
      if (parallel) {
        // Run independent tasks in parallel, respecting dependencies
        const results = await this.dispatchParallel(ordered, {
          maxConcurrent,
          worktreeIsolation,
          timeout,
          onTaskUpdate,
        });
        return aggregate(results);
      }

      // Sequential dispatch — await in loop is intentional (tasks must run one at a time)
      const results: SubagentResult[] = [];
      for (const task of ordered) {
        // eslint-disable-line no-await-in-loop
        onTaskUpdate?.(task.taskId, 'running');
        const result = await this.executeTask(task, worktreeIsolation, timeout);
        results.push(result);
        onTaskUpdate?.(task.taskId, result.status);

        // Stop on failure in sequential mode
        if (result.exitCode !== 0) break;
      }

      return aggregate(results);
    } finally {
      // Event-driven orphan reaping: sweep after every dispatch cycle
      this.reaper.reap();
    }
  }

  /** Clean up all resources — kills tracked process groups, then cleans worktrees, claims, concurrency */
  cleanup(): void {
    this.reaper.killAll();
    this.workspace.cleanupAll();
    this.checkout.releaseAll();
    this.concurrency.reset();
  }

  /** Run orphan detection and cleanup */
  reapOrphans(): ReapResult {
    return this.reaper.reap();
  }

  // ── Internal ──────────────────────────────────────────────────────

  private async dispatchParallel(
    tasks: SubagentTask[],
    opts: {
      maxConcurrent: number;
      worktreeIsolation: boolean;
      timeout: number;
      onTaskUpdate?: (taskId: string, status: SubagentStatus) => void;
    },
  ): Promise<SubagentResult[]> {
    const results = new Map<string, SubagentResult>();
    const pending = new Map<string, SubagentTask>();
    const completed = new Set<string>();

    // Initialize all tasks as pending
    for (const task of tasks) {
      pending.set(task.taskId, task);
    }

    // Process in waves until all done
    while (pending.size > 0) {
      // Find tasks whose dependencies are all completed
      const ready: SubagentTask[] = [];
      for (const [_id, task] of pending) {
        const deps = task.dependencies ?? [];
        if (deps.every((d) => completed.has(d))) {
          ready.push(task);
        }
      }

      if (ready.length === 0 && pending.size > 0) {
        // Deadlock — remaining tasks have unmet dependencies
        for (const [deadId, task] of pending) {
          results.set(deadId, {
            taskId: deadId,
            status: 'failed',
            exitCode: 1,
            error: `Unresolvable dependencies: ${(task.dependencies ?? []).filter((d) => !completed.has(d)).join(', ')}`,
            durationMs: 0,
          });
        }
        break;
      }

      // Dispatch ready tasks in parallel with concurrency control
      // eslint-disable-next-line no-await-in-loop -- waves must complete before next wave
      const waveResults = await Promise.allSettled(
        ready.map(async (task) => {
          opts.onTaskUpdate?.(task.taskId, 'running');
          await this.concurrency.acquire(task.runtime ?? 'default', opts.maxConcurrent);
          try {
            return await this.executeTask(
              task,
              opts.worktreeIsolation,
              task.timeout ?? opts.timeout,
            );
          } finally {
            this.concurrency.release(task.runtime ?? 'default');
          }
        }),
      );

      // Collect results
      for (let i = 0; i < ready.length; i++) {
        const task = ready[i];
        const settled = waveResults[i];
        const result: SubagentResult =
          settled.status === 'fulfilled'
            ? settled.value
            : {
                taskId: task.taskId,
                status: 'failed',
                exitCode: 1,
                error: settled.reason?.message ?? 'Unknown error',
                durationMs: 0,
              };

        results.set(task.taskId, result);
        completed.add(task.taskId);
        pending.delete(task.taskId);
        opts.onTaskUpdate?.(task.taskId, result.status);
      }
    }

    // Return in original task order
    return tasks.map((t) => results.get(t.taskId)!);
  }

  private async executeTask(
    task: SubagentTask,
    worktreeIsolation: boolean,
    timeout: number,
  ): Promise<SubagentResult> {
    const startTime = Date.now();

    // 1. Claim the task
    const claimed = this.checkout.claim(task.taskId, 'dispatcher');
    if (!claimed) {
      return {
        taskId: task.taskId,
        status: 'failed',
        exitCode: 1,
        error: 'Task already claimed by another process',
        durationMs: Date.now() - startTime,
      };
    }

    // 2. Resolve workspace
    const workspace = this.workspace.resolve(task.taskId, task.workspace, worktreeIsolation);

    // 3. Get adapter
    const adapterType = task.runtime ?? this.getDefaultAdapterType();
    let adapter;
    try {
      adapter = this.adapterRegistry.get(adapterType);
    } catch {
      this.checkout.release(task.taskId);
      return {
        taskId: task.taskId,
        status: 'failed',
        exitCode: 1,
        error: `Adapter '${adapterType}' not found in registry`,
        durationMs: Date.now() - startTime,
      };
    }

    // 4. Inject goal ancestry context if available
    let enrichedConfig: Record<string, unknown> = { ...task.config, timeout };
    const goalId = task.config?.goalId as string | undefined;
    if (goalId && this.goalAncestry) {
      enrichedConfig =
        this.goalAncestry.inject({ config: enrichedConfig }, goalId).config ?? enrichedConfig;
    }

    // 5. Execute with timeout and active process killing
    let childPid: number | undefined;
    try {
      const resultPromise = adapter.execute({
        runId: `subagent-${task.taskId}-${Date.now()}`,
        prompt: task.prompt,
        workspace,
        config: enrichedConfig,
        onMeta: (meta) => {
          // Adapters report their child PID via onMeta({ pid })
          if (typeof meta.pid === 'number') {
            childPid = meta.pid;
            this.reaper.register(childPid, task.taskId);
          }
        },
      });

      let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutTimer = setTimeout(() => {
          reject(new Error('Task timed out'));
          // Kill the child process if we have a PID
          if (childPid !== undefined) {
            // Fire-and-forget: kill with escalation (SIGTERM → wait 5s → SIGKILL)
            void this.reaper.killProcess(childPid, true).then(() => {
              this.reaper.unregister(childPid!);
            });
          }
        }, timeout);
      });

      let adapterResult;
      try {
        adapterResult = await Promise.race([resultPromise, timeoutPromise]);
      } finally {
        clearTimeout(timeoutTimer);
      }

      // Normal completion — unregister from reaper
      if (childPid !== undefined) {
        this.reaper.unregister(childPid);
      }

      return {
        taskId: task.taskId,
        status: adapterResult.exitCode === 0 ? 'completed' : 'failed',
        exitCode: adapterResult.exitCode,
        summary: adapterResult.summary,
        usage: adapterResult.usage,
        sessionState: adapterResult.sessionState,
        durationMs: Date.now() - startTime,
        pid: childPid ?? adapterResult.pid,
      };
    } catch (err) {
      return {
        taskId: task.taskId,
        status: 'failed',
        exitCode: 1,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startTime,
        pid: childPid,
      };
    } finally {
      // Cleanup
      this.checkout.release(task.taskId);
      if (worktreeIsolation) {
        this.workspace.cleanup(task.taskId);
      }
    }
  }

  /** Topological sort by dependencies (stable — preserves input order for equal deps) */
  private resolveDependencies(tasks: SubagentTask[]): SubagentTask[] {
    const taskMap = new Map(tasks.map((t) => [t.taskId, t]));
    const sorted: SubagentTask[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (id: string) => {
      if (visited.has(id)) return;
      if (visiting.has(id)) return; // cycle — skip
      visiting.add(id);

      const task = taskMap.get(id);
      if (task) {
        for (const dep of task.dependencies ?? []) {
          visit(dep);
        }
        visited.add(id);
        visiting.delete(id);
        sorted.push(task);
      }
    };

    for (const task of tasks) {
      visit(task.taskId);
    }

    return sorted;
  }

  private getDefaultAdapterType(): string {
    try {
      return this.adapterRegistry.getDefault().type;
    } catch {
      return 'claude-code';
    }
  }
}
