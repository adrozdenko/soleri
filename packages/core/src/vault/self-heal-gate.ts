// ─── Self-Heal Gate ───────────────────────────────────────────────
// Persistent, session-counted gate for automatic vault self-healing.
// Fires the full self-heal cycle (groom + dedup + contradictions +
// backfill + health audit) when session and time thresholds are met.
//
// Persists to SQLite — survives restarts, no reconfiguration needed.

import type { PersistenceProvider } from '../persistence/types.js';
import type { Curator } from '../curator/curator.js';
import type { LinkManager } from './linking.js';
import { OperationLogger } from './operation-log.js';

export interface SelfHealReport {
  healthBefore: number;
  healthAfter: number;
  duplicatesFound: number;
  contradictionsFound: number;
  linksCreated: number;
  durationMs: number;
  totalHeals: number;
  timestamp: string;
}

export interface SelfHealStatus {
  sessionsSinceLastHeal: number;
  lastHealAt: string | null;
  lastHealDurationMs: number | null;
  totalHeals: number;
  gateEligible: boolean;
  sessionThreshold: number;
  hourThreshold: number;
}

export class SelfHealGate {
  private provider: PersistenceProvider;
  private opLogger: OperationLogger | null = null;

  constructor(
    provider: PersistenceProvider,
    private curator: Curator,
    private linkManager: LinkManager | null,
    private sessionThreshold: number = 10,
    private hourThreshold: number = 48,
  ) {
    this.provider = provider;
    this.ensureSchema();
    try {
      this.opLogger = new OperationLogger(provider);
    } catch {
      // optional
    }
  }

  private ensureSchema(): void {
    this.provider.execSql(`
      CREATE TABLE IF NOT EXISTS self_heal_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        sessions_since_last_heal INTEGER NOT NULL DEFAULT 0,
        last_heal_at TEXT,
        last_heal_duration_ms INTEGER,
        last_heal_report TEXT,
        total_heals INTEGER NOT NULL DEFAULT 0,
        session_threshold INTEGER NOT NULL DEFAULT 10,
        hour_threshold INTEGER NOT NULL DEFAULT 48,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    // Ensure the singleton row exists
    this.provider.run(
      `INSERT OR IGNORE INTO self_heal_meta (id, session_threshold, hour_threshold) VALUES (1, @st, @ht)`,
      { st: this.sessionThreshold, ht: this.hourThreshold },
    );
  }

  incrementSessionCount(): void {
    this.provider.run(
      "UPDATE self_heal_meta SET sessions_since_last_heal = sessions_since_last_heal + 1, updated_at = datetime('now') WHERE id = 1",
    );
  }

  checkGate(): { eligible: boolean; reason: string } {
    const meta = this.getMeta();
    const sessions = meta.sessions_since_last_heal as number;
    const lastHeal = meta.last_heal_at as string | null;

    if (sessions < this.sessionThreshold) {
      return {
        eligible: false,
        reason: `Only ${sessions}/${this.sessionThreshold} sessions since last heal`,
      };
    }
    if (lastHeal) {
      const hoursSince = (Date.now() - new Date(lastHeal).getTime()) / (1000 * 60 * 60);
      if (hoursSince < this.hourThreshold) {
        return {
          eligible: false,
          reason: `Only ${Math.round(hoursSince)}h/${this.hourThreshold}h since last heal`,
        };
      }
    }
    return { eligible: true, reason: 'Gate conditions met' };
  }

  run(): SelfHealReport {
    const start = Date.now();

    // 1. BEFORE health score
    const healthBefore = this.curator.healthAudit();

    // 2. Grooming
    this.curator.groomAll();

    // 3. Consolidation (live)
    const consolidation = this.curator.consolidate({
      dryRun: false,
      staleDaysThreshold: 90,
      duplicateThreshold: 0.45,
      contradictionThreshold: 0.4,
    });

    // 4. Link backfill
    let linksCreated = 0;
    if (this.linkManager) {
      try {
        const backfill = this.linkManager.backfillLinks({ threshold: 0.7 });
        linksCreated = backfill.linksCreated;
      } catch {
        // best-effort
      }
    }

    // 5. AFTER health score
    const healthAfter = this.curator.healthAudit();

    const durationMs = Date.now() - start;
    const now = new Date().toISOString();

    const report: SelfHealReport = {
      healthBefore: healthBefore.score,
      healthAfter: healthAfter.score,
      duplicatesFound: consolidation.duplicates?.length ?? 0,
      contradictionsFound: consolidation.contradictions?.length ?? 0,
      linksCreated,
      durationMs,
      totalHeals: 0,
      timestamp: now,
    };

    // Update persistent state
    this.provider.run(
      `UPDATE self_heal_meta SET
        sessions_since_last_heal = 0,
        last_heal_at = ?,
        last_heal_duration_ms = ?,
        last_heal_report = ?,
        total_heals = total_heals + 1,
        updated_at = ?
      WHERE id = 1`,
      [now, durationMs, JSON.stringify(report), now],
    );

    const meta = this.getMeta();
    report.totalHeals = meta.total_heals as number;

    // Log the operation
    if (this.opLogger) {
      try {
        this.opLogger.log(
          'self_heal',
          'auto_self_heal',
          `Auto self-heal: ${healthBefore.score} → ${healthAfter.score}`,
          linksCreated + (consolidation.mutations ?? 0),
          { healthBefore: healthBefore.score, healthAfter: healthAfter.score, durationMs },
        );
      } catch {
        // best-effort
      }
    }

    return report;
  }

  getStatus(): SelfHealStatus {
    const meta = this.getMeta();
    return {
      sessionsSinceLastHeal: meta.sessions_since_last_heal as number,
      lastHealAt: meta.last_heal_at as string | null,
      lastHealDurationMs: meta.last_heal_duration_ms as number | null,
      totalHeals: meta.total_heals as number,
      gateEligible: this.checkGate().eligible,
      sessionThreshold: this.sessionThreshold,
      hourThreshold: this.hourThreshold,
    };
  }

  private getMeta(): Record<string, unknown> {
    return this.provider.get('SELECT * FROM self_heal_meta WHERE id = 1') as Record<
      string,
      unknown
    >;
  }
}
