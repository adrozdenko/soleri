import type { PersistenceProvider } from '../persistence/types.js';
import type { GovernanceDashboard } from './types.js';
import type { GovernancePolicies } from './governance-policies.js';
import type { GovernanceProposals } from './governance-proposals.js';

// ─── GovernanceDashboard ────────────────────────────────────────────

export class GovernanceDashboardModule {
  constructor(
    private provider: PersistenceProvider,
    private policies: GovernancePolicies,
    private proposals: GovernanceProposals,
  ) {}

  getDashboard(projectPath: string): GovernanceDashboard {
    const policy = this.policies.getPolicy(projectPath);
    const quotaStatus = this.policies.getQuotaStatus(projectPath);
    const proposalStats = this.proposals.getProposalStats(projectPath);

    const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
    const trendRows = this.provider.all<{ action: string; count: number }>(
      'SELECT action, COUNT(*) as count FROM vault_policy_evaluations WHERE project_path = ? AND evaluated_at > ? GROUP BY action',
      [projectPath, sevenDaysAgo],
    );

    const evaluationTrend: Record<string, number> = {};
    for (const row of trendRows) {
      evaluationTrend[row.action] = row.count;
    }

    return {
      vaultSize: quotaStatus.total,
      quotaPercent:
        quotaStatus.maxTotal > 0 ? Math.round((quotaStatus.total / quotaStatus.maxTotal) * 100) : 0,
      quotaStatus,
      pendingProposals: proposalStats.pending,
      acceptanceRate: proposalStats.acceptanceRate,
      evaluationTrend,
      policySummary: {
        maxEntries: policy.quotas.maxEntriesTotal,
        requireReview: policy.autoCapture.requireReview,
        archiveAfterDays: policy.retention.archiveAfterDays,
        autoExpireDays: policy.autoCapture.autoExpireDays,
      },
    };
  }
}
