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
  /** Latest staged consolidation awaiting adopt/discard, if any. */
  pendingProposal: DreamProposal | null;
}

export interface DreamProposalEvidence {
  duplicatesFound: number;
  staleCandidates: number;
  contradictionsFound: number;
  /** Capped samples of each category for review — not the full sets. */
  samples: {
    duplicates: unknown[];
    staleEntries: unknown[];
    contradictions: unknown[];
  };
}

export interface DreamProposal {
  id: number;
  status: 'pending' | 'adopted' | 'discarded';
  evidence: DreamProposalEvidence;
  resolutionReason: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

/** Max sample items persisted per category in proposal evidence. */
const EVIDENCE_SAMPLE_CAP = 10;

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

  /**
   * Stage a consolidation proposal without touching the vault: dry-run the
   * curator and persist the findings for explicit adopt/discard. At most one
   * pending proposal exists — re-proposing replaces it with fresh evidence.
   */
  propose(): DreamProposal {
    const result = this.curator.consolidate({
      dryRun: true,
      staleDaysThreshold: 90,
      duplicateThreshold: 0.45,
      contradictionThreshold: 0.4,
    });

    const evidence: DreamProposalEvidence = {
      duplicatesFound: result.duplicates?.length ?? 0,
      staleCandidates: result.staleEntries?.length ?? 0,
      contradictionsFound: result.contradictions?.length ?? 0,
      samples: {
        duplicates: (result.duplicates ?? []).slice(0, EVIDENCE_SAMPLE_CAP),
        staleEntries: (result.staleEntries ?? []).slice(0, EVIDENCE_SAMPLE_CAP),
        contradictions: (result.contradictions ?? []).slice(0, EVIDENCE_SAMPLE_CAP),
      },
    };

    // Replace any stale pending proposal — its evidence is outdated now.
    this.provider.run(
      `UPDATE dream_proposals SET status = 'discarded',
        resolution_reason = 'superseded by newer proposal',
        resolved_at = datetime('now')
      WHERE status = 'pending'`,
    );
    this.provider.run('INSERT INTO dream_proposals (status, evidence) VALUES (?, ?)', [
      'pending',
      JSON.stringify(evidence),
    ]);

    const pending = this.getPendingProposal();
    if (!pending) throw new Error('Failed to persist dream proposal');
    return pending;
  }

  /**
   * Adopt a staged proposal: apply consolidation for real and close the
   * proposal. The consolidation re-runs live rather than replaying stale
   * evidence, so the vault is mutated from current state.
   */
  adopt(proposalId?: number): { report: DreamReport; proposal: DreamProposal } {
    const proposal = this.requireProposal(proposalId);
    const report = this.run();
    this.provider.run(
      `UPDATE dream_proposals SET status = 'adopted', resolved_at = datetime('now') WHERE id = ?`,
      [proposal.id],
    );
    const updated = this.getProposal(proposal.id);
    return { report, proposal: updated ?? proposal };
  }

  /** Discard a staged proposal with a reason. The vault is never touched. */
  discard(reason: string, proposalId?: number): DreamProposal {
    const proposal = this.requireProposal(proposalId);
    this.provider.run(
      `UPDATE dream_proposals SET status = 'discarded', resolution_reason = ?, resolved_at = datetime('now') WHERE id = ?`,
      [reason, proposal.id],
    );
    const updated = this.getProposal(proposal.id);
    if (!updated) throw new Error(`Dream proposal ${proposal.id} vanished during discard`);
    return updated;
  }

  getPendingProposal(): DreamProposal | null {
    const row = this.provider.get(
      "SELECT * FROM dream_proposals WHERE status = 'pending' ORDER BY id DESC LIMIT 1",
    ) as Record<string, unknown> | undefined;
    return row ? this.rowToProposal(row) : null;
  }

  getProposal(id: number): DreamProposal | null {
    const row = this.provider.get('SELECT * FROM dream_proposals WHERE id = ?', [id]) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToProposal(row) : null;
  }

  private requireProposal(proposalId?: number): DreamProposal {
    const proposal =
      proposalId !== undefined ? this.getProposal(proposalId) : this.getPendingProposal();
    if (!proposal) {
      throw new Error(
        proposalId !== undefined
          ? `Dream proposal ${proposalId} not found`
          : 'No pending dream proposal — run propose() first',
      );
    }
    if (proposal.status !== 'pending') {
      throw new Error(`Dream proposal ${proposal.id} is already ${proposal.status}`);
    }
    return proposal;
  }

  private rowToProposal(row: Record<string, unknown>): DreamProposal {
    return {
      id: row.id as number,
      status: row.status as DreamProposal['status'],
      evidence: JSON.parse((row.evidence as string) ?? '{}') as DreamProposalEvidence,
      resolutionReason: (row.resolution_reason as string | null) ?? null,
      createdAt: row.created_at as string,
      resolvedAt: (row.resolved_at as string | null) ?? null,
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
      pendingProposal: this.getPendingProposal(),
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
