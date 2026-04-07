import type { Vault } from '../vault/vault.js';
import type { PersistenceProvider } from '../persistence/types.js';
import type { Proposal, ProposalStatus, ProposalStats } from './types.js';

// ─── Row Mapping ──────────────────────────────────────────────────

export interface RawProposal {
  id: number;
  project_path: string;
  entry_id: string | null;
  title: string;
  type: string;
  category: string;
  proposed_data: string;
  status: string;
  proposed_at: number;
  decided_at: number | null;
  decided_by: string | null;
  modification_note: string | null;
  source: string;
}

export function mapProposal(row: RawProposal): Proposal {
  return {
    id: row.id,
    projectPath: row.project_path,
    entryId: row.entry_id,
    title: row.title,
    type: row.type,
    category: row.category,
    proposedData: JSON.parse(row.proposed_data),
    status: row.status as ProposalStatus,
    proposedAt: row.proposed_at,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by,
    modificationNote: row.modification_note,
    source: row.source,
  };
}

// ─── GovernanceProposals ────────────────────────────────────────────

export class GovernanceProposals {
  constructor(
    private provider: PersistenceProvider,
    private vault: Vault,
  ) {}

  countPending(projectPath: string): number {
    const row = this.provider.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM vault_proposals WHERE project_path = ? AND status = 'pending'",
      [projectPath],
    );
    return row?.count ?? 0;
  }

  propose(
    projectPath: string,
    entryData: {
      entryId?: string;
      title: string;
      type: string;
      category: string;
      data?: Record<string, unknown>;
    },
    source?: string,
  ): number {
    const result = this.provider.run(
      `INSERT INTO vault_proposals (project_path, entry_id, title, type, category, proposed_data, source)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        projectPath,
        entryData.entryId ?? null,
        entryData.title,
        entryData.type,
        entryData.category,
        JSON.stringify(entryData.data ?? {}),
        source ?? 'auto-capture',
      ],
    );
    return Number(result.lastInsertRowid);
  }

  approveProposal(proposalId: number, decidedBy?: string): Proposal | null {
    const proposal = this.resolveProposal(proposalId, 'approved', decidedBy);
    if (!proposal) return null;
    this.captureFromProposal(proposal);
    return proposal;
  }

  rejectProposal(proposalId: number, decidedBy?: string, note?: string): Proposal | null {
    return this.resolveProposal(proposalId, 'rejected', decidedBy, note);
  }

  modifyProposal(
    proposalId: number,
    modifications: Record<string, unknown>,
    decidedBy?: string,
  ): Proposal | null {
    const existing = this.getProposalById(proposalId);
    if (!existing || existing.status !== 'pending') return null;

    const merged = { ...existing.proposedData, ...modifications };

    this.provider.run(
      `UPDATE vault_proposals
       SET status = 'modified', proposed_data = ?, decided_at = unixepoch(),
           decided_by = ?, modification_note = ?
       WHERE id = ?`,
      [
        JSON.stringify(merged),
        decidedBy ?? null,
        `Modified fields: ${Object.keys(modifications).join(', ')}`,
        proposalId,
      ],
    );

    const proposal = this.getProposalById(proposalId);
    if (proposal) this.captureFromProposal(proposal);
    return proposal;
  }

  listPendingProposals(projectPath?: string, limit?: number): Proposal[] {
    if (projectPath) {
      const rows = this.provider.all<RawProposal>(
        'SELECT * FROM vault_proposals WHERE project_path = ? AND status = ? ORDER BY proposed_at DESC LIMIT ?',
        [projectPath, 'pending', limit ?? 50],
      );
      return rows.map(mapProposal);
    }
    const rows = this.provider.all<RawProposal>(
      'SELECT * FROM vault_proposals WHERE status = ? ORDER BY proposed_at DESC LIMIT ?',
      ['pending', limit ?? 50],
    );
    return rows.map(mapProposal);
  }

  getProposalStats(projectPath?: string): ProposalStats {
    const whereClause = projectPath ? 'WHERE project_path = ?' : '';
    const params = projectPath ? [projectPath] : [];

    const statusRows = this.provider.all<{ status: string; count: number }>(
      `SELECT status, COUNT(*) as count FROM vault_proposals ${whereClause} GROUP BY status`,
      params,
    );

    const stats: ProposalStats = {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      modified: 0,
      expired: 0,
      acceptanceRate: 0,
      byCategory: {},
    };

    for (const row of statusRows) {
      stats.total += row.count;
      switch (row.status) {
        case 'pending':
          stats.pending = row.count;
          break;
        case 'approved':
          stats.approved = row.count;
          break;
        case 'rejected':
          stats.rejected = row.count;
          break;
        case 'modified':
          stats.modified = row.count;
          break;
        case 'expired':
          stats.expired = row.count;
          break;
      }
    }

    const decided = stats.approved + stats.modified + stats.rejected;
    stats.acceptanceRate = decided > 0 ? (stats.approved + stats.modified) / decided : 0;

    const catRows = this.provider.all<{ category: string; status: string; count: number }>(
      `SELECT category, status, COUNT(*) as count FROM vault_proposals ${whereClause} GROUP BY category, status`,
      params,
    );

    for (const row of catRows) {
      if (!stats.byCategory[row.category]) {
        stats.byCategory[row.category] = { total: 0, accepted: 0, rate: 0 };
      }
      stats.byCategory[row.category].total += row.count;
      if (row.status === 'approved' || row.status === 'modified') {
        stats.byCategory[row.category].accepted += row.count;
      }
    }

    for (const cat of Object.values(stats.byCategory)) {
      cat.rate = cat.total > 0 ? cat.accepted / cat.total : 0;
    }

    return stats;
  }

  expireStaleProposals(maxAgeDays?: number): number {
    const days = maxAgeDays ?? 14;
    const cutoff = Math.floor(Date.now() / 1000) - days * 86400;

    const result = this.provider.run(
      "UPDATE vault_proposals SET status = 'expired', decided_at = unixepoch() WHERE status = 'pending' AND proposed_at < ?",
      [cutoff],
    );

    return result.changes;
  }

  private captureFromProposal(proposal: Proposal): void {
    const data = proposal.proposedData as Record<string, unknown>;
    const entryId = proposal.entryId ?? `proposal-${proposal.id}`;
    this.vault.add({
      id: entryId,
      type: (proposal.type as 'pattern' | 'anti-pattern' | 'rule') ?? 'pattern',
      domain: proposal.category,
      title: proposal.title,
      severity: (data.severity as 'critical' | 'warning' | 'suggestion') ?? 'warning',
      description: (data.description as string) ?? proposal.title,
      context: data.context as string | undefined,
      example: data.example as string | undefined,
      counterExample: data.counterExample as string | undefined,
      why: data.why as string | undefined,
      tags: (data.tags as string[]) ?? [],
    });
  }

  private resolveProposal(
    proposalId: number,
    status: ProposalStatus,
    decidedBy?: string,
    note?: string,
  ): Proposal | null {
    const existing = this.getProposalById(proposalId);
    if (!existing || existing.status !== 'pending') return null;

    this.provider.run(
      'UPDATE vault_proposals SET status = ?, decided_at = unixepoch(), decided_by = ?, modification_note = ? WHERE id = ?',
      [status, decidedBy ?? null, note ?? null, proposalId],
    );

    return this.getProposalById(proposalId);
  }

  private getProposalById(id: number): Proposal | null {
    const row = this.provider.get<RawProposal>('SELECT * FROM vault_proposals WHERE id = ?', [id]);
    return row ? mapProposal(row) : null;
  }
}
