import type { Vault } from '../vault/vault.js';
import type { PersistenceProvider } from '../persistence/types.js';
import type {
  PolicyType,
  PolicyPreset,
  VaultPolicy,
  QuotaStatus,
  PolicyDecision,
  BatchDecision,
  PolicyAuditEntry,
  Proposal,
  ProposalStats,
  GovernanceDashboard,
} from './types.js';
import { GovernancePolicies } from './governance-policies.js';
import { GovernanceProposals } from './governance-proposals.js';
import { GovernanceDashboardModule } from './governance-dashboard.js';
import { runNormalizeProjectPathsMigration } from './migrations/normalize-project-paths.js';

// ─── Governance Facade ──────────────────────────────────────────────

export class Governance {
  private provider: PersistenceProvider;
  private policies: GovernancePolicies;
  private proposals: GovernanceProposals;
  private dashboardModule: GovernanceDashboardModule;

  constructor(vault: Vault) {
    this.provider = vault.getProvider();
    this.initializeTables();

    // One-time data migration: rewrite relative project_path rows to the
    // absolute form. Runs once (idempotency marker in soleri_data_migrations)
    // and is wrapped in a transaction so a failure leaves the DB untouched.
    // Swallows errors so a migration bug can't take down engine startup —
    // callers that read policies will still get the DEFAULT_PRESET fallback.
    try {
      runNormalizeProjectPathsMigration(this.provider);
    } catch {
      // Non-critical — governance still functions with un-migrated rows.
    }

    this.policies = new GovernancePolicies(this.provider);
    this.proposals = new GovernanceProposals(this.provider, vault);
    this.dashboardModule = new GovernanceDashboardModule(
      this.provider,
      this.policies,
      this.proposals,
    );
  }

  // ─── Schema ─────────────────────────────────────────────────────

  private initializeTables(): void {
    this.provider.execSql(`
      CREATE TABLE IF NOT EXISTS vault_policies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_path TEXT NOT NULL,
        policy_type TEXT NOT NULL CHECK(policy_type IN ('quota', 'retention', 'auto-capture')),
        config TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        UNIQUE(project_path, policy_type)
      );

      CREATE TABLE IF NOT EXISTS vault_proposals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_path TEXT NOT NULL,
        entry_id TEXT,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        category TEXT NOT NULL,
        proposed_data TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK(status IN ('pending', 'approved', 'rejected', 'modified', 'expired')),
        proposed_at INTEGER NOT NULL DEFAULT (unixepoch()),
        decided_at INTEGER,
        decided_by TEXT,
        modification_note TEXT,
        source TEXT DEFAULT 'auto-capture'
      );

      CREATE TABLE IF NOT EXISTS vault_policy_evaluations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_path TEXT NOT NULL,
        entry_type TEXT NOT NULL,
        entry_category TEXT NOT NULL,
        entry_title TEXT,
        action TEXT NOT NULL,
        reason TEXT,
        quota_total INTEGER,
        quota_max INTEGER,
        proposal_id INTEGER,
        evaluated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );

      CREATE TABLE IF NOT EXISTS vault_policy_changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_path TEXT NOT NULL,
        policy_type TEXT NOT NULL,
        old_config TEXT,
        new_config TEXT NOT NULL,
        changed_by TEXT,
        changed_at INTEGER NOT NULL DEFAULT (unixepoch())
      );

      CREATE INDEX IF NOT EXISTS idx_vault_policies_project ON vault_policies(project_path);
      CREATE INDEX IF NOT EXISTS idx_vault_proposals_project ON vault_proposals(project_path);
      CREATE INDEX IF NOT EXISTS idx_vault_proposals_status ON vault_proposals(status);
      CREATE INDEX IF NOT EXISTS idx_vault_evaluations_project ON vault_policy_evaluations(project_path);
      CREATE INDEX IF NOT EXISTS idx_vault_evaluations_action ON vault_policy_evaluations(action);
    `);
  }

  // ─── Policy Delegates ───────────────────────────────────────────

  getPolicy(projectPath: string): VaultPolicy {
    return this.policies.getPolicy(projectPath);
  }

  setPolicy(
    projectPath: string,
    policyType: PolicyType,
    config: Record<string, unknown>,
    changedBy?: string,
  ): void {
    this.policies.setPolicy(projectPath, policyType, config, changedBy);
  }

  applyPreset(projectPath: string, preset: PolicyPreset, changedBy?: string): void {
    this.policies.applyPreset(projectPath, preset, changedBy);
  }

  getQuotaStatus(projectPath: string): QuotaStatus {
    return this.policies.getQuotaStatus(projectPath);
  }

  getAuditTrail(projectPath: string, limit?: number): PolicyAuditEntry[] {
    return this.policies.getAuditTrail(projectPath, limit);
  }

  // ─── Evaluation Delegates ───────────────────────────────────────

  evaluateCapture(
    projectPath: string,
    entry: { type: string; category: string; title?: string },
  ): PolicyDecision {
    return this.policies.evaluateCapture(projectPath, entry, (pp) =>
      this.proposals.countPending(pp),
    );
  }

  evaluateBatch(
    projectPath: string,
    entries: Array<{ type: string; category: string; title?: string }>,
  ): BatchDecision[] {
    return this.policies.evaluateBatch(projectPath, entries, (pp) =>
      this.proposals.countPending(pp),
    );
  }

  // ─── Proposal Delegates ─────────────────────────────────────────

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
    return this.proposals.propose(projectPath, entryData, source);
  }

  approveProposal(proposalId: number, decidedBy?: string): Proposal | null {
    return this.proposals.approveProposal(proposalId, decidedBy);
  }

  rejectProposal(proposalId: number, decidedBy?: string, note?: string): Proposal | null {
    return this.proposals.rejectProposal(proposalId, decidedBy, note);
  }

  modifyProposal(
    proposalId: number,
    modifications: Record<string, unknown>,
    decidedBy?: string,
  ): Proposal | null {
    return this.proposals.modifyProposal(proposalId, modifications, decidedBy);
  }

  listPendingProposals(projectPath?: string, limit?: number): Proposal[] {
    return this.proposals.listPendingProposals(projectPath, limit);
  }

  getProposalStats(projectPath?: string): ProposalStats {
    return this.proposals.getProposalStats(projectPath);
  }

  expireStaleProposals(maxAgeDays?: number): number {
    return this.proposals.expireStaleProposals(maxAgeDays);
  }

  // ─── Dashboard Delegate ─────────────────────────────────────────

  getDashboard(projectPath: string): GovernanceDashboard {
    return this.dashboardModule.getDashboard(projectPath);
  }
}
