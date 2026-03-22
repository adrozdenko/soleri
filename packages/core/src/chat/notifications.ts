/**
 * Notification Engine — pluggable background polling with debounce.
 *
 * Generic notification system for chat transports. Register check functions
 * that run at configurable intervals. Built-in debounce prevents spam.
 *
 * Transport-specific delivery (Telegram, Discord, etc.) is handled via
 * the onNotify callback.
 */

// ─── Types ────────────────────────────────────────────────────────────

export interface NotificationCheck {
  /** Unique check ID. */
  id: string;
  /** Human-readable label. */
  label: string;
  /** The check function. Returns null if nothing to notify, or a message string. */
  check: () => Promise<string | null>;
  /** Cooldown between notifications for this check (ms). Default: 4 hours. */
  cooldownMs?: number;
  /** Optional time window — only run during these hours (0-23). */
  activeHours?: { start: number; end: number };
}

export interface NotificationEngineConfig {
  /** Polling interval in ms. Default: 30 minutes. */
  intervalMs?: number;
  /** Callback to deliver a notification. */
  onNotify: (checkId: string, message: string) => Promise<void>;
  /** Default cooldown for checks that don't specify one. Default: 4 hours. */
  defaultCooldownMs?: number;
}

export interface NotificationStats {
  /** Number of registered checks. */
  checks: number;
  /** Whether the engine is running. */
  running: boolean;
  /** Total notifications sent. */
  sent: number;
  /** Last poll timestamp. */
  lastPollAt: number | null;
}

// ─── Engine ───────────────────────────────────────────────────────────

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours

export class NotificationEngine {
  private checks = new Map<string, NotificationCheck>();
  private lastNotified = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private sent = 0;
  private lastPollAt: number | null = null;
  private readonly intervalMs: number;
  private readonly defaultCooldownMs: number;
  private readonly onNotify: (checkId: string, message: string) => Promise<void>;

  constructor(config: NotificationEngineConfig) {
    this.intervalMs = config.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.defaultCooldownMs = config.defaultCooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.onNotify = config.onNotify;
  }

  /**
   * Register a notification check.
   */
  register(check: NotificationCheck): void {
    this.checks.set(check.id, check);
  }

  /**
   * Unregister a check.
   */
  unregister(id: string): boolean {
    return this.checks.delete(id);
  }

  /**
   * Start the polling loop. Runs an initial check after a short delay.
   */
  start(): void {
    if (this.timer) return; // Already running

    // Initial check after 10 seconds
    setTimeout(() => this.poll(), 10_000);

    this.timer = setInterval(() => this.poll(), this.intervalMs);
  }

  /**
   * Stop the polling loop.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Run all checks once (called automatically by the polling loop).
   */
  async poll(): Promise<number> {
    this.lastPollAt = Date.now();
    let notified = 0;

    for (const [id, check] of this.checks) {
      try {
        // Time window check
        if (check.activeHours) {
          const hour = new Date().getHours();
          const { start, end } = check.activeHours;
          if (start <= end) {
            if (hour < start || hour >= end) continue;
          } else {
            // Wraps midnight (e.g., 22-6)
            if (hour < start && hour >= end) continue;
          }
        }

        // Cooldown check
        if (!this.shouldNotify(id, check.cooldownMs ?? this.defaultCooldownMs)) {
          continue;
        }

        // oxlint-disable-next-line eslint(no-await-in-loop)
        const message = await check.check();
        if (message) {
          // oxlint-disable-next-line eslint(no-await-in-loop)
          await this.onNotify(id, message);
          this.lastNotified.set(id, Date.now());
          this.sent++;
          notified++;
        }
      } catch {
        // Individual check failure is non-critical
      }
    }

    return notified;
  }

  /**
   * Get engine stats.
   */
  stats(): NotificationStats {
    return {
      checks: this.checks.size,
      running: this.timer !== null,
      sent: this.sent,
      lastPollAt: this.lastPollAt,
    };
  }

  /**
   * Check if enough time has passed since last notification for this check.
   */
  private shouldNotify(checkId: string, cooldownMs: number): boolean {
    const last = this.lastNotified.get(checkId);
    if (!last) return true;
    return Date.now() - last >= cooldownMs;
  }
}
