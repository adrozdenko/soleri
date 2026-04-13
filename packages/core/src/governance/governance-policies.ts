import { resolve as resolvePath } from 'node:path';
import type { PersistenceProvider } from '../persistence/types.js';
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
} from './types.js';

// ─── Default Presets ────────────────────────────────────────────────

interface PresetConfig {
  quotas: QuotaPolicy;
  retention: RetentionPolicy;
  autoCapture: AutoCapturePolicy;
}

export const POLICY_PRESETS: Record<PolicyPreset, PresetConfig> = {
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

export const DEFAULT_PRESET: PolicyPreset = 'moderate';

// ─── GovernancePolicies ─────────────────────────────────────────────

export class GovernancePolicies {
  constructor(private provider: PersistenceProvider) {}

  /**
   * Normalize a project path before DB I/O. Every public method on this class
   * must funnel projectPath through here so callers that pass '.' vs the
   * resolved absolute path read and write the same row. Mirrors the
   * normalizeTs() pattern used for vault timestamps — single chokepoint,
   * caller-agnostic correctness.
   */
  private normalizePath(projectPath: string): string {
    return resolvePath(projectPath);
  }

  getPolicy(projectPath: string): VaultPolicy {
    const normalized = this.normalizePath(projectPath);
    const defaults = POLICY_PRESETS[DEFAULT_PRESET];

    const rows = this.provider.all<{ policy_type: string; config: string }>(
      'SELECT policy_type, config FROM vault_policies WHERE project_path = ? AND enabled = 1',
      [normalized],
    );

    let quotas = defaults.quotas;
    let retention = defaults.retention;
    let autoCapture = defaults.autoCapture;

    for (const row of rows) {
      const parsed = JSON.parse(row.config);
      if (row.policy_type === 'quota') quotas = parsed;
      else if (row.policy_type === 'retention') retention = parsed;
      else if (row.policy_type === 'auto-capture') autoCapture = parsed;
    }

    return { projectPath: normalized, quotas, retention, autoCapture };
  }

  setPolicy(
    projectPath: string,
    policyType: PolicyType,
    config: Record<string, unknown>,
    changedBy?: string,
  ): void {
    const normalized = this.normalizePath(projectPath);
    const existing = this.provider.get<{ config: string }>(
      'SELECT config FROM vault_policies WHERE project_path = ? AND policy_type = ?',
      [normalized, policyType],
    );
    const oldConfig = existing ? existing.config : null;

    this.provider.run(
      `INSERT INTO vault_policies (project_path, policy_type, config, updated_at)
       VALUES (?, ?, ?, unixepoch())
       ON CONFLICT(project_path, policy_type)
       DO UPDATE SET config = excluded.config, updated_at = excluded.updated_at`,
      [normalized, policyType, JSON.stringify(config)],
    );

    this.provider.run(
      'INSERT INTO vault_policy_changes (project_path, policy_type, old_config, new_config, changed_by) VALUES (?, ?, ?, ?, ?)',
      [normalized, policyType, oldConfig, JSON.stringify(config), changedBy ?? null],
    );
  }

  applyPreset(projectPath: string, preset: PolicyPreset, changedBy?: string): void {
    const normalized = this.normalizePath(projectPath);
    const config = POLICY_PRESETS[preset];
    if (!config) throw new Error(`Unknown preset: ${preset}`);

    this.setPolicy(
      normalized,
      'quota',
      config.quotas as unknown as Record<string, unknown>,
      changedBy,
    );
    this.setPolicy(
      normalized,
      'retention',
      config.retention as unknown as Record<string, unknown>,
      changedBy,
    );
    this.setPolicy(
      normalized,
      'auto-capture',
      config.autoCapture as unknown as Record<string, unknown>,
      changedBy,
    );
  }

  getQuotaStatus(projectPath: string): QuotaStatus {
    const normalized = this.normalizePath(projectPath);
    const policy = this.getPolicy(normalized);

    const totalRow = this.provider.get<{ count: number }>('SELECT COUNT(*) as count FROM entries');
    const total = totalRow?.count ?? 0;

    const categoryRows = this.provider.all<{ domain: string; count: number }>(
      'SELECT domain, COUNT(*) as count FROM entries GROUP BY domain',
    );
    const byCategory: Record<string, number> = {};
    for (const row of categoryRows) {
      byCategory[row.domain] = row.count;
    }

    const typeRows = this.provider.all<{ type: string; count: number }>(
      'SELECT type, COUNT(*) as count FROM entries GROUP BY type',
    );
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
    const normalized = this.normalizePath(projectPath);
    const rows = this.provider.all<{
      id: number;
      project_path: string;
      policy_type: string;
      old_config: string | null;
      new_config: string;
      changed_by: string | null;
      changed_at: number;
    }>(
      'SELECT id, project_path, policy_type, old_config, new_config, changed_by, changed_at FROM vault_policy_changes WHERE project_path = ? ORDER BY changed_at DESC LIMIT ?',
      [normalized, limit ?? 50],
    );

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

  evaluateCapture(
    projectPath: string,
    entry: { type: string; category: string; title?: string },
    countPending: (projectPath: string) => number,
  ): PolicyDecision {
    const normalized = this.normalizePath(projectPath);
    const policy = this.getPolicy(normalized);
    const quotaStatus = this.getQuotaStatus(normalized);
    let decision: PolicyDecision;

    if (!policy.autoCapture.enabled) {
      decision = {
        allowed: false,
        action: 'reject',
        reason: 'Auto-capture is disabled',
        quotaStatus,
      };
    } else if (policy.autoCapture.requireReview) {
      const pendingCount = countPending(normalized);
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
    } else if (quotaStatus.total >= policy.quotas.maxEntriesTotal) {
      decision = {
        allowed: false,
        action: 'reject',
        reason: `Total quota exceeded (${quotaStatus.total}/${policy.quotas.maxEntriesTotal})`,
        quotaStatus,
      };
    } else if (
      (quotaStatus.byCategory[entry.category] ?? 0) >= policy.quotas.maxEntriesPerCategory
    ) {
      decision = {
        allowed: false,
        action: 'quarantine',
        reason: `Category quota exceeded for "${entry.category}"`,
        quotaStatus,
      };
    } else if ((quotaStatus.byType[entry.type] ?? 0) >= policy.quotas.maxEntriesPerType) {
      decision = {
        allowed: false,
        action: 'quarantine',
        reason: `Type quota exceeded for "${entry.type}"`,
        quotaStatus,
      };
    } else {
      decision = { allowed: true, action: 'capture', quotaStatus };
    }

    this.logEvaluation(normalized, entry, decision);

    return decision;
  }

  evaluateBatch(
    projectPath: string,
    entries: Array<{ type: string; category: string; title?: string }>,
    countPending: (projectPath: string) => number,
  ): BatchDecision[] {
    const results: BatchDecision[] = [];
    for (const entry of entries) {
      const decision = this.evaluateCapture(projectPath, entry, countPending);
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
      this.provider.run(
        `INSERT INTO vault_policy_evaluations
         (project_path, entry_type, entry_category, entry_title, action, reason, quota_total, quota_max)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          projectPath,
          entry.type,
          entry.category,
          entry.title ?? null,
          decision.action,
          decision.reason ?? null,
          decision.quotaStatus?.total ?? null,
          decision.quotaStatus?.maxTotal ?? null,
        ],
      );
    } catch {
      // Fire-and-forget — don't fail capture because of evaluation logging
    }
  }
}
