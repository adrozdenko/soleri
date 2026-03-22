import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Vault } from '../../vault/vault.js';
import { Planner } from '../../planning/planner.js';
import { Brain } from '../../brain/brain.js';
import { BrainIntelligence } from '../../brain/intelligence.js';
import { Governance } from '../../governance/governance.js';
import { ProjectRegistry } from '../../project/project-registry.js';
import { PlaybookExecutor } from '../../playbooks/playbook-executor.js';
import { createOrchestrateFacadeOps } from './orchestrate-facade.js';
import { captureOps, executeOp } from '../../engine/test-helpers.js';
import type { CapturedOp } from '../../engine/test-helpers.js';
import type { AgentRuntime } from '../types.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeRuntime(vault: Vault): AgentRuntime {
  const brain = new Brain(vault);
  const plansPath = join(tmpdir(), `orch-test-${Date.now()}.json`);
  const planner = new Planner(plansPath);
  const brainIntelligence = new BrainIntelligence(vault, brain);
  const governance = new Governance(vault);
  const projectRegistry = new ProjectRegistry(vault.getProvider());
  const playbookExecutor = new PlaybookExecutor();
  const contextHealth = {
    track: vi.fn(),
    check: vi.fn().mockReturnValue({ level: 'green', estimatedFill: 0.1, toolCallCount: 5, estimatedTokens: 1000, recommendation: '' }),
  };

  return {
    vault,
    planner,
    brain,
    brainIntelligence,
    governance,
    projectRegistry,
    playbookExecutor,
    contextHealth,
    config: { agentId: 'test-agent' },
  } as unknown as AgentRuntime;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('orchestrate-facade', () => {
  let vault: Vault;
  let ops: Map<string, CapturedOp>;

  beforeEach(() => {
    vault = new Vault(':memory:');
    ops = captureOps(createOrchestrateFacadeOps(makeRuntime(vault)));
  });

  afterEach(() => {
    vault.close();
  });

  it('registers session_start + satellite ops', () => {
    expect(ops.size).toBeGreaterThanOrEqual(20);
    expect([...ops.keys()]).toContain('session_start');
    expect([...ops.keys()]).toContain('orchestrate_plan');
    expect([...ops.keys()]).toContain('orchestrate_execute');
    expect([...ops.keys()]).toContain('orchestrate_complete');
    expect([...ops.keys()]).toContain('orchestrate_status');
    expect([...ops.keys()]).toContain('orchestrate_quick_capture');
    expect([...ops.keys()]).toContain('project_get');
    expect([...ops.keys()]).toContain('project_list');
    expect([...ops.keys()]).toContain('playbook_list');
  });

  it('has correct auth levels', () => {
    expect(ops.get('session_start')!.auth).toBe('write');
    expect(ops.get('orchestrate_plan')!.auth).toBe('write');
    expect(ops.get('orchestrate_status')!.auth).toBe('read');
    expect(ops.get('project_get')!.auth).toBe('read');
    expect(ops.get('project_list')!.auth).toBe('read');
  });

  // ─── session_start ─────────────────────────────────────────────

  it('session_start registers project and returns stats', async () => {
    const result = await executeOp(ops, 'session_start', { projectPath: '/test/proj' });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.project).toBeDefined();
    expect(data.is_new).toBe(true);
    expect(data.vault).toBeDefined();
    expect(data.governance).toBeDefined();
  });

  it('session_start increments session count on second call', async () => {
    await executeOp(ops, 'session_start', { projectPath: '/test/proj' });
    const result = await executeOp(ops, 'session_start', { projectPath: '/test/proj' });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.is_new).toBe(false);
    expect(data.message).toContain('Session #2');
  });

  // ─── project_get ───────────────────────────────────────────────

  it('project_get returns not found for unregistered project', async () => {
    const result = await executeOp(ops, 'project_get', { projectId: 'nonexistent' });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).found).toBe(false);
  });

  // ─── project_list ──────────────────────────────────────────────

  it('project_list returns empty initially', async () => {
    const result = await executeOp(ops, 'project_list', {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).count).toBe(0);
  });

  it('project_list includes registered projects', async () => {
    await executeOp(ops, 'session_start', { projectPath: '/test/proj' });
    const result = await executeOp(ops, 'project_list', {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).count).toBeGreaterThanOrEqual(1);
  });

  // ─── orchestrate_status ────────────────────────────────────────

  it('orchestrate_status returns combined status', async () => {
    const result = await executeOp(ops, 'orchestrate_status', {});
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.activePlans).toBeDefined();
    expect(data.vaultStats).toBeDefined();
    expect(data.brainStats).toBeDefined();
  });

  // ─── orchestrate_quick_capture ─────────────────────────────────

  it('orchestrate_quick_capture captures knowledge', async () => {
    const result = await executeOp(ops, 'orchestrate_quick_capture', {
      domain: 'testing',
      context: 'Learned that tests should be colocated',
    });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.session).toBeDefined();
  });

  // ─── playbook_list ─────────────────────────────────────────────

  it('playbook_list returns empty with no playbooks', async () => {
    const result = await executeOp(ops, 'playbook_list', {});
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).count).toBe(0);
  });

  // ─── project_add_rule ──────────────────────────────────────────

  it('project_add_rule adds a rule to a project', async () => {
    await executeOp(ops, 'session_start', { projectPath: '/test/proj' });
    const listResult = await executeOp(ops, 'project_list', {});
    const projects = (listResult.data as { projects: Array<Record<string, unknown>> }).projects;
    const projectId = projects[0].id as string;

    const result = await executeOp(ops, 'project_add_rule', {
      projectId,
      category: 'convention',
      text: 'Use semantic tokens',
      priority: 5,
    });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).added).toBe(true);
  });

  // ─── project_unregister ────────────────────────────────────────

  it('project_unregister removes a project', async () => {
    await executeOp(ops, 'session_start', { projectPath: '/test/proj' });
    const listResult = await executeOp(ops, 'project_list', {});
    const projects = (listResult.data as { projects: Array<Record<string, unknown>> }).projects;
    const projectId = projects[0].id as string;

    const result = await executeOp(ops, 'project_unregister', { projectId });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).removed).toBe(true);
  });
});
