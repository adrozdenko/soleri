import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createAgentRuntime } from '../runtime.js';
import type { AgentRuntime } from '../types.js';

// Regression canary for the governance quota-percent mismatch bug.
// Before the fix, session_start resolved projectPath via node:path.resolve
// but governance_dashboard accepted it verbatim. A stored row keyed by "."
// would match the dashboard query but not session_start, producing two
// different quotaPercent values for the same logical projectPath. This
// test asserts they agree — the canary that would have caught the original
// bug in CI.

describe('Governance quota parity — session_start vs governance_dashboard', () => {
  let runtime: AgentRuntime;
  let plannerDir: string;
  let workDir: string;
  let originalCwd: string;

  beforeEach(() => {
    plannerDir = join(tmpdir(), 'gov-parity-' + Date.now());
    workDir = join(tmpdir(), 'gov-parity-cwd-' + Date.now());
    mkdirSync(plannerDir, { recursive: true });
    mkdirSync(workDir, { recursive: true });
    originalCwd = process.cwd();
    process.chdir(workDir);
    runtime = createAgentRuntime({
      agentId: 'test-gov-parity',
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

  it("both handlers compute identical quotaPercent for projectPath '.'", () => {
    // Register + seed a custom permissive quota via the relative path.
    runtime.governance.applyPreset('.', 'permissive');

    // Compute the numbers both handlers would produce, using the SAME math
    // the handlers use (Math.round((total / maxTotal) * 100)).
    const absolutePath = resolve('.');
    const sessionStartQuota = runtime.governance.getQuotaStatus(absolutePath);
    const dashboard = runtime.governance.getDashboard('.');

    const sessionStartPercent =
      sessionStartQuota.maxTotal > 0
        ? Math.round((sessionStartQuota.total / sessionStartQuota.maxTotal) * 100)
        : 0;

    expect(sessionStartQuota.maxTotal).toBe(dashboard.quotaStatus.maxTotal);
    expect(sessionStartPercent).toBe(dashboard.quotaPercent);
    expect(sessionStartQuota.isWarning).toBe(dashboard.quotaStatus.isWarning);
  });

  it("policies written under '.' are still readable via the absolute path", () => {
    runtime.governance.setPolicy('.', 'quota', {
      maxEntriesTotal: 3141,
      maxEntriesPerCategory: 500,
      maxEntriesPerType: 1000,
      warnAtPercent: 85,
    });

    const viaAbsolute = runtime.governance.getPolicy(resolve('.'));
    const dashboard = runtime.governance.getDashboard('.');

    expect(viaAbsolute.quotas.maxEntriesTotal).toBe(3141);
    expect(dashboard.quotaStatus.maxTotal).toBe(3141);
  });
});
