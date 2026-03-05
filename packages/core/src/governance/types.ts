// ─── Policy Types ───────────────────────────────────────────────────

export type PolicyType = 'quota' | 'retention' | 'auto-capture';
export type PolicyPreset = 'strict' | 'moderate' | 'permissive';
export type PolicyAction = 'capture' | 'quarantine' | 'reject' | 'propose';

export interface QuotaPolicy {
  maxEntriesTotal: number;
  maxEntriesPerCategory: number;
  maxEntriesPerType: number;
  warnAtPercent: number;
}

export interface RetentionPolicy {
  archiveAfterDays: number;
  minHitsToKeep: number;
  deleteArchivedAfterDays: number;
}

export interface AutoCapturePolicy {
  enabled: boolean;
  requireReview: boolean;
  maxPendingProposals: number;
  autoExpireDays: number;
}

export interface VaultPolicy {
  projectPath: string;
  quotas: QuotaPolicy;
  retention: RetentionPolicy;
  autoCapture: AutoCapturePolicy;
}

export interface QuotaStatus {
  total: number;
  maxTotal: number;
  byCategory: Record<string, number>;
  byType: Record<string, number>;
  warnAtPercent: number;
  isWarning: boolean;
}

export interface PolicyDecision {
  allowed: boolean;
  action: PolicyAction;
  reason?: string;
  quotaStatus?: QuotaStatus;
}

export interface BatchDecision {
  entry: { type: string; category: string; title?: string };
  decision: PolicyDecision;
}

export interface PolicyAuditEntry {
  id: number;
  projectPath: string;
  policyType: string;
  oldConfig: Record<string, unknown> | null;
  newConfig: Record<string, unknown>;
  changedBy: string | null;
  changedAt: number;
}

// ─── Proposal Types ─────────────────────────────────────────────────

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'modified' | 'expired';

export interface Proposal {
  id: number;
  projectPath: string;
  entryId: string | null;
  title: string;
  type: string;
  category: string;
  proposedData: Record<string, unknown>;
  status: ProposalStatus;
  proposedAt: number;
  decidedAt: number | null;
  decidedBy: string | null;
  modificationNote: string | null;
  source: string;
}

export interface ProposalStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  modified: number;
  expired: number;
  acceptanceRate: number;
  byCategory: Record<string, { total: number; accepted: number; rate: number }>;
}

// ─── Dashboard ──────────────────────────────────────────────────────

export interface GovernanceDashboard {
  vaultSize: number;
  quotaPercent: number;
  quotaStatus: QuotaStatus;
  pendingProposals: number;
  acceptanceRate: number;
  evaluationTrend: Record<string, number>;
  policySummary: {
    maxEntries: number;
    requireReview: boolean;
    archiveAfterDays: number;
    autoExpireDays: number;
  };
}
