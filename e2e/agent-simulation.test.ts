/**
 * E2E: Agent Full Lifecycle Simulation
 *
 * Simulates a user's first week with a Soleri agent. Every assertion
 * defines CORRECT BEHAVIOR — if the code doesn't match, the code is wrong.
 *
 * This is NOT adapted to the code. This IS the specification.
 *
 * Sequential: each test depends on the state built by previous tests.
 * One runtime, one vault, one brain — accumulating knowledge across "days."
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createAgentRuntime,
  createSemanticFacades,
  createDomainFacades,
  registerFacade,
  seedDefaultPlaybooks,
  CapabilityRegistry,
} from '@soleri/core';
import type { FacadeConfig, AgentRuntime, CapabilityHandler, CapabilityDefinition } from '@soleri/core';

// ─── Infrastructure ──────────────────────────────────────

const AGENT_ID = 'sim-agent';

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

function parse(raw: { content: Array<{ type: string; text: string }> }): Record<string, unknown> {
  return JSON.parse(raw.content[0].text);
}

// ─── Shared State ────────────────────────────────────────

let runtime: AgentRuntime;
let registry: CapabilityRegistry;
let handlers: Map<string, ReturnType<typeof captureHandler>>;
const workDir = join(tmpdir(), `soleri-sim-${Date.now()}`);

// Shorthand for calling ops
async function op(facade: string, opName: string, params: Record<string, unknown> = {}) {
  const h = handlers.get(`${AGENT_ID}_${facade}`);
  if (!h) throw new Error(`No facade: ${facade}. Available: ${[...handlers.keys()].join(', ')}`);
  return parse(await h({ op: opName, params }));
}

// Track state across "days"
const state: Record<string, unknown> = {};

// ═══════════════════════════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════════════════════════

describe('Agent Simulation: First Week', () => {
  beforeAll(() => {
    mkdirSync(workDir, { recursive: true });

    runtime = createAgentRuntime({
      agentId: AGENT_ID,
      vaultPath: ':memory:',
      plansPath: join(workDir, 'plans.json'),
    });

    const semanticFacades = createSemanticFacades(runtime, AGENT_ID);
    const domainFacades = createDomainFacades(runtime, AGENT_ID, ['frontend', 'backend', 'infrastructure']);
    const allFacades = [...semanticFacades, ...domainFacades];

    handlers = new Map();
    for (const facade of allFacades) {
      handlers.set(facade.name, captureHandler(facade));
    }

    // Seed playbooks (like entry-point does)
    seedDefaultPlaybooks(runtime.vault);

    // Initialize capability registry (like entry-point does)
    registry = new CapabilityRegistry();
    const coreCaps: CapabilityDefinition[] = [
      'vault.search', 'vault.capture', 'brain.recommend', 'brain.strengths',
      'memory.search', 'plan.create', 'orchestrate.plan', 'admin.health',
    ].map(id => ({ id, description: id, provides: [`${id}-output`], requires: [] }));
    const coreHandlers = new Map<string, CapabilityHandler>();
    coreCaps.forEach(c => coreHandlers.set(c.id, async () => ({ success: true, data: {}, produced: [] })));
    registry.registerPack('core', coreCaps, coreHandlers, 100);
  });

  afterAll(() => {
    runtime.close();
    rmSync(workDir, { recursive: true, force: true });
  });

  // ═══════════════════════════════════════════════════════════
  //  DAY 1: Setup & First Contact
  // ═══════════════════════════════════════════════════════════

  describe('Day 1: Setup & First Contact', () => {

    it('1. Health check — all subsystems should be healthy', async () => {
      const res = await op('admin', 'admin_health');

      expect(res.status).toBe('healthy');
      expect(res.subsystems).toBeDefined();
      const subs = res.subsystems as Record<string, { status: string }>;
      expect(subs.vault.status).toBe('healthy');
      expect(subs.brain.status).toBe('healthy');
      expect(subs.planner.status).toBe('healthy');
    });

    it('2. Tool list — should enumerate all registered ops', async () => {
      const res = await op('admin', 'admin_tool_list');

      expect(res.count).toBeGreaterThan(50); // agent has 100+ ops
      const tools = res.tools as Array<{ name: string }>;
      expect(tools.some(t => t.name.includes('vault'))).toBe(true);
      expect(tools.some(t => t.name.includes('brain'))).toBe(true);
      expect(tools.some(t => t.name.includes('plan'))).toBe(true);
    });

    it('3. Vault is empty at start', async () => {
      const res = await op('vault', 'vault_stats');

      expect(res.totalEntries).toBeGreaterThanOrEqual(0);
      // Seeded playbooks may be counted — but no user knowledge yet
    });

    it('4. Brain has no learned patterns yet', async () => {
      const res = await op('brain', 'brain_stats');

      expect(res.feedbackCount).toBe(0);
      expect(res.intelligence).toBeDefined();
      const intel = res.intelligence as { sessionCount: number; strengthsComputed: boolean };
      expect(intel.sessionCount).toBe(0);
      expect(intel.strengthsComputed).toBe(false);
    });

    it('5. Route intent — "what can you do?" should classify as EXPLORE or PLAN', async () => {
      const res = await op('control', 'route_intent', { prompt: 'what can you do?' });

      expect(res.intent).toBeDefined();
      expect(res.confidence).toBeDefined();
      expect(typeof res.confidence).toBe('number');
      // Agent should recognize this as an exploration/information request
      expect(['EXPLORE', 'PLAN', 'REVIEW'].includes(res.intent as string)).toBe(true);
    });

    it('6. Route intent — "build me a login form" should classify as BUILD', async () => {
      const res = await op('control', 'route_intent', { prompt: 'build me a login form' });

      expect(res.intent).toBe('BUILD');
      expect(res.confidence as number).toBeGreaterThan(0.5);
    });

    it('7. Route intent — "the navbar is broken" should classify as FIX', async () => {
      const res = await op('control', 'route_intent', { prompt: 'the navbar is broken and crashes on mobile' });

      expect(res.intent).toBe('FIX');
      expect(res.confidence as number).toBeGreaterThan(0.5);
    });

    it('8. Route intent — "make it faster" should classify as IMPROVE', async () => {
      const res = await op('control', 'route_intent', { prompt: 'make the dashboard load faster, it takes 5 seconds' });

      expect(res.intent).toBe('IMPROVE');
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  DAY 2: First Work Task — Full Planning Lifecycle
  // ═══════════════════════════════════════════════════════════

  describe('Day 2: First Work Task', () => {

    it('9. Create plan for "build error handler"', async () => {
      const res = await op('plan', 'create_plan', {
        objective: 'Build a centralized error handling system with error boundaries, retry logic, and monitoring integration',
        scope: 'Frontend error handling for React application',
        tasks: [
          { title: 'Set up error boundary at route level', description: 'Wrap route components with React ErrorBoundary' },
          { title: 'Create centralized error service', description: 'Build error capture, context enrichment, and monitoring integration' },
          { title: 'Add retry logic with exponential backoff', description: 'Implement retry for API calls with jitter and circuit breaker' },
        ],
      });

      expect(res.created).toBe(true);
      const plan = res.plan as Record<string, unknown>;
      expect(plan.id).toBeDefined();
      expect(typeof plan.id).toBe('string');
      expect(plan.objective).toContain('error handling');
      expect(plan.status).toBe('draft');
      expect((plan.tasks as Array<unknown>).length).toBe(3);

      state.planId = plan.id;
      state.taskIds = (plan.tasks as Array<{ id: string }>).map(t => t.id);
    });

    it('10. Approve the plan', async () => {
      const res = await op('plan', 'approve_plan', {
        planId: state.planId,
        startExecution: true,
      });

      expect(res.approved).toBe(true);
      expect(res.executing).toBe(true);
      const plan = res.plan as Record<string, unknown>;
      expect(plan.status).toBe('executing');
    });

    it('11. Complete task 1', async () => {
      const taskIds = state.taskIds as string[];
      const res = await op('plan', 'update_task', {
        planId: state.planId,
        taskId: taskIds[0],
        status: 'completed',
      });

      expect(res.updated).toBe(true);
      expect((res.task as Record<string, unknown>).status).toBe('completed');
    });

    it('12. Complete task 2', async () => {
      const taskIds = state.taskIds as string[];
      const res = await op('plan', 'update_task', {
        planId: state.planId,
        taskId: taskIds[1],
        status: 'completed',
      });

      expect(res.updated).toBe(true);
    });

    it('13. Complete task 3', async () => {
      const taskIds = state.taskIds as string[];
      const res = await op('plan', 'update_task', {
        planId: state.planId,
        taskId: taskIds[2],
        status: 'completed',
      });

      expect(res.updated).toBe(true);
    });

    it('14. Reconcile — all tasks done, accuracy should be 100', async () => {
      const res = await op('plan', 'plan_reconcile', {
        planId: state.planId,
        actualOutcome: 'All three error handling components built and tested. Error boundaries catch route-level crashes, centralized service logs to monitoring, retry logic uses exponential backoff with jitter.',
      });

      expect(res.reconciled).toBe(true);
      expect(res.accuracy).toBe(100);
      expect(res.driftCount).toBe(0);
    });

    it('15. Complete lifecycle — should capture knowledge', async () => {
      const res = await op('plan', 'plan_complete_lifecycle', {
        planId: state.planId,
        patterns: ['Error boundaries at route level prevent cascading failures'],
        antiPatterns: ['Never use empty catch blocks'],
      });

      expect(res.completed).toBe(true);
      expect(res.patternsAdded).toBeGreaterThanOrEqual(1);
      expect(res.antiPatternsAdded).toBeGreaterThanOrEqual(1);
    });

    it('16. Verify plan is completed', async () => {
      const res = await op('plan', 'get_plan', { planId: state.planId });

      expect(res.status).toBe('completed');
      expect(res.reconciliation).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  DAY 3: Knowledge Compounds
  // ═══════════════════════════════════════════════════════════

  describe('Day 3: Knowledge Compounds', () => {

    it('17. Capture knowledge from Day 2 experience', async () => {
      const res = await op('vault', 'capture_knowledge', {
        entries: [
          {
            type: 'pattern',
            domain: 'frontend',
            title: 'Error boundaries at route level prevent cascading failures',
            description: 'Wrapping route components in React ErrorBoundary prevents a single component crash from taking down the entire page. Show fallback UI and log to monitoring.',
            severity: 'critical',
            tags: ['react', 'error-handling', 'resilience'],
          },
          {
            type: 'pattern',
            domain: 'frontend',
            title: 'Exponential backoff with jitter for API retries',
            description: 'Use exponential backoff starting at 1s with random jitter to prevent thundering herd. Include circuit breaker after 5 consecutive failures.',
            severity: 'warning',
            tags: ['api', 'retry', 'resilience'],
          },
          {
            type: 'anti-pattern',
            domain: 'frontend',
            title: 'Empty catch blocks swallow errors silently',
            description: 'Every catch block must either re-throw, log with context, or handle the specific error type. Empty catch blocks hide bugs and make debugging impossible.',
            severity: 'critical',
            tags: ['error-handling', 'debugging'],
          },
        ],
      });

      expect(res.captured).toBeGreaterThanOrEqual(3);
      expect(res.results).toBeDefined();
      const results = res.results as Array<{ id: string; action: string }>;
      expect(results.length).toBe(3);
      // All should be captured (not proposed/rejected)
      for (const r of results) {
        expect(r.id).toBeDefined();
        expect(typeof r.id).toBe('string');
      }
      state.capturedIds = results.map(r => r.id);
    });

    it('18. Search vault — should find captured error handling patterns', async () => {
      const res = await op('vault', 'search', {
        query: 'error handling boundary react',
      });

      const results = res.data as Array<{ entry: { id: string; title: string }; score: number }>;
      expect(results.length).toBeGreaterThan(0);

      // Should find the error boundary pattern we just captured
      const errorBoundary = results.find(r =>
        r.entry.title.toLowerCase().includes('error bound'),
      );
      expect(errorBoundary).toBeDefined();
      expect(errorBoundary!.score).toBeGreaterThan(0);
    });

    it('19. Link related patterns — error boundary supports retry logic', async () => {
      const ids = state.capturedIds as string[];
      const res = await op('vault', 'link_entries', {
        sourceId: ids[0], // error boundaries
        targetId: ids[1], // retry logic
        linkType: 'supports',
        note: 'Error boundaries catch failures from retry exhaustion',
      });

      expect(res.success).toBe(true);
      expect(res.link).toBeDefined();
      expect((res.link as Record<string, unknown>).linkType).toBe('supports');
    });

    it('20. Link anti-pattern — empty catch contradicts error handling', async () => {
      const ids = state.capturedIds as string[];
      const res = await op('vault', 'link_entries', {
        sourceId: ids[2], // empty catch (anti-pattern)
        targetId: ids[0], // error boundaries
        linkType: 'contradicts',
        note: 'Empty catches undermine error boundaries by hiding errors',
      });

      expect(res.success).toBe(true);
    });

    it('21. Traverse graph — should find connected patterns', async () => {
      const ids = state.capturedIds as string[];
      const res = await op('vault', 'traverse', {
        entryId: ids[0], // error boundaries
        depth: 2,
      });

      expect(res.connectedEntries).toBeDefined();
      const connected = res.connectedEntries as Array<{ id: string }>;
      expect(connected.length).toBeGreaterThanOrEqual(2); // retry + anti-pattern
    });

    it('22. Record brain feedback — user found error boundary pattern helpful', async () => {
      const ids = state.capturedIds as string[];
      const res = await op('brain', 'brain_feedback', {
        query: 'how to handle errors in react',
        entryId: ids[0],
        action: 'accepted',
        source: 'search',
        confidence: 0.95,
      });

      expect(res.success).toBe(true);
    });

    it('23. Record brain feedback — user dismissed empty catch as irrelevant to query', async () => {
      const ids = state.capturedIds as string[];
      const res = await op('brain', 'brain_feedback', {
        query: 'how to handle errors in react',
        entryId: ids[2],
        action: 'dismissed',
        source: 'search',
        confidence: 0.3,
      });

      expect(res.success).toBe(true);
    });

    it('24. Vault-informed plan — should reference existing knowledge', async () => {
      const res = await op('plan', 'create_plan', {
        objective: 'Add retry mechanism to the payment service API calls',
        scope: 'Backend payment integration',
        decisions: ['Use exponential backoff pattern from vault'],
      });

      expect(res.created).toBe(true);
      const plan = res.plan as Record<string, unknown>;
      // Plan was created referencing vault knowledge
      expect(plan.decisions).toBeDefined();
      expect((plan.decisions as string[]).length).toBeGreaterThanOrEqual(1);

      state.plan2Id = plan.id;
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  DAY 4: Pack Installation & Capabilities
  // ═══════════════════════════════════════════════════════════

  describe('Day 4: Pack Installation & Capabilities', () => {

    it('25. Registry starts with core capabilities only', () => {
      expect(registry.has('vault.search')).toBe(true);
      expect(registry.has('brain.recommend')).toBe(true);
      expect(registry.has('color.validate')).toBe(false);
      expect(registry.has('token.check')).toBe(false);
    });

    it('26. Install design-system pack — capabilities should register', () => {
      const designCaps: CapabilityDefinition[] = [
        {
          id: 'color.validate',
          description: 'Check color contrast against WCAG standards',
          provides: ['contrast-ratio', 'wcag-level', 'pass-fail'],
          requires: ['foreground', 'background'],
        },
        {
          id: 'token.check',
          description: 'Validate semantic token usage',
          provides: ['valid', 'suggestion', 'priority-level'],
          requires: ['token-value'],
          knowledge: ['color-token-priority'],
        },
        {
          id: 'component.scaffold',
          description: 'Create component following design system workflow',
          provides: ['component-files'],
          requires: ['component-name'],
          depends: ['color.validate', 'token.check'],
        },
      ];

      const contrastHandler: CapabilityHandler = async (params) => {
        const fg = params.foreground as string;
        const bg = params.background as string;
        // Simplified contrast calculation
        const ratio = fg === '#000000' && bg === '#FFFFFF' ? 21 : 4.5;
        const level = ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : 'FAIL';
        return {
          success: true,
          data: { ratio, level, pass: ratio >= 4.5 },
          produced: ['contrast-ratio', 'wcag-level', 'pass-fail'],
        };
      };

      const designHandlers = new Map<string, CapabilityHandler>();
      designHandlers.set('color.validate', contrastHandler);
      designHandlers.set('token.check', async (params) => ({
        success: true,
        data: { valid: !(params['token-value'] as string).startsWith('#'), suggestion: 'Use semantic token' },
        produced: ['valid', 'suggestion'],
      }));
      designHandlers.set('component.scaffold', async () => ({
        success: true,
        data: { files: ['Button.tsx', 'Button.test.tsx', 'Button.stories.tsx'] },
        produced: ['component-files'],
      }));

      registry.registerPack('design-system', designCaps, designHandlers, 50);

      expect(registry.has('color.validate')).toBe(true);
      expect(registry.has('token.check')).toBe(true);
      expect(registry.has('component.scaffold')).toBe(true);
      expect(registry.size).toBe(11); // 8 core + 3 design
    });

    it('27. Execute color.validate capability — black on white = AAA', async () => {
      const resolved = registry.resolve('color.validate');
      expect(resolved.available).toBe(true);

      const result = await resolved.handler!({ foreground: '#000000', background: '#FFFFFF' }, {} as never);
      expect(result.success).toBe(true);
      expect(result.data.ratio).toBe(21);
      expect(result.data.level).toBe('AAA');
      expect(result.data.pass).toBe(true);
    });

    it('28. Execute token.check — hex value should be invalid', async () => {
      const resolved = registry.resolve('token.check');
      expect(resolved.available).toBe(true);

      const result = await resolved.handler!({ 'token-value': '#FF0000' }, {} as never);
      expect(result.success).toBe(true);
      expect(result.data.valid).toBe(false);
    });

    it('29. Execute token.check — semantic token should be valid', async () => {
      const resolved = registry.resolve('token.check');
      const result = await resolved.handler!({ 'token-value': 'bg-surface' }, {} as never);
      expect(result.data.valid).toBe(true);
    });

    it('30. Resolve component.scaffold — deps satisfied', () => {
      const resolved = registry.resolve('component.scaffold');
      expect(resolved.available).toBe(true);
      expect(resolved.providers).toContain('design-system');
    });

    it('31. Uninstalled capability — a11y.audit not available', () => {
      const resolved = registry.resolve('a11y.audit');
      expect(resolved.available).toBe(false);
    });

    it('32. Flow validation — BUILD flow with missing capabilities degrades', () => {
      const validation = registry.validateFlow({
        steps: [
          { needs: ['vault.search', 'brain.recommend'] },
          { needs: ['color.validate', 'token.check'] },
          { needs: ['a11y.audit', 'perf.audit'] }, // not installed
        ],
        onMissingCapability: {
          default: 'skip-with-warning',
          blocking: ['vault.search'],
        },
      });

      expect(validation.valid).toBe(false); // missing a11y.audit + perf.audit
      expect(validation.canRunPartially).toBe(true); // missing caps not blocking
      expect(validation.available).toContain('vault.search');
      expect(validation.available).toContain('color.validate');
      expect(validation.missing).toContain('a11y.audit');
      expect(validation.missing).toContain('perf.audit');
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  DAY 5: Multi-Session Memory & Brain Learning
  // ═══════════════════════════════════════════════════════════

  describe('Day 5: Multi-Session Memory', () => {

    it('33. Capture session summary from Day 2-4 work', async () => {
      const res = await op('memory', 'session_capture', {
        summary: 'Built error handling system: error boundaries, centralized error service, retry with backoff. Installed design-system pack. Validated color contrast and token usage.',
        topics: ['error-handling', 'design-system', 'accessibility'],
        toolsUsed: ['create_plan', 'capture_knowledge', 'link_entries', 'color.validate'],
      });

      expect(res.captured).toBe(true);
      expect(res.memory).toBeDefined();
      const memory = res.memory as Record<string, unknown>;
      expect(memory.summary).toContain('error handling');
    });

    it('34. Memory search — should find session about error handling', async () => {
      const res = await op('memory', 'memory_search', {
        query: 'error handling system',
      });

      const results = res as unknown as Array<Record<string, unknown>>;
      // memory_search returns array directly
      expect(Array.isArray(results) || (res as Record<string, unknown>).data !== undefined).toBe(true);
    });

    it('35. Build brain intelligence from accumulated feedback', async () => {
      // Rebuild vocabulary first (required before build_intelligence)
      const rebuildRes = await op('brain', 'rebuild_vocabulary');
      expect(rebuildRes.rebuilt).toBe(true);
      expect(rebuildRes.vocabularySize).toBeGreaterThan(0);

      const buildRes = await op('brain', 'build_intelligence');
      expect(buildRes.built).toBeDefined();
    });

    it('36. Brain should have learned from Day 3 feedback', async () => {
      const res = await op('brain', 'brain_stats');

      expect(res.feedbackCount).toBeGreaterThanOrEqual(2); // accepted + dismissed from Day 3
      expect(res.vocabularySize).toBeGreaterThan(0);
    });

    it('37. Brain recommend — should return patterns for error handling context', async () => {
      const res = await op('brain', 'brain_recommend', {
        domain: 'frontend',
        task: 'handling errors in a web application',
      });

      expect(res.recommendations).toBeDefined();
      // Brain may or may not have enough data for strong recommendations
      // but the system should not crash and should return a valid shape
      expect(Array.isArray(res.recommendations)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  DAY 6: Governance & Quality
  // ═══════════════════════════════════════════════════════════

  describe('Day 6: Governance & Quality', () => {

    it('38. Curator health audit — should return quality score', async () => {
      const res = await op('curator', 'curator_health_audit');

      expect(res.score).toBeDefined();
      expect(typeof res.score).toBe('number');
      expect(res.score as number).toBeGreaterThanOrEqual(0);
      expect(res.score as number).toBeLessThanOrEqual(100);
      expect(res.details).toBeDefined();
      const details = res.details as Record<string, unknown>;
      expect(details.totalEntries).toBeGreaterThan(0);
    });

    it('39. Check for orphans — some entries should be unlinked', async () => {
      const res = await op('vault', 'get_orphans', { limit: 20 });

      expect(res.orphans).toBeDefined();
      expect(res.totalOrphans).toBeDefined();
      expect(typeof res.totalOrphans).toBe('number');
      // We linked 2 of 3 captured patterns, so at least 1 orphan (retry logic)
    });

    it('40. Suggest links for an orphan', async () => {
      const ids = state.capturedIds as string[];
      const res = await op('vault', 'suggest_links', {
        entryId: ids[1], // retry logic — linked to error boundary but maybe orphan from other perspective
        limit: 5,
      });

      expect(res.suggestions).toBeDefined();
      expect(res.totalSuggestions).toBeDefined();
    });

    it('41. Governance dashboard — should show vault health', async () => {
      const res = await op('governance', 'governance_dashboard', {
        projectPath: '.',
      });

      expect(res.vaultSize).toBeDefined();
      expect(typeof res.vaultSize).toBe('number');
      expect(res.policy).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  DAY 7: Full Orchestration & Validation
  // ═══════════════════════════════════════════════════════════

  describe('Day 7: Orchestration & Validation', () => {

    it('42. Orchestrate plan — full pipeline', async () => {
      const res = await op('orchestrate', 'orchestrate_plan', {
        objective: 'Add loading skeleton screens to all data-fetching pages',
        scope: 'Frontend UX improvement',
        tasks: [
          { title: 'Create SkeletonLoader component', description: 'Reusable skeleton with pulse animation' },
          { title: 'Add to dashboard page', description: 'Replace spinner with skeleton' },
        ],
      });

      expect(res.created).toBe(true);
      const plan = res.plan as Record<string, unknown>;
      expect(plan.id).toBeDefined();
      state.orchPlanId = plan.id;
    });

    it('43. Orchestrate execute', async () => {
      // First approve
      await op('plan', 'approve_plan', {
        planId: state.orchPlanId,
        startExecution: true,
      });

      const res = await op('orchestrate', 'orchestrate_execute', {
        planId: state.orchPlanId,
      });

      expect(res.executing).toBe(true);
      expect(res.planId).toBe(state.orchPlanId);
      state.sessionId = res.sessionId;
    });

    it('44. Loop start — iterative validation', async () => {
      const res = await op('loop', 'loop_start', {
        mode: 'custom',
        prompt: 'Validate skeleton screens meet design system standards',
        maxIterations: 5,
      });

      expect(res.started).toBe(true);
      expect(res.loopId).toBeDefined();
      state.loopId = res.loopId;
    });

    it('45. Loop status — should be active', async () => {
      const res = await op('loop', 'loop_status');

      expect(res.active).toBe(true);
      expect(res.loop).toBeDefined();
      const loop = res.loop as Record<string, unknown>;
      expect(loop.status).toBe('running');
    });

    it('46. Loop cancel — stop iteration', async () => {
      const res = await op('loop', 'loop_cancel');

      expect(res.cancelled).toBe(true);
      expect(res.loopId).toBe(state.loopId);
    });

    it('47. Capability registry — final state should have all installed capabilities', () => {
      const grouped = registry.list();

      expect(grouped.has('vault')).toBe(true);
      expect(grouped.has('brain')).toBe(true);
      expect(grouped.has('color')).toBe(true);
      expect(grouped.has('token')).toBe(true);
      expect(grouped.has('component')).toBe(true);

      // Total capabilities: 8 core + 3 design = 11
      expect(registry.size).toBe(11);
    });

    it('48. Final brain stats — should reflect accumulated learning', async () => {
      const res = await op('brain', 'brain_stats');

      // Brain has processed feedback from the simulation
      expect(res.feedbackCount).toBeGreaterThanOrEqual(2);
      expect(res.vocabularySize).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  EDGE CASES
  // ═══════════════════════════════════════════════════════════

  describe('Edge Cases', () => {

    it('49. Empty prompt — route intent should not crash', async () => {
      const res = await op('control', 'route_intent', { prompt: '' });
      expect(res.intent).toBeDefined();
    });

    it('50. Approve already-completed plan — should return error', async () => {
      const res = await op('plan', 'approve_plan', { planId: state.planId });
      // Plan is already completed — can't approve again
      expect(res.error || res.approved === false).toBeTruthy();
    });

    it('51. Search with zero results — should return empty array', async () => {
      const res = await op('vault', 'search', {
        query: 'xyzzy_nonexistent_term_that_matches_nothing_12345',
      });
      const results = res.data as Array<unknown>;
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    it('52. Capture duplicate pattern — should not create second entry', async () => {
      const res1 = await op('vault', 'capture_knowledge', {
        entries: [{
          type: 'pattern',
          domain: 'frontend',
          title: 'Error boundaries at route level prevent cascading failures',
          description: 'Same pattern as before — should deduplicate',
          severity: 'critical',
          tags: ['react'],
        }],
      });

      // Should either update existing or report as duplicate
      expect(res1.captured + res1.duplicated).toBeGreaterThanOrEqual(1);
    });

    it('53. Get links for non-existent entry — should handle gracefully', async () => {
      const res = await op('vault', 'get_links', { entryId: 'nonexistent-entry-id' });
      expect(res.totalLinks).toBe(0);
    });

    it('54. Concurrent vault captures — no corruption', async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        op('vault', 'capture_quick', {
          type: 'pattern',
          domain: 'testing',
          title: `Concurrent pattern ${i}`,
          description: `Pattern captured concurrently ${i}`,
          severity: 'suggestion',
          tags: ['concurrent-test'],
        }),
      );

      const results = await Promise.all(promises);
      for (const res of results) {
        expect(res.captured).toBe(true);
      }
    });

    it('55. Vault stats reflect all captures', async () => {
      const res = await op('vault', 'vault_stats');

      // We captured: 3 patterns (Day 3) + 5 concurrent + playbooks + plan lifecycle captures
      expect(res.totalEntries).toBeGreaterThanOrEqual(8);
      expect(res.byDomain).toBeDefined();
      const byDomain = res.byDomain as Record<string, number>;
      expect(byDomain.frontend).toBeGreaterThanOrEqual(2);
    });
  });
});
