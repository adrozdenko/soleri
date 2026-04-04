import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createControlFacadeOps } from './control-facade.js';
import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';

function mockRuntime(): AgentRuntime {
  return {
    identityManager: {
      getIdentity: vi.fn(),
      setIdentity: vi.fn(),
      addGuideline: vi.fn(),
      removeGuideline: vi.fn(),
      rollback: vi.fn(),
    },
    intentRouter: {
      routeIntent: vi.fn(),
      morph: vi.fn(),
      getBehaviorRules: vi.fn(),
      getCurrentMode: vi.fn(),
      recordRoutingFeedback: vi.fn(),
      getRoutingAccuracy: vi.fn(),
    },
    governance: {
      getPolicy: vi.fn(),
      setPolicy: vi.fn(),
      applyPreset: vi.fn(),
      listPendingProposals: vi.fn(),
      approveProposal: vi.fn(),
      rejectProposal: vi.fn(),
      modifyProposal: vi.fn(),
      getProposalStats: vi.fn(),
      expireStaleProposals: vi.fn(),
      getQuotaStatus: vi.fn(),
      getDashboard: vi.fn(),
    },
  } as unknown as AgentRuntime;
}

function findOp(ops: OpDefinition[], name: string): OpDefinition {
  const op = ops.find((o) => o.name === name);
  if (!op) throw new Error(`Op "${name}" not found`);
  return op;
}

describe('createControlFacadeOps', () => {
  let runtime: ReturnType<typeof mockRuntime>;
  let ops: OpDefinition[];

  beforeEach(() => {
    runtime = mockRuntime();
    ops = createControlFacadeOps(runtime);
  });

  describe('get_identity', () => {
    it('returns identity when found', async () => {
      const identity = { agentId: 'test', name: 'Test Agent', version: 1 };
      vi.mocked(runtime.identityManager.getIdentity).mockReturnValue(identity as never);

      const result = await findOp(ops, 'get_identity').handler({ agentId: 'test' });
      expect(result).toEqual(identity);
      expect(runtime.identityManager.getIdentity).toHaveBeenCalledWith('test');
    });

    it('returns found:false when identity missing', async () => {
      vi.mocked(runtime.identityManager.getIdentity).mockReturnValue(undefined as never);

      const result = await findOp(ops, 'get_identity').handler({ agentId: 'missing' });
      expect(result).toEqual({ found: false, agentId: 'missing' });
    });
  });

  describe('update_identity', () => {
    it('updates identity and returns updated flag', async () => {
      const updated = { agentId: 'test', name: 'New Name', version: 2 };
      vi.mocked(runtime.identityManager.setIdentity).mockReturnValue(updated as never);

      const result = await findOp(ops, 'update_identity').handler({
        agentId: 'test',
        name: 'New Name',
      });
      expect(result).toEqual({ updated: true, identity: updated });
    });
  });

  describe('add_guideline', () => {
    it('adds guideline and returns added flag', async () => {
      const guideline = { id: 'g1', category: 'behavior', text: 'Be nice' };
      vi.mocked(runtime.identityManager.addGuideline).mockReturnValue(guideline as never);

      const result = await findOp(ops, 'add_guideline').handler({
        agentId: 'test',
        category: 'behavior',
        text: 'Be nice',
      });
      expect(result).toEqual({ added: true, guideline });
      expect(runtime.identityManager.addGuideline).toHaveBeenCalledWith('test', {
        category: 'behavior',
        text: 'Be nice',
        priority: undefined,
      });
    });

    it('passes priority when provided', async () => {
      vi.mocked(runtime.identityManager.addGuideline).mockReturnValue({} as never);

      await findOp(ops, 'add_guideline').handler({
        agentId: 'test',
        category: 'style',
        text: 'Use formal tone',
        priority: 10,
      });
      expect(runtime.identityManager.addGuideline).toHaveBeenCalledWith('test', {
        category: 'style',
        text: 'Use formal tone',
        priority: 10,
      });
    });
  });

  describe('remove_guideline', () => {
    it('returns removal result', async () => {
      vi.mocked(runtime.identityManager.removeGuideline).mockReturnValue(true as never);

      const result = await findOp(ops, 'remove_guideline').handler({ guidelineId: 'g1' });
      expect(result).toEqual({ removed: true });
    });

    it('returns false when guideline not found', async () => {
      vi.mocked(runtime.identityManager.removeGuideline).mockReturnValue(false as never);

      const result = await findOp(ops, 'remove_guideline').handler({ guidelineId: 'none' });
      expect(result).toEqual({ removed: false });
    });
  });

  describe('rollback_identity', () => {
    it('rolls back to specified version', async () => {
      const identity = { agentId: 'test', version: 1 };
      vi.mocked(runtime.identityManager.rollback).mockReturnValue(identity as never);

      const result = await findOp(ops, 'rollback_identity').handler({
        agentId: 'test',
        version: 1,
      });
      expect(result).toEqual({ rolledBack: true, identity });
      expect(runtime.identityManager.rollback).toHaveBeenCalledWith('test', 1);
    });
  });

  describe('route_intent', () => {
    it('classifies prompt', async () => {
      const routing = { intent: 'BUILD', confidence: 0.9, mode: 'BUILD-MODE' };
      vi.mocked(runtime.intentRouter.routeIntent).mockReturnValue(routing as never);

      const result = await findOp(ops, 'route_intent').handler({ prompt: 'build a button' });
      expect(result).toEqual(routing);
      expect(runtime.intentRouter.routeIntent).toHaveBeenCalledWith('build a button');
    });
  });

  describe('morph', () => {
    it('switches mode', async () => {
      const morphResult = { mode: 'BUILD-MODE', previous: 'GENERAL-MODE' };
      vi.mocked(runtime.intentRouter.morph).mockReturnValue(morphResult as never);

      const result = await findOp(ops, 'morph').handler({ mode: 'BUILD-MODE' });
      expect(result).toEqual(morphResult);
    });
  });

  describe('get_behavior_rules', () => {
    it('returns rules for specified mode', async () => {
      const rules = ['Rule 1', 'Rule 2'];
      vi.mocked(runtime.intentRouter.getBehaviorRules).mockReturnValue(rules as never);
      vi.mocked(runtime.intentRouter.getCurrentMode).mockReturnValue('GENERAL-MODE' as never);

      const result = await findOp(ops, 'get_behavior_rules').handler({ mode: 'BUILD-MODE' });
      expect(result).toEqual({ mode: 'BUILD-MODE', rules });
    });

    it('defaults to current mode when none specified', async () => {
      const rules = ['Default rule'];
      vi.mocked(runtime.intentRouter.getBehaviorRules).mockReturnValue(rules as never);
      vi.mocked(runtime.intentRouter.getCurrentMode).mockReturnValue('FIX-MODE' as never);

      const result = await findOp(ops, 'get_behavior_rules').handler({});
      expect(result).toEqual({ mode: 'FIX-MODE', rules });
      expect(runtime.intentRouter.getBehaviorRules).toHaveBeenCalledWith(undefined);
    });
  });

  describe('governance_policy', () => {
    it('gets policy', async () => {
      const policy = { quota: {}, retention: {} };
      vi.mocked(runtime.governance.getPolicy).mockReturnValue(policy as never);

      const result = await findOp(ops, 'governance_policy').handler({
        action: 'get',
        projectPath: '/proj',
      });
      expect(result).toEqual(policy);
    });

    it('sets policy', async () => {
      const policy = { updated: true };
      vi.mocked(runtime.governance.getPolicy).mockReturnValue(policy as never);

      const result = (await findOp(ops, 'governance_policy').handler({
        action: 'set',
        projectPath: '/proj',
        policyType: 'quota',
        config: { maxEntries: 1000 },
        changedBy: 'user',
      })) as Record<string, unknown>;
      expect(result.updated).toBe(true);
      expect(runtime.governance.setPolicy).toHaveBeenCalledWith(
        '/proj',
        'quota',
        { maxEntries: 1000 },
        'user',
      );
    });

    it('returns error when set called without policyType', async () => {
      const result = (await findOp(ops, 'governance_policy').handler({
        action: 'set',
        projectPath: '/proj',
      })) as Record<string, unknown>;
      expect(result.error).toContain('policyType is required');
    });

    it('applies preset', async () => {
      const policy = { applied: true };
      vi.mocked(runtime.governance.getPolicy).mockReturnValue(policy as never);

      const result = (await findOp(ops, 'governance_policy').handler({
        action: 'applyPreset',
        projectPath: '/proj',
        preset: 'strict',
        changedBy: 'admin',
      })) as Record<string, unknown>;
      expect(result.applied).toBe(true);
      expect(result.preset).toBe('strict');
    });

    it('returns error for unknown action', async () => {
      const result = (await findOp(ops, 'governance_policy').handler({
        action: 'unknown',
        projectPath: '/proj',
      })) as Record<string, unknown>;
      expect(result.error).toContain('Unknown action');
    });
  });

  describe('governance_proposals', () => {
    it('lists pending proposals', async () => {
      const proposals = [{ id: 1 }];
      vi.mocked(runtime.governance.listPendingProposals).mockReturnValue(proposals as never);

      const result = await findOp(ops, 'governance_proposals').handler({
        action: 'list',
        projectPath: '/proj',
        limit: 10,
      });
      expect(result).toEqual(proposals);
    });

    it('approves a proposal', async () => {
      vi.mocked(runtime.governance.approveProposal).mockReturnValue({ approved: true } as never);

      const result = await findOp(ops, 'governance_proposals').handler({
        action: 'approve',
        proposalId: 1,
        decidedBy: 'user',
      });
      expect(result).toEqual({ approved: true });
    });

    it('rejects a proposal', async () => {
      vi.mocked(runtime.governance.rejectProposal).mockReturnValue({ rejected: true } as never);

      await findOp(ops, 'governance_proposals').handler({
        action: 'reject',
        proposalId: 2,
        decidedBy: 'user',
        note: 'Not needed',
      });
      expect(runtime.governance.rejectProposal).toHaveBeenCalledWith(2, 'user', 'Not needed');
    });

    it('modifies a proposal', async () => {
      vi.mocked(runtime.governance.modifyProposal).mockReturnValue({ modified: true } as never);

      await findOp(ops, 'governance_proposals').handler({
        action: 'modify',
        proposalId: 3,
        modifications: { title: 'Updated' },
        decidedBy: 'user',
      });
      expect(runtime.governance.modifyProposal).toHaveBeenCalledWith(
        3,
        { title: 'Updated' },
        'user',
      );
    });

    it('gets stats', async () => {
      vi.mocked(runtime.governance.getProposalStats).mockReturnValue({ total: 5 } as never);

      const result = await findOp(ops, 'governance_proposals').handler({
        action: 'stats',
        projectPath: '/proj',
      });
      expect(result).toEqual({ total: 5 });
    });

    it('expires stale proposals', async () => {
      vi.mocked(runtime.governance.expireStaleProposals).mockReturnValue(3 as never);

      const result = (await findOp(ops, 'governance_proposals').handler({
        action: 'expire',
        maxAgeDays: 7,
      })) as Record<string, unknown>;
      expect(result.expired).toBe(3);
    });

    it('returns error for unknown action', async () => {
      const result = (await findOp(ops, 'governance_proposals').handler({
        action: 'unknown',
      })) as Record<string, unknown>;
      expect(result.error).toContain('Unknown action');
    });
  });

  describe('governance_stats', () => {
    it('returns quota and proposal stats', async () => {
      vi.mocked(runtime.governance.getQuotaStatus).mockReturnValue({ used: 10 } as never);
      vi.mocked(runtime.governance.getProposalStats).mockReturnValue({ total: 5 } as never);

      const result = (await findOp(ops, 'governance_stats').handler({
        projectPath: '/proj',
      })) as Record<string, unknown>;
      expect(result.quotaStatus).toEqual({ used: 10 });
      expect(result.proposalStats).toEqual({ total: 5 });
    });
  });

  describe('governance_expire', () => {
    it('expires stale proposals with default age', async () => {
      vi.mocked(runtime.governance.expireStaleProposals).mockReturnValue(2 as never);

      const result = (await findOp(ops, 'governance_expire').handler({})) as Record<
        string,
        unknown
      >;
      expect(result.expired).toBe(2);
      expect(runtime.governance.expireStaleProposals).toHaveBeenCalledWith(undefined);
    });
  });

  describe('governance_dashboard', () => {
    it('returns dashboard data', async () => {
      const dashboard = { vaultSize: 100, quotaUsage: 0.5 };
      vi.mocked(runtime.governance.getDashboard).mockReturnValue(dashboard as never);

      const result = await findOp(ops, 'governance_dashboard').handler({
        projectPath: '/proj',
      });
      expect(result).toEqual(dashboard);
    });
  });

  describe('routing_feedback', () => {
    it('records feedback', async () => {
      vi.mocked(runtime.intentRouter.recordRoutingFeedback).mockReturnValue({
        recorded: true,
      } as never);

      const result = await findOp(ops, 'routing_feedback').handler({
        initialIntent: 'BUILD',
        actualIntent: 'FIX',
        confidence: 0.7,
        correction: true,
      });
      expect(result).toEqual({ recorded: true });
      expect(runtime.intentRouter.recordRoutingFeedback).toHaveBeenCalledWith({
        initialIntent: 'BUILD',
        actualIntent: 'FIX',
        confidence: 0.7,
        correction: true,
        routingLogId: undefined,
      });
    });
  });

  describe('routing_accuracy', () => {
    it('returns accuracy report', async () => {
      const report = { accuracy: 0.85, total: 100 };
      vi.mocked(runtime.intentRouter.getRoutingAccuracy).mockReturnValue(report as never);

      const result = await findOp(ops, 'routing_accuracy').handler({ periodDays: 7 });
      expect(result).toEqual(report);
      expect(runtime.intentRouter.getRoutingAccuracy).toHaveBeenCalledWith(7);
    });
  });
});
