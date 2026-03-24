/**
 * E2E Test: Operator Profile
 *
 * Creates a real agent runtime with operator module, then exercises
 * all operator facade ops through the dispatch layer.
 * Uses real SQLite (in-memory) — no mocks.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAgentRuntime, createSemanticFacades, registerFacade } from '@soleri/core';
import type { FacadeConfig, AgentRuntime } from '@soleri/core';

const AGENT_ID = 'e2e-operator';

/** Capture the MCP handler from registerFacade without a real server */
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

/** Parse MCP tool response */
function parseResponse(raw: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(raw.content[0].text) as {
    success: boolean;
    data?: unknown;
    error?: string;
    op: string;
    facade: string;
  };
}

describe('E2E: operator-profile', () => {
  let runtime: AgentRuntime;
  let facades: FacadeConfig[];
  let handlers: Map<string, ReturnType<typeof captureHandler>>;
  const plannerDir = join(tmpdir(), `soleri-e2e-operator-${Date.now()}`);

  beforeAll(() => {
    mkdirSync(plannerDir, { recursive: true });

    runtime = createAgentRuntime({
      agentId: AGENT_ID,
      vaultPath: ':memory:',
      plansPath: join(plannerDir, 'plans.json'),
    });

    facades = createSemanticFacades(runtime, AGENT_ID);

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

  const OP = `${AGENT_ID}_operator`;

  // ─── Facade Registration ────────────────────────────────────────────

  it('should register operator facade with all 10 ops', () => {
    const operatorFacade = facades.find((f) => f.name === OP);
    expect(operatorFacade).not.toBeUndefined();
    expect(operatorFacade!.description).toBe(
      'Operator profile — personality learning, signals, adaptation.',
    );
    expect(operatorFacade!.ops).toHaveLength(10);

    const opNames = operatorFacade!.ops.map((o) => o.name);
    expect(opNames).toEqual([
      'profile_get',
      'profile_update_section',
      'profile_correct',
      'profile_delete',
      'profile_export',
      'signal_accumulate',
      'signal_list',
      'signal_stats',
      'synthesis_check',
      'profile_snapshot',
    ]);
  });

  // ─── Signal Accumulate ──────────────────────────────────────────────

  it('signal_accumulate stores test signals', async () => {
    const res = await callOp(OP, 'signal_accumulate', {
      signals: [
        {
          id: 'sig-e2e-1',
          signalType: 'command_style',
          data: { style: 'terse', snippet: 'deploy' },
          timestamp: new Date().toISOString(),
          sessionId: 'e2e-session',
          confidence: 0.8,
          source: 'test',
        },
        {
          id: 'sig-e2e-2',
          signalType: 'frustration',
          data: { level: 'mild', trigger: 'slow response', context: 'waiting' },
          timestamp: new Date().toISOString(),
          sessionId: 'e2e-session',
          confidence: 0.6,
          source: 'test',
        },
        {
          id: 'sig-e2e-3',
          signalType: 'command_style',
          data: { style: 'verbose', snippet: 'please refactor the whole module' },
          timestamp: new Date().toISOString(),
          sessionId: 'e2e-session',
          confidence: 0.7,
          source: 'test',
        },
      ],
    });
    expect(res.success).toBe(true);
    expect(res.op).toBe('signal_accumulate');
    const data = res.data as { stored: number };
    expect(data.stored).toBe(3);
  });

  // ─── Signal Stats ──────────────────────────────────────────────────

  it('signal_stats returns correct counts matching accumulated signals', async () => {
    const res = await callOp(OP, 'signal_stats', {});
    expect(res.success).toBe(true);
    expect(res.op).toBe('signal_stats');
    const data = res.data as {
      byType: Record<string, number>;
      totalUnprocessed: number;
      lastSynthesis: string | null;
    };
    expect(data.byType['command_style']).toBe(2);
    expect(data.byType['frustration']).toBe(1);
    expect(data.totalUnprocessed).toBe(3);
    expect(data.lastSynthesis).toBeNull();
  });

  // ─── Synthesis Check ───────────────────────────────────────────────

  it('synthesis_check reflects threshold logic — below threshold', async () => {
    const res = await callOp(OP, 'synthesis_check', {});
    expect(res.success).toBe(true);
    expect(res.op).toBe('synthesis_check');
    const data = res.data as {
      due: boolean;
      reason: string;
      pendingSignalCount: number;
      sectionsToUpdate: Record<string, boolean>;
      lastSynthesisAt: string | null;
    };
    expect(data.due).toBe(false);
    expect(data.pendingSignalCount).toBe(3);
    expect(data.lastSynthesisAt).toBeNull();
    expect(typeof data.reason).toBe('string');
    expect(data.reason.length).toBeGreaterThan(0);
    // Verify sectionsToUpdate has the expected profile section keys
    expect(data.sectionsToUpdate).toHaveProperty('communication');
    expect(data.sectionsToUpdate).toHaveProperty('technicalContext');
    expect(data.sectionsToUpdate).toHaveProperty('identity');
    expect(data.sectionsToUpdate).toHaveProperty('cognition');
  });

  // ─── Profile Update Section ─────────────────────────────────────────

  it('profile_update_section for communication', async () => {
    const res = await callOp(OP, 'profile_update_section', {
      section: 'communication',
      data: {
        style: 'concise',
        signalWords: ['just', 'quickly'],
        formality: 0.3,
        patience: 0.8,
        adaptationRules: [],
      },
    });
    expect(res.success).toBe(true);
    expect(res.op).toBe('profile_update_section');
    const data = res.data as { updated: boolean; section: string; version: number };
    expect(data.updated).toBe(true);
    expect(data.section).toBe('communication');
    expect(typeof data.version).toBe('number');
  });

  it('profile_update_section for technicalContext', async () => {
    const res = await callOp(OP, 'profile_update_section', {
      section: 'technicalContext',
      data: {
        domains: ['typescript', 'node', 'sqlite'],
        tools: [{ name: 'vitest', proficiency: 'advanced', frequency: 'daily' }],
        blindSpots: [],
      },
    });
    expect(res.success).toBe(true);
    expect(res.op).toBe('profile_update_section');
    const data = res.data as { updated: boolean; section: string; version: number };
    expect(data.updated).toBe(true);
    expect(data.section).toBe('technicalContext');
    expect(typeof data.version).toBe('number');
  });

  // ─── Profile Get — Both Sections Present ────────────────────────────

  it('profile_get returns both updated sections', async () => {
    const res = await callOp(OP, 'profile_get', {});
    expect(res.success).toBe(true);
    expect(res.op).toBe('profile_get');
    const data = res.data as {
      profile: {
        communication: {
          style: string;
          signalWords: string[];
          formality: number;
          patience: number;
        };
        technicalContext: {
          domains: string[];
          tools: Array<{ name: string; proficiency: string; frequency: string }>;
          blindSpots: unknown[];
        };
      };
    };
    expect(data.profile.communication.style).toBe('concise');
    expect(data.profile.communication.signalWords).toEqual(['just', 'quickly']);
    expect(data.profile.communication.formality).toBe(0.3);
    expect(data.profile.communication.patience).toBe(0.8);
    expect(data.profile.technicalContext.domains).toEqual(['typescript', 'node', 'sqlite']);
    expect(data.profile.technicalContext.tools).toHaveLength(1);
    expect(data.profile.technicalContext.tools[0].name).toBe('vitest');
    expect(data.profile.technicalContext.tools[0].proficiency).toBe('advanced');
    expect(data.profile.technicalContext.tools[0].frequency).toBe('daily');
    expect(data.profile.technicalContext.blindSpots).toEqual([]);
  });

  // ─── Profile Export ────────────────────────────────────────────────

  it('profile_export produces markdown output', async () => {
    const res = await callOp(OP, 'profile_export', { format: 'markdown' });
    expect(res.success).toBe(true);
    expect(res.op).toBe('profile_export');
    const data = res.data as { exported: boolean; format: string; content: string };
    expect(data.exported).toBe(true);
    expect(data.format).toBe('markdown');
    expect(data.content).toContain('# Operator Profile');
    expect(data.content).toContain('Communication');
    expect(data.content).toContain('Technical Context');
    // Markdown should contain the metadata table
    expect(data.content).toContain('## Metadata');
    expect(data.content).toContain('| Field | Value |');
  });

  it('profile_export produces JSON output', async () => {
    const res = await callOp(OP, 'profile_export', { format: 'json' });
    expect(res.success).toBe(true);
    expect(res.op).toBe('profile_export');
    const data = res.data as { exported: boolean; format: string; content: string };
    expect(data.exported).toBe(true);
    expect(data.format).toBe('json');
    const parsed = JSON.parse(data.content);
    expect(parsed.communication.style).toBe('concise');
    expect(parsed.communication.signalWords).toEqual(['just', 'quickly']);
    expect(parsed.technicalContext.domains).toEqual(['typescript', 'node', 'sqlite']);
  });

  // ─── Profile Snapshot ──────────────────────────────────────────────

  it('profile_snapshot creates versioned snapshot', async () => {
    const res = await callOp(OP, 'profile_snapshot', { trigger: 'e2e-test' });
    expect(res.success).toBe(true);
    expect(res.op).toBe('profile_snapshot');
    const data = res.data as { snapshotted: boolean; version: number };
    expect(data.snapshotted).toBe(true);
    expect(data.version).toBe(1);
  });

  // ─── Signal List ───────────────────────────────────────────────────

  it('signal_list returns accumulated signals', async () => {
    const res = await callOp(OP, 'signal_list', {});
    expect(res.success).toBe(true);
    expect(res.op).toBe('signal_list');
    const data = res.data as {
      signals: Array<{
        signalType: string;
        confidence: number;
        source: string | null;
        processed: boolean;
      }>;
      count: number;
    };
    expect(data.count).toBe(3);
    const types = data.signals.map((s) => s.signalType).sort();
    expect(types).toEqual(['command_style', 'command_style', 'frustration']);
    // All signals should be from the same source
    for (const s of data.signals) {
      expect(s.source).toBe('test');
      expect(s.processed).toBe(false);
    }
  });

  it('signal_list filters by type', async () => {
    const res = await callOp(OP, 'signal_list', { types: ['frustration'] });
    expect(res.success).toBe(true);
    expect(res.op).toBe('signal_list');
    const data = res.data as {
      signals: Array<{ signalType: string; confidence: number }>;
      count: number;
    };
    expect(data.count).toBe(1);
    expect(data.signals[0].signalType).toBe('frustration');
    expect(data.signals[0].confidence).toBe(0.6);
  });
});
