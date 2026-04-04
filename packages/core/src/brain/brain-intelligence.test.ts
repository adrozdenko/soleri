import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAgentRuntime } from '../runtime/runtime.js';
import type { AgentRuntime } from '../runtime/types.js';
import type { BrainExportData } from './types.js';

describe('BrainIntelligence', () => {
  let runtime: AgentRuntime;
  let plannerDir: string;

  beforeEach(() => {
    plannerDir = join(tmpdir(), 'brain-intel-test-' + Date.now());
    mkdirSync(plannerDir, { recursive: true });
    runtime = createAgentRuntime({
      agentId: 'test-brain-intel',
      vaultPath: ':memory:',
      plansPath: join(plannerDir, 'plans.json'),
    });
  });

  afterEach(() => {
    runtime.close();
    rmSync(plannerDir, { recursive: true, force: true });
  });

  // ─── Initialization ─────────────────────────────────────────────

  it('should initialize with empty stats', () => {
    const stats = runtime.brainIntelligence.getStats();
    expect(stats.strengths).toBe(0);
    expect(stats.sessions).toBe(0);
    expect(stats.activeSessions).toBe(0);
    expect(stats.proposals).toBe(0);
    expect(stats.promotedProposals).toBe(0);
    expect(stats.globalPatterns).toBe(0);
    expect(stats.domainProfiles).toBe(0);
  });

  // ─── Session Lifecycle ──────────────────────────────────────────

  it('should start a session', () => {
    const session = runtime.brainIntelligence.lifecycle({
      action: 'start',
      domain: 'testing',
      context: 'unit tests',
    });
    expect(session.id).toBeDefined();
    expect(session.domain).toBe('testing');
    expect(session.context).toBe('unit tests');
    expect(session.endedAt).toBeNull();
  });

  it('should start a session with custom id', () => {
    const session = runtime.brainIntelligence.lifecycle({
      action: 'start',
      sessionId: 'custom-123',
      domain: 'dev',
    });
    expect(session.id).toBe('custom-123');
  });

  it('should end a session', () => {
    const started = runtime.brainIntelligence.lifecycle({
      action: 'start',
      sessionId: 'end-test',
      domain: 'testing',
    });

    const ended = runtime.brainIntelligence.lifecycle({
      action: 'end',
      sessionId: started.id,
      toolsUsed: ['search', 'edit'],
      filesModified: ['a.ts', 'b.ts'],
      planOutcome: 'completed',
    });

    expect(ended.endedAt).not.toBeNull();
    expect(ended.toolsUsed).toEqual(['search', 'edit']);
    expect(ended.filesModified).toEqual(['a.ts', 'b.ts']);
    expect(ended.planOutcome).toBe('completed');
  });

  it('should throw when ending session without sessionId', () => {
    expect(() => {
      runtime.brainIntelligence.lifecycle({ action: 'end' });
    }).toThrow('sessionId required');
  });

  it('should track active sessions in stats', () => {
    runtime.brainIntelligence.lifecycle({ action: 'start', sessionId: 'active-1' });
    runtime.brainIntelligence.lifecycle({ action: 'start', sessionId: 'active-2' });
    runtime.brainIntelligence.lifecycle({
      action: 'end',
      sessionId: 'active-1',
    });

    const stats = runtime.brainIntelligence.getStats();
    expect(stats.sessions).toBe(2);
    expect(stats.activeSessions).toBe(1);
  });

  // ─── Session Context ────────────────────────────────────────────

  it('should return session context with frequencies', () => {
    runtime.brainIntelligence.lifecycle({
      action: 'start',
      sessionId: 'ctx-1',
      toolsUsed: ['search', 'edit', 'search'],
      filesModified: ['a.ts'],
    });
    runtime.brainIntelligence.lifecycle({
      action: 'start',
      sessionId: 'ctx-2',
      toolsUsed: ['search', 'write'],
      filesModified: ['a.ts', 'b.ts'],
    });

    const ctx = runtime.brainIntelligence.getSessionContext();
    expect(ctx.recentSessions.length).toBe(2);
    expect(ctx.toolFrequency.length).toBeGreaterThan(0);
    expect(ctx.fileFrequency.length).toBeGreaterThan(0);

    const searchFreq = ctx.toolFrequency.find((t) => t.tool === 'search');
    expect(searchFreq).toBeDefined();
    expect(searchFreq!.count).toBe(3);
  });

  it('should limit session context results', () => {
    for (let i = 0; i < 5; i++) {
      runtime.brainIntelligence.lifecycle({
        action: 'start',
        sessionId: `limit-${i}`,
      });
    }
    const ctx = runtime.brainIntelligence.getSessionContext(2);
    expect(ctx.recentSessions.length).toBe(2);
  });

  // ─── Archive Sessions ────────────────────────────────────────────

  it('should archive old sessions', () => {
    const db = runtime.vault.getDb();
    // Insert an old session directly
    db.prepare(
      `INSERT INTO brain_sessions (id, started_at, ended_at, tools_used, files_modified)
       VALUES (?, datetime('now', '-60 days'), datetime('now', '-59 days'), '[]', '[]')`,
    ).run('old-session');

    runtime.brainIntelligence.lifecycle({ action: 'start', sessionId: 'new-session' });
    runtime.brainIntelligence.lifecycle({ action: 'end', sessionId: 'new-session' });

    const result = runtime.brainIntelligence.archiveSessions(30);
    expect(result.archived).toBe(1);

    const stats = runtime.brainIntelligence.getStats();
    expect(stats.sessions).toBe(1); // only new-session remains
  });

  it('should not archive active sessions', () => {
    runtime.brainIntelligence.lifecycle({ action: 'start', sessionId: 'active' });
    const result = runtime.brainIntelligence.archiveSessions(0);
    expect(result.archived).toBe(0);
  });

  // ─── Strength Scoring ──────────────────────────────────────────

  it('should compute strengths from feedback', () => {
    // Seed vault and record feedback
    runtime.vault.seed([
      {
        id: 's-1',
        type: 'pattern',
        domain: 'testing',
        title: 'Test pattern',
        severity: 'warning',
        description: 'A test pattern.',
        tags: ['test'],
      },
    ]);

    runtime.brain.recordFeedback('test query', 's-1', 'accepted');
    runtime.brain.recordFeedback('test query 2', 's-1', 'accepted');
    runtime.brain.recordFeedback('test query 3', 's-1', 'dismissed');

    const strengths = runtime.brainIntelligence.computeStrengths();
    expect(strengths.length).toBe(1);
    expect(strengths[0].pattern).toBe('Test pattern');
    expect(strengths[0].domain).toBe('testing');
    expect(strengths[0].usageCount).toBe(3);
    expect(strengths[0].successRate).toBeCloseTo(2 / 3, 2);
    expect(strengths[0].strength).toBeGreaterThan(0);
  });

  it('should return empty strengths with no feedback', () => {
    const strengths = runtime.brainIntelligence.computeStrengths();
    expect(strengths).toEqual([]);
  });

  it('should get strengths with filters', () => {
    runtime.vault.seed([
      {
        id: 'sf-1',
        type: 'pattern',
        domain: 'd1',
        title: 'P1',
        severity: 'warning',
        description: 'D',
        tags: [],
      },
      {
        id: 'sf-2',
        type: 'pattern',
        domain: 'd2',
        title: 'P2',
        severity: 'warning',
        description: 'D',
        tags: [],
      },
    ]);
    runtime.brain.recordFeedback('q', 'sf-1', 'accepted');
    runtime.brain.recordFeedback('q', 'sf-2', 'accepted');
    runtime.brainIntelligence.computeStrengths();

    const d1 = runtime.brainIntelligence.getStrengths({ domain: 'd1' });
    expect(d1.length).toBe(1);
    expect(d1[0].domain).toBe('d1');
  });

  // ─── Recommendations ──────────────────────────────────────────

  it('should recommend patterns', () => {
    runtime.vault.seed([
      {
        id: 'r-1',
        type: 'pattern',
        domain: 'testing',
        title: 'Test pattern',
        severity: 'warning',
        description: 'D',
        tags: [],
      },
    ]);
    // Need enough feedback to reach minStrength threshold of 30
    for (let i = 0; i < 10; i++) {
      runtime.brain.recordFeedback(`q${i}`, 'r-1', 'accepted');
    }
    runtime.brainIntelligence.computeStrengths();

    const recommendations = runtime.brainIntelligence.recommend({ domain: 'testing' });
    expect(recommendations.length).toBeGreaterThan(0);
  });

  it('should boost recommendations by task context', () => {
    runtime.vault.seed([
      {
        id: 'rb-1',
        type: 'pattern',
        domain: 'd',
        title: 'Database migration pattern',
        severity: 'warning',
        description: 'D',
        tags: [],
      },
      {
        id: 'rb-2',
        type: 'pattern',
        domain: 'd',
        title: 'API endpoint pattern',
        severity: 'warning',
        description: 'D',
        tags: [],
      },
    ]);
    for (let i = 0; i < 10; i++) {
      runtime.brain.recordFeedback(`q${i}`, 'rb-1', 'accepted');
      runtime.brain.recordFeedback(`q${i}`, 'rb-2', 'accepted');
    }
    runtime.brainIntelligence.computeStrengths();

    const recs = runtime.brainIntelligence.recommend({ task: 'database migration' });
    if (recs.length >= 2) {
      // Database pattern should be boosted
      expect(recs[0].pattern).toContain('Database');
    }
  });

  // ─── Knowledge Extraction ─────────────────────────────────────

  it('should extract knowledge from session with repeated tools', () => {
    runtime.brainIntelligence.lifecycle({
      action: 'start',
      sessionId: 'extract-1',
      toolsUsed: ['search', 'search', 'search', 'edit'],
    });
    runtime.brainIntelligence.lifecycle({
      action: 'end',
      sessionId: 'extract-1',
    });

    const result = runtime.brainIntelligence.extractKnowledge('extract-1');
    expect(result.sessionId).toBe('extract-1');
    expect(result.rulesApplied).toContain('repeated_tool_usage');
    expect(result.proposals.length).toBeGreaterThan(0);
    expect(result.proposals[0].rule).toBe('repeated_tool_usage');
  });

  it('should extract multi-file edit pattern', () => {
    runtime.brainIntelligence.lifecycle({
      action: 'start',
      sessionId: 'extract-2',
      filesModified: ['a.ts', 'b.ts', 'c.ts'],
    });
    runtime.brainIntelligence.lifecycle({
      action: 'end',
      sessionId: 'extract-2',
    });

    const result = runtime.brainIntelligence.extractKnowledge('extract-2');
    expect(result.rulesApplied).toContain('multi_file_edit');
  });

  it('should extract plan completed workflow', () => {
    runtime.brainIntelligence.lifecycle({
      action: 'start',
      sessionId: 'extract-3',
      planId: 'plan-1',
    });
    runtime.brainIntelligence.lifecycle({
      action: 'end',
      sessionId: 'extract-3',
      planOutcome: 'completed',
    });

    const result = runtime.brainIntelligence.extractKnowledge('extract-3');
    expect(result.rulesApplied).toContain('plan_completed');
  });

  it('should extract plan abandoned anti-pattern', () => {
    runtime.brainIntelligence.lifecycle({
      action: 'start',
      sessionId: 'extract-4',
      planId: 'plan-2',
    });
    runtime.brainIntelligence.lifecycle({
      action: 'end',
      sessionId: 'extract-4',
      planOutcome: 'abandoned',
    });

    const result = runtime.brainIntelligence.extractKnowledge('extract-4');
    expect(result.rulesApplied).toContain('plan_abandoned');
  });

  it('should throw for non-existent session', () => {
    expect(() => {
      runtime.brainIntelligence.extractKnowledge('non-existent');
    }).toThrow('Session not found');
  });

  // ─── Proposals ─────────────────────────────────────────────────

  it('should list proposals', () => {
    // Use plan_completed (confidence 0.65) — below auto-promote threshold (0.8)
    runtime.brainIntelligence.lifecycle({
      action: 'start',
      sessionId: 'prop-1',
      planId: 'plan-list-1',
    });
    runtime.brainIntelligence.lifecycle({
      action: 'end',
      sessionId: 'prop-1',
      planId: 'plan-list-1',
      planOutcome: 'completed',
    });

    const proposals = runtime.brainIntelligence.getProposals();
    expect(proposals.length).toBeGreaterThan(0);
    // plan_completed confidence is 0.65 — below auto-promote threshold
    const planProposals = proposals.filter((p) => p.rule === 'plan_completed');
    expect(planProposals.length).toBeGreaterThan(0);
    expect(planProposals[0].promoted).toBe(false);
  });

  it('should filter proposals by session', () => {
    runtime.brainIntelligence.lifecycle({
      action: 'start',
      sessionId: 'prop-s1',
      toolsUsed: ['x', 'x', 'x'],
    });
    runtime.brainIntelligence.lifecycle({ action: 'end', sessionId: 'prop-s1' });
    runtime.brainIntelligence.extractKnowledge('prop-s1');

    runtime.brainIntelligence.lifecycle({
      action: 'start',
      sessionId: 'prop-s2',
      toolsUsed: ['y', 'y', 'y'],
    });
    runtime.brainIntelligence.lifecycle({ action: 'end', sessionId: 'prop-s2' });
    runtime.brainIntelligence.extractKnowledge('prop-s2');

    const s1 = runtime.brainIntelligence.getProposals({ sessionId: 'prop-s1' });
    const s2 = runtime.brainIntelligence.getProposals({ sessionId: 'prop-s2' });
    expect(s1.every((p) => p.sessionId === 'prop-s1')).toBe(true);
    expect(s2.every((p) => p.sessionId === 'prop-s2')).toBe(true);
  });

  it('should promote proposals to vault', () => {
    // Use plan_completed (confidence 0.65) to avoid auto-promote (threshold 0.8)
    runtime.brainIntelligence.lifecycle({
      action: 'start',
      sessionId: 'promo-1',
      planId: 'plan-promo-1',
    });
    runtime.brainIntelligence.lifecycle({
      action: 'end',
      sessionId: 'promo-1',
      planId: 'plan-promo-1',
      planOutcome: 'completed',
    });

    const proposals = runtime.brainIntelligence.getProposals({
      sessionId: 'promo-1',
      promoted: false,
    });
    expect(proposals.length).toBeGreaterThan(0);

    const result = runtime.brainIntelligence.promoteProposals([proposals[0].id]);
    expect(result.promoted).toBe(1);
    expect(result.failed).toEqual([]);

    // Check vault has the entry
    const entry = runtime.vault.get(`proposal-${proposals[0].id}`);
    expect(entry).not.toBeNull();
    expect(entry!.domain).toBe('brain-intelligence');
  });

  it('should handle promoting non-existent proposal', () => {
    const result = runtime.brainIntelligence.promoteProposals(['non-existent']);
    expect(result.promoted).toBe(0);
    expect(result.failed).toContain('non-existent');
  });

  it('should gate promote through governance when strict preset', () => {
    // Use plan_completed (confidence 0.65) to avoid auto-promote (threshold 0.8)
    runtime.brainIntelligence.lifecycle({
      action: 'start',
      sessionId: 'gov-promo-1',
      planId: 'plan-gov-1',
    });
    runtime.brainIntelligence.lifecycle({
      action: 'end',
      sessionId: 'gov-promo-1',
      planId: 'plan-gov-1',
      planOutcome: 'completed',
    });

    const proposals = runtime.brainIntelligence.getProposals({
      sessionId: 'gov-promo-1',
      promoted: false,
    });
    expect(proposals.length).toBeGreaterThan(0);

    // Apply strict preset — requireReview: true
    runtime.governance.applyPreset('.', 'strict', 'test');

    const result = runtime.brainIntelligence.promoteProposals(
      [proposals[0].id],
      runtime.governance,
      '.',
    );

    // Should be gated, not promoted
    expect(result.promoted).toBe(0);
    expect(result.gated.length).toBe(1);
    expect(result.gated[0].action).toBe('propose');

    // Entry should NOT be in vault
    expect(runtime.vault.get(`proposal-${proposals[0].id}`)).toBeNull();

    // But should be in governance proposals
    const pending = runtime.governance.listPendingProposals('.');
    expect(pending.some((p) => p.source === 'brain-promote')).toBe(true);
  });

  // ─── Build Intelligence ────────────────────────────────────────

  it('should build intelligence pipeline', () => {
    runtime.vault.seed([
      {
        id: 'bi-1',
        type: 'pattern',
        domain: 'd1',
        title: 'Pattern A',
        severity: 'warning',
        description: 'D',
        tags: [],
      },
    ]);
    runtime.brain.recordFeedback('q', 'bi-1', 'accepted');

    const result = runtime.brainIntelligence.buildIntelligence();
    expect(result.strengthsComputed).toBe(1);
    expect(result.globalPatterns).toBe(1);
    expect(result.domainProfiles).toBe(1);
  });

  it('should build with empty data', () => {
    const result = runtime.brainIntelligence.buildIntelligence();
    expect(result.strengthsComputed).toBe(0);
    expect(result.globalPatterns).toBe(0);
    expect(result.domainProfiles).toBe(0);
  });

  // ─── Global Patterns ──────────────────────────────────────────

  it('should return global patterns after build', () => {
    runtime.vault.seed([
      {
        id: 'gp-1',
        type: 'pattern',
        domain: 'd1',
        title: 'Cross Pattern',
        severity: 'warning',
        description: 'D',
        tags: [],
      },
    ]);
    runtime.brain.recordFeedback('q', 'gp-1', 'accepted');
    runtime.brainIntelligence.buildIntelligence();

    const patterns = runtime.brainIntelligence.getGlobalPatterns();
    expect(patterns.length).toBe(1);
    expect(patterns[0].pattern).toBe('Cross Pattern');
    expect(patterns[0].domains).toContain('d1');
  });

  // ─── Domain Profiles ──────────────────────────────────────────

  it('should return domain profile after build', () => {
    runtime.vault.seed([
      {
        id: 'dp-1',
        type: 'pattern',
        domain: 'security',
        title: 'Security Pattern',
        severity: 'warning',
        description: 'D',
        tags: [],
      },
    ]);
    runtime.brain.recordFeedback('q', 'dp-1', 'accepted');
    runtime.brainIntelligence.buildIntelligence();

    const profile = runtime.brainIntelligence.getDomainProfile('security');
    expect(profile).not.toBeNull();
    expect(profile!.domain).toBe('security');
    expect(profile!.topPatterns.length).toBe(1);
  });

  it('should return null for unknown domain', () => {
    const profile = runtime.brainIntelligence.getDomainProfile('nonexistent');
    expect(profile).toBeNull();
  });

  // ─── Export / Import ──────────────────────────────────────────

  it('should export all data', () => {
    runtime.brainIntelligence.lifecycle({
      action: 'start',
      sessionId: 'exp-1',
      domain: 'testing',
    });
    runtime.brainIntelligence.lifecycle({
      action: 'end',
      sessionId: 'exp-1',
    });

    const data = runtime.brainIntelligence.exportData();
    expect(data.sessions.length).toBe(1);
    expect(data.exportedAt).toBeDefined();
  });

  it('should import data', () => {
    const data: BrainExportData = {
      strengths: [
        {
          pattern: 'Imported Pattern',
          domain: 'testing',
          strength: 75,
          usageScore: 20,
          spreadScore: 15,
          successScore: 20,
          recencyScore: 20,
          usageCount: 8,
          uniqueContexts: 3,
          successRate: 0.8,
          lastUsed: new Date().toISOString(),
        },
      ],
      sessions: [
        {
          id: 'imp-s1',
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
          domain: 'testing',
          context: 'import test',
          toolsUsed: ['search'],
          filesModified: [],
          planId: null,
          planOutcome: null,
          extractedAt: null,
        },
      ],
      proposals: [],
      globalPatterns: [
        {
          pattern: 'Imported Global',
          domains: ['testing'],
          totalStrength: 75,
          avgStrength: 75,
          domainCount: 1,
        },
      ],
      domainProfiles: [
        {
          domain: 'testing',
          topPatterns: [{ pattern: 'Imported', strength: 75 }],
          sessionCount: 1,
          avgSessionDuration: 5,
          lastActivity: new Date().toISOString(),
        },
      ],
      exportedAt: new Date().toISOString(),
    };

    const result = runtime.brainIntelligence.importData(data);
    expect(result.imported.strengths).toBe(1);
    expect(result.imported.sessions).toBe(1);
    expect(result.imported.globalPatterns).toBe(1);
    expect(result.imported.domainProfiles).toBe(1);

    // Verify imported data is accessible
    const strengths = runtime.brainIntelligence.getStrengths();
    expect(strengths.length).toBe(1);
    expect(strengths[0].pattern).toBe('Imported Pattern');
  });

  it('should handle duplicate session import gracefully', () => {
    runtime.brainIntelligence.lifecycle({ action: 'start', sessionId: 'dup-1' });

    const data: BrainExportData = {
      strengths: [],
      sessions: [
        {
          id: 'dup-1',
          startedAt: new Date().toISOString(),
          endedAt: null,
          domain: null,
          context: null,
          toolsUsed: [],
          filesModified: [],
          planId: null,
          planOutcome: null,
          extractedAt: null,
        },
      ],
      proposals: [],
      globalPatterns: [],
      domainProfiles: [],
      exportedAt: new Date().toISOString(),
    };

    const result = runtime.brainIntelligence.importData(data);
    expect(result.imported.sessions).toBe(0); // Duplicate ignored
  });

  // ─── Auto-extraction on session end ─────────────────────────

  it('should auto-extract when session ends with tools used', () => {
    runtime.brainIntelligence.lifecycle({
      action: 'start',
      sessionId: 'auto-1',
      domain: 'testing',
      toolsUsed: ['search', 'search', 'search'],
    });
    const session = runtime.brainIntelligence.lifecycle({
      action: 'end',
      sessionId: 'auto-1',
    });
    // extractedAt should be set automatically
    expect(session.extractedAt).not.toBeNull();
  });

  it('should not auto-extract when session has no signal', () => {
    runtime.brainIntelligence.lifecycle({
      action: 'start',
      sessionId: 'auto-2',
    });
    const session = runtime.brainIntelligence.lifecycle({
      action: 'end',
      sessionId: 'auto-2',
    });
    // No tools, no files, no plan — should not extract
    expect(session.extractedAt).toBeNull();
  });

  it('should auto-extract when session has a plan', () => {
    runtime.brainIntelligence.lifecycle({
      action: 'start',
      sessionId: 'auto-3',
      planId: 'plan-123',
    });
    const session = runtime.brainIntelligence.lifecycle({
      action: 'end',
      sessionId: 'auto-3',
      planOutcome: 'completed',
    });
    expect(session.extractedAt).not.toBeNull();
  });

  // ─── extractedAt Tracking ──────────────────────────────────

  it('should set extractedAt when extractKnowledge is called manually', () => {
    // Use a session with no tools/files/plan so auto-extraction doesn't fire
    runtime.brainIntelligence.lifecycle({
      action: 'start',
      sessionId: 'ext-1',
      domain: 'testing',
    });
    runtime.brainIntelligence.lifecycle({
      action: 'end',
      sessionId: 'ext-1',
    });

    // Before manual extraction, extractedAt should be null (no auto-extract — no signal)
    const ctx = runtime.brainIntelligence.getSessionContext(10);
    const before = ctx.recentSessions.find((s) => s.id === 'ext-1');
    expect(before?.extractedAt).toBeNull();

    // Manual extract
    runtime.brainIntelligence.extractKnowledge('ext-1');

    // After extraction, extractedAt should be set
    const ctx2 = runtime.brainIntelligence.getSessionContext(10);
    const after = ctx2.recentSessions.find((s) => s.id === 'ext-1');
    expect(after?.extractedAt).not.toBeNull();
  });

  // ─── resetExtracted ────────────────────────────────────────

  it('should reset extractedAt for a specific session', () => {
    runtime.brainIntelligence.lifecycle({
      action: 'start',
      sessionId: 'reset-1',
      toolsUsed: ['a', 'a', 'a'],
    });
    runtime.brainIntelligence.lifecycle({ action: 'end', sessionId: 'reset-1' });
    runtime.brainIntelligence.extractKnowledge('reset-1');

    const result = runtime.brainIntelligence.resetExtracted({ sessionId: 'reset-1' });
    expect(result.reset).toBe(1);

    const ctx = runtime.brainIntelligence.getSessionContext(10);
    const session = ctx.recentSessions.find((s) => s.id === 'reset-1');
    expect(session?.extractedAt).toBeNull();
  });

  it('should reset all extracted sessions', () => {
    runtime.brainIntelligence.lifecycle({
      action: 'start',
      sessionId: 'reset-a',
      toolsUsed: ['a', 'a', 'a'],
    });
    runtime.brainIntelligence.lifecycle({ action: 'end', sessionId: 'reset-a' });
    runtime.brainIntelligence.extractKnowledge('reset-a');

    runtime.brainIntelligence.lifecycle({
      action: 'start',
      sessionId: 'reset-b',
      toolsUsed: ['b', 'b', 'b'],
    });
    runtime.brainIntelligence.lifecycle({ action: 'end', sessionId: 'reset-b' });
    runtime.brainIntelligence.extractKnowledge('reset-b');

    const result = runtime.brainIntelligence.resetExtracted({ all: true });
    expect(result.reset).toBe(2);
  });

  it('should return 0 when nothing to reset', () => {
    const result = runtime.brainIntelligence.resetExtracted({ all: true });
    expect(result.reset).toBe(0);
  });

  it('should return 0 when no filter is provided', () => {
    const result = runtime.brainIntelligence.resetExtracted();
    expect(result.reset).toBe(0);
  });

  it('should allow re-extraction after reset', () => {
    runtime.brainIntelligence.lifecycle({
      action: 'start',
      sessionId: 'reext-1',
      toolsUsed: ['search', 'search', 'search'],
    });
    runtime.brainIntelligence.lifecycle({ action: 'end', sessionId: 'reext-1' });

    const first = runtime.brainIntelligence.extractKnowledge('reext-1');
    expect(first.proposals.length).toBeGreaterThan(0);

    runtime.brainIntelligence.resetExtracted({ sessionId: 'reext-1' });

    const second = runtime.brainIntelligence.extractKnowledge('reext-1');
    expect(second.proposals.length).toBeGreaterThan(0);
  });

  // ─── Dedup guard in createProposal ──────────────────────────

  it('should not create duplicate proposals for the same rule + sessionId', () => {
    runtime.brainIntelligence.lifecycle({
      action: 'start',
      sessionId: 'dedup-1',
      toolsUsed: ['search', 'search', 'search'],
    });
    runtime.brainIntelligence.lifecycle({ action: 'end', sessionId: 'dedup-1' });

    // First extraction creates proposals
    const first = runtime.brainIntelligence.extractKnowledge('dedup-1');
    expect(first.proposals.length).toBeGreaterThan(0);
    const firstProposalCount = first.proposals.length;

    // Reset extracted_at so we can re-extract the same session
    runtime.brainIntelligence.resetExtracted({ sessionId: 'dedup-1' });

    // Second extraction should return the same proposals (dedup guard)
    const second = runtime.brainIntelligence.extractKnowledge('dedup-1');
    expect(second.proposals.length).toBe(firstProposalCount);

    // Proposal IDs should be identical (returned existing, not created new)
    expect(second.proposals[0].id).toBe(first.proposals[0].id);

    // Total proposals in the system should not have doubled
    const stats = runtime.brainIntelligence.getStats();
    expect(stats.proposals).toBe(firstProposalCount);
  });

  // ─── computeStrengths with modified feedback ───────────────

  it('should weight modified feedback at 0.5 in computeStrengths', () => {
    // Seed an entry for feedback to reference
    runtime.vault.seed([
      {
        id: 'str-1',
        type: 'pattern',
        domain: 'testing',
        title: 'Strength test pattern',
        severity: 'warning',
        description: 'Testing strength computation with modified feedback.',
        tags: ['test'],
      },
    ]);

    // Record feedback: 1 accepted, 1 modified, 1 failed
    runtime.brain.recordFeedback({ query: 'q1', entryId: 'str-1', action: 'accepted' });
    runtime.brain.recordFeedback({ query: 'q2', entryId: 'str-1', action: 'modified' });
    runtime.brain.recordFeedback({ query: 'q3', entryId: 'str-1', action: 'failed' });

    const strengths = runtime.brainIntelligence.computeStrengths();
    const s = strengths.find((p) => p.pattern === 'Strength test pattern');
    expect(s).toBeDefined();

    // successRate = (1 + 0.5) / (3 - 1) = 1.5/2 = 0.75
    expect(s!.successRate).toBeCloseTo(0.75, 2);
  });
});
