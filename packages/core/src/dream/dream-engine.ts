import type { PersistenceProvider } from '../persistence/types.js';
import type { Vault } from '../vault/vault.js';
import type { Curator } from '../curator/curator.js';

export interface DreamReport {
  durationMs: number;
  duplicatesFound: number;
  staleArchived: number;
  contradictionsFound: number;
  totalDreams: number;
  timestamp: string;
}

export interface DreamStatus {
  sessionsSinceLastDream: number;
  lastDreamAt: string | null;
  lastDreamDurationMs: number | null;
  totalDreams: number;
  gateEligible: boolean;
}

export class DreamEngine {
  private provider: PersistenceProvider;

  constructor(
    vault: Vault,
    private curator: Curator,
    private sessionThreshold: number = 5,
    private hourThreshold: number = 24,
  ) {
    this.provider = vault.getProvider();
  }

  run(): DreamReport {
    const start = Date.now();
    const result = this.curator.consolidate({
      dryRun: false,
      staleDaysThreshold: 90,
      duplicateThreshold: 0.45,
      contradictionThreshold: 0.4,
    });
    const durationMs = Date.now() - start;
    const now = new Date().toISOString();

    this.provider.run(
      `UPDATE dream_meta SET
        sessions_since_last_dream = 0,
        last_dream_at = ?,
        last_dream_duration_ms = ?,
        last_dream_report = ?,
        total_dreams = total_dreams + 1,
        updated_at = ?
      WHERE id = 1`,
      [now, durationMs, JSON.stringify(result), now],
    );

    const meta = this.getMeta();
    return {
      durationMs,
      duplicatesFound: result.duplicates?.length ?? 0,
      staleArchived: result.staleEntries?.length ?? 0,
      contradictionsFound: result.contradictions?.length ?? 0,
      totalDreams: meta.total_dreams as number,
      timestamp: now,
    };
  }

  incrementSessionCount(): void {
    this.provider.run(
      "UPDATE dream_meta SET sessions_since_last_dream = sessions_since_last_dream + 1, updated_at = datetime('now') WHERE id = 1",
    );
  }

  getStatus(): DreamStatus {
    const meta = this.getMeta();
    return {
      sessionsSinceLastDream: meta.sessions_since_last_dream as number,
      lastDreamAt: meta.last_dream_at as string | null,
      lastDreamDurationMs: meta.last_dream_duration_ms as number | null,
      totalDreams: meta.total_dreams as number,
      gateEligible: this.isGateEligible(meta),
    };
  }

  checkGate(): { eligible: boolean; reason: string } {
    const meta = this.getMeta();
    const sessions = meta.sessions_since_last_dream as number;
    const lastDream = meta.last_dream_at as string | null;
    if (sessions < this.sessionThreshold) {
      return {
        eligible: false,
        reason: `Only ${sessions}/${this.sessionThreshold} sessions since last dream`,
      };
    }
    if (lastDream) {
      const hoursSince = (Date.now() - new Date(lastDream).getTime()) / (1000 * 60 * 60);
      if (hoursSince < this.hourThreshold) {
        return {
          eligible: false,
          reason: `Only ${Math.round(hoursSince)}h/${this.hourThreshold}h since last dream`,
        };
      }
    }
    return { eligible: true, reason: 'Gate conditions met' };
  }

  private isGateEligible(meta: Record<string, unknown>): boolean {
    const sessions = meta.sessions_since_last_dream as number;
    const lastDream = meta.last_dream_at as string | null;
    if (sessions < this.sessionThreshold) return false;
    if (!lastDream) return true;
    const hoursSince = (Date.now() - new Date(lastDream).getTime()) / (1000 * 60 * 60);
    return hoursSince >= this.hourThreshold;
  }

  private getMeta(): Record<string, unknown> {
    return this.provider.get('SELECT * FROM dream_meta WHERE id = 1') as Record<string, unknown>;
  }
}
