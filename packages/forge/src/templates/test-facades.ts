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
  createCoreOps,
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

  describe('${config.id}_core', () => {
    function buildCoreFacade(): FacadeConfig {
      const coreOps = createCoreOps(runtime);
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
        description: 'Core operations',
        ops: [...coreOps, ...agentOps],
      };
    }

    it('should create core facade with expected ops', () => {
      const facade = buildCoreFacade();
      expect(facade.name).toBe('${config.id}_core');
      const opNames = facade.ops.map((o) => o.name);
      // Core ops (37)
      expect(opNames).toContain('search');
      expect(opNames).toContain('vault_stats');
      expect(opNames).toContain('list_all');
      expect(opNames).toContain('register');
      expect(opNames).toContain('llm_status');
      expect(opNames).toContain('curator_status');
      expect(opNames).toContain('curator_health_audit');
      // Brain Intelligence ops (11)
      expect(opNames).toContain('brain_session_context');
      expect(opNames).toContain('brain_strengths');
      expect(opNames).toContain('brain_global_patterns');
      expect(opNames).toContain('brain_recommend');
      expect(opNames).toContain('brain_build_intelligence');
      expect(opNames).toContain('brain_export');
      expect(opNames).toContain('brain_import');
      expect(opNames).toContain('brain_extract_knowledge');
      expect(opNames).toContain('brain_archive_sessions');
      expect(opNames).toContain('brain_promote_proposals');
      expect(opNames).toContain('brain_lifecycle');
      // Enhanced brain ops (3)
      expect(opNames).toContain('brain_feedback');
      expect(opNames).toContain('brain_feedback_stats');
      expect(opNames).toContain('brain_reset_extracted');
      // Agent-specific ops (5)
      expect(opNames).toContain('health');
      expect(opNames).toContain('identity');
      expect(opNames).toContain('activate');
      expect(opNames).toContain('inject_claude_md');
      expect(opNames).toContain('setup');
      // Control ops (8)
      expect(opNames).toContain('get_identity');
      expect(opNames).toContain('update_identity');
      expect(opNames).toContain('add_guideline');
      expect(opNames).toContain('remove_guideline');
      expect(opNames).toContain('rollback_identity');
      expect(opNames).toContain('route_intent');
      expect(opNames).toContain('morph');
      expect(opNames).toContain('get_behavior_rules');
      // Cognee ops (5)
      expect(opNames).toContain('cognee_status');
      expect(opNames).toContain('cognee_search');
      expect(opNames).toContain('cognee_add');
      expect(opNames).toContain('cognee_cognify');
      expect(opNames).toContain('cognee_config');
      // LLM ops (2)
      expect(opNames).toContain('llm_rotate');
      expect(opNames).toContain('llm_call');
      // Governance ops (5)
      expect(opNames).toContain('governance_policy');
      expect(opNames).toContain('governance_proposals');
      expect(opNames).toContain('governance_stats');
      expect(opNames).toContain('governance_expire');
      expect(opNames).toContain('governance_dashboard');
      // Planning Extra ops (9)
      expect(opNames).toContain('plan_iterate');
      expect(opNames).toContain('plan_split');
      expect(opNames).toContain('plan_reconcile');
      expect(opNames).toContain('plan_complete_lifecycle');
      expect(opNames).toContain('plan_dispatch');
      expect(opNames).toContain('plan_review');
      expect(opNames).toContain('plan_archive');
      expect(opNames).toContain('plan_list_tasks');
      expect(opNames).toContain('plan_stats');
      // Memory Extra ops (8)
      expect(opNames).toContain('memory_delete');
      expect(opNames).toContain('memory_stats');
      expect(opNames).toContain('memory_export');
      expect(opNames).toContain('memory_import');
      expect(opNames).toContain('memory_prune');
      expect(opNames).toContain('memory_deduplicate');
      expect(opNames).toContain('memory_topics');
      expect(opNames).toContain('memory_by_project');
      // Vault Extra ops (12)
      expect(opNames).toContain('vault_get');
      expect(opNames).toContain('vault_update');
      expect(opNames).toContain('vault_remove');
      expect(opNames).toContain('vault_bulk_add');
      expect(opNames).toContain('vault_bulk_remove');
      expect(opNames).toContain('vault_tags');
      expect(opNames).toContain('vault_domains');
      expect(opNames).toContain('vault_recent');
      expect(opNames).toContain('vault_import');
      expect(opNames).toContain('vault_seed');
      expect(opNames).toContain('vault_backup');
      expect(opNames).toContain('vault_age_report');
      // Admin ops (8)
      expect(opNames).toContain('admin_health');
      expect(opNames).toContain('admin_tool_list');
      expect(opNames).toContain('admin_config');
      expect(opNames).toContain('admin_vault_size');
      expect(opNames).toContain('admin_uptime');
      expect(opNames).toContain('admin_version');
      expect(opNames).toContain('admin_reset_cache');
      expect(opNames).toContain('admin_diagnostic');
      // Loop ops (7)
      expect(opNames).toContain('loop_start');
      expect(opNames).toContain('loop_iterate');
      expect(opNames).toContain('loop_status');
      expect(opNames).toContain('loop_cancel');
      expect(opNames).toContain('loop_history');
      expect(opNames).toContain('loop_is_active');
      expect(opNames).toContain('loop_complete');
      // Orchestrate ops (5)
      expect(opNames).toContain('orchestrate_plan');
      expect(opNames).toContain('orchestrate_execute');
      expect(opNames).toContain('orchestrate_complete');
      expect(opNames).toContain('orchestrate_status');
      expect(opNames).toContain('orchestrate_quick_capture');
      // Capture ops (4)
      expect(opNames).toContain('capture_knowledge');
      expect(opNames).toContain('capture_quick');
      expect(opNames).toContain('search_intelligent');
      expect(opNames).toContain('search_feedback');
      // Grading ops (5)
      expect(opNames).toContain('plan_grade');
      expect(opNames).toContain('plan_check_history');
      expect(opNames).toContain('plan_latest_check');
      expect(opNames).toContain('plan_meets_grade');
      expect(opNames).toContain('plan_auto_improve');
      // Admin Extra ops (10)
      expect(opNames).toContain('admin_telemetry');
      expect(opNames).toContain('admin_telemetry_recent');
      expect(opNames).toContain('admin_telemetry_reset');
      expect(opNames).toContain('admin_permissions');
      expect(opNames).toContain('admin_vault_analytics');
      expect(opNames).toContain('admin_search_insights');
      expect(opNames).toContain('admin_module_status');
      expect(opNames).toContain('admin_env');
      expect(opNames).toContain('admin_gc');
      expect(opNames).toContain('admin_export_config');
      // Curator Extra ops (4)
      expect(opNames).toContain('curator_entry_history');
      expect(opNames).toContain('curator_record_snapshot');
      expect(opNames).toContain('curator_queue_stats');
      expect(opNames).toContain('curator_enrich');
      // Project ops (12)
      expect(opNames).toContain('project_get');
      expect(opNames).toContain('project_list');
      expect(opNames).toContain('project_unregister');
      expect(opNames).toContain('project_get_rules');
      expect(opNames).toContain('project_list_rules');
      expect(opNames).toContain('project_add_rule');
      expect(opNames).toContain('project_remove_rule');
      expect(opNames).toContain('project_link');
      expect(opNames).toContain('project_unlink');
      expect(opNames).toContain('project_get_links');
      expect(opNames).toContain('project_linked_projects');
      expect(opNames).toContain('project_touch');
      // Cross-project memory ops (3)
      expect(opNames).toContain('memory_promote_to_global');
      expect(opNames).toContain('memory_configure');
      expect(opNames).toContain('memory_cross_project_search');
      // Playbook ops (5)
      expect(opNames).toContain('playbook_list');
      expect(opNames).toContain('playbook_get');
      expect(opNames).toContain('playbook_create');
      expect(opNames).toContain('playbook_match');
      expect(opNames).toContain('playbook_seed');
      // Total: 188 (183 core + 5 agent-specific)
      expect(facade.ops.length).toBe(188);
    });

    it('search should query across all domains with ranked results', async () => {
      runtime.vault.seed([
        makeEntry({ id: 'c1', domain: 'alpha', title: 'Alpha pattern', tags: ['a'] }),
        makeEntry({ id: 'c2', domain: 'beta', title: 'Beta pattern', tags: ['b'] }),
      ]);
      runtime = createAgentRuntime({ agentId: '${config.id}', vaultPath: ':memory:', plansPath: join(plannerDir, 'plans2.json') });
      runtime.vault.seed([
        makeEntry({ id: 'c1', domain: 'alpha', title: 'Alpha pattern', tags: ['a'] }),
        makeEntry({ id: 'c2', domain: 'beta', title: 'Beta pattern', tags: ['b'] }),
      ]);
      const facade = buildCoreFacade();
      const searchOp = facade.ops.find((o) => o.name === 'search')!;
      const results = (await searchOp.handler({ query: 'pattern' })) as Array<{ entry: unknown; score: number; breakdown: unknown }>;
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(2);
      expect(results[0].score).toBeGreaterThan(0);
    });

    it('vault_stats should return counts', async () => {
      runtime.vault.seed([
        makeEntry({ id: 'vs1', domain: 'd1', tags: ['x'] }),
        makeEntry({ id: 'vs2', domain: 'd2', tags: ['y'] }),
      ]);
      const facade = buildCoreFacade();
      const statsOp = facade.ops.find((o) => o.name === 'vault_stats')!;
      const stats = (await statsOp.handler({})) as { totalEntries: number };
      expect(stats.totalEntries).toBe(2);
    });

    it('health should return ok status', async () => {
      const facade = buildCoreFacade();
      const healthOp = facade.ops.find((o) => o.name === 'health')!;
      const health = (await healthOp.handler({})) as { status: string };
      expect(health.status).toBe('ok');
    });

    it('identity should return persona', async () => {
      const facade = buildCoreFacade();
      const identityOp = facade.ops.find((o) => o.name === 'identity')!;
      const persona = (await identityOp.handler({})) as { name: string; role: string };
      expect(persona.name).toBe('${escapeQuotes(config.name)}');
      expect(persona.role).toBe('${escapeQuotes(config.role)}');
    });

    it('activate should return persona and setup status', async () => {
      const facade = buildCoreFacade();
      const activateOp = facade.ops.find((o) => o.name === 'activate')!;
      const result = (await activateOp.handler({ projectPath: '/tmp/nonexistent-test' })) as {
        activated: boolean;
        persona: { name: string; role: string };
      };
      expect(result.activated).toBe(true);
      expect(result.persona.name).toBe('${escapeQuotes(config.name)}');
    });

    it('activate with deactivate flag should return deactivation', async () => {
      const facade = buildCoreFacade();
      const activateOp = facade.ops.find((o) => o.name === 'activate')!;
      const result = (await activateOp.handler({ deactivate: true })) as { deactivated: boolean; message: string };
      expect(result.deactivated).toBe(true);
      expect(result.message).toBeDefined();
    });

    it('inject_claude_md should create CLAUDE.md in temp dir', async () => {
      const tempDir = join(tmpdir(), 'forge-inject-test-' + Date.now());
      mkdirSync(tempDir, { recursive: true });
      try {
        const facade = buildCoreFacade();
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
      const facade = buildCoreFacade();
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

    it('create_plan should create a draft plan', async () => {
      const facade = buildCoreFacade();
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

    it('brain_stats should return intelligence stats', async () => {
      const facade = buildCoreFacade();
      const statsOp = facade.ops.find((o) => o.name === 'brain_stats')!;
      const result = (await statsOp.handler({})) as {
        vocabularySize: number;
        feedbackCount: number;
      };
      expect(result.vocabularySize).toBe(0);
      expect(result.feedbackCount).toBe(0);
    });

    it('curator_status should return table counts', async () => {
      const facade = buildCoreFacade();
      const statusOp = facade.ops.find((o) => o.name === 'curator_status')!;
      const result = (await statusOp.handler({})) as { initialized: boolean };
      expect(result.initialized).toBe(true);
    });

    it('curator_health_audit should return score', async () => {
      runtime.vault.seed([
        makeEntry({ id: 'ha1', type: 'pattern', tags: ['a', 'b'] }),
        makeEntry({ id: 'ha2', type: 'anti-pattern', tags: ['c', 'd'] }),
      ]);
      runtime.curator.groomAll();
      const facade = buildCoreFacade();
      const healthOp = facade.ops.find((o) => o.name === 'curator_health_audit')!;
      const result = (await healthOp.handler({})) as { score: number };
      expect(result.score).toBeGreaterThan(0);
    });

    it('governance_policy get should return default policy', async () => {
      const facade = buildCoreFacade();
      const policyOp = facade.ops.find((o) => o.name === 'governance_policy')!;
      const result = (await policyOp.handler({ action: 'get', projectPath: '/test' })) as {
        projectPath: string;
        quotas: { maxEntriesTotal: number };
        autoCapture: { enabled: boolean };
      };
      expect(result.projectPath).toBe('/test');
      expect(result.quotas.maxEntriesTotal).toBe(500);
      expect(result.autoCapture.enabled).toBe(true);
    });

    it('governance_dashboard should return combined view', async () => {
      const facade = buildCoreFacade();
      const dashOp = facade.ops.find((o) => o.name === 'governance_dashboard')!;
      const result = (await dashOp.handler({ projectPath: '/test' })) as {
        vaultSize: number;
        quotaPercent: number;
        pendingProposals: number;
      };
      expect(typeof result.vaultSize).toBe('number');
      expect(typeof result.quotaPercent).toBe('number');
      expect(result.pendingProposals).toBe(0);
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
