import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createAgentRuntime } from '../runtime/runtime.js';
import type { AgentRuntime } from '../runtime/types.js';

// Invariant under test: every public method on GovernancePolicies must normalize
// projectPath via node:path.resolve before touching the DB. Without this,
// callers that pass '.' vs the resolved absolute path read/write different rows
// and downstream consumers (session_start, governance_dashboard) disagree.

describe('GovernancePolicies — projectPath normalization invariant', () => {
  let runtime: AgentRuntime;
  let plannerDir: string;
  let workDir: string;
  let originalCwd: string;

  beforeEach(() => {
    plannerDir = join(tmpdir(), 'gov-norm-' + Date.now());
    workDir = join(tmpdir(), 'gov-norm-cwd-' + Date.now());
    mkdirSync(plannerDir, { recursive: true });
    mkdirSync(workDir, { recursive: true });
    originalCwd = process.cwd();
    process.chdir(workDir);
    runtime = createAgentRuntime({
      agentId: 'test-governance-normalization',
      vaultPath: ':memory:',
      plansPath: join(plannerDir, 'plans.json'),
    });
  });

  afterEach(() => {
    runtime.close();
    process.chdir(originalCwd);
    rmSync(plannerDir, { recursive: true, force: true });
    rmSync(workDir, { recursive: true, force: true });
  });

  it("getPolicy('.') and getPolicy(resolve('.')) return the same custom policy", () => {
    runtime.governance.setPolicy(resolve('.'), 'quota', {
      maxEntriesTotal: 777,
      maxEntriesPerCategory: 100,
      maxEntriesPerType: 200,
      warnAtPercent: 85,
    });

    const viaRelative = runtime.governance.getPolicy('.');
    const viaAbsolute = runtime.governance.getPolicy(resolve('.'));

    expect(viaRelative.quotas.maxEntriesTotal).toBe(777);
    expect(viaAbsolute.quotas.maxEntriesTotal).toBe(777);
    expect(viaRelative.quotas).toEqual(viaAbsolute.quotas);
  });

  it("setPolicy('.') writes a row keyed by the absolute path", () => {
    runtime.governance.setPolicy('.', 'quota', {
      maxEntriesTotal: 1234,
      maxEntriesPerCategory: 100,
      maxEntriesPerType: 200,
      warnAtPercent: 90,
    });

    // Reading via the absolute path must see the write made with '.'.
    const absPolicy = runtime.governance.getPolicy(resolve('.'));
    expect(absPolicy.quotas.maxEntriesTotal).toBe(1234);
  });

  it("getQuotaStatus('.') and getQuotaStatus(resolve('.')) return identical maxTotal", () => {
    runtime.governance.applyPreset('.', 'permissive');

    const viaRelative = runtime.governance.getQuotaStatus('.');
    const viaAbsolute = runtime.governance.getQuotaStatus(resolve('.'));

    expect(viaRelative.maxTotal).toBe(2000); // permissive
    expect(viaAbsolute.maxTotal).toBe(2000);
    expect(viaRelative.maxTotal).toBe(viaAbsolute.maxTotal);
    expect(viaRelative.warnAtPercent).toBe(viaAbsolute.warnAtPercent);
  });

  it("applyPreset('.') is visible when read via absolute path", () => {
    runtime.governance.applyPreset('.', 'strict');

    const absPolicy = runtime.governance.getPolicy(resolve('.'));
    expect(absPolicy.quotas.maxEntriesTotal).toBe(200); // strict
    expect(absPolicy.quotas.warnAtPercent).toBe(70);
    expect(absPolicy.autoCapture.requireReview).toBe(true);
  });

  it("getAuditTrail('.') returns entries written via absolute path", () => {
    runtime.governance.setPolicy(
      resolve('.'),
      'retention',
      { archiveAfterDays: 42 },
      'test-writer',
    );

    const trailViaRelative = runtime.governance.getAuditTrail('.');
    const trailViaAbsolute = runtime.governance.getAuditTrail(resolve('.'));

    expect(trailViaRelative).toHaveLength(1);
    expect(trailViaAbsolute).toHaveLength(1);
    expect(trailViaRelative[0].changedBy).toBe('test-writer');
    expect(trailViaRelative[0].newConfig).toHaveProperty('archiveAfterDays', 42);
  });

  it("evaluateCapture uses the same policy for '.' and resolve('.')", () => {
    // Set a tight quota via relative path
    runtime.governance.setPolicy('.', 'quota', {
      maxEntriesTotal: 10_000, // high so we don't trip total
      maxEntriesPerCategory: 1, // low so category check drives the decision
      maxEntriesPerType: 10_000,
      warnAtPercent: 80,
    });
    runtime.governance.setPolicy('.', 'auto-capture', {
      enabled: true,
      requireReview: false,
      maxPendingProposals: 100,
      autoExpireDays: 30,
    });

    const entry = { type: 'pattern', category: 'testing', title: 'x' };
    const countPending = () => 0;

    const viaRelative = runtime.governance.evaluateCapture('.', entry, countPending);
    const viaAbsolute = runtime.governance.evaluateCapture(resolve('.'), entry, countPending);

    // Both should resolve to the same policy — identical action, regardless of which
    // path shape the caller used. (Action may be 'capture' or 'quarantine' depending
    // on existing state; what matters is that the two calls agree.)
    expect(viaRelative.action).toBe(viaAbsolute.action);
    expect(viaRelative.quotaStatus?.maxTotal).toBe(viaAbsolute.quotaStatus?.maxTotal);
  });

  it('cross-handler parity: quotaStatus is identical across relative and absolute call shapes', () => {
    // This is the canary for the original bug: two code paths with the same
    // logical projectPath must agree on quota numbers.
    runtime.governance.applyPreset(resolve('.'), 'moderate');

    const q1 = runtime.governance.getQuotaStatus('.');
    const q2 = runtime.governance.getQuotaStatus(resolve('.'));

    expect(q1.total).toBe(q2.total);
    expect(q1.maxTotal).toBe(q2.maxTotal);
    expect(q1.isWarning).toBe(q2.isWarning);
  });
});
