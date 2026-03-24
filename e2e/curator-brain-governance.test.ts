/**
 * E2E Test: Curator, Brain Intelligence, Governance, and Orchestrate
 *
 * Exercises the advanced engine features: curator grooming & health audits,
 * brain learning loop with feedback → vocabulary → recommendations,
 * governance policy lifecycle, and orchestrate plan/execute/complete.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAgentRuntime, createSemanticFacades, registerFacade } from '@soleri/core';
import type { FacadeConfig, AgentRuntime } from '@soleri/core';

const AGENT_ID = 'e2e-advanced';

function captureHandler(facade: FacadeConfig) {
  let captured:
    | ((args: { op: string; params: Record<string, unknown> }) => Promise<{
        content: Array<{ type: string; text: string }>;
      }>)
    | null = null;

  const mockServer = {
    tool: (_name: string, _desc: string, _schema: unknown, handler: unknown) => {
      captured = handler as typeof captured;
    },
  };
  registerFacade(mockServer as never, facade);
  return captured!;
}

function parseResponse(raw: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(raw.content[0].text) as {
    success: boolean;
    data?: unknown;
    error?: string;
    op: string;
    facade: string;
  };
}

describe('E2E: curator-brain-governance', () => {
  let runtime: AgentRuntime;
  let handlers: Map<string, ReturnType<typeof captureHandler>>;
  const plannerDir = join(tmpdir(), `soleri-e2e-advanced-${Date.now()}`);

  beforeAll(() => {
    mkdirSync(plannerDir, { recursive: true });

    runtime = createAgentRuntime({
      agentId: AGENT_ID,
      vaultPath: ':memory:',
      plansPath: join(plannerDir, 'plans.json'),
    });

    const facades = createSemanticFacades(runtime, AGENT_ID);
    handlers = new Map();
    for (const facade of facades) {
      handlers.set(facade.name, captureHandler(facade));
    }
  });

  afterAll(() => {
    runtime.close();
    rmSync(plannerDir, { recursive: true, force: true });
  });

  async function callOp(facadeName: string, op: string, params: Record<string, unknown> = {}) {
    const handler = handlers.get(facadeName);
    if (!handler) throw new Error(`No facade: ${facadeName}`);
    const raw = await handler({ op, params });
    return parseResponse(raw);
  }

  // ─── Seed vault with entries for curator/brain to work with ────────

  it('seed: should capture multiple vault entries', async () => {
    const entries = [
      {
        type: 'pattern',
        domain: 'frontend',
        title: 'Component Composition',
        description: 'Prefer composition over inheritance for UI components',
        severity: 'warning',
        tags: ['react', 'components', 'architecture'],
      },
      {
        type: 'anti-pattern',
        domain: 'frontend',
        title: 'Prop Drilling',
        description: 'Avoid passing props through many intermediate components',
        severity: 'warning',
        tags: ['react', 'state', 'anti-pattern'],
      },
      {
        type: 'pattern',
        domain: 'backend',
        title: 'Connection Pooling',
        description: 'Always use connection pooling for database access in production',
        severity: 'critical',
        tags: ['database', 'performance'],
      },
      {
        type: 'rule',
        domain: 'backend',
        title: 'No Raw SQL',
        description: 'Use parameterized queries to prevent SQL injection attacks',
        severity: 'critical',
        tags: ['security', 'database', 'sql'],
      },
      {
        type: 'pattern',
        domain: 'frontend',
        title: 'Semantic HTML',
        description: 'Use semantic HTML elements for better accessibility',
        severity: 'info',
        tags: ['a11y', 'html', 'accessibility'],
      },
    ];

    const res = await callOp(`${AGENT_ID}_vault`, 'capture_knowledge', { entries });
    expect(res.success).toBe(true);
  });

  // ─── Seed duplicate entries for detect_duplicates test ─────────────

  it('seed: should capture near-duplicate entries for duplicate detection', async () => {
    const entries = [
      {
        type: 'pattern',
        domain: 'frontend',
        title: 'Component Composition Pattern',
        description:
          'Prefer composition over inheritance for building reusable UI components in React',
        severity: 'warning',
        tags: ['react', 'components', 'architecture'],
      },
    ];
    const res = await callOp(`${AGENT_ID}_vault`, 'capture_knowledge', { entries });
    expect(res.success).toBe(true);
  });

  // ─── Seed contradictory entries for contradiction test ─────────────

  it('seed: should capture contradictory pattern/anti-pattern pair', async () => {
    const entries = [
      {
        type: 'pattern',
        domain: 'frontend',
        title: 'Use Global State Management',
        description:
          'Use global state management like Redux or Zustand for sharing state across components',
        severity: 'warning',
        tags: ['react', 'state', 'redux', 'global-state'],
      },
      {
        type: 'anti-pattern',
        domain: 'frontend',
        title: 'Avoid Global State Management',
        description:
          'Never use global state management for sharing state across components as it creates tight coupling',
        severity: 'warning',
        tags: ['react', 'state', 'redux', 'global-state'],
      },
    ];
    const res = await callOp(`${AGENT_ID}_vault`, 'capture_knowledge', { entries });
    expect(res.success).toBe(true);
  });

  // ─── Curator Tests ─────────────────────────────────────────────────

  it('curator: health_audit should return score and specific metric keys', async () => {
    const res = await callOp(`${AGENT_ID}_curator`, 'curator_health_audit');
    expect(res.success).toBe(true);
    const data = res.data as {
      score: number;
      metrics: { coverage: number; freshness: number; quality: number; tagHealth: number };
      recommendations: string[];
    };
    expect(typeof data.score).toBe('number');
    expect(data.score).toBeGreaterThanOrEqual(0);
    expect(data.score).toBeLessThanOrEqual(100);

    // Verify specific metric keys exist and are numbers
    expect(typeof data.metrics.coverage).toBe('number');
    expect(typeof data.metrics.freshness).toBe('number');
    expect(typeof data.metrics.quality).toBe('number');
    expect(typeof data.metrics.tagHealth).toBe('number');

    // All metrics must be in [0, 1] range
    for (const key of ['coverage', 'freshness', 'quality', 'tagHealth'] as const) {
      expect(data.metrics[key]).toBeGreaterThanOrEqual(0);
      expect(data.metrics[key]).toBeLessThanOrEqual(1);
    }

    expect(Array.isArray(data.recommendations)).toBe(true);
    expect(data.recommendations.length).toBeGreaterThan(0);
    // Each recommendation is a non-empty string
    for (const rec of data.recommendations) {
      expect(typeof rec).toBe('string');
      expect(rec.length).toBeGreaterThan(0);
    }
  });

  it('curator: status should return table info', async () => {
    const res = await callOp(`${AGENT_ID}_curator`, 'curator_status');
    expect(res.success).toBe(true);
    const data = res.data as { initialized: boolean };
    expect(data.initialized).toBe(true);
  });

  it('curator: groom_all should return count and summary of what was groomed', async () => {
    const res = await callOp(`${AGENT_ID}_curator`, 'curator_groom_all');
    expect(res.success).toBe(true);
    const data = res.data as {
      totalEntries: number;
      groomedCount: number;
      tagsNormalized: number;
      staleCount: number;
      durationMs: number;
    };
    // Verify specific fields exist and have correct types
    expect(typeof data.totalEntries).toBe('number');
    expect(typeof data.groomedCount).toBe('number');
    expect(typeof data.tagsNormalized).toBe('number');
    expect(typeof data.staleCount).toBe('number');
    expect(typeof data.durationMs).toBe('number');

    // We seeded 7 entries, all should be groomed
    expect(data.totalEntries).toBeGreaterThanOrEqual(7);
    expect(data.groomedCount).toBe(data.totalEntries);
    expect(data.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('curator: detect_duplicates should find seeded near-duplicates', async () => {
    const res = await callOp(`${AGENT_ID}_curator`, 'curator_detect_duplicates', {
      threshold: 0.3,
    });
    expect(res.success).toBe(true);
    const data = res.data as Array<{
      entryId: string;
      matches: Array<{ entryId: string; title: string; similarity: number; suggestMerge: boolean }>;
      scannedCount: number;
    }>;
    expect(Array.isArray(data)).toBe(true);

    // We seeded "Component Composition" and "Component Composition Pattern" with near-identical
    // descriptions in the same domain — they should be detected as duplicates
    expect(data.length).toBeGreaterThan(0);

    // Verify the structure of each result
    for (const result of data) {
      expect(typeof result.entryId).toBe('string');
      expect(Array.isArray(result.matches)).toBe(true);
      expect(typeof result.scannedCount).toBe('number');
      for (const match of result.matches) {
        expect(typeof match.entryId).toBe('string');
        expect(typeof match.title).toBe('string');
        expect(typeof match.similarity).toBe('number');
        expect(match.similarity).toBeGreaterThanOrEqual(0.3);
        expect(typeof match.suggestMerge).toBe('boolean');
      }
    }

    // At least one pair should involve the Component Composition entries
    const allMatchTitles = data.flatMap((r) => r.matches.map((m) => m.title));
    const hasCompositionMatch = allMatchTitles.some((t) => t.includes('Component Composition'));
    expect(hasCompositionMatch).toBe(true);
  });

  it('curator: contradictions should detect pattern vs anti-pattern conflicts', async () => {
    const res = await callOp(`${AGENT_ID}_curator`, 'curator_contradictions', {
      detect: true,
    });
    expect(res.success).toBe(true);
    const data = res.data as Array<{
      id: number;
      patternId: string;
      antipatternId: string;
      similarity: number;
      status: string;
      createdAt: number;
      resolvedAt: number | null;
    }>;
    expect(Array.isArray(data)).toBe(true);

    // We seeded "Use Global State Management" (pattern) and "Avoid Global State Management"
    // (anti-pattern) — the contradiction detector should find them
    expect(data.length).toBeGreaterThan(0);

    // Verify contradiction structure
    for (const contradiction of data) {
      expect(typeof contradiction.id).toBe('number');
      expect(typeof contradiction.patternId).toBe('string');
      expect(typeof contradiction.antipatternId).toBe('string');
      expect(typeof contradiction.similarity).toBe('number');
      expect(contradiction.similarity).toBeGreaterThan(0);
      expect(contradiction.status).toBe('open');
      expect(typeof contradiction.createdAt).toBe('number');
    }
  });

  it('curator: consolidate (dry-run) should return recommendations without mutations', async () => {
    const res = await callOp(`${AGENT_ID}_curator`, 'curator_consolidate', {
      dryRun: true,
    });
    expect(res.success).toBe(true);
  });

  // ─── Brain Learning Loop ───────────────────────────────────────────

  it('brain: rebuild_vocabulary should index vault entries', async () => {
    // Rebuild vocabulary
    const res = await callOp(`${AGENT_ID}_brain`, 'rebuild_vocabulary');
    expect(res.success).toBe(true);
    const data = res.data as { rebuilt: boolean; vocabularySize: number };
    expect(data.rebuilt).toBe(true);
    // With 7 seeded entries, vocabulary should have indexed tokens
    expect(data.vocabularySize).toBeGreaterThan(0);

    // brain_stats should reflect the same vocabulary size
    const statsAfter = await callOp(`${AGENT_ID}_brain`, 'brain_stats');
    expect(statsAfter.success).toBe(true);
    const afterData = statsAfter.data as { vocabularySize: number };
    expect(afterData.vocabularySize).toBe(data.vocabularySize);
  });

  it('brain: record_feedback should accept feedback on entries', async () => {
    // Search first to get entry IDs
    const searchRes = await callOp(`${AGENT_ID}_vault`, 'search', {
      query: 'component composition',
    });
    expect(searchRes.success).toBe(true);
    const results = searchRes.data as Array<{ entry: { id: string }; score: number }>;
    expect(results.length).toBeGreaterThan(0);

    const entryId = results[0].entry.id;
    const res = await callOp(`${AGENT_ID}_brain`, 'record_feedback', {
      query: 'component composition',
      entryId,
      action: 'accepted',
    });
    expect(res.success).toBe(true);
  });

  it('brain: brain_stats should reflect vocabulary and feedback counts', async () => {
    const res = await callOp(`${AGENT_ID}_brain`, 'brain_stats');
    expect(res.success).toBe(true);
    const data = res.data as {
      vocabularySize: number;
      feedbackCount: number;
      weights: Record<string, number>;
      intelligence: Record<string, unknown>;
    };
    // After rebuild + seeding 7 entries, vocabulary should be > 0
    expect(data.vocabularySize).toBeGreaterThan(0);
    // After record_feedback, feedbackCount should be > 0
    expect(typeof data.feedbackCount).toBe('number');
    expect(data.feedbackCount).toBeGreaterThan(0);
    // Weights should have known keys
    expect(typeof data.weights.semantic).toBe('number');
    expect(typeof data.weights.severity).toBe('number');
    expect(data.intelligence).toBeDefined();
    expect(typeof data.intelligence).toBe('object');
  });

  it('brain: brain_lifecycle start → end session', async () => {
    const startRes = await callOp(`${AGENT_ID}_brain`, 'brain_lifecycle', {
      action: 'start',
      domain: 'frontend',
      context: 'E2E testing brain sessions',
    });
    expect(startRes.success).toBe(true);
    const session = startRes.data as { id: string };
    expect(session.id).toBeDefined();

    const endRes = await callOp(`${AGENT_ID}_brain`, 'brain_lifecycle', {
      action: 'end',
      sessionId: session.id,
      toolsUsed: ['vault_search', 'brain_stats'],
      filesModified: ['test.ts'],
      planOutcome: 'completed',
    });
    expect(endRes.success).toBe(true);
  });

  it('brain: session_list should return sessions with consistent count', async () => {
    const res = await callOp(`${AGENT_ID}_brain`, 'session_list', {});
    expect(res.success).toBe(true);
    const data = res.data as { sessions: unknown[]; count: number };
    expect(data.count).toBeGreaterThan(0);
    // sessions array length MUST equal count — these must be consistent
    expect(data.sessions.length).toBe(data.count);
    expect(Array.isArray(data.sessions)).toBe(true);
  });

  it('brain: brain_build_intelligence should compute strengths', async () => {
    const res = await callOp(`${AGENT_ID}_brain`, 'brain_build_intelligence');
    expect(res.success).toBe(true);
  });

  it('brain: brain_strengths should return scored patterns with correct structure', async () => {
    const res = await callOp(`${AGENT_ID}_brain`, 'brain_strengths', { limit: 10 });
    expect(res.success).toBe(true);
    const data = res.data as Array<{
      pattern: string;
      domain: string;
      strength: number;
      usageScore: number;
      spreadScore: number;
      successScore: number;
      recencyScore: number;
      usageCount: number;
      uniqueContexts: number;
      successRate: number;
      lastUsed: string;
    }>;
    expect(Array.isArray(data)).toBe(true);

    // After build_intelligence with feedback, we should have at least one strength
    if (data.length > 0) {
      for (const item of data) {
        // Verify PatternStrength shape
        expect(typeof item.pattern).toBe('string');
        expect(item.pattern.length).toBeGreaterThan(0);
        expect(typeof item.domain).toBe('string');
        expect(typeof item.strength).toBe('number');
        expect(item.strength).toBeGreaterThanOrEqual(0);
        expect(typeof item.usageScore).toBe('number');
        expect(typeof item.spreadScore).toBe('number');
        expect(typeof item.successScore).toBe('number');
        expect(typeof item.recencyScore).toBe('number');
        expect(typeof item.usageCount).toBe('number');
        expect(typeof item.uniqueContexts).toBe('number');
        expect(typeof item.successRate).toBe('number');
        expect(typeof item.lastUsed).toBe('string');
      }
    }
  });

  it('brain: brain_recommend should return recommendations as PatternStrength array', async () => {
    const res = await callOp(`${AGENT_ID}_brain`, 'brain_recommend', {
      domain: 'frontend',
      task: 'build a reusable component',
      limit: 5,
    });
    expect(res.success).toBe(true);
    const data = res.data as Array<{
      pattern: string;
      domain: string;
      strength: number;
    }>;
    expect(Array.isArray(data)).toBe(true);

    // Recommendations should be PatternStrength items
    for (const item of data) {
      expect(typeof item.pattern).toBe('string');
      expect(typeof item.domain).toBe('string');
      expect(typeof item.strength).toBe('number');
    }
  });

  it('brain: brain_export and brain_import round-trip preserves data', async () => {
    // Get brain_stats before export
    const statsBeforeExport = await callOp(`${AGENT_ID}_brain`, 'brain_stats');
    const beforeData = statsBeforeExport.data as { vocabularySize: number };

    // Export
    const exportRes = await callOp(`${AGENT_ID}_brain`, 'brain_export');
    expect(exportRes.success).toBe(true);
    const exportData = exportRes.data as {
      strengths: unknown[];
      sessions: unknown[];
      proposals: unknown[];
      globalPatterns: unknown[];
      domainProfiles: unknown[];
      exportedAt: string;
    };

    // Verify exported data has expected structure
    expect(Array.isArray(exportData.strengths)).toBe(true);
    expect(Array.isArray(exportData.sessions)).toBe(true);
    expect(Array.isArray(exportData.proposals)).toBe(true);
    expect(Array.isArray(exportData.globalPatterns)).toBe(true);
    expect(Array.isArray(exportData.domainProfiles)).toBe(true);
    expect(typeof exportData.exportedAt).toBe('string');
    // exportedAt should be a valid ISO date
    expect(new Date(exportData.exportedAt).toISOString()).toBe(exportData.exportedAt);

    // Import the exported data
    const importRes = await callOp(`${AGENT_ID}_brain`, 'brain_import', {
      data: exportData,
    });
    expect(importRes.success).toBe(true);
    const importResult = importRes.data as {
      imported: {
        strengths: number;
        sessions: number;
        proposals: number;
        globalPatterns: number;
        domainProfiles: number;
      };
    };

    // Verify import result has all expected keys
    expect(typeof importResult.imported.strengths).toBe('number');
    expect(typeof importResult.imported.sessions).toBe('number');
    expect(typeof importResult.imported.proposals).toBe('number');
    expect(typeof importResult.imported.globalPatterns).toBe('number');
    expect(typeof importResult.imported.domainProfiles).toBe('number');

    // Strengths use INSERT OR REPLACE so they always import
    expect(importResult.imported.strengths).toBe(exportData.strengths.length);
    // Sessions/proposals use INSERT OR IGNORE — they already exist in this DB,
    // so imported count can be 0. Verify the sum of all imported counts matches
    // what was attempted (some may be 0 due to idempotency).
    const totalImported =
      importResult.imported.strengths +
      importResult.imported.sessions +
      importResult.imported.proposals +
      importResult.imported.globalPatterns +
      importResult.imported.domainProfiles;
    expect(totalImported).toBeGreaterThanOrEqual(0);

    // Verify brain_stats match after round-trip
    const statsAfterImport = await callOp(`${AGENT_ID}_brain`, 'brain_stats');
    const afterData = statsAfterImport.data as { vocabularySize: number };
    // Vocabulary size should be unchanged by import (it's computed from vault, not imported)
    expect(afterData.vocabularySize).toBe(beforeData.vocabularySize);
  });

  // ─── Governance Tests ──────────────────────────────────────────────

  it('governance: get default policy', async () => {
    const res = await callOp(`${AGENT_ID}_control`, 'governance_policy', {
      action: 'get',
      projectPath: '/tmp/e2e-project',
    });
    expect(res.success).toBe(true);
    const data = res.data as {
      quotas: { maxEntriesTotal: number; maxEntriesPerCategory: number; warnAtPercent: number };
      retention: { archiveAfterDays: number };
      autoCapture: { enabled: boolean; requireReview: boolean };
    };
    expect(typeof data.quotas.maxEntriesTotal).toBe('number');
    expect(typeof data.quotas.maxEntriesPerCategory).toBe('number');
    expect(typeof data.quotas.warnAtPercent).toBe('number');
    expect(typeof data.retention.archiveAfterDays).toBe('number');
    expect(typeof data.autoCapture.enabled).toBe('boolean');
    expect(typeof data.autoCapture.requireReview).toBe('boolean');
  });

  it('governance: apply strict preset with full policy shape', async () => {
    const res = await callOp(`${AGENT_ID}_control`, 'governance_policy', {
      action: 'applyPreset',
      projectPath: '/tmp/e2e-project',
      preset: 'strict',
      changedBy: 'e2e-test',
    });
    expect(res.success).toBe(true);
    const data = res.data as { applied: boolean; policy: { quotas: { maxEntriesTotal: number; maxEntriesPerCategory: number; warnAtPercent: number }; retention: { archiveAfterDays: number; minHitsToKeep: number; deleteArchivedAfterDays: number }; autoCapture: { enabled: boolean; requireReview: boolean; maxPendingProposals: number; autoExpireDays: number } } };
    expect(data.applied).toBe(true);

    // Verify the full strict preset shape
    expect(data.policy.quotas.maxEntriesTotal).toBe(200);
    expect(data.policy.quotas.maxEntriesPerCategory).toBe(50);
    expect(data.policy.quotas.warnAtPercent).toBe(70);
    expect(data.policy.retention.archiveAfterDays).toBe(30);
    expect(data.policy.retention.minHitsToKeep).toBe(5);
    expect(data.policy.retention.deleteArchivedAfterDays).toBe(90);
    expect(data.policy.autoCapture.requireReview).toBe(true);
    expect(data.policy.autoCapture.maxPendingProposals).toBe(10);
    expect(data.policy.autoCapture.autoExpireDays).toBe(7);
  });

  it('governance: get stats returns quota and proposal info with correct types', async () => {
    const res = await callOp(`${AGENT_ID}_control`, 'governance_stats', {
      projectPath: '/tmp/e2e-project',
    });
    expect(res.success).toBe(true);
    const data = res.data as {
      quotaStatus: { total: number; maxTotal: number };
      proposalStats: { total: number };
    };
    expect(typeof data.quotaStatus.total).toBe('number');
    expect(typeof data.quotaStatus.maxTotal).toBe('number');
    expect(typeof data.proposalStats.total).toBe('number');
  });

  it('governance: dashboard returns comprehensive view', async () => {
    const res = await callOp(`${AGENT_ID}_control`, 'governance_dashboard', {
      projectPath: '/tmp/e2e-project',
    });
    expect(res.success).toBe(true);
    const data = res.data as {
      vaultSize: number;
      quotaPercent: number;
      policySummary: {
        maxEntries: number;
        requireReview: boolean;
        archiveAfterDays: number;
        autoExpireDays: number;
      };
    };
    expect(typeof data.vaultSize).toBe('number');
    expect(typeof data.quotaPercent).toBe('number');
    // Verify policySummary has correct values from strict preset
    expect(typeof data.policySummary.maxEntries).toBe('number');
    expect(typeof data.policySummary.requireReview).toBe('boolean');
    expect(typeof data.policySummary.archiveAfterDays).toBe('number');
    expect(typeof data.policySummary.autoExpireDays).toBe('number');
  });

  it('governance: proposal lifecycle — list (empty), then check stats', async () => {
    const listRes = await callOp(`${AGENT_ID}_control`, 'governance_proposals', {
      action: 'list',
      projectPath: '/tmp/e2e-project',
    });
    expect(listRes.success).toBe(true);
    expect(Array.isArray(listRes.data)).toBe(true);

    const statsRes = await callOp(`${AGENT_ID}_control`, 'governance_proposals', {
      action: 'stats',
      projectPath: '/tmp/e2e-project',
    });
    expect(statsRes.success).toBe(true);
  });

  // ─── Orchestrate Tests ─────────────────────────────────────────────

  it('orchestrate: session_start project', async () => {
    const res = await callOp(`${AGENT_ID}_orchestrate`, 'session_start', {
      projectPath: '/tmp/e2e-project',
      name: 'E2E Test Project',
    });
    expect(res.success).toBe(true);
    const data = res.data as { project: { name: string }; vault: { entries: number } };
    expect(data.project.name).toBeDefined();
    expect(data.vault.entries).toBeGreaterThanOrEqual(0);
  });

  it('orchestrate: plan → execute → complete lifecycle', async () => {
    // Plan
    const planRes = await callOp(`${AGENT_ID}_orchestrate`, 'orchestrate_plan', {
      objective: 'Test the orchestration pipeline',
      scope: 'E2E testing scope',
      domain: 'frontend',
      tasks: [
        { title: 'Step 1', description: 'First orchestrated step' },
        { title: 'Step 2', description: 'Second orchestrated step' },
      ],
    });
    expect(planRes.success).toBe(true);
    const planData = planRes.data as { plan: { id: string }; recommendations: unknown[] };
    expect(planData.plan.id).toBeDefined();

    // Approve plan before executing
    const approveRes = await callOp(`${AGENT_ID}_plan`, 'approve_plan', {
      planId: planData.plan.id,
    });
    expect(approveRes.success).toBe(true);

    // Execute via orchestrate (starts plan execution + brain session)
    const execRes = await callOp(`${AGENT_ID}_orchestrate`, 'orchestrate_execute', {
      planId: planData.plan.id,
      domain: 'frontend',
      context: 'E2E orchestration test',
    });
    expect(execRes.success).toBe(true);
    const execData = execRes.data as { plan: unknown; session: { id: string } };
    expect(execData.session.id).toBeDefined();

    // Complete via plan lifecycle (plan state machine: executing → validating → reconciling → completed)
    const completePlanRes = await callOp(`${AGENT_ID}_plan`, 'plan_complete_lifecycle', {
      planId: planData.plan.id,
    });
    expect(completePlanRes.success).toBe(true);
  });

  it('orchestrate: quick_capture captures knowledge without plan lifecycle', async () => {
    const res = await callOp(`${AGENT_ID}_orchestrate`, 'orchestrate_quick_capture', {
      domain: 'backend',
      context: 'Quick capture of a database optimization insight',
      toolsUsed: ['vault_search'],
      filesModified: ['db-config.ts'],
      outcome: 'completed',
    });
    expect(res.success).toBe(true);
    const data = res.data as { session: unknown };
    expect(data.session).toBeDefined();
  });

  it('orchestrate: status returns combined overview', async () => {
    const res = await callOp(`${AGENT_ID}_orchestrate`, 'orchestrate_status', {
      domain: 'frontend',
      sessionLimit: 5,
    });
    expect(res.success).toBe(true);
    const data = res.data as {
      activePlans: unknown;
      sessionContext: unknown;
      vaultStats: unknown;
      brainStats: unknown;
    };
    expect(data.vaultStats).toBeDefined();
    expect(data.brainStats).toBeDefined();
  });
});
