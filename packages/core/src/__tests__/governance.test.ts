import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAgentRuntime } from '../runtime/runtime.js';
import type { AgentRuntime } from '../runtime/types.js';

describe('Governance', () => {
  let runtime: AgentRuntime;
  let plannerDir: string;

  beforeEach(() => {
    plannerDir = join(tmpdir(), 'governance-test-' + Date.now());
    mkdirSync(plannerDir, { recursive: true });
    runtime = createAgentRuntime({
      agentId: 'test-governance',
      vaultPath: ':memory:',
      plansPath: join(plannerDir, 'plans.json'),
    });
  });

  afterEach(() => {
    runtime.close();
    rmSync(plannerDir, { recursive: true, force: true });
  });

  // ─── Policy CRUD ──────────────────────────────────────────────────

  describe('Policy CRUD', () => {
    it('should return moderate defaults for unknown project', () => {
      const policy = runtime.governance.getPolicy('/unknown');
      expect(policy.projectPath).toBe('/unknown');
      expect(policy.quotas.maxEntriesTotal).toBe(500);
      expect(policy.retention.archiveAfterDays).toBe(90);
      expect(policy.autoCapture.enabled).toBe(true);
      expect(policy.autoCapture.requireReview).toBe(false);
    });

    it('should persist setPolicy changes', () => {
      runtime.governance.setPolicy('/test', 'quota', {
        maxEntriesTotal: 100,
        maxEntriesPerCategory: 30,
        maxEntriesPerType: 50,
        warnAtPercent: 75,
      });
      const policy = runtime.governance.getPolicy('/test');
      expect(policy.quotas.maxEntriesTotal).toBe(100);
      expect(policy.quotas.warnAtPercent).toBe(75);
      // Other policies should remain default
      expect(policy.retention.archiveAfterDays).toBe(90);
    });

    it('should applyPreset for all 3 policy types', () => {
      runtime.governance.applyPreset('/test', 'strict', 'admin');
      const policy = runtime.governance.getPolicy('/test');
      expect(policy.quotas.maxEntriesTotal).toBe(200);
      expect(policy.retention.archiveAfterDays).toBe(30);
      expect(policy.autoCapture.requireReview).toBe(true);
      expect(policy.autoCapture.maxPendingProposals).toBe(10);
    });
  });

  // ─── Evaluation Cascade ───────────────────────────────────────────

  describe('Evaluation Cascade', () => {
    it('should reject when auto-capture is disabled', () => {
      runtime.governance.setPolicy('/test', 'auto-capture', {
        enabled: false,
        requireReview: false,
        maxPendingProposals: 25,
        autoExpireDays: 14,
      });
      const decision = runtime.governance.evaluateCapture('/test', {
        type: 'pattern',
        category: 'testing',
      });
      expect(decision.allowed).toBe(false);
      expect(decision.action).toBe('reject');
      expect(decision.reason).toContain('disabled');
    });

    it('should propose when review is required', () => {
      runtime.governance.applyPreset('/test', 'strict'); // requireReview: true
      const decision = runtime.governance.evaluateCapture('/test', {
        type: 'pattern',
        category: 'testing',
      });
      expect(decision.allowed).toBe(false);
      expect(decision.action).toBe('propose');
    });

    it('should reject when total quota exceeded', () => {
      // Set very low quota
      runtime.governance.setPolicy('/test', 'quota', {
        maxEntriesTotal: 1,
        maxEntriesPerCategory: 100,
        maxEntriesPerType: 100,
        warnAtPercent: 80,
      });
      // Seed entries to exceed quota
      runtime.vault.seed([
        {
          id: 'q1',
          type: 'pattern',
          domain: 'testing',
          title: 'Test',
          severity: 'warning',
          description: 'Test',
          tags: ['t'],
        },
      ]);
      const decision = runtime.governance.evaluateCapture('/test', {
        type: 'pattern',
        category: 'testing',
      });
      expect(decision.allowed).toBe(false);
      expect(decision.action).toBe('reject');
      expect(decision.reason).toContain('Total quota exceeded');
    });

    it('should quarantine when category quota exceeded', () => {
      runtime.governance.setPolicy('/test', 'quota', {
        maxEntriesTotal: 1000,
        maxEntriesPerCategory: 1,
        maxEntriesPerType: 1000,
        warnAtPercent: 80,
      });
      runtime.vault.seed([
        {
          id: 'cq1',
          type: 'pattern',
          domain: 'testing',
          title: 'Test',
          severity: 'warning',
          description: 'Test',
          tags: ['t'],
        },
      ]);
      const decision = runtime.governance.evaluateCapture('/test', {
        type: 'pattern',
        category: 'testing',
      });
      expect(decision.allowed).toBe(false);
      expect(decision.action).toBe('quarantine');
    });

    it('should quarantine when type quota exceeded', () => {
      runtime.governance.setPolicy('/test', 'quota', {
        maxEntriesTotal: 1000,
        maxEntriesPerCategory: 1000,
        maxEntriesPerType: 1,
        warnAtPercent: 80,
      });
      runtime.vault.seed([
        {
          id: 'tq1',
          type: 'pattern',
          domain: 'testing',
          title: 'Test',
          severity: 'warning',
          description: 'Test',
          tags: ['t'],
        },
      ]);
      const decision = runtime.governance.evaluateCapture('/test', {
        type: 'pattern',
        category: 'testing',
      });
      expect(decision.allowed).toBe(false);
      expect(decision.action).toBe('quarantine');
    });

    it('should allow capture when within all quotas', () => {
      const decision = runtime.governance.evaluateCapture('/test', {
        type: 'pattern',
        category: 'testing',
        title: 'A good pattern',
      });
      expect(decision.allowed).toBe(true);
      expect(decision.action).toBe('capture');
    });
  });

  // ─── Batch Evaluation ─────────────────────────────────────────────

  describe('Batch Evaluation', () => {
    it('should evaluate multiple entries with running state', () => {
      const results = runtime.governance.evaluateBatch('/test', [
        { type: 'pattern', category: 'a' },
        { type: 'anti-pattern', category: 'b' },
        { type: 'rule', category: 'c' },
      ]);
      expect(results).toHaveLength(3);
      expect(results.every((r) => r.decision.action === 'capture')).toBe(true);
    });
  });

  // ─── Proposal Lifecycle ───────────────────────────────────────────

  describe('Proposal Lifecycle', () => {
    it('should create and approve a proposal', () => {
      const id = runtime.governance.propose('/test', {
        title: 'New pattern',
        type: 'pattern',
        category: 'testing',
        data: { description: 'A discovered pattern' },
      });
      expect(id).toBeGreaterThan(0);

      const approved = runtime.governance.approveProposal(id, 'admin');
      expect(approved).not.toBeNull();
      expect(approved!.status).toBe('approved');
      expect(approved!.decidedBy).toBe('admin');
    });

    it('should auto-capture entry into vault on approval', () => {
      const id = runtime.governance.propose('/test', {
        entryId: 'approved-entry-1',
        title: 'Approved pattern',
        type: 'pattern',
        category: 'testing',
        data: {
          severity: 'warning',
          description: 'A pattern that was reviewed and approved.',
          tags: ['governance', 'approved'],
        },
      });

      // Before approval — not in vault
      expect(runtime.vault.get('approved-entry-1')).toBeNull();

      runtime.governance.approveProposal(id, 'admin');

      // After approval — entry is in vault
      const entry = runtime.vault.get('approved-entry-1');
      expect(entry).not.toBeNull();
      expect(entry!.domain).toBe('testing');
      expect(entry!.title).toBe('Approved pattern');
      expect(entry!.tags).toContain('governance');
    });

    it('should generate entry id from proposal id when entryId is missing', () => {
      const id = runtime.governance.propose('/test', {
        title: 'No entry id',
        type: 'rule',
        category: 'styling',
        data: { severity: 'suggestion', description: 'Auto-id test.' },
      });

      runtime.governance.approveProposal(id);

      const entry = runtime.vault.get(`proposal-${id}`);
      expect(entry).not.toBeNull();
      expect(entry!.type).toBe('rule');
      expect(entry!.domain).toBe('styling');
    });

    it('should reject a proposal with a note', () => {
      const id = runtime.governance.propose('/test', {
        title: 'Bad pattern',
        type: 'pattern',
        category: 'testing',
      });

      const rejected = runtime.governance.rejectProposal(id, 'admin', 'Not useful');
      expect(rejected).not.toBeNull();
      expect(rejected!.status).toBe('rejected');
      expect(rejected!.modificationNote).toBe('Not useful');
    });

    it('should modify a proposal and mark as modified', () => {
      const id = runtime.governance.propose('/test', {
        title: 'Draft pattern',
        type: 'pattern',
        category: 'testing',
        data: { description: 'Original' },
      });

      const modified = runtime.governance.modifyProposal(
        id,
        { description: 'Updated description', severity: 'critical' },
        'editor',
      );
      expect(modified).not.toBeNull();
      expect(modified!.status).toBe('modified');
      expect(modified!.proposedData.description).toBe('Updated description');
      expect(modified!.proposedData.severity).toBe('critical');
    });

    it('should return null when approving nonexistent proposal', () => {
      const result = runtime.governance.approveProposal(999);
      expect(result).toBeNull();
    });

    it('should not allow double-approval', () => {
      const id = runtime.governance.propose('/test', {
        title: 'Test',
        type: 'pattern',
        category: 'testing',
      });
      runtime.governance.approveProposal(id);
      const second = runtime.governance.approveProposal(id);
      expect(second).toBeNull();
    });

    it('should list pending proposals', () => {
      runtime.governance.propose('/test', { title: 'P1', type: 'pattern', category: 'a' });
      runtime.governance.propose('/test', { title: 'P2', type: 'rule', category: 'b' });
      runtime.governance.propose('/other', { title: 'P3', type: 'pattern', category: 'c' });

      const all = runtime.governance.listPendingProposals();
      expect(all).toHaveLength(3);

      const testOnly = runtime.governance.listPendingProposals('/test');
      expect(testOnly).toHaveLength(2);
    });
  });

  // ─── Proposal Stats ──────────────────────────────────────────────

  describe('Proposal Stats', () => {
    it('should compute counts and acceptance rate', () => {
      const id1 = runtime.governance.propose('/test', {
        title: 'P1',
        type: 'pattern',
        category: 'a',
      });
      const id2 = runtime.governance.propose('/test', {
        title: 'P2',
        type: 'pattern',
        category: 'a',
      });
      runtime.governance.propose('/test', { title: 'P3', type: 'rule', category: 'b' });

      runtime.governance.approveProposal(id1);
      runtime.governance.rejectProposal(id2);
      // id3 remains pending

      const stats = runtime.governance.getProposalStats('/test');
      expect(stats.total).toBe(3);
      expect(stats.approved).toBe(1);
      expect(stats.rejected).toBe(1);
      expect(stats.pending).toBe(1);
      expect(stats.acceptanceRate).toBe(0.5); // 1 approved / 2 decided
    });

    it('should compute byCategory breakdown', () => {
      const id1 = runtime.governance.propose('/test', {
        title: 'P1',
        type: 'pattern',
        category: 'styling',
      });
      const id2 = runtime.governance.propose('/test', {
        title: 'P2',
        type: 'pattern',
        category: 'styling',
      });
      runtime.governance.approveProposal(id1);
      runtime.governance.rejectProposal(id2);

      const stats = runtime.governance.getProposalStats('/test');
      expect(stats.byCategory.styling).toBeDefined();
      expect(stats.byCategory.styling.total).toBe(2);
      expect(stats.byCategory.styling.accepted).toBe(1);
      expect(stats.byCategory.styling.rate).toBe(0.5);
    });
  });

  // ─── Audit Trail ──────────────────────────────────────────────────

  describe('Audit Trail', () => {
    it('should log policy changes', () => {
      runtime.governance.setPolicy(
        '/test',
        'quota',
        {
          maxEntriesTotal: 100,
          maxEntriesPerCategory: 30,
          maxEntriesPerType: 50,
          warnAtPercent: 75,
        },
        'admin',
      );

      const trail = runtime.governance.getAuditTrail('/test');
      expect(trail.length).toBeGreaterThan(0);
      expect(trail[0].policyType).toBe('quota');
      expect(trail[0].changedBy).toBe('admin');
      expect(trail[0].oldConfig).toBeNull(); // First set, no previous
      expect(trail[0].newConfig).toHaveProperty('maxEntriesTotal', 100);
    });

    it('should record old config on policy update', () => {
      runtime.governance.setPolicy('/test', 'quota', { maxEntriesTotal: 100 } as Record<
        string,
        unknown
      >);
      runtime.governance.setPolicy('/test', 'quota', { maxEntriesTotal: 200 } as Record<
        string,
        unknown
      >);

      const trail = runtime.governance.getAuditTrail('/test');
      expect(trail.length).toBe(2);
      // Both entries present — find the second change (the one with oldConfig)
      const updateEntry = trail.find((t) => t.oldConfig !== null);
      expect(updateEntry).toBeDefined();
      expect(updateEntry!.newConfig).toHaveProperty('maxEntriesTotal', 200);
      expect(updateEntry!.oldConfig).toHaveProperty('maxEntriesTotal', 100);
    });
  });

  // ─── Dashboard ────────────────────────────────────────────────────

  describe('Dashboard', () => {
    it('should return combined health view', () => {
      const dashboard = runtime.governance.getDashboard('/test');
      expect(dashboard.vaultSize).toBe(0);
      expect(dashboard.quotaPercent).toBe(0);
      expect(dashboard.pendingProposals).toBe(0);
      expect(dashboard.policySummary.maxEntries).toBe(500);
      expect(dashboard.policySummary.requireReview).toBe(false);
      expect(typeof dashboard.acceptanceRate).toBe('number');
      expect(typeof dashboard.evaluationTrend).toBe('object');
    });

    it('should reflect vault entries in quota percent', () => {
      // Set low quota for easy percentage
      runtime.governance.setPolicy('/test', 'quota', {
        maxEntriesTotal: 10,
        maxEntriesPerCategory: 100,
        maxEntriesPerType: 100,
        warnAtPercent: 80,
      });
      runtime.vault.seed([
        {
          id: 'dq1',
          type: 'pattern',
          domain: 'd',
          title: 'T',
          severity: 'warning',
          description: 'D',
          tags: ['t'],
        },
        {
          id: 'dq2',
          type: 'pattern',
          domain: 'd',
          title: 'T',
          severity: 'warning',
          description: 'D',
          tags: ['t'],
        },
        {
          id: 'dq3',
          type: 'pattern',
          domain: 'd',
          title: 'T',
          severity: 'warning',
          description: 'D',
          tags: ['t'],
        },
      ]);

      const dashboard = runtime.governance.getDashboard('/test');
      expect(dashboard.vaultSize).toBe(3);
      expect(dashboard.quotaPercent).toBe(30);
    });
  });

  // ─── Edge Cases ───────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('should handle empty vault gracefully', () => {
      const status = runtime.governance.getQuotaStatus('/empty');
      expect(status.total).toBe(0);
      expect(status.isWarning).toBe(false);
    });

    it('should handle unknown project defaults', () => {
      const policy = runtime.governance.getPolicy('/nonexistent');
      expect(policy.quotas.maxEntriesTotal).toBe(500);
    });

    it('should return null for approving nonexistent proposal', () => {
      expect(runtime.governance.approveProposal(9999)).toBeNull();
    });

    it('should return 0 expired when no stale proposals', () => {
      const expired = runtime.governance.expireStaleProposals(1);
      expect(expired).toBe(0);
    });

    it('should return empty stats when no proposals exist', () => {
      const stats = runtime.governance.getProposalStats('/test');
      expect(stats.total).toBe(0);
      expect(stats.acceptanceRate).toBe(0);
      expect(Object.keys(stats.byCategory)).toHaveLength(0);
    });
  });
});
