import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createAgentRuntime } from '../runtime/runtime.js';
import type { AgentRuntime } from '../runtime/types.js';

describe('Governance (colocated)', () => {
  let runtime: AgentRuntime;
  let plannerDir: string;

  beforeEach(() => {
    plannerDir = join(tmpdir(), 'gov-colocated-' + Date.now());
    mkdirSync(plannerDir, { recursive: true });
    runtime = createAgentRuntime({
      agentId: 'test-governance-colocated',
      vaultPath: ':memory:',
      plansPath: join(plannerDir, 'plans.json'),
    });
  });

  afterEach(() => {
    runtime.close();
    rmSync(plannerDir, { recursive: true, force: true });
  });

  // ─── Policy CRUD ──────────────────────────────────────────────────

  describe('getPolicy', () => {
    it('returns moderate defaults for unknown project', () => {
      const policy = runtime.governance.getPolicy('/unknown');
      expect(policy.projectPath).toBe(resolve('/unknown').replace(/\\/g, '/'));
      expect(policy.quotas.maxEntriesTotal).toBe(500);
      expect(policy.quotas.maxEntriesPerCategory).toBe(150);
      expect(policy.quotas.maxEntriesPerType).toBe(250);
      expect(policy.quotas.warnAtPercent).toBe(80);
      expect(policy.retention.archiveAfterDays).toBe(90);
      expect(policy.retention.minHitsToKeep).toBe(2);
      expect(policy.retention.deleteArchivedAfterDays).toBe(180);
      expect(policy.autoCapture.enabled).toBe(true);
      expect(policy.autoCapture.requireReview).toBe(false);
      expect(policy.autoCapture.maxPendingProposals).toBe(25);
      expect(policy.autoCapture.autoExpireDays).toBe(14);
    });

    it('returns custom policy when set', () => {
      runtime.governance.setPolicy('/proj', 'quota', {
        maxEntriesTotal: 42,
        maxEntriesPerCategory: 10,
        maxEntriesPerType: 20,
        warnAtPercent: 60,
      });
      const policy = runtime.governance.getPolicy('/proj');
      expect(policy.quotas.maxEntriesTotal).toBe(42);
      expect(policy.retention.archiveAfterDays).toBe(90); // default unchanged
    });

    it('returns distinct policies per project', () => {
      runtime.governance.applyPreset('/a', 'strict');
      runtime.governance.applyPreset('/b', 'permissive');
      expect(runtime.governance.getPolicy('/a').quotas.maxEntriesTotal).toBe(200);
      expect(runtime.governance.getPolicy('/b').quotas.maxEntriesTotal).toBe(2000);
    });
  });

  describe('setPolicy', () => {
    it('upserts on repeated calls for same project+type', () => {
      runtime.governance.setPolicy('/p', 'quota', { maxEntriesTotal: 100 } as Record<
        string,
        unknown
      >);
      runtime.governance.setPolicy('/p', 'quota', { maxEntriesTotal: 200 } as Record<
        string,
        unknown
      >);
      const policy = runtime.governance.getPolicy('/p');
      expect(policy.quotas.maxEntriesTotal).toBe(200);
    });

    it('records audit trail with changedBy', () => {
      runtime.governance.setPolicy(
        '/p',
        'retention',
        { archiveAfterDays: 7 } as Record<string, unknown>,
        'admin',
      );
      const trail = runtime.governance.getAuditTrail('/p');
      expect(trail).toHaveLength(1);
      expect(trail[0].changedBy).toBe('admin');
      expect(trail[0].oldConfig).toBeNull();
      expect(trail[0].newConfig).toHaveProperty('archiveAfterDays', 7);
    });

    it('captures old config on update', () => {
      runtime.governance.setPolicy('/p', 'quota', { maxEntriesTotal: 50 } as Record<
        string,
        unknown
      >);
      runtime.governance.setPolicy('/p', 'quota', { maxEntriesTotal: 100 } as Record<
        string,
        unknown
      >);
      const trail = runtime.governance.getAuditTrail('/p');
      const update = trail.find((t) => t.oldConfig !== null);
      expect(update).toBeDefined();
      expect(update!.oldConfig).toHaveProperty('maxEntriesTotal', 50);
      expect(update!.newConfig).toHaveProperty('maxEntriesTotal', 100);
    });
  });

  describe('applyPreset', () => {
    it('applies strict preset correctly', () => {
      runtime.governance.applyPreset('/p', 'strict');
      const policy = runtime.governance.getPolicy('/p');
      expect(policy.quotas.maxEntriesTotal).toBe(200);
      expect(policy.quotas.maxEntriesPerCategory).toBe(50);
      expect(policy.retention.archiveAfterDays).toBe(30);
      expect(policy.retention.minHitsToKeep).toBe(5);
      expect(policy.autoCapture.requireReview).toBe(true);
      expect(policy.autoCapture.maxPendingProposals).toBe(10);
      expect(policy.autoCapture.autoExpireDays).toBe(7);
    });

    it('applies moderate preset correctly', () => {
      runtime.governance.applyPreset('/p', 'moderate');
      const policy = runtime.governance.getPolicy('/p');
      expect(policy.quotas.maxEntriesTotal).toBe(500);
      expect(policy.retention.archiveAfterDays).toBe(90);
      expect(policy.autoCapture.requireReview).toBe(false);
    });

    it('applies permissive preset correctly', () => {
      runtime.governance.applyPreset('/p', 'permissive');
      const policy = runtime.governance.getPolicy('/p');
      expect(policy.quotas.maxEntriesTotal).toBe(2000);
      expect(policy.quotas.maxEntriesPerCategory).toBe(500);
      expect(policy.retention.archiveAfterDays).toBe(365);
      expect(policy.retention.deleteArchivedAfterDays).toBe(730);
      expect(policy.autoCapture.maxPendingProposals).toBe(100);
      expect(policy.autoCapture.autoExpireDays).toBe(30);
    });

    it('throws on unknown preset', () => {
      expect(() => runtime.governance.applyPreset('/p', 'nonexistent' as never)).toThrow(
        'Unknown preset',
      );
    });

    it('creates audit trail entries for all 3 policy types', () => {
      runtime.governance.applyPreset('/p', 'strict', 'admin');
      const trail = runtime.governance.getAuditTrail('/p');
      expect(trail).toHaveLength(3);
      const types = trail.map((t) => t.policyType).sort();
      expect(types).toEqual(['auto-capture', 'quota', 'retention']);
      expect(trail.every((t) => t.changedBy === 'admin')).toBe(true);
    });
  });

  // ─── Quota Status ─────────────────────────────────────────────────

  describe('getQuotaStatus', () => {
    it('returns zero counts for empty vault', () => {
      const status = runtime.governance.getQuotaStatus('/p');
      expect(status.total).toBe(0);
      expect(status.maxTotal).toBe(500);
      expect(status.isWarning).toBe(false);
      expect(Object.keys(status.byCategory)).toHaveLength(0);
      expect(Object.keys(status.byType)).toHaveLength(0);
    });

    it('counts entries by category and type', () => {
      runtime.vault.seed([
        {
          id: 'e1',
          type: 'pattern',
          domain: 'testing',
          title: 'T1',
          severity: 'warning',
          description: 'D1',
          tags: [],
        },
        {
          id: 'e2',
          type: 'rule',
          domain: 'testing',
          title: 'T2',
          severity: 'warning',
          description: 'D2',
          tags: [],
        },
        {
          id: 'e3',
          type: 'pattern',
          domain: 'styling',
          title: 'T3',
          severity: 'warning',
          description: 'D3',
          tags: [],
        },
      ]);
      const status = runtime.governance.getQuotaStatus('/p');
      expect(status.total).toBe(3);
      expect(status.byCategory.testing).toBe(2);
      expect(status.byCategory.styling).toBe(1);
      expect(status.byType.pattern).toBe(2);
      expect(status.byType.rule).toBe(1);
    });

    it('sets isWarning when at warn threshold', () => {
      runtime.governance.setPolicy('/p', 'quota', {
        maxEntriesTotal: 10,
        maxEntriesPerCategory: 100,
        maxEntriesPerType: 100,
        warnAtPercent: 50,
      });
      // Seed 5 entries = 50% of 10
      const entries = Array.from({ length: 5 }, (_, i) => ({
        id: `w${i}`,
        type: 'pattern' as const,
        domain: 'test',
        title: `T${i}`,
        severity: 'warning' as const,
        description: `D${i}`,
        tags: [] as string[],
      }));
      runtime.vault.seed(entries);
      const status = runtime.governance.getQuotaStatus('/p');
      expect(status.isWarning).toBe(true);
    });

    it('isWarning is false below threshold', () => {
      runtime.governance.setPolicy('/p', 'quota', {
        maxEntriesTotal: 100,
        maxEntriesPerCategory: 100,
        maxEntriesPerType: 100,
        warnAtPercent: 80,
      });
      runtime.vault.seed([
        {
          id: 'x1',
          type: 'pattern',
          domain: 'a',
          title: 'T',
          severity: 'warning',
          description: 'D',
          tags: [],
        },
      ]);
      const status = runtime.governance.getQuotaStatus('/p');
      expect(status.isWarning).toBe(false);
    });
  });

  // ─── Audit Trail ──────────────────────────────────────────────────

  describe('getAuditTrail', () => {
    it('returns empty array for project with no changes', () => {
      const trail = runtime.governance.getAuditTrail('/empty');
      expect(trail).toEqual([]);
    });

    it('respects limit parameter', () => {
      runtime.governance.setPolicy('/p', 'quota', { a: 1 } as Record<string, unknown>);
      runtime.governance.setPolicy('/p', 'quota', { a: 2 } as Record<string, unknown>);
      runtime.governance.setPolicy('/p', 'quota', { a: 3 } as Record<string, unknown>);
      const trail = runtime.governance.getAuditTrail('/p', 2);
      expect(trail).toHaveLength(2);
    });

    it('returns entries ordered by changed_at descending', () => {
      runtime.governance.setPolicy('/p', 'quota', { v: 1 } as Record<string, unknown>);
      runtime.governance.setPolicy('/p', 'retention', { v: 2 } as Record<string, unknown>);
      const trail = runtime.governance.getAuditTrail('/p');
      expect(trail).toHaveLength(2);
      // Both have the same second-resolution timestamp, so verify both types are present
      const types = trail.map((t) => t.policyType).sort();
      expect(types).toEqual(['quota', 'retention']);
      // Verify changed_at is non-decreasing (most recent first)
      expect(trail[0].changedAt).toBeGreaterThanOrEqual(trail[1].changedAt);
    });
  });

  // ─── Evaluation ───────────────────────────────────────────────────

  describe('evaluateCapture', () => {
    it('allows capture when within all quotas', () => {
      const decision = runtime.governance.evaluateCapture('/p', {
        type: 'pattern',
        category: 'testing',
        title: 'Good one',
      });
      expect(decision.allowed).toBe(true);
      expect(decision.action).toBe('capture');
      expect(decision.quotaStatus).toBeDefined();
    });

    it('rejects when auto-capture is disabled', () => {
      runtime.governance.setPolicy('/p', 'auto-capture', {
        enabled: false,
        requireReview: false,
        maxPendingProposals: 25,
        autoExpireDays: 14,
      });
      const decision = runtime.governance.evaluateCapture('/p', { type: 'pattern', category: 'a' });
      expect(decision.allowed).toBe(false);
      expect(decision.action).toBe('reject');
      expect(decision.reason).toContain('disabled');
    });

    it('proposes when review is required and pending slots available', () => {
      runtime.governance.applyPreset('/p', 'strict');
      const decision = runtime.governance.evaluateCapture('/p', { type: 'pattern', category: 'a' });
      expect(decision.allowed).toBe(false);
      expect(decision.action).toBe('propose');
      expect(decision.reason).toContain('Review required');
    });

    it('rejects when review required but pending proposals at max', () => {
      runtime.governance.setPolicy('/p', 'auto-capture', {
        enabled: true,
        requireReview: true,
        maxPendingProposals: 2,
        autoExpireDays: 14,
      });
      // Create 2 pending proposals to fill the max
      runtime.governance.propose('/p', { title: 'P1', type: 'pattern', category: 'a' });
      runtime.governance.propose('/p', { title: 'P2', type: 'pattern', category: 'b' });

      const decision = runtime.governance.evaluateCapture('/p', { type: 'pattern', category: 'c' });
      expect(decision.allowed).toBe(false);
      expect(decision.action).toBe('reject');
      expect(decision.reason).toContain('Too many pending proposals');
    });

    it('rejects when total quota exceeded', () => {
      runtime.governance.setPolicy('/p', 'quota', {
        maxEntriesTotal: 1,
        maxEntriesPerCategory: 100,
        maxEntriesPerType: 100,
        warnAtPercent: 80,
      });
      runtime.vault.seed([
        {
          id: 'full1',
          type: 'pattern',
          domain: 'a',
          title: 'T',
          severity: 'warning',
          description: 'D',
          tags: [],
        },
      ]);
      const decision = runtime.governance.evaluateCapture('/p', { type: 'pattern', category: 'a' });
      expect(decision.allowed).toBe(false);
      expect(decision.action).toBe('reject');
      expect(decision.reason).toContain('Total quota exceeded');
    });

    it('quarantines when category quota exceeded', () => {
      runtime.governance.setPolicy('/p', 'quota', {
        maxEntriesTotal: 1000,
        maxEntriesPerCategory: 1,
        maxEntriesPerType: 1000,
        warnAtPercent: 80,
      });
      runtime.vault.seed([
        {
          id: 'cat1',
          type: 'pattern',
          domain: 'a',
          title: 'T',
          severity: 'warning',
          description: 'D',
          tags: [],
        },
      ]);
      const decision = runtime.governance.evaluateCapture('/p', { type: 'pattern', category: 'a' });
      expect(decision.allowed).toBe(false);
      expect(decision.action).toBe('quarantine');
      expect(decision.reason).toContain('Category quota exceeded');
    });

    it('quarantines when type quota exceeded', () => {
      runtime.governance.setPolicy('/p', 'quota', {
        maxEntriesTotal: 1000,
        maxEntriesPerCategory: 1000,
        maxEntriesPerType: 1,
        warnAtPercent: 80,
      });
      runtime.vault.seed([
        {
          id: 'typ1',
          type: 'pattern',
          domain: 'a',
          title: 'T',
          severity: 'warning',
          description: 'D',
          tags: [],
        },
      ]);
      const decision = runtime.governance.evaluateCapture('/p', { type: 'pattern', category: 'b' });
      expect(decision.allowed).toBe(false);
      expect(decision.action).toBe('quarantine');
      expect(decision.reason).toContain('Type quota exceeded');
    });
  });

  describe('evaluateBatch', () => {
    it('evaluates multiple entries', () => {
      const results = runtime.governance.evaluateBatch('/p', [
        { type: 'pattern', category: 'a' },
        { type: 'rule', category: 'b' },
        { type: 'anti-pattern', category: 'c' },
      ]);
      expect(results).toHaveLength(3);
      expect(results.every((r) => r.decision.action === 'capture')).toBe(true);
    });

    it('returns empty array for empty input', () => {
      const results = runtime.governance.evaluateBatch('/p', []);
      expect(results).toEqual([]);
    });

    it('produces mixed results when quotas are tight', () => {
      runtime.governance.setPolicy('/p', 'quota', {
        maxEntriesTotal: 1,
        maxEntriesPerCategory: 100,
        maxEntriesPerType: 100,
        warnAtPercent: 80,
      });
      runtime.vault.seed([
        {
          id: 'mx1',
          type: 'pattern',
          domain: 'a',
          title: 'T',
          severity: 'warning',
          description: 'D',
          tags: [],
        },
      ]);
      const results = runtime.governance.evaluateBatch('/p', [
        { type: 'pattern', category: 'a' },
        { type: 'rule', category: 'b' },
      ]);
      // Both should be rejected since total quota is already full
      expect(results.every((r) => r.decision.action === 'reject')).toBe(true);
    });
  });

  // ─── Proposals ────────────────────────────────────────────────────

  describe('propose', () => {
    it('returns a positive proposal id', () => {
      const id = runtime.governance.propose('/p', {
        title: 'New pattern',
        type: 'pattern',
        category: 'testing',
      });
      expect(id).toBeGreaterThan(0);
    });

    it('stores custom data and source', () => {
      const id = runtime.governance.propose(
        '/p',
        {
          entryId: 'custom-id',
          title: 'With data',
          type: 'rule',
          category: 'arch',
          data: { description: 'Detailed rule', severity: 'critical' },
        },
        'brain-radar',
      );
      const pending = runtime.governance.listPendingProposals('/p');
      const found = pending.find((p) => p.id === id);
      expect(found).toBeDefined();
      expect(found!.entryId).toBe('custom-id');
      expect(found!.source).toBe('brain-radar');
      expect(found!.proposedData).toHaveProperty('description', 'Detailed rule');
    });
  });

  describe('approveProposal', () => {
    it('approves and captures into vault', () => {
      const id = runtime.governance.propose('/p', {
        entryId: 'ap-1',
        title: 'Approved pattern',
        type: 'pattern',
        category: 'testing',
        data: { severity: 'warning', description: 'Test desc', tags: ['gov'] },
      });
      expect(runtime.vault.get('ap-1')).toBeNull();

      const result = runtime.governance.approveProposal(id, 'admin');
      expect(result).not.toBeNull();
      expect(result!.status).toBe('approved');
      expect(result!.decidedBy).toBe('admin');

      const entry = runtime.vault.get('ap-1');
      expect(entry).not.toBeNull();
      expect(entry!.title).toBe('Approved pattern');
      expect(entry!.domain).toBe('testing');
    });

    it('generates entry id from proposal id when entryId missing', () => {
      const id = runtime.governance.propose('/p', {
        title: 'Auto id',
        type: 'rule',
        category: 'arch',
        data: { severity: 'suggestion', description: 'Auto' },
      });
      runtime.governance.approveProposal(id);
      const entry = runtime.vault.get(`proposal-${id}`);
      expect(entry).not.toBeNull();
      expect(entry!.type).toBe('rule');
    });

    it('returns null for nonexistent proposal', () => {
      expect(runtime.governance.approveProposal(9999)).toBeNull();
    });

    it('returns null on double approval', () => {
      const id = runtime.governance.propose('/p', { title: 'T', type: 'pattern', category: 'a' });
      runtime.governance.approveProposal(id);
      expect(runtime.governance.approveProposal(id)).toBeNull();
    });

    it('returns null when trying to approve a rejected proposal', () => {
      const id = runtime.governance.propose('/p', { title: 'T', type: 'pattern', category: 'a' });
      runtime.governance.rejectProposal(id);
      expect(runtime.governance.approveProposal(id)).toBeNull();
    });
  });

  describe('rejectProposal', () => {
    it('rejects with note', () => {
      const id = runtime.governance.propose('/p', { title: 'Bad', type: 'pattern', category: 'a' });
      const result = runtime.governance.rejectProposal(id, 'admin', 'Not useful');
      expect(result).not.toBeNull();
      expect(result!.status).toBe('rejected');
      expect(result!.modificationNote).toBe('Not useful');
    });

    it('returns null for nonexistent proposal', () => {
      expect(runtime.governance.rejectProposal(9999)).toBeNull();
    });

    it('returns null when rejecting already-approved proposal', () => {
      const id = runtime.governance.propose('/p', { title: 'T', type: 'pattern', category: 'a' });
      runtime.governance.approveProposal(id);
      expect(runtime.governance.rejectProposal(id)).toBeNull();
    });
  });

  describe('modifyProposal', () => {
    it('merges modifications and marks as modified', () => {
      const id = runtime.governance.propose('/p', {
        title: 'Draft',
        type: 'pattern',
        category: 'a',
        data: { description: 'Original', severity: 'warning' },
      });
      const result = runtime.governance.modifyProposal(
        id,
        { description: 'Updated', extra: true },
        'editor',
      );
      expect(result).not.toBeNull();
      expect(result!.status).toBe('modified');
      expect(result!.proposedData.description).toBe('Updated');
      expect(result!.proposedData.severity).toBe('warning'); // original preserved
      expect(result!.proposedData.extra).toBe(true);
    });

    it('captures into vault on modify', () => {
      const id = runtime.governance.propose('/p', {
        entryId: 'mod-1',
        title: 'Modifiable',
        type: 'pattern',
        category: 'testing',
        data: { severity: 'warning', description: 'Before' },
      });
      expect(runtime.vault.get('mod-1')).toBeNull();
      runtime.governance.modifyProposal(id, { description: 'After' }, 'editor');
      const entry = runtime.vault.get('mod-1');
      expect(entry).not.toBeNull();
      expect(entry!.description).toBe('After');
    });

    it('returns null for nonexistent proposal', () => {
      expect(runtime.governance.modifyProposal(9999, { a: 1 })).toBeNull();
    });

    it('returns null when modifying non-pending proposal', () => {
      const id = runtime.governance.propose('/p', { title: 'T', type: 'pattern', category: 'a' });
      runtime.governance.approveProposal(id);
      expect(runtime.governance.modifyProposal(id, { a: 1 })).toBeNull();
    });
  });

  describe('listPendingProposals', () => {
    it('lists all pending across projects when no filter', () => {
      runtime.governance.propose('/a', { title: 'P1', type: 'pattern', category: 'x' });
      runtime.governance.propose('/b', { title: 'P2', type: 'rule', category: 'y' });
      const all = runtime.governance.listPendingProposals();
      expect(all).toHaveLength(2);
    });

    it('filters by project path', () => {
      runtime.governance.propose('/a', { title: 'P1', type: 'pattern', category: 'x' });
      runtime.governance.propose('/b', { title: 'P2', type: 'rule', category: 'y' });
      expect(runtime.governance.listPendingProposals('/a')).toHaveLength(1);
      expect(runtime.governance.listPendingProposals('/b')).toHaveLength(1);
    });

    it('respects limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        runtime.governance.propose('/p', { title: `P${i}`, type: 'pattern', category: 'a' });
      }
      expect(runtime.governance.listPendingProposals('/p', 3)).toHaveLength(3);
    });

    it('excludes non-pending proposals', () => {
      const id1 = runtime.governance.propose('/p', { title: 'P1', type: 'pattern', category: 'a' });
      runtime.governance.propose('/p', { title: 'P2', type: 'rule', category: 'b' });
      runtime.governance.approveProposal(id1);
      expect(runtime.governance.listPendingProposals('/p')).toHaveLength(1);
    });
  });

  // ─── Proposal Stats ──────────────────────────────────────────────

  describe('getProposalStats', () => {
    it('returns zeroes when no proposals exist', () => {
      const stats = runtime.governance.getProposalStats('/p');
      expect(stats.total).toBe(0);
      expect(stats.pending).toBe(0);
      expect(stats.approved).toBe(0);
      expect(stats.rejected).toBe(0);
      expect(stats.modified).toBe(0);
      expect(stats.expired).toBe(0);
      expect(stats.acceptanceRate).toBe(0);
      expect(Object.keys(stats.byCategory)).toHaveLength(0);
    });

    it('computes counts and acceptance rate', () => {
      const id1 = runtime.governance.propose('/p', { title: 'P1', type: 'pattern', category: 'a' });
      const id2 = runtime.governance.propose('/p', { title: 'P2', type: 'pattern', category: 'a' });
      const id3 = runtime.governance.propose('/p', { title: 'P3', type: 'rule', category: 'b' });
      runtime.governance.propose('/p', { title: 'P4', type: 'rule', category: 'b' }); // pending

      runtime.governance.approveProposal(id1);
      runtime.governance.rejectProposal(id2);
      runtime.governance.modifyProposal(id3, { updated: true });

      const stats = runtime.governance.getProposalStats('/p');
      expect(stats.total).toBe(4);
      expect(stats.approved).toBe(1);
      expect(stats.rejected).toBe(1);
      expect(stats.modified).toBe(1);
      expect(stats.pending).toBe(1);
      // acceptanceRate = (approved + modified) / (approved + modified + rejected) = 2/3
      expect(stats.acceptanceRate).toBeCloseTo(2 / 3, 5);
    });

    it('computes byCategory breakdown', () => {
      const id1 = runtime.governance.propose('/p', {
        title: 'P1',
        type: 'pattern',
        category: 'arch',
      });
      const id2 = runtime.governance.propose('/p', { title: 'P2', type: 'rule', category: 'arch' });
      runtime.governance.approveProposal(id1);
      runtime.governance.rejectProposal(id2);

      const stats = runtime.governance.getProposalStats('/p');
      expect(stats.byCategory.arch).toBeDefined();
      expect(stats.byCategory.arch.total).toBe(2);
      expect(stats.byCategory.arch.accepted).toBe(1);
      expect(stats.byCategory.arch.rate).toBe(0.5);
    });

    it('returns global stats when no projectPath provided', () => {
      runtime.governance.propose('/a', { title: 'P1', type: 'pattern', category: 'x' });
      runtime.governance.propose('/b', { title: 'P2', type: 'rule', category: 'y' });
      const stats = runtime.governance.getProposalStats();
      expect(stats.total).toBe(2);
    });
  });

  // ─── Expiration ───────────────────────────────────────────────────

  describe('expireStaleProposals', () => {
    it('returns 0 when no stale proposals', () => {
      runtime.governance.propose('/p', { title: 'Fresh', type: 'pattern', category: 'a' });
      const expired = runtime.governance.expireStaleProposals(1);
      expect(expired).toBe(0);
    });

    it('returns 0 when no proposals at all', () => {
      expect(runtime.governance.expireStaleProposals()).toBe(0);
    });

    it('does not expire non-pending proposals', () => {
      const id = runtime.governance.propose('/p', { title: 'T', type: 'pattern', category: 'a' });
      runtime.governance.approveProposal(id);
      // Even with maxAgeDays=0, approved proposals should not be expired
      // (the SQL only targets status='pending')
      const expired = runtime.governance.expireStaleProposals(0);
      expect(expired).toBe(0);
    });
  });

  // ─── Dashboard ────────────────────────────────────────────────────

  describe('getDashboard', () => {
    it('returns combined health view for empty project', () => {
      const dashboard = runtime.governance.getDashboard('/p');
      expect(dashboard.vaultSize).toBe(0);
      expect(dashboard.quotaPercent).toBe(0);
      expect(dashboard.pendingProposals).toBe(0);
      expect(dashboard.acceptanceRate).toBe(0);
      expect(dashboard.policySummary.maxEntries).toBe(500);
      expect(dashboard.policySummary.requireReview).toBe(false);
      expect(dashboard.policySummary.archiveAfterDays).toBe(90);
      expect(dashboard.policySummary.autoExpireDays).toBe(14);
      expect(typeof dashboard.evaluationTrend).toBe('object');
    });

    it('reflects vault size and quota percent', () => {
      runtime.governance.setPolicy('/p', 'quota', {
        maxEntriesTotal: 10,
        maxEntriesPerCategory: 100,
        maxEntriesPerType: 100,
        warnAtPercent: 80,
      });
      runtime.vault.seed([
        {
          id: 'd1',
          type: 'pattern',
          domain: 'd',
          title: 'T',
          severity: 'warning',
          description: 'D',
          tags: [],
        },
        {
          id: 'd2',
          type: 'rule',
          domain: 'd',
          title: 'T',
          severity: 'warning',
          description: 'D',
          tags: [],
        },
      ]);
      const dashboard = runtime.governance.getDashboard('/p');
      expect(dashboard.vaultSize).toBe(2);
      expect(dashboard.quotaPercent).toBe(20);
    });

    it('reflects pending proposals count', () => {
      runtime.governance.propose('/p', { title: 'P1', type: 'pattern', category: 'a' });
      runtime.governance.propose('/p', { title: 'P2', type: 'rule', category: 'b' });
      const dashboard = runtime.governance.getDashboard('/p');
      expect(dashboard.pendingProposals).toBe(2);
    });

    it('reflects policy summary from applied preset', () => {
      runtime.governance.applyPreset('/p', 'strict');
      const dashboard = runtime.governance.getDashboard('/p');
      expect(dashboard.policySummary.maxEntries).toBe(200);
      expect(dashboard.policySummary.requireReview).toBe(true);
      expect(dashboard.policySummary.archiveAfterDays).toBe(30);
      expect(dashboard.policySummary.autoExpireDays).toBe(7);
    });

    it('includes evaluation trend from recent evaluations', () => {
      // Trigger evaluations to populate the trend
      runtime.governance.evaluateCapture('/p', { type: 'pattern', category: 'a' });
      runtime.governance.evaluateCapture('/p', { type: 'rule', category: 'b' });
      const dashboard = runtime.governance.getDashboard('/p');
      expect(dashboard.evaluationTrend.capture).toBe(2);
    });
  });

  // ─── Edge Cases ───────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('handles concurrent proposals across projects', () => {
      const id1 = runtime.governance.propose('/a', { title: 'P1', type: 'pattern', category: 'x' });
      const id2 = runtime.governance.propose('/b', { title: 'P2', type: 'rule', category: 'y' });
      expect(id1).not.toBe(id2);
      expect(runtime.governance.listPendingProposals('/a')).toHaveLength(1);
      expect(runtime.governance.listPendingProposals('/b')).toHaveLength(1);
    });

    it('proposal with empty data serializes correctly', () => {
      const id = runtime.governance.propose('/p', {
        title: 'Minimal',
        type: 'pattern',
        category: 'misc',
      });
      const pending = runtime.governance.listPendingProposals('/p');
      const found = pending.find((p) => p.id === id);
      expect(found).toBeDefined();
      expect(found!.proposedData).toEqual({});
    });

    it('setPolicy handles all three policy types independently', () => {
      runtime.governance.setPolicy('/p', 'quota', { maxEntriesTotal: 42 } as Record<
        string,
        unknown
      >);
      runtime.governance.setPolicy('/p', 'retention', { archiveAfterDays: 7 } as Record<
        string,
        unknown
      >);
      runtime.governance.setPolicy('/p', 'auto-capture', { enabled: false } as Record<
        string,
        unknown
      >);

      const policy = runtime.governance.getPolicy('/p');
      expect(policy.quotas.maxEntriesTotal).toBe(42);
      expect(policy.retention.archiveAfterDays).toBe(7);
      expect(policy.autoCapture.enabled).toBe(false);
    });

    it('dashboard quotaPercent is 0 when maxTotal is 0', () => {
      runtime.governance.setPolicy('/p', 'quota', {
        maxEntriesTotal: 0,
        maxEntriesPerCategory: 0,
        maxEntriesPerType: 0,
        warnAtPercent: 80,
      });
      const dashboard = runtime.governance.getDashboard('/p');
      expect(dashboard.quotaPercent).toBe(0);
    });
  });
});
