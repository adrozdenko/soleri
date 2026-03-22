import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAgentRuntime } from '../runtime/runtime.js';
import type { AgentRuntime } from '../runtime/types.js';
import { buildAdaptationSummary } from '../runtime/session-briefing.js';
import type { OperatorProfile } from '../operator/operator-types.js';

function makeProfile(overrides: Partial<OperatorProfile> = {}): OperatorProfile {
  const now = new Date().toISOString();
  return {
    id: 'test-profile',
    operatorId: 'default',
    version: 1,
    identity: { background: '', role: '', philosophy: '', evidence: [] },
    cognition: { patterns: [], derivations: [], evidence: [] },
    communication: {
      style: 'mixed',
      signalWords: [],
      formality: 0.5,
      patience: 0.5,
      adaptationRules: [],
    },
    workingRules: { rules: [] },
    trustModel: { level: 'new', builders: [], breakers: [], currentLevel: 0.5 },
    tasteProfile: { entries: [] },
    growthEdges: { observed: [], selfReported: [] },
    technicalContext: { domains: [], tools: [], blindSpots: [] },
    sessionCount: 0,
    lastSynthesis: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('buildAdaptationSummary', () => {
  it('should return null for a default empty profile', () => {
    const profile = makeProfile();
    expect(buildAdaptationSummary(profile)).toBeNull();
  });

  it('should include communication style when not mixed', () => {
    const profile = makeProfile({
      communication: {
        style: 'concise',
        signalWords: [],
        formality: 0.8,
        patience: 0.5,
        adaptationRules: [],
      },
    });
    const summary = buildAdaptationSummary(profile)!;
    expect(summary).toContain('Communication:');
    expect(summary).toContain('concise');
    expect(summary).toContain('formal');
  });

  it('should include trust level when not new', () => {
    const profile = makeProfile({
      trustModel: { level: 'established', builders: [], breakers: [], currentLevel: 0.8 },
    });
    const summary = buildAdaptationSummary(profile)!;
    expect(summary).toContain('Trust: established');
    expect(summary).toContain('high autonomy');
  });

  it('should include working rules as priorities', () => {
    const profile = makeProfile({
      workingRules: {
        rules: [
          { rule: 'Always write tests first', source: 'reported', reinforcements: 3, firstSeen: '', lastSeen: '' },
          { rule: 'Prefer small commits', source: 'observed', reinforcements: 2, firstSeen: '', lastSeen: '' },
        ],
      },
    });
    const summary = buildAdaptationSummary(profile)!;
    expect(summary).toContain('Priorities:');
    expect(summary).toContain('Always write tests first');
  });

  it('should include growth edges', () => {
    const profile = makeProfile({
      growthEdges: {
        observed: [{ area: 'TypeScript generics', description: '', progress: 'developing' }],
        selfReported: [],
      },
    });
    const summary = buildAdaptationSummary(profile)!;
    expect(summary).toContain('Growth edges:');
    expect(summary).toContain('TypeScript generics');
  });

  it('should produce at most 8 lines', () => {
    const profile = makeProfile({
      communication: { style: 'concise', signalWords: [], formality: 0.9, patience: 0.5, adaptationRules: [] },
      trustModel: { level: 'deep', builders: [], breakers: [], currentLevel: 0.9 },
      workingRules: {
        rules: [
          { rule: 'Rule 1', source: 'reported', reinforcements: 1, firstSeen: '', lastSeen: '' },
          { rule: 'Rule 2', source: 'reported', reinforcements: 1, firstSeen: '', lastSeen: '' },
          { rule: 'Rule 3', source: 'reported', reinforcements: 1, firstSeen: '', lastSeen: '' },
        ],
      },
      growthEdges: {
        observed: [{ area: 'A', description: '', progress: 'developing' }],
        selfReported: [{ area: 'B', description: '', progress: 'emerging' }],
      },
    });
    const summary = buildAdaptationSummary(profile)!;
    const lineCount = summary.split('\n').length;
    expect(lineCount).toBeLessThanOrEqual(8);
  });
});

describe('Session briefing with operator profile', () => {
  let runtime: AgentRuntime;
  let plannerDir: string;

  beforeEach(() => {
    plannerDir = join(tmpdir(), 'briefing-op-test-' + Date.now());
    mkdirSync(plannerDir, { recursive: true });
    runtime = createAgentRuntime({
      agentId: 'test-briefing-op',
      vaultPath: ':memory:',
      plansPath: join(plannerDir, 'plans.json'),
    });
  });

  afterEach(() => {
    runtime.close();
    rmSync(plannerDir, { recursive: true, force: true });
  });

  it('should not include operator section when no profile exists', async () => {
    // Default runtime has no profile created yet — getProfile() returns null
    const ops = await import('../runtime/session-briefing.js');
    const briefingOps = ops.createSessionBriefingOps(runtime);
    const briefingOp = briefingOps.find((o) => o.name === 'session_briefing')!;
    const result = (await briefingOp.handler({})) as { sections: Array<{ label: string }> };
    const labels = result.sections.map((s) => s.label);
    expect(labels).not.toContain('Operator Adaptation');
  });

  it('should include operator section when profile has content', async () => {
    // Create a profile with meaningful data
    runtime.operatorProfile.updateSection('communication', {
      style: 'concise',
      signalWords: [],
      formality: 0.2,
      patience: 0.7,
      adaptationRules: [],
    });
    runtime.operatorProfile.updateSection('trustModel', {
      level: 'established',
      builders: [],
      breakers: [],
      currentLevel: 0.75,
    });

    const ops = await import('../runtime/session-briefing.js');
    const briefingOps = ops.createSessionBriefingOps(runtime);
    const briefingOp = briefingOps.find((o) => o.name === 'session_briefing')!;
    const result = (await briefingOp.handler({})) as {
      sections: Array<{ label: string; content: string }>;
    };
    const opSection = result.sections.find((s) => s.label === 'Operator Adaptation');
    expect(opSection).toBeDefined();
    expect(opSection!.content).toContain('concise');
    expect(opSection!.content).toContain('Trust: established');
  });
});

describe('profile_export', () => {
  let runtime: AgentRuntime;
  let plannerDir: string;

  beforeEach(() => {
    plannerDir = join(tmpdir(), 'export-test-' + Date.now());
    mkdirSync(plannerDir, { recursive: true });
    runtime = createAgentRuntime({
      agentId: 'test-export',
      vaultPath: ':memory:',
      plansPath: join(plannerDir, 'plans.json'),
    });
  });

  afterEach(() => {
    runtime.close();
    rmSync(plannerDir, { recursive: true, force: true });
  });

  it('should export markdown with section headers and evidence', async () => {
    // Create profile with evidence
    runtime.operatorProfile.updateSection('identity', {
      background: 'Senior engineer',
      role: 'Tech lead',
      philosophy: 'Ship fast, iterate',
      evidence: [
        { signalId: 's1', timestamp: '2024-01-01', confidence: 0.9, summary: 'Mentioned tech lead role' },
      ],
    });

    const { createOperatorFacadeOps } = await import(
      '../runtime/facades/operator-facade.js'
    );
    const ops = createOperatorFacadeOps(runtime);
    const exportOp = ops.find((o) => o.name === 'profile_export')!;
    const result = (await exportOp.handler({ format: 'markdown' })) as {
      exported: boolean;
      content: string;
    };
    expect(result.exported).toBe(true);
    expect(result.content).toContain('# Operator Profile');
    expect(result.content).toContain('## Identity');
    expect(result.content).toContain('## Metadata');
    expect(result.content).toContain('**Evidence');
    expect(result.content).toContain('Mentioned tech lead role');
  });

  it('should export json as raw profile object', async () => {
    // Ensure profile exists
    runtime.operatorProfile.updateSection('communication', {
      style: 'formal',
      signalWords: [],
      formality: 0.9,
      patience: 0.5,
      adaptationRules: [],
    });

    const { createOperatorFacadeOps } = await import(
      '../runtime/facades/operator-facade.js'
    );
    const ops = createOperatorFacadeOps(runtime);
    const exportOp = ops.find((o) => o.name === 'profile_export')!;
    const result = (await exportOp.handler({ format: 'json' })) as {
      exported: boolean;
      format: string;
      content: string;
    };
    expect(result.exported).toBe(true);
    expect(result.format).toBe('json');
    const parsed = JSON.parse(result.content);
    expect(parsed.communication.style).toBe('formal');
  });

  it('should return exported:false when no profile exists', async () => {
    // Delete any auto-created profile
    runtime.operatorProfile.deleteProfile();

    const { createOperatorFacadeOps } = await import(
      '../runtime/facades/operator-facade.js'
    );
    const ops = createOperatorFacadeOps(runtime);
    const exportOp = ops.find((o) => o.name === 'profile_export')!;
    const result = (await exportOp.handler({ format: 'json' })) as { exported: boolean };
    expect(result.exported).toBe(false);
  });
});
