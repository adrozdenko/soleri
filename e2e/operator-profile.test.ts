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
import {
  createAgentRuntime,
  createSemanticFacades,
  registerFacade,
} from '@soleri/core';
import type { FacadeConfig, AgentRuntime } from '@soleri/core';

const AGENT_ID = 'e2e-operator';

/** Capture the MCP handler from registerFacade without a real server */
function captureHandler(facade: FacadeConfig) {
  let captured: ((args: { op: string; params: Record<string, unknown> }) => Promise<{
    content: Array<{ type: string; text: string }>;
  }>) | null = null;

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
    expect(operatorFacade).toBeDefined();
    expect(operatorFacade!.ops).toHaveLength(10);

    const opNames = operatorFacade!.ops.map((o) => o.name);
    expect(opNames).toContain('profile_get');
    expect(opNames).toContain('profile_update_section');
    expect(opNames).toContain('profile_correct');
    expect(opNames).toContain('profile_delete');
    expect(opNames).toContain('profile_export');
    expect(opNames).toContain('signal_accumulate');
    expect(opNames).toContain('signal_list');
    expect(opNames).toContain('signal_stats');
    expect(opNames).toContain('synthesis_check');
    expect(opNames).toContain('profile_snapshot');
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
    const data = res.data as { stored: number };
    expect(data.stored).toBe(3);
  });

  // ─── Signal Stats ──────────────────────────────────────────────────

  it('signal_stats returns correct counts matching accumulated signals', async () => {
    const res = await callOp(OP, 'signal_stats', {});
    expect(res.success).toBe(true);
    const data = res.data as { byType: Record<string, number>; totalUnprocessed: number };
    expect(data.byType['command_style']).toBe(2);
    expect(data.byType['frustration']).toBe(1);
    expect(data.totalUnprocessed).toBe(3);
  });

  // ─── Synthesis Check ───────────────────────────────────────────────

  it('synthesis_check reflects threshold logic — below threshold', async () => {
    const res = await callOp(OP, 'synthesis_check', {});
    expect(res.success).toBe(true);
    const data = res.data as {
      due: boolean;
      pendingSignalCount: number;
      sectionsToUpdate: Record<string, boolean>;
    };
    expect(data.due).toBe(false);
    expect(data.pendingSignalCount).toBe(3);
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
    const data = res.data as { updated: boolean };
    expect(data.updated).toBe(true);
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
    const data = res.data as { updated: boolean };
    expect(data.updated).toBe(true);
  });

  // ─── Profile Get — Both Sections Present ────────────────────────────

  it('profile_get returns both updated sections', async () => {
    const res = await callOp(OP, 'profile_get', {});
    expect(res.success).toBe(true);
    const data = res.data as {
      profile: {
        communication: { style: string; signalWords: string[] };
        technicalContext: { domains: string[]; tools: Array<{ name: string }> };
      };
    };
    expect(data.profile.communication.style).toBe('concise');
    expect(data.profile.communication.signalWords).toContain('just');
    expect(data.profile.technicalContext.domains).toContain('typescript');
    expect(data.profile.technicalContext.tools[0].name).toBe('vitest');
  });

  // ─── Profile Export ────────────────────────────────────────────────

  it('profile_export produces markdown output', async () => {
    const res = await callOp(OP, 'profile_export', { format: 'markdown' });
    expect(res.success).toBe(true);
    const data = res.data as { exported: boolean; format: string; content: string };
    expect(data.exported).toBe(true);
    expect(data.format).toBe('markdown');
    expect(data.content).toContain('# Operator Profile');
    expect(data.content).toContain('Communication');
    expect(data.content).toContain('Technical Context');
  });

  it('profile_export produces JSON output', async () => {
    const res = await callOp(OP, 'profile_export', { format: 'json' });
    expect(res.success).toBe(true);
    const data = res.data as { exported: boolean; format: string; content: string };
    expect(data.exported).toBe(true);
    expect(data.format).toBe('json');
    const parsed = JSON.parse(data.content);
    expect(parsed.communication.style).toBe('concise');
  });

  // ─── Profile Snapshot ──────────────────────────────────────────────

  it('profile_snapshot creates versioned snapshot', async () => {
    const res = await callOp(OP, 'profile_snapshot', { trigger: 'e2e-test' });
    expect(res.success).toBe(true);
    const data = res.data as { snapshotted: boolean; version: number };
    expect(data.snapshotted).toBe(true);
    expect(data.version).toBeGreaterThanOrEqual(1);
  });

  // ─── Signal List ───────────────────────────────────────────────────

  it('signal_list returns accumulated signals', async () => {
    const res = await callOp(OP, 'signal_list', {});
    expect(res.success).toBe(true);
    const data = res.data as { signals: Array<{ signalType: string }>; count: number };
    expect(data.count).toBe(3);
    expect(data.signals.some((s) => s.signalType === 'command_style')).toBe(true);
    expect(data.signals.some((s) => s.signalType === 'frustration')).toBe(true);
  });

  it('signal_list filters by type', async () => {
    const res = await callOp(OP, 'signal_list', { types: ['frustration'] });
    expect(res.success).toBe(true);
    const data = res.data as { signals: Array<{ signalType: string }>; count: number };
    expect(data.count).toBe(1);
    expect(data.signals[0].signalType).toBe('frustration');
  });
});
