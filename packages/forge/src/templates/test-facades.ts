import type { AgentConfig } from '../types.js';

/**
 * Generates facade integration tests for a new agent.
 * Uses runtime factories from @soleri/core — tests both core ops and domain ops.
 */
export function generateFacadesTest(config: AgentConfig): string {
  const domainDescribes = config.domains
    .map((d) => generateDomainDescribe(config.id, d))
    .join('\n\n');

  return `import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createAgentRuntime,
  createSemanticFacades,
  createDomainFacade,
} from '@soleri/core';
import type { AgentRuntime, IntelligenceEntry, OpDefinition, FacadeConfig } from '@soleri/core';
import { z } from 'zod';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PERSONA } from '../identity/persona.js';
import { activateAgent, deactivateAgent } from '../activation/activate.js';
import { injectClaudeMd, injectClaudeMdGlobal, hasAgentMarker } from '../activation/inject-claude-md.js';

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
  let runtime: AgentRuntime;
  let plannerDir: string;

  beforeEach(() => {
    plannerDir = join(tmpdir(), 'forge-planner-test-' + Date.now());
    mkdirSync(plannerDir, { recursive: true });
    runtime = createAgentRuntime({
      agentId: '${config.id}',
      vaultPath: ':memory:',
      plansPath: join(plannerDir, 'plans.json'),
    });
  });

  afterEach(() => {
    runtime.close();
    rmSync(plannerDir, { recursive: true, force: true });
  });

${domainDescribes}

  // ─── Semantic Facades ────────────────────────────────────────
  describe('semantic facades', () => {
    function buildSemanticFacades(): FacadeConfig[] {
      return createSemanticFacades(runtime, '${config.id}');
    }

    it('should create 10 semantic facades', () => {
      const facades = buildSemanticFacades();
      expect(facades).toHaveLength(10);
      const names = facades.map(f => f.name);
      expect(names).toContain('${config.id}_vault');
      expect(names).toContain('${config.id}_plan');
      expect(names).toContain('${config.id}_brain');
      expect(names).toContain('${config.id}_memory');
      expect(names).toContain('${config.id}_admin');
      expect(names).toContain('${config.id}_curator');
      expect(names).toContain('${config.id}_loop');
      expect(names).toContain('${config.id}_orchestrate');
      expect(names).toContain('${config.id}_control');
      expect(names).toContain('${config.id}_cognee');
    });

    it('total ops across all facades should be 209', () => {
      const facades = buildSemanticFacades();
      const totalOps = facades.reduce((sum, f) => sum + f.ops.length, 0);
      expect(totalOps).toBe(209);
    });
  });

  describe('${config.id}_vault', () => {
    function getFacade(): FacadeConfig {
      return createSemanticFacades(runtime, '${config.id}').find(f => f.name === '${config.id}_vault')!;
    }

    it('should contain vault ops', () => {
      const opNames = getFacade().ops.map(o => o.name);
      expect(opNames).toContain('search');
      expect(opNames).toContain('vault_stats');
      expect(opNames).toContain('list_all');
      expect(opNames).toContain('export');
      expect(opNames).toContain('vault_get');
      expect(opNames).toContain('vault_import');
      expect(opNames).toContain('capture_knowledge');
      expect(opNames).toContain('intake_ingest_book');
    });

    it('search should query across all domains', async () => {
      runtime.vault.seed([
        makeEntry({ id: 'c1', domain: 'alpha', title: 'Alpha pattern', tags: ['a'] }),
        makeEntry({ id: 'c2', domain: 'beta', title: 'Beta pattern', tags: ['b'] }),
      ]);
      runtime = createAgentRuntime({ agentId: '${config.id}', vaultPath: ':memory:', plansPath: join(plannerDir, 'plans2.json') });
      runtime.vault.seed([
        makeEntry({ id: 'c1', domain: 'alpha', title: 'Alpha pattern', tags: ['a'] }),
        makeEntry({ id: 'c2', domain: 'beta', title: 'Beta pattern', tags: ['b'] }),
      ]);
      const facade = createSemanticFacades(runtime, '${config.id}').find(f => f.name === '${config.id}_vault')!;
      const searchOp = facade.ops.find(o => o.name === 'search')!;
      const results = (await searchOp.handler({ query: 'pattern' })) as Array<{ entry: unknown; score: number }>;
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(2);
    });

    it('vault_stats should return counts', async () => {
      runtime.vault.seed([
        makeEntry({ id: 'vs1', domain: 'd1', tags: ['x'] }),
        makeEntry({ id: 'vs2', domain: 'd2', tags: ['y'] }),
      ]);
      const facade = createSemanticFacades(runtime, '${config.id}').find(f => f.name === '${config.id}_vault')!;
      const statsOp = facade.ops.find(o => o.name === 'vault_stats')!;
      const stats = (await statsOp.handler({})) as { totalEntries: number };
      expect(stats.totalEntries).toBe(2);
    });
  });

  describe('${config.id}_plan', () => {
    it('should contain planning ops', () => {
      const facade = createSemanticFacades(runtime, '${config.id}').find(f => f.name === '${config.id}_plan')!;
      const opNames = facade.ops.map(o => o.name);
      expect(opNames).toContain('create_plan');
      expect(opNames).toContain('get_plan');
      expect(opNames).toContain('approve_plan');
      expect(opNames).toContain('plan_iterate');
      expect(opNames).toContain('plan_grade');
    });

    it('create_plan should create a draft plan', async () => {
      const facade = createSemanticFacades(runtime, '${config.id}').find(f => f.name === '${config.id}_plan')!;
      const createOp = facade.ops.find(o => o.name === 'create_plan')!;
      const result = (await createOp.handler({
        objective: 'Add caching',
        scope: 'api layer',
        tasks: [{ title: 'Add Redis', description: 'Set up Redis client' }],
      })) as { created: boolean; plan: { status: string } };
      expect(result.created).toBe(true);
      expect(result.plan.status).toBe('draft');
    });
  });

  describe('${config.id}_brain', () => {
    it('should contain brain ops', () => {
      const facade = createSemanticFacades(runtime, '${config.id}').find(f => f.name === '${config.id}_brain')!;
      const opNames = facade.ops.map(o => o.name);
      expect(opNames).toContain('brain_stats');
      expect(opNames).toContain('brain_strengths');
      expect(opNames).toContain('brain_build_intelligence');
      expect(opNames).toContain('brain_lifecycle');
      expect(opNames).toContain('brain_decay_report');
    });

    it('brain_stats should return intelligence stats', async () => {
      const facade = createSemanticFacades(runtime, '${config.id}').find(f => f.name === '${config.id}_brain')!;
      const statsOp = facade.ops.find(o => o.name === 'brain_stats')!;
      const result = (await statsOp.handler({})) as { vocabularySize: number };
      expect(result.vocabularySize).toBe(0);
    });
  });

  describe('${config.id}_memory', () => {
    it('should contain memory ops', () => {
      const facade = createSemanticFacades(runtime, '${config.id}').find(f => f.name === '${config.id}_memory')!;
      const opNames = facade.ops.map(o => o.name);
      expect(opNames).toContain('memory_search');
      expect(opNames).toContain('memory_capture');
      expect(opNames).toContain('memory_promote_to_global');
    });
  });

  describe('${config.id}_admin', () => {
    it('should contain admin ops', () => {
      const facade = createSemanticFacades(runtime, '${config.id}').find(f => f.name === '${config.id}_admin')!;
      const opNames = facade.ops.map(o => o.name);
      expect(opNames).toContain('admin_health');
      expect(opNames).toContain('admin_tool_list');
      expect(opNames).toContain('llm_rotate');
      expect(opNames).toContain('render_prompt');
    });
  });

  describe('${config.id}_curator', () => {
    it('should contain curator ops', () => {
      const facade = createSemanticFacades(runtime, '${config.id}').find(f => f.name === '${config.id}_curator')!;
      const opNames = facade.ops.map(o => o.name);
      expect(opNames).toContain('curator_status');
      expect(opNames).toContain('curator_health_audit');
      expect(opNames).toContain('curator_hybrid_contradictions');
    });

    it('curator_status should return initialized', async () => {
      const facade = createSemanticFacades(runtime, '${config.id}').find(f => f.name === '${config.id}_curator')!;
      const statusOp = facade.ops.find(o => o.name === 'curator_status')!;
      const result = (await statusOp.handler({})) as { initialized: boolean };
      expect(result.initialized).toBe(true);
    });
  });

  describe('${config.id}_loop', () => {
    it('should contain loop ops', () => {
      const facade = createSemanticFacades(runtime, '${config.id}').find(f => f.name === '${config.id}_loop')!;
      const opNames = facade.ops.map(o => o.name);
      expect(opNames).toContain('loop_start');
      expect(opNames).toContain('loop_iterate');
      expect(opNames).toContain('loop_cancel');
    });
  });

  describe('${config.id}_orchestrate', () => {
    it('should contain orchestrate ops', () => {
      const facade = createSemanticFacades(runtime, '${config.id}').find(f => f.name === '${config.id}_orchestrate')!;
      const opNames = facade.ops.map(o => o.name);
      expect(opNames).toContain('register');
      expect(opNames).toContain('orchestrate_plan');
      expect(opNames).toContain('project_get');
      expect(opNames).toContain('playbook_list');
    });
  });

  describe('${config.id}_control', () => {
    it('should contain control and governance ops', () => {
      const facade = createSemanticFacades(runtime, '${config.id}').find(f => f.name === '${config.id}_control')!;
      const opNames = facade.ops.map(o => o.name);
      expect(opNames).toContain('get_identity');
      expect(opNames).toContain('route_intent');
      expect(opNames).toContain('governance_policy');
      expect(opNames).toContain('governance_dashboard');
    });

    it('governance_policy should return default policy', async () => {
      const facade = createSemanticFacades(runtime, '${config.id}').find(f => f.name === '${config.id}_control')!;
      const policyOp = facade.ops.find(o => o.name === 'governance_policy')!;
      const result = (await policyOp.handler({ action: 'get', projectPath: '/test' })) as {
        projectPath: string;
        quotas: { maxEntriesTotal: number };
      };
      expect(result.projectPath).toBe('/test');
      expect(result.quotas.maxEntriesTotal).toBe(500);
    });
  });

  describe('${config.id}_cognee', () => {
    it('should contain cognee ops', () => {
      const facade = createSemanticFacades(runtime, '${config.id}').find(f => f.name === '${config.id}_cognee')!;
      const opNames = facade.ops.map(o => o.name);
      expect(opNames).toContain('cognee_status');
      expect(opNames).toContain('cognee_search');
      expect(opNames).toContain('cognee_sync_status');
    });
  });

  describe('${config.id}_core (agent-specific)', () => {
    function buildAgentFacade(): FacadeConfig {
      const agentOps: OpDefinition[] = [
        {
          name: 'health',
          description: 'Health check',
          auth: 'read',
          handler: async () => {
            const stats = runtime.vault.stats();
            return {
              status: 'ok',
              agent: { name: PERSONA.name, role: PERSONA.role },
              vault: { entries: stats.totalEntries, domains: Object.keys(stats.byDomain) },
            };
          },
        },
        {
          name: 'identity',
          description: 'Agent identity',
          auth: 'read',
          handler: async () => PERSONA,
        },
        {
          name: 'activate',
          description: 'Activate agent',
          auth: 'read',
          schema: z.object({
            projectPath: z.string().optional().default('.'),
            deactivate: z.boolean().optional(),
          }),
          handler: async (params) => {
            if (params.deactivate) return deactivateAgent();
            return activateAgent(runtime.vault, (params.projectPath as string) ?? '.', runtime.planner);
          },
        },
        {
          name: 'inject_claude_md',
          description: 'Inject CLAUDE.md',
          auth: 'write',
          schema: z.object({
            projectPath: z.string().optional().default('.'),
            global: z.boolean().optional(),
          }),
          handler: async (params) => {
            if (params.global) return injectClaudeMdGlobal();
            return injectClaudeMd((params.projectPath as string) ?? '.');
          },
        },
        {
          name: 'setup',
          description: 'Setup status',
          auth: 'read',
          schema: z.object({ projectPath: z.string().optional().default('.') }),
          handler: async (params) => {
            const { existsSync: exists } = await import('node:fs');
            const { join: joinPath } = await import('node:path');
            const { homedir } = await import('node:os');
            const pp = (params.projectPath as string) ?? '.';
            const projectClaudeMd = joinPath(pp, 'CLAUDE.md');
            const globalClaudeMd = joinPath(homedir(), '.claude', 'CLAUDE.md');
            const stats = runtime.vault.stats();
            const recommendations: string[] = [];
            if (!hasAgentMarker(globalClaudeMd) && !hasAgentMarker(projectClaudeMd)) {
              recommendations.push('No CLAUDE.md configured');
            }
            if (stats.totalEntries === 0) {
              recommendations.push('Vault is empty');
            }
            // Check hook status
            const { readdirSync } = await import('node:fs');
            const agentClaudeDir = joinPath(__dirname, '..', '.claude');
            const globalClaudeDir = joinPath(homedir(), '.claude');
            const hookStatus = { agent: [] as string[], global: [] as string[], missing: [] as string[] };
            if (exists(agentClaudeDir)) {
              try {
                const agentHooks = readdirSync(agentClaudeDir)
                  .filter((f: string) => f.startsWith('hookify.') && f.endsWith('.local.md'))
                  .map((f: string) => f.replace('hookify.', '').replace('.local.md', ''));
                hookStatus.agent = agentHooks;
                for (const hook of agentHooks) {
                  if (exists(joinPath(globalClaudeDir, \`hookify.\${hook}.local.md\`))) {
                    hookStatus.global.push(hook);
                  } else {
                    hookStatus.missing.push(hook);
                  }
                }
              } catch { /* ignore */ }
            }
            if (hookStatus.missing.length > 0) {
              recommendations.push(\`\${hookStatus.missing.length} hook(s) not installed globally — run scripts/setup.sh\`);
            }
            if (recommendations.length === 0) {
              recommendations.push('${config.name} is fully set up and ready!');
            }
            return {
              agent: { name: PERSONA.name, role: PERSONA.role },
              claude_md: {
                project: { exists: exists(projectClaudeMd), has_agent_section: hasAgentMarker(projectClaudeMd) },
                global: { exists: exists(globalClaudeMd), has_agent_section: hasAgentMarker(globalClaudeMd) },
              },
              vault: { entries: stats.totalEntries, domains: Object.keys(stats.byDomain) },
              hooks: hookStatus,
              recommendations,
            };
          },
        },
      ];
      return {
        name: '${config.id}_core',
        description: 'Agent-specific operations',
        ops: agentOps,
      };
    }

    it('agent ops should not appear in semantic facades', () => {
      const facades = createSemanticFacades(runtime, '${config.id}');
      const allOps = facades.flatMap(f => f.ops.map(o => o.name));
      expect(allOps).not.toContain('health');
      expect(allOps).not.toContain('identity');
      expect(allOps).not.toContain('activate');
      expect(allOps).not.toContain('inject_claude_md');
      expect(allOps).not.toContain('setup');
    });

    it('health should return ok status', async () => {
      const facade = buildAgentFacade();
      const healthOp = facade.ops.find((o) => o.name === 'health')!;
      const health = (await healthOp.handler({})) as { status: string };
      expect(health.status).toBe('ok');
    });

    it('identity should return persona', async () => {
      const facade = buildAgentFacade();
      const identityOp = facade.ops.find((o) => o.name === 'identity')!;
      const persona = (await identityOp.handler({})) as { name: string; role: string };
      expect(persona.name).toBe('${escapeQuotes(config.name)}');
      expect(persona.role).toBe('${escapeQuotes(config.role)}');
    });

    it('activate should return persona and setup status', async () => {
      const facade = buildAgentFacade();
      const activateOp = facade.ops.find((o) => o.name === 'activate')!;
      const result = (await activateOp.handler({ projectPath: '/tmp/nonexistent-test' })) as {
        activated: boolean;
        persona: { name: string; role: string };
      };
      expect(result.activated).toBe(true);
      expect(result.persona.name).toBe('${escapeQuotes(config.name)}');
    });

    it('activate with deactivate flag should return deactivation', async () => {
      const facade = buildAgentFacade();
      const activateOp = facade.ops.find((o) => o.name === 'activate')!;
      const result = (await activateOp.handler({ deactivate: true })) as { deactivated: boolean; message: string };
      expect(result.deactivated).toBe(true);
      expect(result.message).toBeDefined();
    });

    it('inject_claude_md should create CLAUDE.md in temp dir', async () => {
      const tempDir = join(tmpdir(), 'forge-inject-test-' + Date.now());
      mkdirSync(tempDir, { recursive: true });
      try {
        const facade = buildAgentFacade();
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

    it('setup should return project and global CLAUDE.md status', async () => {
      const facade = buildAgentFacade();
      const setupOp = facade.ops.find((o) => o.name === 'setup')!;
      const result = (await setupOp.handler({ projectPath: '/tmp/nonexistent-test' })) as {
        agent: { name: string };
        claude_md: { project: { exists: boolean; has_agent_section: boolean }; global: { exists: boolean; has_agent_section: boolean } };
        vault: { entries: number };
        hooks: { agent: string[]; global: string[]; missing: string[] };
        recommendations: string[];
      };
      expect(result.agent.name).toBe('${escapeQuotes(config.name)}');
      expect(result.vault.entries).toBe(0);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });
});
`;
}

function generateDomainDescribe(agentId: string, domain: string): string {
  const facadeName = `${agentId}_${domain.replace(/-/g, '_')}`;

  return `  describe('${facadeName}', () => {
    function buildDomainFacade(): FacadeConfig {
      return createDomainFacade(runtime, '${agentId}', '${domain}');
    }

    it('should create facade with expected ops', () => {
      const facade = buildDomainFacade();
      expect(facade.name).toBe('${facadeName}');
      const opNames = facade.ops.map((o) => o.name);
      expect(opNames).toContain('get_patterns');
      expect(opNames).toContain('search');
      expect(opNames).toContain('get_entry');
      expect(opNames).toContain('capture');
      expect(opNames).toContain('remove');
    });

    it('get_patterns should return entries for ${domain}', async () => {
      runtime.vault.seed([
        makeEntry({ id: '${domain}-gp1', domain: '${domain}', tags: ['test'] }),
        makeEntry({ id: 'other-gp1', domain: 'other-domain', tags: ['test'] }),
      ]);
      const facade = buildDomainFacade();
      const op = facade.ops.find((o) => o.name === 'get_patterns')!;
      const results = (await op.handler({})) as IntelligenceEntry[];
      expect(results.every((e) => e.domain === '${domain}')).toBe(true);
    });

    it('search should scope to ${domain} with ranked results', async () => {
      runtime.vault.seed([
        makeEntry({ id: '${domain}-s1', domain: '${domain}', title: 'Domain specific pattern', tags: ['find-me'] }),
        makeEntry({ id: 'other-s1', domain: 'other', title: 'Other domain pattern', tags: ['nope'] }),
      ]);
      runtime.brain.rebuildVocabulary();
      const facade = buildDomainFacade();
      const op = facade.ops.find((o) => o.name === 'search')!;
      const results = (await op.handler({ query: 'pattern' })) as Array<{ entry: IntelligenceEntry; score: number }>;
      expect(results.every((r) => r.entry.domain === '${domain}')).toBe(true);
    });

    it('capture should add entry with ${domain} domain', async () => {
      const facade = buildDomainFacade();
      const captureOp = facade.ops.find((o) => o.name === 'capture')!;
      const result = (await captureOp.handler({
        id: '${domain}-cap1',
        type: 'pattern',
        title: 'Captured Pattern',
        severity: 'warning',
        description: 'A captured pattern.',
        tags: ['captured'],
      })) as { captured: boolean; governance?: { action: string } };
      expect(result.captured).toBe(true);
      const entry = runtime.vault.get('${domain}-cap1');
      expect(entry).not.toBeNull();
      expect(entry!.domain).toBe('${domain}');
    });

    it('get_entry should return specific entry', async () => {
      runtime.vault.seed([makeEntry({ id: '${domain}-ge1', domain: '${domain}', tags: ['test'] })]);
      const facade = buildDomainFacade();
      const op = facade.ops.find((o) => o.name === 'get_entry')!;
      const result = (await op.handler({ id: '${domain}-ge1' })) as IntelligenceEntry;
      expect(result.id).toBe('${domain}-ge1');
    });

    it('remove should delete entry', async () => {
      runtime.vault.seed([makeEntry({ id: '${domain}-rm1', domain: '${domain}', tags: ['test'] })]);
      const facade = buildDomainFacade();
      const op = facade.ops.find((o) => o.name === 'remove')!;
      const result = (await op.handler({ id: '${domain}-rm1' })) as { removed: boolean };
      expect(result.removed).toBe(true);
      expect(runtime.vault.get('${domain}-rm1')).toBeNull();
    });
  });`;
}

function escapeQuotes(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
