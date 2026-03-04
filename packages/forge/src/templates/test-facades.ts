import type { AgentConfig } from '../types.js';

/**
 * Generates facade integration tests for a new agent.
 * Tests all domain facades and the core facade.
 */
export function generateFacadesTest(config: AgentConfig): string {
  const domainImports = config.domains
    .map((d) => {
      const fn = `create${pascalCase(d)}Facade`;
      return `import { ${fn} } from '../facades/${d}.facade.js';`;
    })
    .join('\n');

  const domainDescribes = config.domains
    .map((d) => generateDomainDescribe(config.id, d))
    .join('\n\n');

  return `import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Vault, Brain, Planner, KeyPool } from '@soleri/core';
import type { IntelligenceEntry } from '@soleri/core';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
${domainImports}
import { createCoreFacade } from '../facades/core.facade.js';
import { LLMClient } from '../llm/llm-client.js';

function makeEntry(overrides: Partial<IntelligenceEntry> = {}): IntelligenceEntry {
  return {
    id: overrides.id ?? 'test-1',
    type: overrides.type ?? 'pattern',
    domain: overrides.domain ?? 'testing',
    title: overrides.title ?? 'Test Pattern',
    severity: overrides.severity ?? 'warning',
    description: overrides.description ?? 'A test pattern.',
    tags: overrides.tags ?? ['testing'],
  };
}

describe('Facades', () => {
  let vault: Vault;
  let brain: Brain;
  let plannerDir: string;
  let planner: Planner;
  let openaiKeyPool: KeyPool;
  let anthropicKeyPool: KeyPool;
  let llmClient: LLMClient;
  const makeCoreFacade = () =>
    createCoreFacade(vault, planner, brain, undefined, llmClient, openaiKeyPool, anthropicKeyPool);

  beforeEach(() => {
    vault = new Vault(':memory:');
    brain = new Brain(vault);
    plannerDir = join(tmpdir(), 'forge-planner-test-' + Date.now());
    mkdirSync(plannerDir, { recursive: true });
    planner = new Planner(join(plannerDir, 'plans.json'));
    openaiKeyPool = new KeyPool({ keys: [] });
    anthropicKeyPool = new KeyPool({ keys: [] });
    llmClient = new LLMClient(openaiKeyPool, anthropicKeyPool);
  });

  afterEach(() => {
    vault.close();
    rmSync(plannerDir, { recursive: true, force: true });
  });

${domainDescribes}

  describe('${config.id}_core', () => {
    it('should create core facade with expected ops', () => {
      const facade = makeCoreFacade();
      expect(facade.name).toBe('${config.id}_core');
      const opNames = facade.ops.map((o) => o.name);
      expect(opNames).toContain('search');
      expect(opNames).toContain('vault_stats');
      expect(opNames).toContain('list_all');
      expect(opNames).toContain('health');
      expect(opNames).toContain('identity');
      expect(opNames).toContain('activate');
      expect(opNames).toContain('inject_claude_md');
      expect(opNames).toContain('setup');
      expect(opNames).toContain('register');
      expect(opNames).toContain('llm_status');
    });

    it('search should query across all domains with ranked results', async () => {
      vault.seed([
        makeEntry({ id: 'c1', domain: 'alpha', title: 'Alpha pattern', tags: ['a'] }),
        makeEntry({ id: 'c2', domain: 'beta', title: 'Beta pattern', tags: ['b'] }),
      ]);
      brain = new Brain(vault);
      const facade = makeCoreFacade();
      const searchOp = facade.ops.find((o) => o.name === 'search')!;
      const results = (await searchOp.handler({ query: 'pattern' })) as Array<{ entry: unknown; score: number; breakdown: unknown }>;
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(2);
      expect(results[0].score).toBeGreaterThan(0);
      expect(results[0].breakdown).toBeDefined();
    });

    it('vault_stats should return counts', async () => {
      vault.seed([
        makeEntry({ id: 'vs1', domain: 'd1', tags: ['x'] }),
        makeEntry({ id: 'vs2', domain: 'd2', tags: ['y'] }),
      ]);
      const facade = makeCoreFacade();
      const statsOp = facade.ops.find((o) => o.name === 'vault_stats')!;
      const stats = (await statsOp.handler({})) as { totalEntries: number };
      expect(stats.totalEntries).toBe(2);
    });

    it('health should return ok status', async () => {
      const facade = makeCoreFacade();
      const healthOp = facade.ops.find((o) => o.name === 'health')!;
      const health = (await healthOp.handler({})) as { status: string };
      expect(health.status).toBe('ok');
    });

    it('identity should return persona', async () => {
      const facade = makeCoreFacade();
      const identityOp = facade.ops.find((o) => o.name === 'identity')!;
      const persona = (await identityOp.handler({})) as { name: string; role: string };
      expect(persona.name).toBe('${escapeQuotes(config.name)}');
      expect(persona.role).toBe('${escapeQuotes(config.role)}');
    });

    it('list_all should support domain filter', async () => {
      vault.seed([
        makeEntry({ id: 'la1', domain: 'alpha', tags: ['a'] }),
        makeEntry({ id: 'la2', domain: 'beta', tags: ['b'] }),
      ]);
      const facade = makeCoreFacade();
      const listOp = facade.ops.find((o) => o.name === 'list_all')!;
      const filtered = (await listOp.handler({ domain: 'alpha' })) as unknown[];
      expect(filtered).toHaveLength(1);
    });

    it('activate should return persona and setup status', async () => {
      const facade = makeCoreFacade();
      const activateOp = facade.ops.find((o) => o.name === 'activate')!;
      const result = (await activateOp.handler({ projectPath: '/tmp/nonexistent-test' })) as {
        activated: boolean;
        persona: { name: string; role: string };
        guidelines: string[];
        tool_recommendations: unknown[];
        setup_status: { claude_md_injected: boolean; global_claude_md_injected: boolean; vault_has_entries: boolean };
      };
      expect(result.activated).toBe(true);
      expect(result.persona.name).toBe('${escapeQuotes(config.name)}');
      expect(result.persona.role).toBe('${escapeQuotes(config.role)}');
      expect(result.guidelines.length).toBeGreaterThan(0);
      expect(result.tool_recommendations.length).toBeGreaterThan(0);
      expect(result.setup_status.claude_md_injected).toBe(false);
      expect(typeof result.setup_status.global_claude_md_injected).toBe('boolean');
    });

    it('activate with deactivate flag should return deactivation', async () => {
      const facade = makeCoreFacade();
      const activateOp = facade.ops.find((o) => o.name === 'activate')!;
      const result = (await activateOp.handler({ deactivate: true })) as { deactivated: boolean; message: string };
      expect(result.deactivated).toBe(true);
      expect(result.message).toBeDefined();
    });

    it('inject_claude_md should create CLAUDE.md in temp dir', async () => {
      const tempDir = join(tmpdir(), 'forge-inject-test-' + Date.now());
      mkdirSync(tempDir, { recursive: true });
      try {
        const facade = makeCoreFacade();
        const injectOp = facade.ops.find((o) => o.name === 'inject_claude_md')!;
        const result = (await injectOp.handler({ projectPath: tempDir })) as {
          injected: boolean;
          path: string;
          action: string;
        };
        expect(result.injected).toBe(true);
        expect(result.action).toBe('created');
        expect(existsSync(result.path)).toBe(true);
        const content = readFileSync(result.path, 'utf-8');
        expect(content).toContain('${config.id}:mode');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('inject_claude_md with global flag should target ~/.claude/CLAUDE.md', async () => {
      // We test the global path resolution by checking the returned path
      // contains .claude/CLAUDE.md (actual write may or may not happen depending on env)
      const facade = makeCoreFacade();
      const injectOp = facade.ops.find((o) => o.name === 'inject_claude_md')!;
      const result = (await injectOp.handler({ global: true })) as {
        injected: boolean;
        path: string;
        action: string;
      };
      expect(result.injected).toBe(true);
      expect(result.path).toContain('.claude');
      expect(result.path).toContain('CLAUDE.md');
    });

    it('setup should return project and global CLAUDE.md status', async () => {
      const facade = makeCoreFacade();
      const setupOp = facade.ops.find((o) => o.name === 'setup')!;
      const result = (await setupOp.handler({ projectPath: '/tmp/nonexistent-test' })) as {
        agent: { name: string };
        claude_md: {
          project: { exists: boolean; has_agent_section: boolean };
          global: { exists: boolean; has_agent_section: boolean };
        };
        vault: { entries: number };
        recommendations: string[];
      };
      expect(result.agent.name).toBe('${escapeQuotes(config.name)}');
      expect(result.claude_md.project.exists).toBe(false);
      expect(typeof result.claude_md.global.exists).toBe('boolean');
      expect(result.vault.entries).toBe(0);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('register should track new project', async () => {
      const facade = makeCoreFacade();
      const registerOp = facade.ops.find((o) => o.name === 'register')!;
      const result = (await registerOp.handler({ projectPath: '/tmp/reg-test-project', name: 'reg-test' })) as {
        project: { path: string; name: string; sessionCount: number };
        is_new: boolean;
        message: string;
        vault: { entries: number };
      };
      expect(result.is_new).toBe(true);
      expect(result.project.name).toBe('reg-test');
      expect(result.project.sessionCount).toBe(1);
      expect(result.message).toContain('Welcome');
    });

    it('register should increment session count for returning project', async () => {
      const facade = makeCoreFacade();
      const registerOp = facade.ops.find((o) => o.name === 'register')!;
      await registerOp.handler({ projectPath: '/tmp/reg-test-returning', name: 'returning' });
      const result = (await registerOp.handler({ projectPath: '/tmp/reg-test-returning', name: 'returning' })) as {
        project: { sessionCount: number };
        is_new: boolean;
        message: string;
      };
      expect(result.is_new).toBe(false);
      expect(result.project.sessionCount).toBe(2);
      expect(result.message).toContain('Welcome back');
    });

    it('memory_capture should store a memory', async () => {
      const facade = makeCoreFacade();
      const captureOp = facade.ops.find((o) => o.name === 'memory_capture')!;
      const result = (await captureOp.handler({
        projectPath: '/test',
        type: 'lesson',
        context: 'Testing facades',
        summary: 'Facade tests work great',
        topics: ['testing'],
        filesModified: [],
        toolsUsed: [],
      })) as { captured: boolean; memory: { id: string; type: string } };
      expect(result.captured).toBe(true);
      expect(result.memory.id).toMatch(/^mem-/);
      expect(result.memory.type).toBe('lesson');
    });

    it('memory_search should find captured memories', async () => {
      const facade = makeCoreFacade();
      const captureOp = facade.ops.find((o) => o.name === 'memory_capture')!;
      await captureOp.handler({
        projectPath: '/test',
        type: 'lesson',
        context: 'Database optimization',
        summary: 'Learned about index strategies for PostgreSQL',
        topics: ['database'],
        filesModified: [],
        toolsUsed: [],
      });
      const searchOp = facade.ops.find((o) => o.name === 'memory_search')!;
      const results = (await searchOp.handler({ query: 'index strategies' })) as Array<{ summary: string }>;
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].summary).toContain('index strategies');
    });

    it('memory_list should return all memories with stats', async () => {
      const facade = makeCoreFacade();
      const captureOp = facade.ops.find((o) => o.name === 'memory_capture')!;
      await captureOp.handler({
        projectPath: '/test',
        type: 'session',
        context: 'ctx',
        summary: 'Session summary',
        topics: [],
        filesModified: [],
        toolsUsed: [],
      });
      const listOp = facade.ops.find((o) => o.name === 'memory_list')!;
      const result = (await listOp.handler({})) as {
        memories: unknown[];
        stats: { total: number };
      };
      expect(result.memories).toHaveLength(1);
      expect(result.stats.total).toBe(1);
    });

    it('session_capture should store a session memory', async () => {
      const facade = makeCoreFacade();
      const sessionOp = facade.ops.find((o) => o.name === 'session_capture')!;
      const result = (await sessionOp.handler({
        projectPath: '/tmp/test-session',
        summary: 'Worked on vault memory system',
        topics: ['vault', 'memory'],
        filesModified: ['vault.ts'],
        toolsUsed: ['Edit', 'Bash'],
      })) as { captured: boolean; memory: { type: string; summary: string }; message: string };
      expect(result.captured).toBe(true);
      expect(result.memory.type).toBe('session');
      expect(result.memory.summary).toBe('Worked on vault memory system');
      expect(result.message).toContain('saved');
    });

    it('export should return vault entries as bundles', async () => {
      vault.seed([
        makeEntry({ id: 'exp1', domain: 'security', tags: ['auth'] }),
        makeEntry({ id: 'exp2', domain: 'security', tags: ['xss'] }),
        makeEntry({ id: 'exp3', domain: 'api-design', tags: ['rest'] }),
      ]);
      const facade = makeCoreFacade();
      const exportOp = facade.ops.find((o) => o.name === 'export')!;
      const result = (await exportOp.handler({})) as {
        exported: boolean;
        bundles: Array<{ domain: string; entries: unknown[] }>;
        totalEntries: number;
        domains: string[];
      };
      expect(result.exported).toBe(true);
      expect(result.totalEntries).toBe(3);
      expect(result.domains).toContain('security');
      expect(result.domains).toContain('api-design');
      expect(result.bundles.find((b) => b.domain === 'security')!.entries).toHaveLength(2);
    });

    it('export should filter by domain', async () => {
      vault.seed([
        makeEntry({ id: 'exp-d1', domain: 'security', tags: ['auth'] }),
        makeEntry({ id: 'exp-d2', domain: 'api-design', tags: ['rest'] }),
      ]);
      const facade = makeCoreFacade();
      const exportOp = facade.ops.find((o) => o.name === 'export')!;
      const result = (await exportOp.handler({ domain: 'security' })) as {
        bundles: Array<{ domain: string; entries: unknown[] }>;
        totalEntries: number;
      };
      expect(result.totalEntries).toBe(1);
      expect(result.bundles).toHaveLength(1);
      expect(result.bundles[0].domain).toBe('security');
    });

    it('create_plan should create a draft plan', async () => {
      const facade = makeCoreFacade();
      const createOp = facade.ops.find((o) => o.name === 'create_plan')!;
      const result = (await createOp.handler({
        objective: 'Add caching',
        scope: 'api layer',
        tasks: [{ title: 'Add Redis', description: 'Set up Redis client' }],
      })) as { created: boolean; plan: { id: string; status: string; tasks: unknown[] } };
      expect(result.created).toBe(true);
      expect(result.plan.status).toBe('draft');
      expect(result.plan.tasks).toHaveLength(1);
    });

    it('get_plan should return a plan by id', async () => {
      const facade = makeCoreFacade();
      const createOp = facade.ops.find((o) => o.name === 'create_plan')!;
      const created = (await createOp.handler({ objective: 'Test', scope: 'test' })) as { plan: { id: string } };
      const getOp = facade.ops.find((o) => o.name === 'get_plan')!;
      const result = (await getOp.handler({ planId: created.plan.id })) as { id: string; objective: string };
      expect(result.id).toBe(created.plan.id);
      expect(result.objective).toBe('Test');
    });

    it('get_plan without id should return active plans', async () => {
      const facade = makeCoreFacade();
      const createOp = facade.ops.find((o) => o.name === 'create_plan')!;
      await createOp.handler({ objective: 'Plan A', scope: 'a' });
      const getOp = facade.ops.find((o) => o.name === 'get_plan')!;
      const result = (await getOp.handler({})) as { active: unknown[]; executing: unknown[] };
      expect(result.active).toHaveLength(1);
      expect(result.executing).toHaveLength(0);
    });

    it('approve_plan should approve and optionally start execution', async () => {
      const facade = makeCoreFacade();
      const createOp = facade.ops.find((o) => o.name === 'create_plan')!;
      const created = (await createOp.handler({ objective: 'Approve', scope: 'test' })) as { plan: { id: string } };
      const approveOp = facade.ops.find((o) => o.name === 'approve_plan')!;
      const result = (await approveOp.handler({ planId: created.plan.id, startExecution: true })) as {
        approved: boolean;
        executing: boolean;
        plan: { status: string };
      };
      expect(result.approved).toBe(true);
      expect(result.executing).toBe(true);
      expect(result.plan.status).toBe('executing');
    });

    it('update_task should update task status', async () => {
      const facade = makeCoreFacade();
      const createOp = facade.ops.find((o) => o.name === 'create_plan')!;
      const created = (await createOp.handler({
        objective: 'Task update',
        scope: 'test',
        tasks: [{ title: 'T1', description: 'Do thing' }],
      })) as { plan: { id: string } };
      const approveOp = facade.ops.find((o) => o.name === 'approve_plan')!;
      await approveOp.handler({ planId: created.plan.id, startExecution: true });
      const updateOp = facade.ops.find((o) => o.name === 'update_task')!;
      const result = (await updateOp.handler({
        planId: created.plan.id,
        taskId: 'task-1',
        status: 'completed',
      })) as { updated: boolean; task: { status: string } };
      expect(result.updated).toBe(true);
      expect(result.task!.status).toBe('completed');
    });

    it('complete_plan should complete with task summary', async () => {
      const facade = makeCoreFacade();
      const createOp = facade.ops.find((o) => o.name === 'create_plan')!;
      const created = (await createOp.handler({
        objective: 'Complete me',
        scope: 'test',
        tasks: [
          { title: 'T1', description: 'Do thing' },
          { title: 'T2', description: 'Another' },
        ],
      })) as { plan: { id: string } };
      const approveOp = facade.ops.find((o) => o.name === 'approve_plan')!;
      await approveOp.handler({ planId: created.plan.id, startExecution: true });
      const updateOp = facade.ops.find((o) => o.name === 'update_task')!;
      await updateOp.handler({ planId: created.plan.id, taskId: 'task-1', status: 'completed' });
      await updateOp.handler({ planId: created.plan.id, taskId: 'task-2', status: 'skipped' });
      const completeOp = facade.ops.find((o) => o.name === 'complete_plan')!;
      const result = (await completeOp.handler({ planId: created.plan.id })) as {
        completed: boolean;
        taskSummary: { completed: number; skipped: number; total: number };
      };
      expect(result.completed).toBe(true);
      expect(result.taskSummary.completed).toBe(1);
      expect(result.taskSummary.skipped).toBe(1);
      expect(result.taskSummary.total).toBe(2);
    });

    it('should have brain ops in core facade', () => {
      const facade = makeCoreFacade();
      const opNames = facade.ops.map((o) => o.name);
      expect(opNames).toContain('record_feedback');
      expect(opNames).toContain('rebuild_vocabulary');
      expect(opNames).toContain('brain_stats');
    });

    it('record_feedback should record search feedback', async () => {
      const facade = makeCoreFacade();
      const feedbackOp = facade.ops.find((o) => o.name === 'record_feedback')!;
      const result = (await feedbackOp.handler({
        query: 'test query',
        entryId: 'test-entry',
        action: 'accepted',
      })) as { recorded: boolean; query: string; action: string };
      expect(result.recorded).toBe(true);
      expect(result.query).toBe('test query');
      expect(result.action).toBe('accepted');
    });

    it('rebuild_vocabulary should rebuild and return size', async () => {
      vault.seed([
        makeEntry({ id: 'rv1', title: 'Rebuild vocab test', description: 'Testing vocabulary rebuild.', tags: ['rebuild'] }),
      ]);
      brain = new Brain(vault);
      const facade = makeCoreFacade();
      const rebuildOp = facade.ops.find((o) => o.name === 'rebuild_vocabulary')!;
      const result = (await rebuildOp.handler({})) as { rebuilt: boolean; vocabularySize: number };
      expect(result.rebuilt).toBe(true);
      expect(result.vocabularySize).toBeGreaterThan(0);
    });

    it('brain_stats should return intelligence stats', async () => {
      const facade = makeCoreFacade();
      const statsOp = facade.ops.find((o) => o.name === 'brain_stats')!;
      const result = (await statsOp.handler({})) as {
        vocabularySize: number;
        feedbackCount: number;
        weights: { semantic: number; severity: number; recency: number; tagOverlap: number; domainMatch: number };
      };
      expect(result.vocabularySize).toBe(0);
      expect(result.feedbackCount).toBe(0);
      expect(result.weights.semantic).toBeCloseTo(0.40, 2);
      expect(result.weights.severity).toBeCloseTo(0.15, 2);
    });

    it('brain_stats should reflect feedback count after recording', async () => {
      const facade = makeCoreFacade();
      const feedbackOp = facade.ops.find((o) => o.name === 'record_feedback')!;
      await feedbackOp.handler({ query: 'q1', entryId: 'e1', action: 'accepted' });
      await feedbackOp.handler({ query: 'q2', entryId: 'e2', action: 'dismissed' });
      const statsOp = facade.ops.find((o) => o.name === 'brain_stats')!;
      const result = (await statsOp.handler({})) as { feedbackCount: number };
      expect(result.feedbackCount).toBe(2);
    });

    it('llm_status should return provider availability', async () => {
      const facade = makeCoreFacade();
      const llmStatusOp = facade.ops.find((o) => o.name === 'llm_status')!;
      const result = (await llmStatusOp.handler({})) as {
        providers: {
          openai: { available: boolean; keyPool: unknown };
          anthropic: { available: boolean; keyPool: unknown };
        };
        routes: unknown[];
      };
      expect(result.providers.openai.available).toBe(false);
      expect(result.providers.anthropic.available).toBe(false);
      expect(result.providers.openai.keyPool).toBeNull();
      expect(Array.isArray(result.routes)).toBe(true);
    });

    it('llm_status should reflect key pool when keys present', async () => {
      const oPool = new KeyPool({ keys: ['sk-test'] });
      const aPool = new KeyPool({ keys: ['sk-ant-test'] });
      const client = new LLMClient(oPool, aPool);
      const facade = createCoreFacade(vault, planner, brain, undefined, client, oPool, aPool);
      const llmStatusOp = facade.ops.find((o) => o.name === 'llm_status')!;
      const result = (await llmStatusOp.handler({})) as {
        providers: {
          openai: { available: boolean; keyPool: { poolSize: number } };
          anthropic: { available: boolean; keyPool: { poolSize: number } };
        };
      };
      expect(result.providers.openai.available).toBe(true);
      expect(result.providers.openai.keyPool.poolSize).toBe(1);
      expect(result.providers.anthropic.available).toBe(true);
      expect(result.providers.anthropic.keyPool.poolSize).toBe(1);
    });

    it('search through brain should return ranked results with breakdowns', async () => {
      vault.seed([
        makeEntry({ id: 'bs-1', domain: 'security', title: 'Authentication token handling', severity: 'critical', description: 'Always validate JWT tokens.', tags: ['auth', 'jwt'] }),
      ]);
      brain = new Brain(vault);
      const facade = makeCoreFacade();
      const searchOp = facade.ops.find((o) => o.name === 'search')!;
      const results = (await searchOp.handler({ query: 'authentication token' })) as Array<{ entry: { id: string }; score: number; breakdown: { semantic: number; total: number } }>;
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].score).toBeGreaterThan(0);
      expect(results[0].breakdown.total).toBe(results[0].score);
    });
  });
});
`;
}

function generateDomainDescribe(agentId: string, domain: string): string {
  const facadeName = `${agentId}_${domain.replace(/-/g, '_')}`;
  const factoryFn = `create${pascalCase(domain)}Facade`;

  return `  describe('${facadeName}', () => {
    it('should create facade with expected ops', () => {
      const facade = ${factoryFn}(vault, brain);
      expect(facade.name).toBe('${facadeName}');
      const opNames = facade.ops.map((o) => o.name);
      expect(opNames).toContain('get_patterns');
      expect(opNames).toContain('search');
      expect(opNames).toContain('get_entry');
      expect(opNames).toContain('capture');
      expect(opNames).toContain('remove');
    });

    it('get_patterns should return entries for ${domain}', async () => {
      vault.seed([
        makeEntry({ id: '${domain}-gp1', domain: '${domain}', tags: ['test'] }),
        makeEntry({ id: 'other-gp1', domain: 'other-domain', tags: ['test'] }),
      ]);
      const facade = ${factoryFn}(vault, brain);
      const op = facade.ops.find((o) => o.name === 'get_patterns')!;
      const results = (await op.handler({})) as IntelligenceEntry[];
      expect(results.every((e) => e.domain === '${domain}')).toBe(true);
    });

    it('search should scope to ${domain} with ranked results', async () => {
      vault.seed([
        makeEntry({ id: '${domain}-s1', domain: '${domain}', title: 'Domain specific pattern', tags: ['find-me'] }),
        makeEntry({ id: 'other-s1', domain: 'other', title: 'Other domain pattern', tags: ['nope'] }),
      ]);
      brain = new Brain(vault);
      const facade = ${factoryFn}(vault, brain);
      const op = facade.ops.find((o) => o.name === 'search')!;
      const results = (await op.handler({ query: 'pattern' })) as Array<{ entry: IntelligenceEntry; score: number; breakdown: unknown }>;
      expect(results.every((r) => r.entry.domain === '${domain}')).toBe(true);
      if (results.length > 0) {
        expect(results[0].score).toBeGreaterThan(0);
        expect(results[0].breakdown).toBeDefined();
      }
    });

    it('capture should add entry with ${domain} domain and auto-tags', async () => {
      const facade = ${factoryFn}(vault, brain);
      const captureOp = facade.ops.find((o) => o.name === 'capture')!;
      const result = (await captureOp.handler({
        id: '${domain}-cap1',
        type: 'pattern',
        title: 'Captured Pattern for Intelligence',
        severity: 'warning',
        description: 'A captured pattern for testing the brain intelligence layer.',
        tags: ['captured'],
      })) as { captured: boolean; autoTags: string[] };
      expect(result.captured).toBe(true);
      expect(result.autoTags).toBeDefined();
      const entry = vault.get('${domain}-cap1');
      expect(entry).not.toBeNull();
      expect(entry!.domain).toBe('${domain}');
    });

    it('get_entry should return specific entry', async () => {
      vault.seed([makeEntry({ id: '${domain}-ge1', domain: '${domain}', tags: ['test'] })]);
      const facade = ${factoryFn}(vault, brain);
      const op = facade.ops.find((o) => o.name === 'get_entry')!;
      const result = (await op.handler({ id: '${domain}-ge1' })) as IntelligenceEntry;
      expect(result.id).toBe('${domain}-ge1');
    });

    it('get_entry should return error for missing entry', async () => {
      const facade = ${factoryFn}(vault, brain);
      const op = facade.ops.find((o) => o.name === 'get_entry')!;
      const result = (await op.handler({ id: 'nonexistent' })) as { error: string };
      expect(result.error).toBeDefined();
    });

    it('remove should delete entry', async () => {
      vault.seed([makeEntry({ id: '${domain}-rm1', domain: '${domain}', tags: ['test'] })]);
      const facade = ${factoryFn}(vault, brain);
      const op = facade.ops.find((o) => o.name === 'remove')!;
      const result = (await op.handler({ id: '${domain}-rm1' })) as { removed: boolean };
      expect(result.removed).toBe(true);
      expect(vault.get('${domain}-rm1')).toBeNull();
    });
  });`;
}

function pascalCase(s: string): string {
  return s
    .split(/[-_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

function escapeQuotes(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
