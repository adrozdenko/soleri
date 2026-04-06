import fs from 'node:fs';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadAgentWorkflows, getWorkflowForIntent, WORKFLOW_TO_INTENT } from './workflow-loader.js';
import type { WorkflowOverride } from './workflow-loader.js';
import type { AgentConfig } from '../runtime/agent-config.js';

vi.mock('node:fs', () => ({
  default: {
    readdirSync: vi.fn(),
    statSync: vi.fn(),
    readFileSync: vi.fn(),
  },
}));

describe('workflow-loader', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('loadAgentWorkflows', () => {
    it('returns empty map when directory does not exist', () => {
      (fs.readdirSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const result = loadAgentWorkflows('/nonexistent/workflows');
      expect(result.size).toBe(0);
    });

    it('loads gates and tools from workflow folder', () => {
      (fs.readdirSync as ReturnType<typeof vi.fn>).mockReturnValue(['feature-dev']);
      (fs.statSync as ReturnType<typeof vi.fn>).mockReturnValue({ isDirectory: () => true });
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation((filePath: string) => {
        if (filePath.endsWith('prompt.md')) {
          return '# Feature Dev\nBuild new features.';
        }
        if (filePath.endsWith('gates.yaml')) {
          return `gates:
  - phase: pre-execution
    requirement: Plan approved
    check: plan-approved
  - phase: completion
    requirement: Tests pass
    check: tests-pass
`;
        }
        if (filePath.endsWith('tools.yaml')) {
          return `tools:
  - soleri_vault op:search_intelligent
  - soleri_plan op:create_plan
`;
        }
        throw new Error('ENOENT');
      });

      const result = loadAgentWorkflows('/agent/workflows');
      expect(result.size).toBe(1);

      const workflow = result.get('feature-dev')!;
      expect(workflow.name).toBe('feature-dev');
      expect(workflow.prompt).toBe('# Feature Dev\nBuild new features.');
      expect(workflow.gates).toHaveLength(2);
      expect(workflow.gates[0]).toEqual({
        phase: 'pre-execution',
        requirement: 'Plan approved',
        check: 'plan-approved',
      });
      expect(workflow.gates[1]).toEqual({
        phase: 'completion',
        requirement: 'Tests pass',
        check: 'tests-pass',
      });
      expect(workflow.tools).toEqual([
        'soleri_vault op:search_intelligent',
        'soleri_plan op:create_plan',
      ]);
    });

    it('skips non-directory entries', () => {
      (fs.readdirSync as ReturnType<typeof vi.fn>).mockReturnValue(['README.md']);
      (fs.statSync as ReturnType<typeof vi.fn>).mockReturnValue({ isDirectory: () => false });

      const result = loadAgentWorkflows('/agent/workflows');
      expect(result.size).toBe(0);
    });

    it('skips workflow folders with no content', () => {
      (fs.readdirSync as ReturnType<typeof vi.fn>).mockReturnValue(['empty-workflow']);
      (fs.statSync as ReturnType<typeof vi.fn>).mockReturnValue({ isDirectory: () => true });
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const result = loadAgentWorkflows('/agent/workflows');
      expect(result.size).toBe(0);
    });
  });

  describe('getWorkflowForIntent', () => {
    it('returns matching workflow for BUILD intent', () => {
      const workflows = new Map<string, WorkflowOverride>([
        ['feature-dev', { name: 'feature-dev', gates: [], tools: ['tool1'] }],
      ]);

      const result = getWorkflowForIntent(workflows, 'BUILD');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('feature-dev');
    });

    it('returns null when no matching workflow', () => {
      const workflows = new Map<string, WorkflowOverride>([
        ['feature-dev', { name: 'feature-dev', gates: [], tools: ['tool1'] }],
      ]);

      const result = getWorkflowForIntent(workflows, 'EXPLORE');
      expect(result).toBeNull();
    });

    it('uses custom mapping when provided', () => {
      const workflows = new Map<string, WorkflowOverride>([
        ['my-custom', { name: 'my-custom', gates: [], tools: ['t1'] }],
      ]);

      const result = getWorkflowForIntent(workflows, 'DESIGN', {
        'my-custom': 'DESIGN',
      });
      expect(result).not.toBeNull();
      expect(result!.name).toBe('my-custom');
    });

    it('is case-insensitive for intent', () => {
      const workflows = new Map<string, WorkflowOverride>([
        ['bug-fix', { name: 'bug-fix', gates: [], tools: [] }],
      ]);

      // bug-fix maps to FIX in WORKFLOW_TO_INTENT
      const result = getWorkflowForIntent(workflows, 'fix');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('bug-fix');
    });
  });

  describe('WORKFLOW_TO_INTENT', () => {
    it('maps known workflow names to intents', () => {
      expect(WORKFLOW_TO_INTENT['feature-dev']).toBe('BUILD');
      expect(WORKFLOW_TO_INTENT['bug-fix']).toBe('FIX');
      expect(WORKFLOW_TO_INTENT['code-review']).toBe('REVIEW');
    });
  });

  describe('AgentConfig override', () => {
    it('returns deliver workflow when agentConfig.workflows maps deliver → DELIVER', () => {
      const workflows = new Map<string, WorkflowOverride>([
        ['deliver', { name: 'deliver', gates: [], tools: ['tool1'] }],
      ]);

      const agentConfig: AgentConfig = {
        workflows: { deliver: 'DELIVER' },
        probes: [],
      };

      const result = getWorkflowForIntent(workflows, 'DELIVER', agentConfig.workflows);
      expect(result).not.toBeNull();
      expect(result!.name).toBe('deliver');
    });

    it('falls back to WORKFLOW_TO_INTENT behavior when no agentConfig is provided', () => {
      const workflows = new Map<string, WorkflowOverride>([
        ['bug-fix', { name: 'bug-fix', gates: [], tools: [] }],
      ]);

      // No agentConfig — standard mapping should still work
      const result = getWorkflowForIntent(workflows, 'FIX');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('bug-fix');
    });
  });
});
