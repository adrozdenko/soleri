/**
 * TDD tests for brain extraction quality (issue #359).
 *
 * These tests define the DESIRED behavior of extractKnowledge().
 * They are expected to FAIL against the current implementation.
 * Implementation fixes come in issues #360-#366.
 *
 * What's wrong today:
 * - plan_completed rule produces generic "Successful plan: {id}" titles
 * - Extraction rules never read session.context (objective, scope, decisions)
 * - No dedup: same rule + sessionId can produce duplicate proposals
 * - long_session rule fires with low-value noise (to be removed in #360)
 * - No drift_detected rule exists yet (to be added in #366)
 * - Confidence is not adjusted based on context richness
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAgentRuntime } from '../runtime/runtime.js';
import type { AgentRuntime } from '../runtime/types.js';

describe('Extraction Quality', () => {
  let runtime: AgentRuntime;
  let plannerDir: string;

  beforeEach(() => {
    plannerDir = join(tmpdir(), 'extraction-quality-test-' + Date.now());
    mkdirSync(plannerDir, { recursive: true });
    runtime = createAgentRuntime({
      agentId: 'test-extraction-quality',
      vaultPath: ':memory:',
      plansPath: join(plannerDir, 'plans.json'),
    });
  });

  afterEach(() => {
    runtime.close();
    rmSync(plannerDir, { recursive: true, force: true });
  });

  // ─── Helper ────────────────────────────────────────────────────────

  function createSessionWithContext(
    sessionId: string,
    context: string,
    overrides: {
      planId?: string;
      planOutcome?: string;
      toolsUsed?: string[];
      filesModified?: string[];
      domain?: string;
    } = {},
  ) {
    runtime.brainIntelligence.lifecycle({
      action: 'start',
      sessionId,
      domain: overrides.domain ?? 'testing',
      context,
      toolsUsed: overrides.toolsUsed ?? [],
      filesModified: overrides.filesModified ?? [],
      planId: overrides.planId,
    });
    runtime.brainIntelligence.lifecycle({
      action: 'end',
      sessionId,
      planOutcome: overrides.planOutcome,
      toolsUsed: overrides.toolsUsed,
      filesModified: overrides.filesModified,
    });
  }

  // ─── 1. Actionable titles from rich context ───────────────────────

  describe('actionable proposals from session context', () => {
    it('should use session context objective in plan_completed proposal title', () => {
      const richContext = JSON.stringify({
        objective: 'Add OAuth2 authentication to the API gateway',
        scope: { included: ['auth module', 'gateway routes'], excluded: ['frontend'] },
        decisions: ['Use passport.js for OAuth2 strategy'],
      });

      createSessionWithContext('rich-ctx-1', richContext, {
        planId: 'plan-oauth',
        planOutcome: 'completed',
      });

      const result = runtime.brainIntelligence.extractKnowledge('rich-ctx-1');
      const planProposal = result.proposals.find((p) => p.rule === 'plan_completed');

      expect(planProposal).toBeDefined();
      // The title should reference the objective, not just the plan ID
      expect(planProposal!.title).not.toContain('Successful plan:');
      expect(planProposal!.title.toLowerCase()).toContain('oauth');
    });

    it('should use session context objective in plan_abandoned proposal title', () => {
      const richContext = JSON.stringify({
        objective: 'Migrate database from Postgres to CockroachDB',
        scope: { included: ['migration scripts', 'connection pool'] },
      });

      createSessionWithContext('rich-ctx-2', richContext, {
        planId: 'plan-migrate',
        planOutcome: 'abandoned',
      });

      const result = runtime.brainIntelligence.extractKnowledge('rich-ctx-2');
      const abandonedProposal = result.proposals.find((p) => p.rule === 'plan_abandoned');

      expect(abandonedProposal).toBeDefined();
      // The title should reference what was abandoned, not just the plan ID
      expect(abandonedProposal!.title).not.toContain('Abandoned plan:');
      expect(abandonedProposal!.title.toLowerCase()).toContain('migrate');
    });

    it('should include scope details in proposal description when context has scope', () => {
      const richContext = JSON.stringify({
        objective: 'Refactor the billing reconciliation module',
        scope: {
          included: ['stripe-adapter', 'webhook-handler', 'ledger-service'],
          excluded: ['billing-ui', 'invoice-generator'],
        },
      });

      createSessionWithContext('rich-ctx-3', richContext, {
        planId: 'plan-abc',
        planOutcome: 'completed',
      });

      const result = runtime.brainIntelligence.extractKnowledge('rich-ctx-3');
      const planProposal = result.proposals.find((p) => p.rule === 'plan_completed');

      expect(planProposal).toBeDefined();
      // Description should mention scope components, not just "can be reused for similar tasks"
      expect(planProposal!.description.toLowerCase()).toMatch(/stripe|webhook|ledger/);
    });
  });

  // ─── 2. Dedup: same rule + sessionId = 1 proposal ────────────────

  describe('proposal deduplication', () => {
    it('should produce exactly 1 proposal per rule per session', () => {
      createSessionWithContext('dedup-1', 'some context', {
        planId: 'plan-dedup',
        planOutcome: 'completed',
      });

      // Extract twice on same session (reset extractedAt in between)
      runtime.brainIntelligence.extractKnowledge('dedup-1');
      runtime.brainIntelligence.resetExtracted({ sessionId: 'dedup-1' });
      runtime.brainIntelligence.extractKnowledge('dedup-1');

      // Query all proposals for this session
      const proposals = runtime.brainIntelligence.getProposals({
        sessionId: 'dedup-1',
      });

      // Count proposals per rule
      const ruleCounts = new Map<string, number>();
      for (const p of proposals) {
        ruleCounts.set(p.rule, (ruleCounts.get(p.rule) ?? 0) + 1);
      }

      // Each rule should appear at most once per session
      for (const [rule, count] of ruleCounts) {
        expect(count, `rule "${rule}" should appear exactly once`).toBe(1);
      }
    });
  });

  // ─── 3. long_session rule should not fire ─────────────────────────

  describe('long_session rule removal', () => {
    it('should NOT produce a long_session proposal', () => {
      // Create session manually with backdated start time to simulate >30 min duration.
      // SQLite datetime('now') uses 'YYYY-MM-DD HH:MM:SS' format (no T/Z), so match that.
      const d = new Date(Date.now() - 35 * 60 * 1000);
      const thirtyFiveMinAgo = d
        .toISOString()
        .replace('T', ' ')
        .replace(/\.\d{3}Z$/, '');
      const provider = runtime.vault.getProvider();

      // Insert session directly with backdated started_at so auto-extract sees the long duration
      provider.run(
        `INSERT INTO brain_sessions (id, started_at, domain, context, tools_used, files_modified)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['long-sess-1', thirtyFiveMinAgo, 'testing', null, '[]', '[]'],
      );

      // End the session — this sets ended_at to now(), creating a >30 min gap
      runtime.brainIntelligence.lifecycle({
        action: 'end',
        sessionId: 'long-sess-1',
        toolsUsed: ['search'], // need at least 1 tool for auto-extract gate
      });

      // Reset extracted_at so we can manually extract and inspect
      runtime.brainIntelligence.resetExtracted({ sessionId: 'long-sess-1' });

      const result = runtime.brainIntelligence.extractKnowledge('long-sess-1');

      // long_session rule should no longer exist (removal in #360)
      expect(result.rulesApplied).not.toContain('long_session');
      expect(result.proposals.find((p) => p.rule === 'long_session')).toBeUndefined();
    });
  });

  // ─── 4. drift_detected rule ───────────────────────────────────────

  describe('drift_detected rule', () => {
    it('should fire when session context contains drift indicators', () => {
      const contextWithDrift = JSON.stringify({
        objective: 'Implement caching layer for API responses',
        drift: {
          items: [
            {
              type: 'added',
              description: 'Added Redis fallback to in-memory cache',
              impact: 'medium',
            },
            {
              type: 'skipped',
              description: 'Skipped cache invalidation webhooks',
              impact: 'high',
            },
          ],
          accuracyScore: 65,
        },
      });

      createSessionWithContext('drift-1', contextWithDrift, {
        planId: 'plan-cache',
        planOutcome: 'completed',
      });

      const result = runtime.brainIntelligence.extractKnowledge('drift-1');

      // A drift_detected rule should fire (to be added in #366)
      expect(result.rulesApplied).toContain('drift_detected');
      const driftProposal = result.proposals.find((p) => p.rule === 'drift_detected');
      expect(driftProposal).toBeDefined();
      expect(driftProposal!.type).toBe('anti-pattern');
      expect(driftProposal!.description.toLowerCase()).toMatch(/drift|skipped|deviation/);
    });

    it('should NOT fire drift_detected when context has no drift', () => {
      const cleanContext = JSON.stringify({
        objective: 'Add unit tests for auth module',
        scope: { included: ['auth'] },
      });

      createSessionWithContext('no-drift-1', cleanContext, {
        planId: 'plan-tests',
        planOutcome: 'completed',
      });

      const result = runtime.brainIntelligence.extractKnowledge('no-drift-1');
      expect(result.rulesApplied).not.toContain('drift_detected');
    });
  });

  // ─── 5. Context richness affects confidence ───────────────────────

  describe('confidence based on context richness', () => {
    it('should assign higher confidence to proposals with rich session context', () => {
      // Session with rich context
      const richContext = JSON.stringify({
        objective: 'Build notification service',
        scope: { included: ['notifications', 'email-adapter', 'push-adapter'] },
        decisions: ['Use event-driven architecture', 'SNS for push notifications'],
      });

      createSessionWithContext('conf-rich', richContext, {
        planId: 'plan-notify-rich',
        planOutcome: 'completed',
      });

      // Session with no context
      createSessionWithContext('conf-empty', '', {
        planId: 'plan-notify-empty',
        planOutcome: 'completed',
      });

      const richResult = runtime.brainIntelligence.extractKnowledge('conf-rich');
      runtime.brainIntelligence.resetExtracted({ sessionId: 'conf-empty' });
      const emptyResult = runtime.brainIntelligence.extractKnowledge('conf-empty');

      const richPlanProposal = richResult.proposals.find((p) => p.rule === 'plan_completed');
      const emptyPlanProposal = emptyResult.proposals.find((p) => p.rule === 'plan_completed');

      expect(richPlanProposal).toBeDefined();
      expect(emptyPlanProposal).toBeDefined();

      // Rich context should produce higher confidence than empty context
      expect(richPlanProposal!.confidence).toBeGreaterThan(emptyPlanProposal!.confidence);
    });

    it('should assign lower confidence when session context is null', () => {
      // Session with null context (no context field at all)
      runtime.brainIntelligence.lifecycle({
        action: 'start',
        sessionId: 'conf-null',
        planId: 'plan-null-ctx',
      });
      runtime.brainIntelligence.lifecycle({
        action: 'end',
        sessionId: 'conf-null',
        planOutcome: 'completed',
      });

      runtime.brainIntelligence.resetExtracted({ sessionId: 'conf-null' });
      const result = runtime.brainIntelligence.extractKnowledge('conf-null');
      const planProposal = result.proposals.find((p) => p.rule === 'plan_completed');

      expect(planProposal).toBeDefined();
      // Without context, confidence should be below the current hardcoded 0.65
      expect(planProposal!.confidence).toBeLessThan(0.65);
    });
  });
});
