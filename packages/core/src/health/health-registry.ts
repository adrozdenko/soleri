/**
 * Centralized health registry — subsystems report status,
 * consumers observe transitions, self-healing retries on recovery.
 */

export type SubsystemStatus = 'healthy' | 'degraded' | 'down';

export interface SubsystemHealth {
  name: string;
  status: SubsystemStatus;
  lastCheckedAt: number;
  lastHealthyAt: number | null;
  failureCount: number;
  lastError: string | null;
}

export type StatusChangeListener = (
  name: string,
  prev: SubsystemStatus,
  next: SubsystemStatus,
) => void;

export type RecoveryHook = (name: string) => void | Promise<void>;

export interface HealthSnapshot {
  overall: SubsystemStatus;
  subsystems: Record<string, SubsystemHealth>;
  registeredAt: number;
}

export class HealthRegistry {
  private subsystems = new Map<string, SubsystemHealth>();
  private listeners: StatusChangeListener[] = [];
  private recoveryHooks = new Map<string, RecoveryHook[]>();
  private readonly registeredAt = Date.now();

  register(name: string, initialStatus: SubsystemStatus = 'healthy'): void {
    if (this.subsystems.has(name)) return;
    this.subsystems.set(name, {
      name,
      status: initialStatus,
      lastCheckedAt: Date.now(),
      lastHealthyAt: initialStatus === 'healthy' ? Date.now() : null,
      failureCount: 0,
      lastError: null,
    });
  }

  update(name: string, status: SubsystemStatus, error?: string): void {
    let sub = this.subsystems.get(name);
    if (!sub) {
      this.register(name, status);
      sub = this.subsystems.get(name)!;
      if (error) sub.lastError = error;
      return;
    }

    const prev = sub.status;
    sub.status = status;
    sub.lastCheckedAt = Date.now();

    if (status === 'healthy') {
      sub.lastHealthyAt = Date.now();
      sub.failureCount = 0;
      sub.lastError = null;
    } else {
      sub.failureCount++;
      if (error) sub.lastError = error;
    }

    if (prev !== status) {
      for (const listener of this.listeners) {
        try {
          listener(name, prev, status);
        } catch {
          // Listener errors must not crash the registry
        }
      }

      // Trigger recovery hooks when transitioning TO healthy
      if (status === 'healthy' && prev !== 'healthy') {
        this.triggerRecovery(name);
      }
    }
  }

  get(name: string): SubsystemHealth | undefined {
    return this.subsystems.get(name);
  }

  snapshot(): HealthSnapshot {
    const subsystems: Record<string, SubsystemHealth> = {};
    for (const [name, health] of this.subsystems) {
      subsystems[name] = { ...health };
    }
    return {
      overall: this.computeOverall(),
      subsystems,
      registeredAt: this.registeredAt,
    };
  }

  onStatusChange(listener: StatusChangeListener): void {
    this.listeners.push(listener);
  }

  onRecovery(subsystem: string, hook: RecoveryHook): void {
    const hooks = this.recoveryHooks.get(subsystem) ?? [];
    hooks.push(hook);
    this.recoveryHooks.set(subsystem, hooks);
  }

  private triggerRecovery(name: string): void {
    const hooks = this.recoveryHooks.get(name);
    if (!hooks) return;
    for (const hook of hooks) {
      try {
        const result = hook(name);
        if (result instanceof Promise) {
          result.catch(() => {
            // Recovery hook failure is non-fatal
          });
        }
      } catch {
        // Recovery hook failure is non-fatal
      }
    }
  }

  private computeOverall(): SubsystemStatus {
    let hasDown = false;
    let hasDegraded = false;
    for (const sub of this.subsystems.values()) {
      if (sub.status === 'down') hasDown = true;
      if (sub.status === 'degraded') hasDegraded = true;
    }
    if (hasDown) return 'down';
    if (hasDegraded) return 'degraded';
    return 'healthy';
  }
}

/**
 * Wrap an async call with graceful degradation.
 * On failure, returns the fallback value and updates health registry.
 */
export async function withDegradation<T>(
  registry: HealthRegistry,
  subsystem: string,
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    const result = await fn();
    registry.update(subsystem, 'healthy');
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const current = registry.get(subsystem);
    // First failure = degraded, repeated = down
    const status: SubsystemStatus = current && current.status === 'degraded' ? 'down' : 'degraded';
    registry.update(subsystem, status, message);
    return fallback;
  }
}
