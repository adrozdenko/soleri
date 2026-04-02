/**
 * E2E Test: Capability Packs
 *
 * Tests organized by USER JOURNEY, not by internal API:
 *
 * Journey 1: "I just scaffolded an agent — does it have capabilities?"
 * Journey 2: "I installed a pack — do new capabilities appear?"
 * Journey 3: "I ask the agent to do something — does it resolve the right capability?"
 * Journey 4: "I ask for something the agent can't do — does it degrade gracefully?"
 * Journey 5: "I'm a new user — does the agent know how to introduce itself?"
 * Journey 6: "I run CLI commands — do they work on my agent?"
 *
 * Plus: edge cases, schema validation, migration verification.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import {
  createAgentRuntime,
  createSemanticFacades,
  createDomainFacades,
  registerFacade,
  CapabilityRegistry,
  chainToCapability,
  packManifestSchema,
  seedDefaultPlaybooks as seedDefaultPlaybooksFn,
} from '@soleri/core';

const seedDefaultPlaybooks = seedDefaultPlaybooksFn;
import type {
  AgentRuntime,
  FacadeConfig,
  CapabilityDefinition,
  CapabilityHandler,
  CapabilityContext,
  CapabilityResult,
} from '@soleri/core';

// ─── Helpers ─────────────────────────────────────────────

const AGENT_ID = 'e2e-caps';

function makeHandler(
  name: string,
  behavior?: (params: Record<string, unknown>) => Record<string, unknown>,
): CapabilityHandler {
  return async (params) => ({
    success: true,
    data: behavior ? behavior(params) : { handler: name },
    produced: [`${name}-output`],
  });
}

function makeCap(id: string, opts?: Partial<CapabilityDefinition>): CapabilityDefinition {
  return {
    id,
    description: `Capability: ${id}`,
    provides: [`${id}-output`],
    requires: [],
    ...opts,
  };
}

/** Capture MCP handler from a facade (same pattern as full-pipeline.test.ts) */
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
  return JSON.parse(raw.content[0].text);
}

// ─── Shared Runtime ──────────────────────────────────────

let runtime: AgentRuntime;
let facades: FacadeConfig[];
let handlers: Map<string, ReturnType<typeof captureHandler>>;
const plannerDir = join(tmpdir(), `soleri-e2e-caps-${Date.now()}`);

async function callOp(facadeName: string, op: string, params: Record<string, unknown> = {}) {
  const handler = handlers.get(facadeName);
  if (!handler) throw new Error(`No facade: ${facadeName}`);
  const raw = await handler({ op, params });
  return parseResponse(raw);
}

// ═══════════════════════════════════════════════════════════
// JOURNEY 1: Fresh agent with core capabilities
// "I just scaffolded an agent — does it have capabilities?"
// ═══════════════════════════════════════════════════════════

describe('Journey 1: Fresh agent has core capabilities', () => {
  let registry: CapabilityRegistry;

  beforeAll(() => {
    mkdirSync(plannerDir, { recursive: true });

    runtime = createAgentRuntime({
      agentId: AGENT_ID,
      vaultPath: ':memory:',
      plansPath: join(plannerDir, 'plans.json'),
    });

    facades = [
      ...createSemanticFacades(runtime, AGENT_ID),
      ...createDomainFacades(runtime, AGENT_ID, ['design', 'testing']),
    ];

    handlers = new Map();
    for (const facade of facades) {
      handlers.set(facade.name, captureHandler(facade));
    }

    // Simulate what the generated entry-point does:
    // Create registry and register core capabilities
    registry = new CapabilityRegistry();

    const coreCaps = [
      'vault.search',
      'vault.capture',
      'vault.playbook',
      'brain.recommend',
      'brain.strengths',
      'memory.search',
      'memory.capture',
      'plan.create',
      'plan.approve',
      'orchestrate.plan',
      'orchestrate.execute',
      'orchestrate.complete',
      'identity.activate',
      'identity.route',
      'admin.health',
      'admin.tools',
      'debug.patterns',
    ].map((id) => makeCap(id));

    const coreHandlers = new Map<string, CapabilityHandler>();
    coreCaps.forEach((c) => coreHandlers.set(c.id, makeHandler(c.id)));
    registry.registerPack('core', coreCaps, coreHandlers, 100);
  });

  afterAll(() => {
    runtime.close();
    rmSync(plannerDir, { recursive: true, force: true });
  });

  it('agent should have core capabilities registered', () => {
    expect(registry.has('vault.search')).toBe(true);
    expect(registry.has('brain.recommend')).toBe(true);
    expect(registry.has('plan.create')).toBe(true);
    expect(registry.has('admin.health')).toBe(true);
  });

  it('agent should NOT have design capabilities without the pack', () => {
    expect(registry.has('color.validate')).toBe(false);
    expect(registry.has('token.check')).toBe(false);
    expect(registry.has('component.scaffold')).toBe(false);
  });

  it('real runtime should have facades wired correctly', () => {
    // 22 semantic facades + 2 domain facades (design, testing) = 24
    expect(facades.length).toBe(24);
    expect(handlers.size).toBe(24);

    // All 22 semantic facades should be registered
    const facadeNames = facades.map((f) => f.name);
    expect(facadeNames).toContain(`${AGENT_ID}_vault`);
    expect(facadeNames).toContain(`${AGENT_ID}_admin`);
    expect(facadeNames).toContain(`${AGENT_ID}_brain`);
    expect(facadeNames).toContain(`${AGENT_ID}_plan`);
    expect(facadeNames).toContain(`${AGENT_ID}_orchestrate`);
    expect(facadeNames).toContain(`${AGENT_ID}_memory`);
    expect(facadeNames).toContain(`${AGENT_ID}_curator`);
    expect(facadeNames).toContain(`${AGENT_ID}_loop`);
    expect(facadeNames).toContain(`${AGENT_ID}_control`);
    expect(facadeNames).toContain(`${AGENT_ID}_context`);
    expect(facadeNames).toContain(`${AGENT_ID}_agency`);
    expect(facadeNames).toContain(`${AGENT_ID}_chat`);
    expect(facadeNames).toContain(`${AGENT_ID}_operator`);
    expect(facadeNames).toContain(`${AGENT_ID}_archive`);
    expect(facadeNames).toContain(`${AGENT_ID}_sync`);
    expect(facadeNames).toContain(`${AGENT_ID}_review`);
    expect(facadeNames).toContain(`${AGENT_ID}_intake`);
    expect(facadeNames).toContain(`${AGENT_ID}_links`);
    expect(facadeNames).toContain(`${AGENT_ID}_branching`);
    expect(facadeNames).toContain(`${AGENT_ID}_tier`);
    // Domain facades
    expect(facadeNames).toContain(`${AGENT_ID}_design`);
    expect(facadeNames).toContain(`${AGENT_ID}_testing`);
  });

  it('capabilities should be grouped by domain', () => {
    const grouped = registry.list();
    expect(grouped.has('vault')).toBe(true);
    expect(grouped.has('brain')).toBe(true);
    expect(grouped.has('plan')).toBe(true);
    expect(grouped.has('memory')).toBe(true);
    expect(grouped.has('orchestrate')).toBe(true);
    expect(grouped.has('identity')).toBe(true);
    expect(grouped.has('admin')).toBe(true);
    expect(grouped.has('debug')).toBe(true);
    // vault domain has 3 capabilities: vault.search, vault.capture, vault.playbook
    expect(grouped.get('vault')!.length).toBe(3);
    // brain domain has 2 capabilities: brain.recommend, brain.strengths
    expect(grouped.get('brain')!.length).toBe(2);
    // plan domain has 2 capabilities: plan.create, plan.approve
    expect(grouped.get('plan')!.length).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════
// JOURNEY 2: Install a pack — capabilities appear
// "I installed a pack — do new capabilities appear?"
// ═══════════════════════════════════════════════════════════

describe('Journey 2: Installing a pack adds capabilities', () => {
  let registry: CapabilityRegistry;

  beforeAll(() => {
    registry = new CapabilityRegistry();

    // Core pack (always present)
    const coreCaps = ['vault.search', 'brain.recommend', 'plan.create'].map((id) => makeCap(id));
    const coreH = new Map<string, CapabilityHandler>();
    coreCaps.forEach((c) => coreH.set(c.id, makeHandler(c.id)));
    registry.registerPack('core', coreCaps, coreH, 100);
  });

  it('should start with only core capabilities', () => {
    expect(registry.size).toBe(3);
    expect(registry.has('color.validate')).toBe(false);
  });

  it('installing design-system pack should add design capabilities', () => {
    const designCaps = [
      makeCap('color.validate', {
        provides: ['contrast-ratio', 'wcag-level', 'pass-fail'],
        requires: ['foreground', 'background'],
      }),
      makeCap('color.parse', {
        provides: ['parsed-color'],
        requires: ['color-string'],
      }),
      makeCap('token.check', {
        provides: ['valid', 'suggestion'],
        requires: ['token-value'],
        knowledge: ['color-token-priority'],
      }),
    ];
    const designH = new Map<string, CapabilityHandler>();
    designCaps.forEach((c) => designH.set(c.id, makeHandler(c.id)));

    registry.registerPack('design-system', designCaps, designH, 50);

    expect(registry.size).toBe(6); // 3 core + 3 design
    expect(registry.has('color.validate')).toBe(true);
    expect(registry.has('token.check')).toBe(true);
    expect(registry.packCount).toBe(2);
  });

  it('capabilities should know which pack provides them', () => {
    const resolved = registry.resolve('color.validate');
    expect(resolved.providers).toContain('design-system');

    const coreResolved = registry.resolve('vault.search');
    expect(coreResolved.providers).toContain('core');
  });

  it('capability with knowledge refs should carry them through', () => {
    const resolved = registry.resolve('token.check');
    expect(resolved.knowledge).toContain('color-token-priority');
  });
});

// ═══════════════════════════════════════════════════════════
// JOURNEY 3: Capability resolution in a real flow
// "I ask the agent to do something — does it resolve correctly?"
// ═══════════════════════════════════════════════════════════

describe('Journey 3: Flow resolves capabilities correctly', () => {
  let registry: CapabilityRegistry;

  beforeAll(() => {
    registry = new CapabilityRegistry();

    // Full stack: core + design
    const allCaps = [
      'vault.search',
      'memory.search',
      'brain.recommend',
      'component.search',
      'component.workflow',
      'component.validate',
      'color.validate',
      'token.check',
      'design.rules',
      'design.recommend',
      'architecture.search',
    ].map((id) => makeCap(id));

    const allH = new Map<string, CapabilityHandler>();
    allCaps.forEach((c) => allH.set(c.id, makeHandler(c.id)));
    registry.registerPack('full-stack', allCaps, allH);
  });

  it('BUILD flow should validate with all capabilities', () => {
    const flowsDir = join(__dirname, '..', 'packages', 'core', 'data', 'flows');
    const buildContent = readFileSync(join(flowsDir, 'build.flow.yaml'), 'utf-8');
    const buildFlow = parseYaml(buildContent);

    const validation = registry.validateFlow({
      steps: buildFlow.steps,
      onMissingCapability: buildFlow['on-missing-capability'],
    });

    // Build flow needs 9 capabilities, all registered in the full-stack pack
    expect(validation.valid).toBe(true);
    expect(validation.missing).toHaveLength(0);
    expect(validation.available.length).toBe(9);
    expect(validation.available).toContain('vault.search');
    expect(validation.available).toContain('memory.search');
    expect(validation.available).toContain('component.search');
    expect(validation.available).toContain('design.recommend');
    expect(validation.available).toContain('architecture.search');
    expect(validation.available).toContain('brain.recommend');
    expect(validation.available).toContain('component.workflow');
    expect(validation.available).toContain('component.validate');
    expect(validation.available).toContain('token.check');
  });

  it('capability handler should receive params and return result', async () => {
    const contrastHandler: CapabilityHandler = async (params) => {
      const fg = params.foreground as string;
      const bg = params.background as string;
      const ratio = fg === '#000000' && bg === '#FFFFFF' ? 21 : 4.5;
      return {
        success: true,
        data: { ratio, level: ratio >= 7 ? 'AAA' : 'AA', pass: ratio >= 4.5 },
        produced: ['contrast-ratio', 'wcag-level', 'pass-fail'],
      };
    };

    const reg = new CapabilityRegistry();
    reg.registerPack(
      'design',
      [makeCap('color.validate')],
      new Map([['color.validate', contrastHandler]]),
    );

    const resolved = reg.resolve('color.validate');
    const result = await resolved.handler!(
      { foreground: '#000000', background: '#FFFFFF' },
      {} as never,
    );

    expect(result.success).toBe(true);
    expect(result.data.ratio).toBe(21);
    expect(result.data.level).toBe('AAA');
    expect(result.data.pass).toBe(true);
    expect(result.produced).toContain('contrast-ratio');
  });

  it('should resolve capabilities with dependencies satisfied', () => {
    const reg = new CapabilityRegistry();
    const caps = [
      makeCap('color.parse'),
      makeCap('color.validate', { depends: ['color.parse'] }),
      makeCap('component.scaffold', { depends: ['color.validate', 'token.check'] }),
      makeCap('token.check'),
    ];
    const h = new Map<string, CapabilityHandler>();
    caps.forEach((c) => h.set(c.id, makeHandler(c.id)));
    reg.registerPack('design', caps, h);

    // All deps satisfied
    expect(reg.resolve('color.validate').available).toBe(true);
    expect(reg.resolve('component.scaffold').available).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// JOURNEY 4: Graceful degradation
// "I ask for something the agent can't do — what happens?"
// ═══════════════════════════════════════════════════════════

describe('Journey 4: Missing capabilities degrade gracefully', () => {
  let registry: CapabilityRegistry;

  beforeAll(() => {
    registry = new CapabilityRegistry();
    // Only core — no design pack
    const coreCaps = ['vault.search', 'brain.recommend', 'memory.search'].map((id) => makeCap(id));
    const coreH = new Map<string, CapabilityHandler>();
    coreCaps.forEach((c) => coreH.set(c.id, makeHandler(c.id)));
    registry.registerPack('core', coreCaps, coreH, 100);
  });

  it('resolving missing capability returns available:false', () => {
    const resolved = registry.resolve('color.validate');
    expect(resolved.available).toBe(false);
    expect(resolved.handler).toBeUndefined();
  });

  it('flow with missing non-blocking capabilities can still run partially', () => {
    const validation = registry.validateFlow({
      steps: [
        { needs: ['vault.search', 'brain.recommend'] }, // all available
        { needs: ['color.validate', 'token.check'] }, // both missing
        { needs: ['vault.search'] }, // available
      ],
      onMissingCapability: {
        default: 'skip-with-warning',
        blocking: ['vault.search'],
      },
    });

    expect(validation.valid).toBe(false);
    expect(validation.canRunPartially).toBe(true); // missing caps are NOT blocking
    expect(validation.missing).toContain('color.validate');
    expect(validation.missing).toContain('token.check');
    expect(validation.available).toContain('vault.search');
    expect(validation.available).toContain('brain.recommend');
  });

  it('flow with missing BLOCKING capability cannot run', () => {
    const validation = registry.validateFlow({
      steps: [{ needs: ['vault.search', 'component.search'] }],
      onMissingCapability: {
        default: 'skip-with-warning',
        blocking: ['component.search'], // this is missing AND blocking
      },
    });

    expect(validation.valid).toBe(false);
    expect(validation.canRunPartially).toBe(false);
    const blocked = validation.degraded.find((d) => d.capability === 'component.search');
    expect(blocked?.impact).toBe('blocking');
  });

  it('missing dependency makes capability unavailable even if registered', () => {
    const reg = new CapabilityRegistry();
    // Register color.validate that depends on color.parse, but don't register color.parse
    reg.registerPack(
      'incomplete',
      [makeCap('color.validate', { depends: ['color.parse'] })],
      new Map([['color.validate', makeHandler('color.validate')]]),
    );

    const resolved = reg.resolve('color.validate');
    expect(resolved.available).toBe(false);
    expect(resolved.missingDependencies).toContain('color.parse');
  });

  it('handler that throws should not crash (caller handles)', async () => {
    const throwingHandler: CapabilityHandler = async () => {
      throw new Error('Something went wrong in the handler');
    };

    const reg = new CapabilityRegistry();
    reg.registerPack(
      'broken',
      [makeCap('broken.handler')],
      new Map([['broken.handler', throwingHandler]]),
    );

    const resolved = reg.resolve('broken.handler');
    expect(resolved.available).toBe(true);

    // The handler throws — caller (flow executor) should catch this
    await expect(resolved.handler!({}, {} as never)).rejects.toThrow('Something went wrong');
  });
});

// ═══════════════════════════════════════════════════════════
// JOURNEY 5: New user onboarding
// "I'm a new user — does the agent know how to introduce itself?"
// ═══════════════════════════════════════════════════════════

describe('Journey 5: New user onboarding', () => {
  it('onboarding playbook should exist in builtin registry', async () => {
    const { getAllBuiltinPlaybooks, getBuiltinPlaybook } = await import('@soleri/core');

    const all = getAllBuiltinPlaybooks();
    // 7 built-in: tdd, brainstorming, code-review, subagent-execution, systematic-debugging, verification, onboarding
    expect(all.length).toBe(7);

    const onboarding = getBuiltinPlaybook('generic-onboarding');
    expect(onboarding).toBeDefined();
    expect(onboarding!.title).toBe('New User Onboarding');
    expect(onboarding!.trigger).toContain('what can you do');
    expect(onboarding!.trigger).toContain('getting started');
    expect(onboarding!.matchKeywords).toContain('help');
    expect(onboarding!.matchKeywords).toContain('capabilities');
  });

  it('onboarding playbook should be seedable into vault', () => {
    const tempDir = join(tmpdir(), `soleri-e2e-onboard-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });

    const rt = createAgentRuntime({
      agentId: 'onboard-test',
      vaultPath: ':memory:',
      plansPath: join(tempDir, 'plans.json'),
    });

    const result = seedDefaultPlaybooks(rt.vault);
    // 7 built-in playbooks should all seed successfully
    expect(result.seeded).toBe(7);
    expect(result.errors).toBe(0);

    rt.close();
    rmSync(tempDir, { recursive: true, force: true });
  });
});

// ═══════════════════════════════════════════════════════════
// JOURNEY 6: Multi-provider priority
// "Two packs provide the same capability — which wins?"
// ═══════════════════════════════════════════════════════════

describe('Journey 6: Multi-provider priority resolution', () => {
  it('higher priority pack wins', async () => {
    const registry = new CapabilityRegistry();

    // Design system pack at priority 50
    const designHandler = makeHandler('design-system', () => ({
      source: 'design-system',
      ratio: 4.5,
    }));
    registry.registerPack(
      'design-system',
      [makeCap('color.validate')],
      new Map([['color.validate', designHandler]]),
      50,
    );

    // Brand guardian pack at priority 75 (user-installed, should win)
    const brandHandler = makeHandler('brand-guardian', () => ({
      source: 'brand-guardian',
      ratio: 7.0,
    }));
    registry.registerPack(
      'brand-guardian',
      [makeCap('color.validate')],
      new Map([['color.validate', brandHandler]]),
      75,
    );

    const resolved = registry.resolve('color.validate');
    expect(resolved.available).toBe(true);
    expect(resolved.providers![0]).toBe('brand-guardian'); // higher priority

    // Execute — should get brand-guardian's result
    const result = await resolved.handler!({}, {} as never);
    expect(result.data.source).toBe('brand-guardian');
    expect(result.data.ratio).toBe(7.0);
  });

  it('core pack at priority 100 always wins for core capabilities', () => {
    const registry = new CapabilityRegistry();

    // Core at priority 100
    registry.registerPack(
      'core',
      [makeCap('vault.search')],
      new Map([['vault.search', makeHandler('core')]]),
      100,
    );

    // Some pack tries to override vault.search at priority 50
    registry.registerPack(
      'override',
      [makeCap('vault.search')],
      new Map([['vault.search', makeHandler('override')]]),
      50,
    );

    const resolved = registry.resolve('vault.search');
    expect(resolved.providers![0]).toBe('core'); // core wins
  });
});

// ═══════════════════════════════════════════════════════════
// Chain mapping & schema validation
// ═══════════════════════════════════════════════════════════

describe('Chain-to-capability v1 bridge', () => {
  it('should map all known Soleri chain names', () => {
    const knownMappings: Record<string, string> = {
      'vault-search': 'vault.search',
      'contrast-check': 'color.validate',
      'validate-tokens': 'token.check',
      'component-search': 'component.search',
      'brain-recommend': 'brain.recommend',
      'brain-strengths': 'brain.strengths',
      'memory-search': 'memory.search',
      'architecture-search': 'architecture.search',
      'design-rules-check': 'design.rules',
    };

    for (const [chain, expected] of Object.entries(knownMappings)) {
      expect(chainToCapability(chain)).toBe(expected);
    }
  });

  it('should return undefined for unknown chains', () => {
    expect(chainToCapability('nonexistent')).toBeUndefined();
    expect(chainToCapability('')).toBeUndefined();
  });

  it('flow validation should work with v1 chains via bridge', () => {
    const registry = new CapabilityRegistry();
    registry.registerPack(
      'core',
      [makeCap('vault.search'), makeCap('brain.recommend')],
      new Map([
        ['vault.search', makeHandler('vs')],
        ['brain.recommend', makeHandler('br')],
      ]),
    );

    const validation = registry.validateFlow({
      steps: [{ chains: ['vault-search', 'brain-recommend'] }], // v1 format
    });

    expect(validation.valid).toBe(true);
    expect(validation.available).toContain('vault.search');
  });
});

describe('Pack manifest v2 schema', () => {
  it('should accept valid manifest with capabilities', () => {
    const result = packManifestSchema.safeParse({
      id: 'design-system',
      name: 'Design System',
      version: '1.0.0',
      capabilities: [
        {
          id: 'color.validate',
          description: 'Check contrast',
          provides: ['ratio'],
          requires: ['fg', 'bg'],
          depends: ['color.parse'],
          knowledge: ['a11y-contrast'],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('should accept manifest WITHOUT capabilities (backwards compat)', () => {
    const result = packManifestSchema.safeParse({
      id: 'legacy',
      name: 'Legacy Pack',
      version: '1.0.0',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.capabilities).toEqual([]);
    }
  });

  it('should reject invalid capability ID formats', () => {
    const badIds = ['UPPER', 'no-period', 'a.b.c', '.leading', 'trailing.'];
    for (const id of badIds) {
      const result = packManifestSchema.safeParse({
        id: 'test',
        name: 'Test',
        version: '1.0.0',
        capabilities: [{ id, description: 'x', provides: [], requires: [] }],
      });
      expect(result.success).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// Flow YAML migration verification
// ═══════════════════════════════════════════════════════════

describe('Flow YAML migration', () => {
  const flowsDir = join(__dirname, '..', 'packages', 'core', 'data', 'flows');
  let flowFiles: string[] = [];

  beforeAll(() => {
    flowFiles = readdirSync(flowsDir).filter((f) => f.endsWith('.flow.yaml'));
  });

  it('all 8 flow files should exist', () => {
    expect(flowFiles.length).toBe(8);
  });

  it('every flow should have on-missing-capability with vault.search as blocking', () => {
    for (const file of flowFiles) {
      const flow = parseYaml(readFileSync(join(flowsDir, file), 'utf-8'));
      expect(flow['on-missing-capability']).toBeDefined();
      expect(flow['on-missing-capability'].default).toBe('skip-with-warning');
      expect(flow['on-missing-capability'].blocking).toContain('vault.search');
    }
  });

  it('every step with chains: should also have needs:', () => {
    for (const file of flowFiles) {
      const flow = parseYaml(readFileSync(join(flowsDir, file), 'utf-8'));
      for (const step of flow.steps ?? []) {
        if (step.chains?.length > 0) {
          expect(step.needs).toBeDefined();
          expect(step.needs.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('all needs: values should be valid domain.action format', () => {
    const format = /^[a-z][a-z0-9]*\.[a-z][a-z0-9]*$/;
    for (const file of flowFiles) {
      const flow = parseYaml(readFileSync(join(flowsDir, file), 'utf-8'));
      for (const step of flow.steps ?? []) {
        for (const need of step.needs ?? []) {
          expect(need).toMatch(format);
        }
      }
    }
  });

  it('every chain used in flows should have a capability mapping', () => {
    const allChains = new Set<string>();
    for (const file of flowFiles) {
      const flow = parseYaml(readFileSync(join(flowsDir, file), 'utf-8'));
      for (const step of flow.steps ?? []) {
        for (const chain of step.chains ?? []) {
          allChains.add(chain);
        }
      }
    }

    for (const chain of allChains) {
      expect(chainToCapability(chain)).toBeDefined();
    }
  });
});
