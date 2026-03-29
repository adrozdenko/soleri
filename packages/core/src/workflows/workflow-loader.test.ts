/**
 * Workflow loader — colocated contract tests.
 *
 * Uses temporary directories with real YAML files (no mocking fs).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadAgentWorkflows, getWorkflowForIntent } from './workflow-loader.js';
import type { WorkflowOverride } from './workflow-loader.js';

// ─── Helpers ────────────────────────────────────────────────────────

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'workflow-loader-test-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function createWorkflow(name: string, opts?: { gates?: string; tools?: string }): void {
  const dir = join(tempDir, name);
  mkdirSync(dir, { recursive: true });
  if (opts?.gates !== undefined) {
    writeFileSync(join(dir, 'gates.yaml'), opts.gates, 'utf-8');
  }
  if (opts?.tools !== undefined) {
    writeFileSync(join(dir, 'tools.yaml'), opts.tools, 'utf-8');
  }
}

// ─── loadAgentWorkflows ─────────────────────────────────────────────

describe('loadAgentWorkflows', () => {
  it('loads valid gates.yaml and tools.yaml', () => {
    createWorkflow('feature-dev', {
      gates: `
- phase: pre-execution
  requirement: vault search completed
  check: vault-search
- phase: completion
  requirement: knowledge captured
  check: knowledge-capture
`,
      tools: `
- vault_search
- plan_create
- brain_recommend
`,
    });

    const workflows = loadAgentWorkflows(tempDir);

    expect(workflows.size).toBe(1);
    const wf = workflows.get('feature-dev')!;
    expect(wf.gates).toHaveLength(2);
    expect(wf.gates[0]).toEqual({
      phase: 'pre-execution',
      requirement: 'vault search completed',
      check: 'vault-search',
    });
    expect(wf.gates[1].phase).toBe('completion');
    expect(wf.tools).toEqual(['vault_search', 'plan_create', 'brain_recommend']);
  });

  it('skips malformed gates.yaml with warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    createWorkflow('bad-gates', {
      gates: `
- phase: invalid-phase
  requirement: something
  check: some-check
`,
      tools: `
- tool_a
`,
    });

    const workflows = loadAgentWorkflows(tempDir);

    expect(workflows.size).toBe(1);
    const wf = workflows.get('bad-gates')!;
    expect(wf.gates).toEqual([]); // malformed gates skipped
    expect(wf.tools).toEqual(['tool_a']); // tools still loaded
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping invalid gates.yaml'));

    warnSpy.mockRestore();
  });

  it('returns empty map for missing directory', () => {
    const workflows = loadAgentWorkflows(join(tempDir, 'nonexistent'));
    expect(workflows.size).toBe(0);
  });

  it('returns empty gates array when gates.yaml is missing', () => {
    createWorkflow('tools-only', {
      tools: `
- tool_x
- tool_y
`,
    });

    const workflows = loadAgentWorkflows(tempDir);

    expect(workflows.size).toBe(1);
    const wf = workflows.get('tools-only')!;
    expect(wf.gates).toEqual([]);
    expect(wf.tools).toEqual(['tool_x', 'tool_y']);
  });

  it('returns empty tools array when tools.yaml is missing', () => {
    createWorkflow('gates-only', {
      gates: `
- phase: brainstorming
  requirement: explore options
  check: brainstorm-check
`,
    });

    const workflows = loadAgentWorkflows(tempDir);

    expect(workflows.size).toBe(1);
    const wf = workflows.get('gates-only')!;
    expect(wf.gates).toHaveLength(1);
    expect(wf.tools).toEqual([]);
  });

  it('loads multiple workflow subdirectories', () => {
    createWorkflow('feature-dev', {
      gates: `
- phase: pre-execution
  requirement: vault check
  check: vault
`,
      tools: '- plan_create',
    });
    createWorkflow('bug-fix', {
      tools: '- debug_tool',
    });

    const workflows = loadAgentWorkflows(tempDir);
    expect(workflows.size).toBe(2);
    expect(workflows.has('feature-dev')).toBe(true);
    expect(workflows.has('bug-fix')).toBe(true);
  });

  it('ignores files (non-directories) in the workflows dir', () => {
    writeFileSync(join(tempDir, 'README.md'), '# Workflows');
    createWorkflow('real-workflow', { tools: '- tool_a' });

    const workflows = loadAgentWorkflows(tempDir);
    expect(workflows.size).toBe(1);
    expect(workflows.has('real-workflow')).toBe(true);
  });
});

// ─── getWorkflowForIntent ───────────────────────────────────────────

describe('getWorkflowForIntent', () => {
  function buildMap(entries: [string, WorkflowOverride][]): Map<string, WorkflowOverride> {
    return new Map(entries);
  }

  const sampleOverride: WorkflowOverride = {
    gates: [{ phase: 'pre-execution', requirement: 'test', check: 'test-check' }],
    tools: ['tool_a'],
  };

  it('resolves intent via default WORKFLOW_TO_INTENT mapping', () => {
    const workflows = buildMap([['feature-dev', sampleOverride]]);
    const result = getWorkflowForIntent(workflows, 'BUILD');
    expect(result).toEqual(sampleOverride);
  });

  it('returns null when no workflow matches the intent', () => {
    const workflows = buildMap([['feature-dev', sampleOverride]]);
    const result = getWorkflowForIntent(workflows, 'UNKNOWN_INTENT');
    expect(result).toBeNull();
  });

  it('returns null when mapping exists but workflow is not loaded', () => {
    const workflows = buildMap([]); // empty map
    const result = getWorkflowForIntent(workflows, 'BUILD');
    expect(result).toBeNull();
  });

  it('custom mapping overrides default mapping', () => {
    const customOverride: WorkflowOverride = { gates: [], tools: ['custom_tool'] };
    const workflows = buildMap([
      ['feature-dev', sampleOverride],
      ['my-custom', customOverride],
    ]);

    // Without custom mapping, BUILD maps to feature-dev
    expect(getWorkflowForIntent(workflows, 'BUILD')).toEqual(sampleOverride);

    // With custom mapping, BUILD maps to my-custom
    const result = getWorkflowForIntent(workflows, 'BUILD', { 'my-custom': 'BUILD' });
    expect(result).toEqual(customOverride);
  });

  it('custom mapping adds new intent mappings', () => {
    const deployOverride: WorkflowOverride = { gates: [], tools: ['deploy_tool'] };
    const workflows = buildMap([['deploy', deployOverride]]);

    const result = getWorkflowForIntent(workflows, 'DEPLOY', { deploy: 'DEPLOY' });
    expect(result).toEqual(deployOverride);
  });
});
