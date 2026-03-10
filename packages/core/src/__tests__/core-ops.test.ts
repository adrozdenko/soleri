import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAgentRuntime } from '../runtime/runtime.js';
import { createSemanticFacades } from '../runtime/facades/index.js';
import type { AgentRuntime } from '../runtime/types.js';
import type { OpDefinition } from '../facades/types.js';

describe('createSemanticFacades', () => {
  let runtime: AgentRuntime;
  let ops: OpDefinition[];
  let plannerDir: string;

  beforeEach(() => {
    plannerDir = join(tmpdir(), 'core-ops-test-' + Date.now());
    mkdirSync(plannerDir, { recursive: true });
    runtime = createAgentRuntime({
      agentId: 'test-core-ops',
      vaultPath: ':memory:',
      plansPath: join(plannerDir, 'plans.json'),
    });
    ops = createSemanticFacades(runtime, 'test').flatMap((f) => f.ops);
  });

  afterEach(() => {
    runtime.close();
    rmSync(plannerDir, { recursive: true, force: true });
  });

  function findOp(name: string): OpDefinition {
    const op = ops.find((o) => o.name === name);
    if (!op) throw new Error(`Op "${name}" not found`);
    return op;
  }

  it('should return 232 ops', () => {
    expect(ops.length).toBe(232);
  });

  it('should have all expected op names', () => {
    const names = ops.map((o) => o.name);
    // Search/Vault
    expect(names).toContain('search');
    expect(names).toContain('vault_stats');
    expect(names).toContain('list_all');
    expect(names).toContain('register');
    // Memory
    expect(names).toContain('memory_search');
    expect(names).toContain('memory_capture');
    expect(names).toContain('memory_list');
    expect(names).toContain('session_capture');
    // Export
    expect(names).toContain('export');
    // Planning
    expect(names).toContain('create_plan');
    expect(names).toContain('get_plan');
    expect(names).toContain('approve_plan');
    expect(names).toContain('update_task');
    expect(names).toContain('complete_plan');
    // Brain
    expect(names).toContain('record_feedback');
    expect(names).toContain('brain_feedback');
    expect(names).toContain('brain_feedback_stats');
    expect(names).toContain('rebuild_vocabulary');
    expect(names).toContain('brain_stats');
    expect(names).toContain('llm_status');
    // Brain Intelligence
    expect(names).toContain('brain_session_context');
    expect(names).toContain('brain_strengths');
    expect(names).toContain('brain_global_patterns');
    expect(names).toContain('brain_recommend');
    expect(names).toContain('brain_build_intelligence');
    expect(names).toContain('brain_export');
    expect(names).toContain('brain_import');
    expect(names).toContain('brain_extract_knowledge');
    expect(names).toContain('brain_archive_sessions');
    expect(names).toContain('brain_promote_proposals');
    expect(names).toContain('brain_lifecycle');
    expect(names).toContain('brain_reset_extracted');
    // Brain decay report (#89)
    expect(names).toContain('brain_decay_report');
    // Curator
    expect(names).toContain('curator_status');
    expect(names).toContain('curator_detect_duplicates');
    expect(names).toContain('curator_contradictions');
    expect(names).toContain('curator_resolve_contradiction');
    expect(names).toContain('curator_groom');
    expect(names).toContain('curator_groom_all');
    expect(names).toContain('curator_consolidate');
    expect(names).toContain('curator_health_audit');
    // Control
    expect(names).toContain('get_identity');
    expect(names).toContain('update_identity');
    expect(names).toContain('add_guideline');
    expect(names).toContain('remove_guideline');
    expect(names).toContain('rollback_identity');
    expect(names).toContain('route_intent');
    expect(names).toContain('morph');
    expect(names).toContain('get_behavior_rules');
    // Cognee
    expect(names).toContain('cognee_status');
    expect(names).toContain('cognee_search');
    expect(names).toContain('cognee_add');
    expect(names).toContain('cognee_cognify');
    expect(names).toContain('cognee_config');
    // LLM
    expect(names).toContain('llm_rotate');
    expect(names).toContain('llm_call');
    // Governance
    expect(names).toContain('governance_policy');
    expect(names).toContain('governance_proposals');
    expect(names).toContain('governance_stats');
    expect(names).toContain('governance_expire');
    expect(names).toContain('governance_dashboard');
    // Playbook (5)
    expect(names).toContain('playbook_list');
    expect(names).toContain('playbook_get');
    expect(names).toContain('playbook_match');
    expect(names).toContain('playbook_seed');
    expect(names).toContain('playbook_create');
    // Planning Extra (9)
    expect(names).toContain('plan_iterate');
    expect(names).toContain('plan_split');
    expect(names).toContain('plan_reconcile');
    expect(names).toContain('plan_complete_lifecycle');
    expect(names).toContain('plan_dispatch');
    expect(names).toContain('plan_review');
    expect(names).toContain('plan_archive');
    expect(names).toContain('plan_list_tasks');
    expect(names).toContain('plan_stats');
    // Memory Extra (8)
    expect(names).toContain('memory_delete');
    expect(names).toContain('memory_stats');
    expect(names).toContain('memory_export');
    expect(names).toContain('memory_import');
    expect(names).toContain('memory_prune');
    expect(names).toContain('memory_deduplicate');
    expect(names).toContain('memory_topics');
    expect(names).toContain('memory_by_project');
    // Vault Extra (12 + 3 temporal)
    expect(names).toContain('vault_get');
    expect(names).toContain('vault_update');
    expect(names).toContain('vault_remove');
    expect(names).toContain('vault_bulk_add');
    expect(names).toContain('vault_bulk_remove');
    expect(names).toContain('vault_tags');
    expect(names).toContain('vault_domains');
    expect(names).toContain('vault_recent');
    expect(names).toContain('vault_import');
    expect(names).toContain('vault_seed');
    expect(names).toContain('vault_backup');
    expect(names).toContain('vault_age_report');
    // #89: Bi-temporal
    expect(names).toContain('vault_set_temporal');
    expect(names).toContain('vault_find_expiring');
    expect(names).toContain('vault_find_expired');
    // Vault archival (#86)
    expect(names).toContain('vault_archive');
    expect(names).toContain('vault_restore');
    expect(names).toContain('vault_optimize');
    // Vault content hashing (#166)
    expect(names).toContain('vault_content_hash');
    expect(names).toContain('vault_dedup_status');
    // Admin (8)
    expect(names).toContain('admin_health');
    expect(names).toContain('admin_tool_list');
    expect(names).toContain('admin_config');
    expect(names).toContain('admin_vault_size');
    expect(names).toContain('admin_uptime');
    expect(names).toContain('admin_version');
    expect(names).toContain('admin_reset_cache');
    expect(names).toContain('admin_diagnostic');
    // Admin Extra (10)
    expect(names).toContain('admin_telemetry');
    expect(names).toContain('admin_telemetry_recent');
    expect(names).toContain('admin_telemetry_reset');
    expect(names).toContain('admin_permissions');
    expect(names).toContain('admin_vault_analytics');
    expect(names).toContain('admin_search_insights');
    expect(names).toContain('admin_module_status');
    expect(names).toContain('admin_env');
    expect(names).toContain('admin_gc');
    expect(names).toContain('admin_export_config');
    // Admin persistence (#85)
    expect(names).toContain('admin_persistence_info');
    // Loop (7)
    expect(names).toContain('loop_start');
    expect(names).toContain('loop_iterate');
    expect(names).toContain('loop_status');
    expect(names).toContain('loop_cancel');
    expect(names).toContain('loop_history');
    expect(names).toContain('loop_is_active');
    expect(names).toContain('loop_complete');
    // Orchestrate (5)
    expect(names).toContain('orchestrate_plan');
    expect(names).toContain('orchestrate_execute');
    expect(names).toContain('orchestrate_complete');
    expect(names).toContain('orchestrate_status');
    expect(names).toContain('orchestrate_quick_capture');
    // Grading (5)
    expect(names).toContain('plan_grade');
    expect(names).toContain('plan_check_history');
    expect(names).toContain('plan_latest_check');
    expect(names).toContain('plan_meets_grade');
    expect(names).toContain('plan_auto_improve');
    // Capture (4)
    expect(names).toContain('capture_knowledge');
    expect(names).toContain('capture_quick');
    expect(names).toContain('search_intelligent');
    expect(names).toContain('search_feedback');
    // Curator Extra (4 + 1 hybrid)
    expect(names).toContain('curator_entry_history');
    expect(names).toContain('curator_record_snapshot');
    expect(names).toContain('curator_queue_stats');
    expect(names).toContain('curator_enrich');
    // #36: Hybrid contradiction detection
    expect(names).toContain('curator_hybrid_contradictions');
    // Project (12)
    expect(names).toContain('project_get');
    expect(names).toContain('project_list');
    expect(names).toContain('project_unregister');
    expect(names).toContain('project_get_rules');
    expect(names).toContain('project_list_rules');
    expect(names).toContain('project_add_rule');
    expect(names).toContain('project_remove_rule');
    expect(names).toContain('project_link');
    expect(names).toContain('project_unlink');
    expect(names).toContain('project_get_links');
    expect(names).toContain('project_linked_projects');
    expect(names).toContain('project_touch');
    // Prompt templates
    expect(names).toContain('render_prompt');
    expect(names).toContain('list_templates');
    // Cognee Sync ops
    expect(names).toContain('cognee_sync_status');
    expect(names).toContain('cognee_sync_drain');
    expect(names).toContain('cognee_sync_reconcile');
    // Intake ops
    expect(names).toContain('intake_ingest_book');
    expect(names).toContain('intake_process');
    expect(names).toContain('intake_status');
    expect(names).toContain('intake_preview');
  });

  it('register should include governance summary', async () => {
    const result = (await findOp('register').handler({ projectPath: '/tmp/test-gov-reg' })) as {
      governance: { pendingProposals: number; quotaPercent: number; isQuotaWarning: boolean };
    };
    expect(typeof result.governance.pendingProposals).toBe('number');
    expect(typeof result.governance.quotaPercent).toBe('number');
    expect(typeof result.governance.isQuotaWarning).toBe('boolean');
  });

  it('search should query vault via brain', async () => {
    runtime.vault.seed([
      {
        id: 'co-1',
        type: 'pattern',
        domain: 'testing',
        title: 'Test pattern for core ops',
        severity: 'warning',
        description: 'Core ops test.',
        tags: ['test'],
      },
    ]);
    runtime.brain.rebuildVocabulary();

    // Re-create ops since brain state changed
    ops = createSemanticFacades(runtime, 'test').flatMap((f) => f.ops);
    const results = (await findOp('search').handler({ query: 'core ops test' })) as unknown[];
    expect(results.length).toBeGreaterThan(0);
  });

  it('vault_stats should return counts', async () => {
    runtime.vault.seed([
      {
        id: 'vs-1',
        type: 'pattern',
        domain: 'd1',
        title: 'T',
        severity: 'warning',
        description: 'D',
        tags: ['t'],
      },
    ]);
    const stats = (await findOp('vault_stats').handler({})) as { totalEntries: number };
    expect(stats.totalEntries).toBe(1);
  });

  it('create_plan + get_plan should work', async () => {
    const created = (await findOp('create_plan').handler({
      objective: 'Test plan',
      scope: 'core-ops test',
      tasks: [{ title: 'Task 1', description: 'Do something' }],
    })) as { created: boolean; plan: { id: string; status: string } };
    expect(created.created).toBe(true);
    expect(created.plan.status).toBe('draft');

    const plan = (await findOp('get_plan').handler({ planId: created.plan.id })) as { id: string };
    expect(plan.id).toBe(created.plan.id);
  });

  it('brain_stats should return stats', async () => {
    const stats = (await findOp('brain_stats').handler({})) as {
      vocabularySize: number;
      feedbackCount: number;
    };
    expect(stats.vocabularySize).toBe(0);
    expect(stats.feedbackCount).toBe(0);
  });

  it('llm_status should return provider info', async () => {
    const status = (await findOp('llm_status').handler({})) as {
      providers: {
        openai: { available: boolean };
        anthropic: { available: boolean };
      };
      routes: unknown[];
    };
    expect(typeof status.providers.openai.available).toBe('boolean');
    expect(typeof status.providers.anthropic.available).toBe('boolean');
    expect(Array.isArray(status.routes)).toBe(true);
  });

  it('curator_status should return initialized', async () => {
    const status = (await findOp('curator_status').handler({})) as { initialized: boolean };
    expect(status.initialized).toBe(true);
  });

  it('curator_health_audit should return score', async () => {
    runtime.vault.seed([
      {
        id: 'ha-1',
        type: 'pattern',
        domain: 'testing',
        title: 'Health pattern',
        severity: 'warning',
        description: 'Testing health.',
        tags: ['health'],
      },
    ]);
    runtime.curator.groomAll();
    const result = (await findOp('curator_health_audit').handler({})) as { score: number };
    expect(result.score).toBeGreaterThan(0);
  });

  it('memory_capture + memory_search should work', async () => {
    await findOp('memory_capture').handler({
      projectPath: '/test',
      type: 'lesson',
      context: 'Testing core ops',
      summary: 'Core ops memory test works',
      topics: ['testing'],
      filesModified: [],
      toolsUsed: [],
    });

    const results = (await findOp('memory_search').handler({
      query: 'core ops memory',
    })) as unknown[];
    expect(results.length).toBeGreaterThan(0);
  });

  it('brain_feedback should record enhanced feedback', async () => {
    runtime.vault.seed([
      {
        id: 'bf-1',
        type: 'pattern',
        domain: 'testing',
        title: 'Brain feedback test',
        severity: 'warning',
        description: 'Test.',
        tags: ['test'],
      },
    ]);
    ops = createSemanticFacades(runtime, 'test').flatMap((f) => f.ops);
    const result = (await findOp('brain_feedback').handler({
      query: 'test',
      entryId: 'bf-1',
      action: 'modified',
      source: 'recommendation',
      confidence: 0.8,
    })) as { id: number; action: string; source: string };
    expect(result.id).toBeGreaterThan(0);
    expect(result.action).toBe('modified');
    expect(result.source).toBe('recommendation');
  });

  it('brain_feedback_stats should return stats', async () => {
    const stats = (await findOp('brain_feedback_stats').handler({})) as {
      total: number;
      acceptanceRate: number;
    };
    expect(typeof stats.total).toBe('number');
    expect(typeof stats.acceptanceRate).toBe('number');
  });

  it('brain_reset_extracted should return reset count', async () => {
    const result = (await findOp('brain_reset_extracted').handler({ all: true })) as {
      reset: number;
    };
    expect(typeof result.reset).toBe('number');
  });

  it('export should return bundles', async () => {
    runtime.vault.seed([
      {
        id: 'exp-1',
        type: 'pattern',
        domain: 'security',
        title: 'Export test',
        severity: 'warning',
        description: 'Testing export.',
        tags: ['export'],
      },
    ]);
    const result = (await findOp('export').handler({})) as {
      exported: boolean;
      totalEntries: number;
    };
    expect(result.exported).toBe(true);
    expect(result.totalEntries).toBe(1);
  });

  it('cognee_status should return health check result', async () => {
    // Cognee is not running in tests — should degrade gracefully
    const result = (await findOp('cognee_status').handler({})) as {
      available: boolean;
      url: string;
    };
    expect(typeof result.available).toBe('boolean');
    expect(typeof result.url).toBe('string');
  });

  it('cognee_search should return empty when unavailable', async () => {
    const results = (await findOp('cognee_search').handler({
      query: 'test pattern',
    })) as unknown[];
    expect(results).toEqual([]);
  });

  it('cognee_add should return 0 when unavailable', async () => {
    runtime.vault.seed([
      {
        id: 'cog-1',
        type: 'pattern',
        domain: 'testing',
        title: 'Cognee test',
        severity: 'warning',
        description: 'Test.',
        tags: ['test'],
      },
    ]);
    const result = (await findOp('cognee_add').handler({
      entryIds: ['cog-1'],
    })) as { added: number };
    expect(result.added).toBe(0);
  });

  it('cognee_cognify should return unavailable when Cognee is down', async () => {
    const result = (await findOp('cognee_cognify').handler({})) as { status: string };
    expect(result.status).toBe('unavailable');
  });

  it('cognee_config should return config and null status', async () => {
    const result = (await findOp('cognee_config').handler({})) as {
      config: { baseUrl: string; dataset: string };
      cachedStatus: null;
    };
    expect(result.config.baseUrl).toBe('http://localhost:8000');
    expect(result.config.dataset).toBe('test-core-ops');
    expect(result.cachedStatus).toBeNull();
  });

  it('llm_rotate should return rotation status', async () => {
    const result = (await findOp('llm_rotate').handler({ provider: 'openai' })) as {
      rotated?: boolean;
      poolSize?: number;
      error?: string;
    };
    // Either reports no keys or successfully rotates
    expect(typeof result.rotated === 'boolean' || typeof result.error === 'string').toBe(true);
  });

  it('governance_policy get should return defaults', async () => {
    const result = (await findOp('governance_policy').handler({
      action: 'get',
      projectPath: '/test',
    })) as { quotas: { maxEntriesTotal: number } };
    expect(result.quotas.maxEntriesTotal).toBe(500);
  });

  it('governance_stats should return quota and proposal stats', async () => {
    const result = (await findOp('governance_stats').handler({
      projectPath: '/test',
    })) as {
      quotaStatus: { total: number };
      proposalStats: { total: number };
    };
    expect(typeof result.quotaStatus.total).toBe('number');
    expect(typeof result.proposalStats.total).toBe('number');
  });

  it('governance_dashboard should return combined view', async () => {
    const result = (await findOp('governance_dashboard').handler({
      projectPath: '/test',
    })) as {
      vaultSize: number;
      quotaPercent: number;
      pendingProposals: number;
    };
    expect(typeof result.vaultSize).toBe('number');
    expect(typeof result.quotaPercent).toBe('number');
    expect(result.pendingProposals).toBe(0);
  });
});
