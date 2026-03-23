/**
 * E2E Test: Agent Activation Lifecycle
 *
 * Tests the complete activation journey of a scaffolded Soleri agent.
 * Mirrors the ops from the generated entry-point template (activate,
 * deactivate, inject_claude_md) using the core runtime and forge
 * template generators.
 *
 * Uses the same captureHandler/callOp pattern as full-pipeline.test.ts.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createAgentRuntime,
  createSemanticFacades,
  createDomainFacades,
  registerFacade,
} from '@soleri/core';
import type { FacadeConfig, OpDefinition, AgentRuntime } from '@soleri/core';
import { z } from 'zod';
import { scaffold, getEngineRulesContent, getEngineMarker } from '@soleri/forge/lib';

// ─── Agent config used throughout all journeys ───────────────────────

const AGENT_ID = 'e2e-activation';
const AGENT_NAME = 'TestBot';
const AGENT_ROLE = 'Testing Advisor';
const AGENT_DESCRIPTION = 'An agent for testing the activation lifecycle.';
const AGENT_DOMAINS = ['testing', 'quality'];
const AGENT_PRINCIPLES = ['Test everything', 'Fast feedback loops'];

// ─── Helpers (same pattern as full-pipeline.test.ts) ─────────────────

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

// ─── Activation logic (mirrors generated entry-point template) ───────
//
// The real agent wires these in its generated index.ts. For E2E testing
// we replicate the handler logic using @soleri/core directly, same as
// the generated code would after compilation.

interface ActivationResult {
  activated: boolean;
  origin: { name: string; role: string; description: string };
  current: {
    role: string;
    greeting: string;
    domains: string[];
    capabilities: Array<{ domain: string; entries: number }>;
    installed_packs: Array<{ id: string; type: string }>;
    what_you_can_do: string[];
    growth_suggestions: string[];
  };
  guidelines: string[];
  session_instruction: string;
  setup_status: {
    claude_md_injected: boolean;
    global_claude_md_injected: boolean;
    vault_has_entries: boolean;
    vault_entry_count: number;
  };
  executing_plans: Array<{ id: string; objective: string; tasks: number; completed: number }>;
  next_steps: string[];
}

interface DeactivationResult {
  deactivated: boolean;
  message: string;
}

interface InjectResult {
  injected: boolean;
  path: string;
  action: 'created' | 'updated' | 'appended';
  engineRules?: boolean;
}

const PERSONA = {
  name: AGENT_NAME,
  role: AGENT_ROLE,
  description: AGENT_DESCRIPTION,
  principles: AGENT_PRINCIPLES,
};

/**
 * Replicate activation logic from the generated activate.ts template.
 * This mirrors what generateActivate() produces when compiled.
 */
function activateAgent(runtime: AgentRuntime, projectPath: string): ActivationResult {
  const { vault, planner, identityManager } = runtime;

  const projectClaudeMd = join(projectPath, 'CLAUDE.md');
  const claudeMdInjected =
    existsSync(projectClaudeMd) &&
    readFileSync(projectClaudeMd, 'utf-8').includes(`<!-- ${AGENT_ID}:mode -->`);

  // We don't check real global CLAUDE.md in tests
  const globalClaudeMdInjected = false;

  const stats = vault.stats();
  const vaultHasEntries = stats.totalEntries > 0;

  const configuredDomains = [...AGENT_DOMAINS];
  const vaultDomains = Object.keys(stats.byDomain);
  const allDomains = [...new Set([...configuredDomains, ...vaultDomains])];

  const capabilities = allDomains.map((d) => ({
    domain: d,
    entries: stats.byDomain[d] ?? 0,
  }));

  const installedPacks: Array<{ id: string; type: string }> = [];
  try {
    const lockPath = join(projectPath, 'soleri.lock');
    if (existsSync(lockPath)) {
      const lockData = JSON.parse(readFileSync(lockPath, 'utf-8'));
      if (lockData.packs) {
        for (const [id, entry] of Object.entries(lockData.packs)) {
          installedPacks.push({ id, type: (entry as Record<string, string>).type ?? 'unknown' });
        }
      }
    }
  } catch {
    // No lock file
  }

  const currentIdentity = identityManager.getIdentity(AGENT_ID);
  const newDomains = allDomains.filter((d) => !configuredDomains.includes(d));
  let currentRole = currentIdentity?.role ?? PERSONA.role;
  if (newDomains.length > 0) {
    const formatted = newDomains.map((d) => d.replace(/-/g, ' ')).join(', ');
    currentRole = `${PERSONA.role} (also covering ${formatted})`;
  }

  let greeting = `Hello! I'm ${PERSONA.name}.`;
  if (allDomains.length > configuredDomains.length) {
    greeting += ` I started as a ${PERSONA.role} and have expanded to also cover ${newDomains.map((d) => d.replace(/-/g, ' ')).join(', ')}.`;
  } else {
    greeting += ` ${PERSONA.role} ready to help.`;
  }
  if (stats.totalEntries > 0) {
    const domainSummary = capabilities
      .filter((c) => c.entries > 0)
      .map((c) => `${c.entries} ${c.domain.replace(/-/g, ' ')}`)
      .join(', ');
    greeting += ` Vault: ${stats.totalEntries} entries (${domainSummary}).`;
  }

  const whatYouCanDo: string[] = [
    'Search and traverse a connected knowledge graph (vault) before every decision',
    'Create structured plans with approval gates and drift reconciliation',
    'Learn from sessions — brain tracks pattern strengths and recommends approaches',
    'Remember across conversations and projects (cross-project memory)',
    'Capture knowledge as typed entries with Zettelkasten links',
    'Run iterative validation loops until quality targets are met',
    'Orchestrate multi-step workflows: plan → execute → capture',
  ];

  for (const cap of capabilities) {
    if (cap.entries > 0) {
      whatYouCanDo.push(
        `${cap.domain.replace(/-/g, ' ')}: ${cap.entries} patterns and knowledge entries`,
      );
    }
  }

  for (const pack of installedPacks) {
    whatYouCanDo.push(
      `Pack "${pack.id}" (${pack.type}) installed — provides domain-specific intelligence`,
    );
  }

  const growthSuggestions: string[] = [];
  if (stats.totalEntries < 10) {
    growthSuggestions.push(
      'Vault has few entries — start capturing patterns to build your knowledge base',
    );
  }
  if (installedPacks.length === 0) {
    growthSuggestions.push(
      'No packs installed — try: soleri pack install <name> to add domain intelligence',
    );
    growthSuggestions.push('Available starter packs: soleri pack available');
  }
  if (allDomains.length <= 1) {
    growthSuggestions.push('Only one domain configured — add more with: soleri add-domain <name>');
  }

  const nextSteps: string[] = [];
  if (!globalClaudeMdInjected && !claudeMdInjected) {
    nextSteps.push(
      'No CLAUDE.md configured — run inject_claude_md with global: true for all projects, or without for this project only',
    );
  } else if (!globalClaudeMdInjected) {
    nextSteps.push(
      'Global CLAUDE.md not configured — run inject_claude_md with global: true to enable activation in all projects',
    );
  }
  if (!vaultHasEntries) {
    nextSteps.push(
      'Vault is empty — start capturing knowledge with the domain capture ops, or install a knowledge pack with soleri pack install',
    );
  }

  const executingPlans = planner
    ? planner.getExecuting().map((p) => ({
        id: p.id,
        objective: p.objective,
        tasks: p.tasks.length,
        completed: p.tasks.filter((t) => t.status === 'completed').length,
      }))
    : [];
  if (executingPlans.length > 0) {
    nextSteps.unshift(`${executingPlans.length} plan(s) in progress — use get_plan to review`);
  }

  if (nextSteps.length === 0) {
    nextSteps.push(`All set! ${AGENT_NAME} is ready.`);
  }

  return {
    activated: true,
    origin: {
      name: PERSONA.name,
      role: PERSONA.role,
      description: PERSONA.description,
    },
    current: {
      role: currentRole,
      greeting,
      domains: allDomains,
      capabilities,
      installed_packs: installedPacks,
      what_you_can_do: whatYouCanDo,
      growth_suggestions: growthSuggestions,
    },
    guidelines: AGENT_PRINCIPLES,
    session_instruction: `You are ${PERSONA.name}. Your origin role is ${PERSONA.role}, but you have grown — your current capabilities span: ${allDomains.join(', ')}. Adapt your expertise to match your actual knowledge. Reference patterns from the knowledge vault. Provide concrete examples. Flag anti-patterns with severity.`,
    setup_status: {
      claude_md_injected: claudeMdInjected,
      global_claude_md_injected: globalClaudeMdInjected,
      vault_has_entries: vaultHasEntries,
      vault_entry_count: stats.totalEntries,
    },
    executing_plans: executingPlans,
    next_steps: nextSteps,
  };
}

function deactivateAgent(): DeactivationResult {
  return {
    deactivated: true,
    message: `Goodbye! ${PERSONA.name} persona deactivated. Reverting to default behavior.`,
  };
}

/**
 * Inject CLAUDE.md into a directory — uses engine rules from @soleri/forge
 * and a minimal agent block with the marker.
 */
function injectClaudeMd(projectPath: string): InjectResult {
  const filePath = join(projectPath, 'CLAUDE.md');
  const engineContent = getEngineRulesContent();
  const agentContent = [
    `<!-- ${AGENT_ID}:mode -->`,
    '',
    `# ${AGENT_NAME} Mode`,
    '',
    `**Role:** ${AGENT_ROLE}`,
    `**Domains:** ${AGENT_DOMAINS.join(', ')}`,
    '',
    `<!-- /${AGENT_ID}:mode -->`,
  ].join('\n');

  const engineMarker = `<!-- ${getEngineMarker()} -->`;

  if (!existsSync(filePath)) {
    writeFileSync(filePath, engineContent + '\n\n' + agentContent + '\n', 'utf-8');
    return { injected: true, path: filePath, action: 'created', engineRules: true };
  }

  const existing = readFileSync(filePath, 'utf-8');

  // Check if already has engine rules
  const hasEngine = existing.includes(engineMarker);
  // Check if already has agent block
  const hasAgent = existing.includes(`<!-- ${AGENT_ID}:mode -->`);

  if (hasEngine && hasAgent) {
    return { injected: true, path: filePath, action: 'updated', engineRules: false };
  }

  let result = existing;
  let action: 'appended' | 'created' | 'updated' = 'appended';
  let engineRulesAdded = false;

  if (!hasEngine) {
    result += '\n\n' + engineContent;
    engineRulesAdded = true;
  }
  if (!hasAgent) {
    result += '\n\n' + agentContent;
  }

  writeFileSync(filePath, result + '\n', 'utf-8');
  return { injected: true, path: filePath, action, engineRules: engineRulesAdded };
}

function injectClaudeMdGlobal(globalDir: string): InjectResult {
  if (!existsSync(globalDir)) {
    mkdirSync(globalDir, { recursive: true });
  }
  return injectClaudeMd(globalDir);
}

function hasAgentMarker(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  return readFileSync(filePath, 'utf-8').includes(`<!-- ${AGENT_ID}:mode -->`);
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('E2E: agent-activation', () => {
  let runtime: AgentRuntime;
  let facades: FacadeConfig[];
  let handlers: Map<string, ReturnType<typeof captureHandler>>;
  const baseDir = join(tmpdir(), `soleri-e2e-activation-${Date.now()}`);
  const projectDir = join(baseDir, 'project');
  const globalClaudeDir = join(baseDir, 'global-claude');
  const plannerDir = join(baseDir, 'planner');

  beforeAll(() => {
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(globalClaudeDir, { recursive: true });
    mkdirSync(plannerDir, { recursive: true });

    runtime = createAgentRuntime({
      agentId: AGENT_ID,
      vaultPath: ':memory:',
      plansPath: join(plannerDir, 'plans.json'),
    });

    // Build agent-specific ops (mirrors generated entry-point)
    const agentOps: OpDefinition[] = [
      {
        name: 'health',
        description: 'Health check.',
        auth: 'read',
        handler: async () => {
          const s = runtime.vault.stats();
          return {
            status: 'ok',
            agent: { name: PERSONA.name, role: PERSONA.role },
            vault: { entries: s.totalEntries, domains: Object.keys(s.byDomain) },
          };
        },
      },
      {
        name: 'identity',
        description: 'Get agent identity.',
        auth: 'read',
        handler: async () => {
          const identity = runtime.identityManager.getIdentity(AGENT_ID);
          if (identity) return identity;
          return PERSONA;
        },
      },
      {
        name: 'activate',
        description: 'Activate agent persona.',
        auth: 'read',
        schema: z.object({
          projectPath: z.string().optional().default(projectDir),
          deactivate: z.boolean().optional(),
        }),
        handler: async (params) => {
          if (params.deactivate) {
            return deactivateAgent();
          }
          // Seed identity from PERSONA on first activation
          if (!runtime.identityManager.getIdentity(AGENT_ID)) {
            runtime.identityManager.setIdentity(AGENT_ID, {
              name: PERSONA.name,
              role: PERSONA.role,
              description: PERSONA.description ?? '',
              personality: PERSONA.principles ?? [],
              changedBy: 'system',
              changeReason: 'Initial identity seeded from PERSONA',
            });
          }
          return activateAgent(runtime, (params.projectPath as string) ?? projectDir);
        },
      },
      {
        name: 'inject_claude_md',
        description: 'Inject CLAUDE.md sections.',
        auth: 'write',
        schema: z.object({
          projectPath: z.string().optional().default(projectDir),
          global: z.boolean().optional(),
        }),
        handler: async (params) => {
          if (params.global) {
            return injectClaudeMdGlobal(globalClaudeDir);
          }
          return injectClaudeMd((params.projectPath as string) ?? projectDir);
        },
      },
    ];

    const agentFacade: FacadeConfig = {
      name: `${AGENT_ID}_core`,
      description: 'Agent-specific ops — health, identity, activation, CLAUDE.md injection.',
      ops: agentOps,
    };

    const semanticFacades = createSemanticFacades(runtime, AGENT_ID);
    const domainFacades = createDomainFacades(runtime, AGENT_ID, AGENT_DOMAINS);
    facades = [...semanticFacades, agentFacade, ...domainFacades];

    handlers = new Map();
    for (const facade of facades) {
      handlers.set(facade.name, captureHandler(facade));
    }
  });

  afterAll(() => {
    runtime.close();
    rmSync(baseDir, { recursive: true, force: true });
  });

  async function callOp(facadeName: string, op: string, params: Record<string, unknown> = {}) {
    const handler = handlers.get(facadeName);
    if (!handler) throw new Error(`No facade: ${facadeName}`);
    const raw = await handler({ op, params });
    return parseResponse(raw);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Journey 1: First-time activation
  // ═══════════════════════════════════════════════════════════════════

  describe('Journey 1: First-time activation', () => {
    let activationData: ActivationResult;

    it('should activate successfully on a fresh agent', async () => {
      const res = await callOp(`${AGENT_ID}_core`, 'activate', {
        projectPath: projectDir,
      });
      expect(res.success).toBe(true);
      activationData = res.data as ActivationResult;
      expect(activationData.activated).toBe(true);
    });

    it('should return origin with agent name, role, and description', () => {
      expect(activationData.origin).toEqual({
        name: AGENT_NAME,
        role: AGENT_ROLE,
        description: AGENT_DESCRIPTION,
      });
    });

    it('should return current with role and domains', () => {
      expect(activationData.current.role).toContain(AGENT_ROLE);
      expect(activationData.current.domains).toContain('testing');
      expect(activationData.current.domains).toContain('quality');
    });

    it('should have greeting that includes agent name', () => {
      expect(activationData.current.greeting).toContain(AGENT_NAME);
    });

    it('should show setup_status with no CLAUDE.md injected', () => {
      expect(activationData.setup_status.claude_md_injected).toBe(false);
      expect(activationData.setup_status.global_claude_md_injected).toBe(false);
    });

    it('should report empty vault on fresh agent', () => {
      expect(activationData.setup_status.vault_has_entries).toBe(false);
      expect(activationData.setup_status.vault_entry_count).toBe(0);
    });

    it('should suggest injecting CLAUDE.md in next_steps', () => {
      const claudeMdStep = activationData.next_steps.find((s) =>
        s.toLowerCase().includes('claude.md'),
      );
      expect(claudeMdStep).toBeDefined();
    });

    it('should suggest capturing knowledge when vault is empty', () => {
      const vaultStep = activationData.next_steps.find((s) =>
        s.toLowerCase().includes('vault is empty'),
      );
      expect(vaultStep).toBeDefined();
    });

    it('should list core capabilities in what_you_can_do', () => {
      const caps = activationData.current.what_you_can_do;
      expect(caps.length).toBeGreaterThanOrEqual(7);
      expect(caps.some((c) => c.includes('vault'))).toBe(true);
      expect(caps.some((c) => c.includes('plan'))).toBe(true);
      expect(caps.some((c) => c.includes('brain') || c.includes('Learn'))).toBe(true);
      expect(caps.some((c) => c.includes('memory') || c.includes('Remember'))).toBe(true);
      expect(caps.some((c) => c.includes('knowledge') || c.includes('Capture'))).toBe(true);
      expect(caps.some((c) => c.includes('loop') || c.includes('validation'))).toBe(true);
      expect(caps.some((c) => c.includes('Orchestrate') || c.includes('workflow'))).toBe(true);
    });

    it('should suggest installing packs when vault is empty', () => {
      const suggestions = activationData.current.growth_suggestions;
      expect(suggestions.some((s) => s.toLowerCase().includes('pack'))).toBe(true);
    });

    it('should suggest capturing patterns when vault has few entries', () => {
      const suggestions = activationData.current.growth_suggestions;
      expect(suggestions.some((s) => s.toLowerCase().includes('few entries'))).toBe(true);
    });

    it('should return guidelines matching agent principles', () => {
      expect(activationData.guidelines).toEqual(AGENT_PRINCIPLES);
    });

    it('should return session_instruction mentioning agent name and domains', () => {
      expect(activationData.session_instruction).toContain(AGENT_NAME);
      expect(activationData.session_instruction).toContain('testing');
      expect(activationData.session_instruction).toContain('quality');
    });

    it('should have no executing plans on fresh agent', () => {
      expect(activationData.executing_plans).toEqual([]);
    });

    it('should have empty installed_packs on fresh agent', () => {
      expect(activationData.current.installed_packs).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Journey 2: Activation with knowledge
  // ═══════════════════════════════════════════════════════════════════

  describe('Journey 2: Activation with knowledge', () => {
    let activationData: ActivationResult;

    it('should capture knowledge to vault first', async () => {
      const res1 = await callOp(`${AGENT_ID}_vault`, 'capture_knowledge', {
        entries: [
          {
            type: 'pattern',
            domain: 'testing',
            title: 'Unit Test Naming Convention',
            description: 'Use describe/it pattern with clear test names',
            severity: 'info',
            tags: ['testing', 'conventions'],
          },
        ],
      });
      expect(res1.success).toBe(true);

      const res2 = await callOp(`${AGENT_ID}_vault`, 'capture_knowledge', {
        entries: [
          {
            type: 'anti-pattern',
            domain: 'quality',
            title: 'Avoid Magic Numbers in Tests',
            description: 'Use named constants instead of magic numbers in assertions',
            severity: 'warning',
            tags: ['quality', 'readability'],
          },
        ],
      });
      expect(res2.success).toBe(true);

      // Also capture in a new domain to test vault-discovered domains
      const res3 = await callOp(`${AGENT_ID}_vault`, 'capture_knowledge', {
        entries: [
          {
            type: 'pattern',
            domain: 'performance',
            title: 'Benchmark Before Optimizing',
            description: 'Always measure before making performance changes',
            severity: 'info',
            tags: ['performance'],
          },
        ],
      });
      expect(res3.success).toBe(true);
    });

    it('should activate with updated vault state', async () => {
      const res = await callOp(`${AGENT_ID}_core`, 'activate', {
        projectPath: projectDir,
      });
      expect(res.success).toBe(true);
      activationData = res.data as ActivationResult;
    });

    it('should reflect vault entry count in setup_status', () => {
      expect(activationData.setup_status.vault_has_entries).toBe(true);
      expect(activationData.setup_status.vault_entry_count).toBeGreaterThanOrEqual(3);
    });

    it('should include vault-discovered domains beyond configured ones', () => {
      expect(activationData.current.domains).toContain('testing');
      expect(activationData.current.domains).toContain('quality');
      expect(activationData.current.domains).toContain('performance');
    });

    it('should reflect vault entry count in greeting', () => {
      expect(activationData.current.greeting).toContain('Vault:');
      expect(activationData.current.greeting).toMatch(/\d+ entries/);
    });

    it('should show domain-specific capabilities with entry counts', () => {
      const caps = activationData.current.capabilities;
      const testingCap = caps.find((c) => c.domain === 'testing');
      const qualityCap = caps.find((c) => c.domain === 'quality');
      const perfCap = caps.find((c) => c.domain === 'performance');

      expect(testingCap).toBeDefined();
      expect(testingCap!.entries).toBeGreaterThanOrEqual(1);
      expect(qualityCap).toBeDefined();
      expect(qualityCap!.entries).toBeGreaterThanOrEqual(1);
      expect(perfCap).toBeDefined();
      expect(perfCap!.entries).toBeGreaterThanOrEqual(1);
    });

    it('should mention new domains in what_you_can_do', () => {
      const caps = activationData.current.what_you_can_do;
      expect(caps.some((c) => c.includes('testing'))).toBe(true);
    });

    it('should reflect expanded role when new domains are discovered', () => {
      // The role should mention the new 'performance' domain
      expect(activationData.current.role).toContain('performance');
    });

    it('should not suggest vault is empty in next_steps anymore', () => {
      const vaultEmptyStep = activationData.next_steps.find((s) =>
        s.toLowerCase().includes('vault is empty'),
      );
      expect(vaultEmptyStep).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Journey 3: CLAUDE.md injection
  // ═══════════════════════════════════════════════════════════════════

  describe('Journey 3: CLAUDE.md injection', () => {
    it('should inject CLAUDE.md into project directory', async () => {
      const res = await callOp(`${AGENT_ID}_core`, 'inject_claude_md', {
        projectPath: projectDir,
      });
      expect(res.success).toBe(true);
      const data = res.data as InjectResult;
      expect(data.injected).toBe(true);
      expect(data.action).toBe('created');
    });

    it('should create CLAUDE.md with engine rules', () => {
      const claudeMdPath = join(projectDir, 'CLAUDE.md');
      expect(existsSync(claudeMdPath)).toBe(true);
      const content = readFileSync(claudeMdPath, 'utf-8');

      // Engine rules markers
      expect(content).toContain('<!-- soleri:engine-rules -->');
      expect(content).toContain('<!-- /soleri:engine-rules -->');

      // Engine rules content
      expect(content).toContain('Soleri Engine Rules');
      expect(content).toContain('Vault as Source of Truth');
      expect(content).toContain('Planning');
      expect(content).toContain('Clean Commits');
      expect(content).toContain('Knowledge Capture');
      expect(content).toContain('op:create_plan');
    });

    it('should create CLAUDE.md with agent block', () => {
      const content = readFileSync(join(projectDir, 'CLAUDE.md'), 'utf-8');

      // Agent markers
      expect(content).toContain(`<!-- ${AGENT_ID}:mode -->`);
      expect(content).toContain(`<!-- /${AGENT_ID}:mode -->`);

      // Agent identity
      expect(content).toContain(AGENT_NAME);
      expect(content).toContain(AGENT_ROLE);
    });

    it('should be idempotent — second injection does not duplicate content', async () => {
      const res = await callOp(`${AGENT_ID}_core`, 'inject_claude_md', {
        projectPath: projectDir,
      });
      expect(res.success).toBe(true);
      const data = res.data as InjectResult;
      expect(data.injected).toBe(true);
      // Should be 'updated' or similar — not creating duplicate
      expect(['updated', 'appended']).toContain(data.action);

      // Verify no duplicate markers
      const content = readFileSync(join(projectDir, 'CLAUDE.md'), 'utf-8');
      const engineMarkerCount = (content.match(/<!-- soleri:engine-rules -->/g) || []).length;
      const agentMarkerCount = (content.match(new RegExp(`<!-- ${AGENT_ID}:mode -->`, 'g')) || [])
        .length;
      expect(engineMarkerCount).toBe(1);
      expect(agentMarkerCount).toBe(1);
    });

    it('should detect agent marker exists in CLAUDE.md', () => {
      const claudeMdPath = join(projectDir, 'CLAUDE.md');
      expect(hasAgentMarker(claudeMdPath)).toBe(true);
    });

    it('should inject into global CLAUDE.md (simulated with temp dir)', async () => {
      const res = await callOp(`${AGENT_ID}_core`, 'inject_claude_md', {
        global: true,
      });
      expect(res.success).toBe(true);
      const data = res.data as InjectResult;
      expect(data.injected).toBe(true);
      expect(data.action).toBe('created');

      // Verify global file was created
      const globalClaudeMdPath = join(globalClaudeDir, 'CLAUDE.md');
      expect(existsSync(globalClaudeMdPath)).toBe(true);
      const content = readFileSync(globalClaudeMdPath, 'utf-8');
      expect(content).toContain('<!-- soleri:engine-rules -->');
      expect(content).toContain(`<!-- ${AGENT_ID}:mode -->`);
    });

    it('activation should now detect CLAUDE.md is injected', async () => {
      const res = await callOp(`${AGENT_ID}_core`, 'activate', {
        projectPath: projectDir,
      });
      expect(res.success).toBe(true);
      const data = res.data as ActivationResult;
      expect(data.setup_status.claude_md_injected).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Journey 4: Deactivation
  // ═══════════════════════════════════════════════════════════════════

  describe('Journey 4: Deactivation', () => {
    it('should activate first to confirm active state', async () => {
      const res = await callOp(`${AGENT_ID}_core`, 'activate', {
        projectPath: projectDir,
      });
      expect(res.success).toBe(true);
      expect((res.data as ActivationResult).activated).toBe(true);
    });

    it('should deactivate successfully', async () => {
      const res = await callOp(`${AGENT_ID}_core`, 'activate', {
        deactivate: true,
      });
      expect(res.success).toBe(true);
      const data = res.data as DeactivationResult;
      expect(data.deactivated).toBe(true);
    });

    it('should return cleanup message mentioning agent name', async () => {
      const res = await callOp(`${AGENT_ID}_core`, 'activate', {
        deactivate: true,
      });
      const data = res.data as DeactivationResult;
      expect(data.message).toContain(AGENT_NAME);
      expect(data.message).toContain('deactivated');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Journey 5: Activation with executing plans
  // ═══════════════════════════════════════════════════════════════════

  describe('Journey 5: Activation with executing plans', () => {
    let planId: string;

    it('should create and approve a plan into executing state', async () => {
      const createRes = await callOp(`${AGENT_ID}_plan`, 'create_plan', {
        title: 'Activation Test Plan',
        objective: 'Validate plan detection during activation',
        scope: 'E2E testing',
        tasks: [
          { title: 'Task 1', description: 'First task' },
          { title: 'Task 2', description: 'Second task' },
        ],
      });
      expect(createRes.success).toBe(true);
      const planData = createRes.data as { plan: { id: string } };
      planId = planData.plan.id;

      // Approve with startExecution to put plan into 'executing' state
      const approveRes = await callOp(`${AGENT_ID}_plan`, 'approve_plan', {
        planId,
        startExecution: true,
      });
      expect(approveRes.success).toBe(true);
      const approveData = approveRes.data as { executing: boolean };
      expect(approveData.executing).toBe(true);
    });

    it('should detect executing plans on activation', async () => {
      const res = await callOp(`${AGENT_ID}_core`, 'activate', {
        projectPath: projectDir,
      });
      expect(res.success).toBe(true);
      const data = res.data as ActivationResult;

      expect(data.executing_plans.length).toBeGreaterThanOrEqual(1);
      const plan = data.executing_plans.find((p) => p.id === planId);
      expect(plan).toBeDefined();
      expect(plan!.objective).toBe('Validate plan detection during activation');
      expect(plan!.tasks).toBe(2);
    });

    it('should include plan reminder in next_steps', async () => {
      const res = await callOp(`${AGENT_ID}_core`, 'activate', {
        projectPath: projectDir,
      });
      const data = res.data as ActivationResult;

      const planStep = data.next_steps.find(
        (s) => s.toLowerCase().includes('plan') && s.toLowerCase().includes('progress'),
      );
      expect(planStep).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Edge Cases
  // ═══════════════════════════════════════════════════════════════════

  describe('Edge cases', () => {
    it('should activate without crashing on a fresh agent with no vault entries', async () => {
      // Create a separate runtime with empty vault
      const emptyPlanDir = join(baseDir, 'empty-planner');
      mkdirSync(emptyPlanDir, { recursive: true });
      const emptyRuntime = createAgentRuntime({
        agentId: 'e2e-empty',
        vaultPath: ':memory:',
        plansPath: join(emptyPlanDir, 'plans.json'),
      });

      try {
        // Directly test the activation function rather than through facade
        const emptyProjectDir = join(baseDir, 'empty-project');
        mkdirSync(emptyProjectDir, { recursive: true });

        // Manually simulate activation with empty state
        const stats = emptyRuntime.vault.stats();
        expect(stats.totalEntries).toBe(0);

        // The function should not throw
        const result = activateAgent(emptyRuntime, emptyProjectDir);
        expect(result.activated).toBe(true);
        expect(result.setup_status.vault_has_entries).toBe(false);
        expect(result.setup_status.vault_entry_count).toBe(0);
        expect(result.executing_plans).toEqual([]);
      } finally {
        emptyRuntime.close();
        rmSync(emptyPlanDir, { recursive: true, force: true });
      }
    });

    it('should detect existing CLAUDE.md during activation', async () => {
      // CLAUDE.md was injected in Journey 3
      const res = await callOp(`${AGENT_ID}_core`, 'activate', {
        projectPath: projectDir,
      });
      expect(res.success).toBe(true);
      const data = res.data as ActivationResult;
      expect(data.setup_status.claude_md_injected).toBe(true);
    });

    it('should be idempotent — double activation returns same structure', async () => {
      const res1 = await callOp(`${AGENT_ID}_core`, 'activate', {
        projectPath: projectDir,
      });
      const res2 = await callOp(`${AGENT_ID}_core`, 'activate', {
        projectPath: projectDir,
      });

      expect(res1.success).toBe(true);
      expect(res2.success).toBe(true);

      const data1 = res1.data as ActivationResult;
      const data2 = res2.data as ActivationResult;

      // Same structure and values
      expect(data1.activated).toBe(data2.activated);
      expect(data1.origin).toEqual(data2.origin);
      expect(data1.current.role).toBe(data2.current.role);
      expect(data1.current.domains).toEqual(data2.current.domains);
      expect(data1.setup_status).toEqual(data2.setup_status);
      expect(data1.guidelines).toEqual(data2.guidelines);
    });

    it('should discover new domains from vault that were not in config', async () => {
      // We already captured a 'performance' entry in Journey 2
      const res = await callOp(`${AGENT_ID}_core`, 'activate', {
        projectPath: projectDir,
      });
      const data = res.data as ActivationResult;

      // 'performance' was NOT in the original config domains
      expect(AGENT_DOMAINS).not.toContain('performance');
      // But it should appear in the activation response
      expect(data.current.domains).toContain('performance');
    });

    it('should handle activation with projectPath pointing to non-existent dir', async () => {
      const fakePath = join(baseDir, 'non-existent-dir');
      const res = await callOp(`${AGENT_ID}_core`, 'activate', {
        projectPath: fakePath,
      });
      // Should not crash — just report no CLAUDE.md
      expect(res.success).toBe(true);
      const data = res.data as ActivationResult;
      expect(data.setup_status.claude_md_injected).toBe(false);
    });

    it('should return unknown op error for invalid operation', async () => {
      const res = await callOp(`${AGENT_ID}_core`, 'nonexistent_op');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Unknown operation');
    });

    it('health op should work alongside activation', async () => {
      const res = await callOp(`${AGENT_ID}_core`, 'health');
      expect(res.success).toBe(true);
      const data = res.data as { status: string; agent: { name: string; role: string } };
      expect(data.status).toBe('ok');
      expect(data.agent.name).toBe(AGENT_NAME);
      expect(data.agent.role).toBe(AGENT_ROLE);
    });

    it('identity op should return seeded identity after activation', async () => {
      const res = await callOp(`${AGENT_ID}_core`, 'identity');
      expect(res.success).toBe(true);
      const data = res.data as { name: string; role: string };
      expect(data.name).toBe(AGENT_NAME);
      expect(data.role).toBe(AGENT_ROLE);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Scaffold integration (verify forge output is consistent)
  // ═══════════════════════════════════════════════════════════════════

  describe('Scaffold integration', () => {
    it('should verify engine rules content matches what inject uses', () => {
      const engineContent = getEngineRulesContent();
      expect(engineContent).toContain('<!-- soleri:engine-rules -->');
      expect(engineContent).toContain('Vault as Source of Truth');
      expect(engineContent).toContain('Planning');
      expect(engineContent).toContain('Clean Commits');
      expect(engineContent).toContain('<!-- /soleri:engine-rules -->');
    });

    it('should verify engine marker is consistent', () => {
      const marker = getEngineMarker();
      expect(marker).toBe('soleri:engine-rules');
    });
  });
});
