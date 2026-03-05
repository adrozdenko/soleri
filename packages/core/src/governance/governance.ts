import type { Vault } from '../vault/vault.js';
import type {
  PolicyType,
  PolicyPreset,
  QuotaPolicy,
  RetentionPolicy,
  AutoCapturePolicy,
  VaultPolicy,
  QuotaStatus,
  PolicyDecision,
  BatchDecision,
  PolicyAuditEntry,
  Proposal,
  ProposalStatus,
  ProposalStats,
  GovernanceDashboard,
} from './types.js';

// ─── Default Presets ────────────────────────────────────────────────

interface PresetConfig {
  quotas: QuotaPolicy;
  retention: RetentionPolicy;
  autoCapture: AutoCapturePolicy;
}

const POLICY_PRESETS: Record<PolicyPreset, PresetConfig> = {
  strict: {
    quotas: {
      maxEntriesTotal: 200,
      maxEntriesPerCategory: 50,
      maxEntriesPerType: 100,
      warnAtPercent: 70,
    },
    retention: { archiveAfterDays: 30, minHitsToKeep: 5, deleteArchivedAfterDays: 90 },
    autoCapture: { enabled: true, requireReview: true, maxPendingProposals: 10, autoExpireDays: 7 },
  },
  moderate: {
    quotas: {
      maxEntriesTotal: 500,
      maxEntriesPerCategory: 150,
      maxEntriesPerType: 250,
      warnAtPercent: 80,
    },
    retention: { archiveAfterDays: 90, minHitsToKeep: 2, deleteArchivedAfterDays: 180 },
    autoCapture: {
      enabled: true,
      requireReview: false,
      maxPendingProposals: 25,
      autoExpireDays: 14,
    },
  },
  permissive: {
    quotas: {
      maxEntriesTotal: 2000,
      maxEntriesPerCategory: 500,
      maxEntriesPerType: 1000,
      warnAtPercent: 90,
    },
    retention: { archiveAfterDays: 365, minHitsToKeep: 0, deleteArchivedAfterDays: 730 },
    autoCapture: {
      enabled: true,
      requireReview: false,
      maxPendingProposals: 100,
      autoExpireDays: 30,
    },
  },
};

const DEFAULT_PRESET: PolicyPreset = 'moderate';

// ─── Governance Class ───────────────────────────────────────────────

export class Governance {
  private vault: Vault;

  constructor(vault: Vault) {
    this.vault = vault;
    this.initializeTables();
  }

  // ─── Schema ─────────────────────────────────────────────────────

  private initializeTables(): void {
    const db = this.vault.getDb();
    db.exec(`
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

  // ─── Policy CRUD ────────────────────────────────────────────────

  getPolicy(projectPath: string): VaultPolicy {
    const db = this.vault.getDb();
    const defaults = POLICY_PRESETS[DEFAULT_PRESET];

    const rows = db
      .prepare(
        'SELECT policy_type, config FROM vault_policies WHERE project_path = ? AND enabled = 1',
      )
      .all(projectPath) as Array<{ policy_type: string; config: string }>;

    let quotas = defaults.quotas;
    let retention = defaults.retention;
    let autoCapture = defaults.autoCapture;

    for (const row of rows) {
      const parsed = JSON.parse(row.config);
      if (row.policy_type === 'quota') quotas = parsed;
      else if (row.policy_type === 'retention') retention = parsed;
      else if (row.policy_type === 'auto-capture') autoCapture = parsed;
    }

    return { projectPath, quotas, retention, autoCapture };
  }

  setPolicy(
    projectPath: string,
    policyType: PolicyType,
    config: Record<string, unknown>,
    changedBy?: string,
  ): void {
    const db = this.vault.getDb();

    // Get old config for audit trail
    const existing = db
      .prepare('SELECT config FROM vault_policies WHERE project_path = ? AND policy_type = ?')
      .get(projectPath, policyType) as { config: string } | undefined;
    const oldConfig = existing ? existing.config : null;

    // UPSERT policy
    db.prepare(
      `INSERT INTO vault_policies (project_path, policy_type, config, updated_at)
       VALUES (?, ?, ?, unixepoch())
       ON CONFLICT(project_path, policy_type)
       DO UPDATE SET config = excluded.config, updated_at = excluded.updated_at`,
    ).run(projectPath, policyType, JSON.stringify(config));

    // Audit trail
    db.prepare(
      'INSERT INTO vault_policy_changes (project_path, policy_type, old_config, new_config, changed_by) VALUES (?, ?, ?, ?, ?)',
    ).run(projectPath, policyType, oldConfig, JSON.stringify(config), changedBy ?? null);
  }

  applyPreset(projectPath: string, preset: PolicyPreset, changedBy?: string): void {
    const config = POLICY_PRESETS[preset];
    if (!config) throw new Error(`Unknown preset: ${preset}`);

    this.setPolicy(
      projectPath,
      'quota',
      config.quotas as unknown as Record<string, unknown>,
      changedBy,
    );
    this.setPolicy(
      projectPath,
      'retention',
      config.retention as unknown as Record<string, unknown>,
      changedBy,
    );
    this.setPolicy(
      projectPath,
      'auto-capture',
      config.autoCapture as unknown as Record<string, unknown>,
      changedBy,
    );
  }

  getQuotaStatus(projectPath: string): QuotaStatus {
    const policy = this.getPolicy(projectPath);
    const db = this.vault.getDb();

    const totalRow = db.prepare('SELECT COUNT(*) as count FROM entries').get() as { count: number };
    const total = totalRow.count;

    // Count by domain (used as category proxy)
    const categoryRows = db
      .prepare('SELECT domain, COUNT(*) as count FROM entries GROUP BY domain')
      .all() as Array<{ domain: string; count: number }>;
    const byCategory: Record<string, number> = {};
    for (const row of categoryRows) {
      byCategory[row.domain] = row.count;
    }

    // Count by type
    const typeRows = db
      .prepare('SELECT type, COUNT(*) as count FROM entries GROUP BY type')
      .all() as Array<{ type: string; count: number }>;
    const byType: Record<string, number> = {};
    for (const row of typeRows) {
      byType[row.type] = row.count;
    }

    const warnAtPercent = policy.quotas.warnAtPercent;
    const isWarning = total >= (policy.quotas.maxEntriesTotal * warnAtPercent) / 100;

    return {
      total,
      maxTotal: policy.quotas.maxEntriesTotal,
      byCategory,
      byType,
      warnAtPercent,
      isWarning,
    };
  }

  getAuditTrail(projectPath: string, limit?: number): PolicyAuditEntry[] {
    const db = this.vault.getDb();
    const rows = db
      .prepare(
        'SELECT id, project_path, policy_type, old_config, new_config, changed_by, changed_at FROM vault_policy_changes WHERE project_path = ? ORDER BY changed_at DESC LIMIT ?',
      )
      .all(projectPath, limit ?? 50) as Array<{
      id: number;
      project_path: string;
      policy_type: string;
      old_config: string | null;
      new_config: string;
      changed_by: string | null;
      changed_at: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      projectPath: row.project_path,
      policyType: row.policy_type,
      oldConfig: row.old_config ? JSON.parse(row.old_config) : null,
      newConfig: JSON.parse(row.new_config),
      changedBy: row.changed_by,
      changedAt: row.changed_at,
    }));
  }

  // ─── Evaluation ─────────────────────────────────────────────────

  evaluateCapture(
    projectPath: string,
    entry: { type: string; category: string; title?: string },
  ): PolicyDecision {
    const policy = this.getPolicy(projectPath);
    const quotaStatus = this.getQuotaStatus(projectPath);
    let decision: PolicyDecision;

    // 1. Auto-capture disabled → reject
    if (!policy.autoCapture.enabled) {
      decision = {
        allowed: false,
        action: 'reject',
        reason: 'Auto-capture is disabled',
        quotaStatus,
      };
    }
    // 2. Require review → propose (if pending < max)
    else if (policy.autoCapture.requireReview) {
      const pendingCount = this.countPending(projectPath);
      if (pendingCount >= policy.autoCapture.maxPendingProposals) {
        decision = {
          allowed: false,
          action: 'reject',
          reason: `Too many pending proposals (${pendingCount}/${policy.autoCapture.maxPendingProposals})`,
          quotaStatus,
        };
      } else {
        decision = { allowed: false, action: 'propose', reason: 'Review required', quotaStatus };
      }
    }
    // 3. Total quota exceeded → reject
    else if (quotaStatus.total >= policy.quotas.maxEntriesTotal) {
      decision = {
        allowed: false,
        action: 'reject',
        reason: `Total quota exceeded (${quotaStatus.total}/${policy.quotas.maxEntriesTotal})`,
        quotaStatus,
      };
    }
    // 4. Per-category quota exceeded → quarantine
    else if ((quotaStatus.byCategory[entry.category] ?? 0) >= policy.quotas.maxEntriesPerCategory) {
      decision = {
        allowed: false,
        action: 'quarantine',
        reason: `Category quota exceeded for "${entry.category}"`,
        quotaStatus,
      };
    }
    // 5. Per-type quota exceeded → quarantine
    else if ((quotaStatus.byType[entry.type] ?? 0) >= policy.quotas.maxEntriesPerType) {
      decision = {
        allowed: false,
        action: 'quarantine',
        reason: `Type quota exceeded for "${entry.type}"`,
        quotaStatus,
      };
    }
    // 6. All clear → capture
    else {
      decision = { allowed: true, action: 'capture', quotaStatus };
    }

    // Log evaluation (fire-and-forget)
    this.logEvaluation(projectPath, entry, decision);

    return decision;
  }

  evaluateBatch(
    projectPath: string,
    entries: Array<{ type: string; category: string; title?: string }>,
  ): BatchDecision[] {
    const results: BatchDecision[] = [];
    for (const entry of entries) {
      const decision = this.evaluateCapture(projectPath, entry);
      results.push({ entry, decision });
    }
    return results;
  }

  private logEvaluation(
    projectPath: string,
    entry: { type: string; category: string; title?: string },
    decision: PolicyDecision,
  ): void {
    try {
      const db = this.vault.getDb();
      db.prepare(
        `INSERT INTO vault_policy_evaluations
         (project_path, entry_type, entry_category, entry_title, action, reason, quota_total, quota_max)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        projectPath,
        entry.type,
        entry.category,
        entry.title ?? null,
        decision.action,
        decision.reason ?? null,
        decision.quotaStatus?.total ?? null,
        decision.quotaStatus?.maxTotal ?? null,
      );
    } catch {
      // Fire-and-forget — don't fail capture because of evaluation logging
    }
  }

  // ─── Proposals ──────────────────────────────────────────────────

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
    const db = this.vault.getDb();
    const result = db
      .prepare(
        `INSERT INTO vault_proposals (project_path, entry_id, title, type, category, proposed_data, source)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        projectPath,
        entryData.entryId ?? null,
        entryData.title,
        entryData.type,
        entryData.category,
        JSON.stringify(entryData.data ?? {}),
        source ?? 'auto-capture',
      );
    return Number(result.lastInsertRowid);
  }

  approveProposal(proposalId: number, decidedBy?: string): Proposal | null {
    const proposal = this.resolveProposal(proposalId, 'approved', decidedBy);
    if (!proposal) return null;

    // Auto-capture into vault from proposal data
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
    const db = this.vault.getDb();
    const existing = this.getProposalById(proposalId);
    if (!existing || existing.status !== 'pending') return null;

    // Merge modifications into proposed data
    const merged = { ...existing.proposedData, ...modifications };

    db.prepare(
      `UPDATE vault_proposals
       SET status = 'modified', proposed_data = ?, decided_at = unixepoch(),
           decided_by = ?, modification_note = ?
       WHERE id = ?`,
    ).run(
      JSON.stringify(merged),
      decidedBy ?? null,
      `Modified fields: ${Object.keys(modifications).join(', ')}`,
      proposalId,
    );

    return this.getProposalById(proposalId);
  }

  listPendingProposals(projectPath?: string, limit?: number): Proposal[] {
    const db = this.vault.getDb();
    if (projectPath) {
      const rows = db
        .prepare(
          'SELECT * FROM vault_proposals WHERE project_path = ? AND status = ? ORDER BY proposed_at DESC LIMIT ?',
        )
        .all(projectPath, 'pending', limit ?? 50);
      return (rows as RawProposal[]).map(mapProposal);
    }
    const rows = db
      .prepare('SELECT * FROM vault_proposals WHERE status = ? ORDER BY proposed_at DESC LIMIT ?')
      .all('pending', limit ?? 50);
    return (rows as RawProposal[]).map(mapProposal);
  }

  getProposalStats(projectPath?: string): ProposalStats {
    const db = this.vault.getDb();
    const whereClause = projectPath ? 'WHERE project_path = ?' : '';
    const params = projectPath ? [projectPath] : [];

    const statusRows = db
      .prepare(
        `SELECT status, COUNT(*) as count FROM vault_proposals ${whereClause} GROUP BY status`,
      )
      .all(...params) as Array<{ status: string; count: number }>;

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

    // Category breakdown
    const catRows = db
      .prepare(
        `SELECT category, status, COUNT(*) as count FROM vault_proposals ${whereClause} GROUP BY category, status`,
      )
      .all(...params) as Array<{ category: string; status: string; count: number }>;

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
    const db = this.vault.getDb();
    const days = maxAgeDays ?? 14;
    const cutoff = Math.floor(Date.now() / 1000) - days * 86400;

    const result = db
      .prepare(
        "UPDATE vault_proposals SET status = 'expired', decided_at = unixepoch() WHERE status = 'pending' AND proposed_at < ?",
      )
      .run(cutoff);

    return result.changes;
  }

  // ─── Dashboard ──────────────────────────────────────────────────

  getDashboard(projectPath: string): GovernanceDashboard {
    const policy = this.getPolicy(projectPath);
    const quotaStatus = this.getQuotaStatus(projectPath);
    const proposalStats = this.getProposalStats(projectPath);

    // Evaluation trend — count by action in last 7 days
    const db = this.vault.getDb();
    const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
    const trendRows = db
      .prepare(
        'SELECT action, COUNT(*) as count FROM vault_policy_evaluations WHERE project_path = ? AND evaluated_at > ? GROUP BY action',
      )
      .all(projectPath, sevenDaysAgo) as Array<{ action: string; count: number }>;

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

  // ─── Private Helpers ────────────────────────────────────────────

  private countPending(projectPath: string): number {
    const db = this.vault.getDb();
    const row = db
      .prepare(
        "SELECT COUNT(*) as count FROM vault_proposals WHERE project_path = ? AND status = 'pending'",
      )
      .get(projectPath) as { count: number };
    return row.count;
  }

  private resolveProposal(
    proposalId: number,
    status: ProposalStatus,
    decidedBy?: string,
    note?: string,
  ): Proposal | null {
    const db = this.vault.getDb();
    const existing = this.getProposalById(proposalId);
    if (!existing || existing.status !== 'pending') return null;

    db.prepare(
      'UPDATE vault_proposals SET status = ?, decided_at = unixepoch(), decided_by = ?, modification_note = ? WHERE id = ?',
    ).run(status, decidedBy ?? null, note ?? null, proposalId);

    return this.getProposalById(proposalId);
  }

  private getProposalById(id: number): Proposal | null {
    const db = this.vault.getDb();
    const row = db.prepare('SELECT * FROM vault_proposals WHERE id = ?').get(id) as
      | RawProposal
      | undefined;
    return row ? mapProposal(row) : null;
  }
}

// ─── Row Mapping ──────────────────────────────────────────────────

interface RawProposal {
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

function mapProposal(row: RawProposal): Proposal {
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
