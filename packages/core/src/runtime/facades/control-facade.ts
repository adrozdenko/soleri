/**
 * Control facade — agent behavior ops.
 * identity, intent routing, morphing, guidelines, governance.
 */

import { z } from 'zod';
import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';
import type { GuidelineCategory, OperationalMode } from '../../control/types.js';
import type { PolicyType, PolicyPreset } from '../../governance/types.js';

export function createControlFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  const { identityManager, intentRouter, governance } = runtime;

  return [
    // ─── Control (inline from core-ops.ts) ──────────────────────
    {
      name: 'get_identity',
      description: 'Get current agent identity with guidelines.',
      auth: 'read',
      schema: z.object({
        agentId: z.string().describe('Agent identifier.'),
      }),
      handler: async (params) => {
        const identity = identityManager.getIdentity(params.agentId as string);
        if (!identity) return { found: false, agentId: params.agentId };
        return identity;
      },
    },
    {
      name: 'update_identity',
      description: 'Update identity fields. Auto-versions and snapshots previous state.',
      auth: 'write',
      schema: z.object({
        agentId: z.string(),
        name: z.string().optional(),
        role: z.string().optional(),
        description: z.string().optional(),
        personality: z.array(z.string()).optional(),
        changedBy: z.string().optional(),
        changeReason: z.string().optional(),
      }),
      handler: async (params) => {
        const identity = identityManager.setIdentity(params.agentId as string, {
          name: params.name as string | undefined,
          role: params.role as string | undefined,
          description: params.description as string | undefined,
          personality: params.personality as string[] | undefined,
          changedBy: params.changedBy as string | undefined,
          changeReason: params.changeReason as string | undefined,
        });
        return { updated: true, identity };
      },
    },
    {
      name: 'add_guideline',
      description: 'Add a behavioral guideline (behavior/preference/restriction/style).',
      auth: 'write',
      schema: z.object({
        agentId: z.string(),
        category: z.enum(['behavior', 'preference', 'restriction', 'style']),
        text: z.string(),
        priority: z.number().optional(),
      }),
      handler: async (params) => {
        const guideline = identityManager.addGuideline(params.agentId as string, {
          category: params.category as GuidelineCategory,
          text: params.text as string,
          priority: params.priority as number | undefined,
        });
        return { added: true, guideline };
      },
    },
    {
      name: 'remove_guideline',
      description: 'Remove a guideline by ID.',
      auth: 'write',
      schema: z.object({
        guidelineId: z.string(),
      }),
      handler: async (params) => {
        const removed = identityManager.removeGuideline(params.guidelineId as string);
        return { removed };
      },
    },
    {
      name: 'rollback_identity',
      description: 'Restore a previous identity version. Creates a new version with the old data.',
      auth: 'write',
      schema: z.object({
        agentId: z.string(),
        version: z.number().describe('Version number to roll back to.'),
      }),
      handler: async (params) => {
        const identity = identityManager.rollback(
          params.agentId as string,
          params.version as number,
        );
        return { rolledBack: true, identity };
      },
    },
    {
      name: 'route_intent',
      description: 'Classify a prompt into intent + operational mode via keyword matching.',
      auth: 'read',
      schema: z.object({
        prompt: z.string().describe('The user prompt to classify.'),
      }),
      handler: async (params) => {
        return intentRouter.routeIntent(params.prompt as string);
      },
    },
    {
      name: 'morph',
      description: 'Switch operational mode manually.',
      auth: 'write',
      schema: z.object({
        mode: z
          .string()
          .describe('The operational mode to switch to (e.g., BUILD-MODE, FIX-MODE).'),
      }),
      handler: async (params) => {
        return intentRouter.morph(params.mode as OperationalMode);
      },
    },
    {
      name: 'get_behavior_rules',
      description: 'Get behavior rules for current or specified mode.',
      auth: 'read',
      schema: z.object({
        mode: z.string().optional().describe('Mode to get rules for. Defaults to current mode.'),
      }),
      handler: async (params) => {
        const mode = params.mode as OperationalMode | undefined;
        const rules = intentRouter.getBehaviorRules(mode);
        const currentMode = intentRouter.getCurrentMode();
        return { mode: mode ?? currentMode, rules };
      },
    },

    // ─── Governance (inline from core-ops.ts) ───────────────────
    {
      name: 'governance_policy',
      description:
        'Get, set, or apply a preset to vault governance policies (quota, retention, auto-capture).',
      auth: 'write',
      schema: z.object({
        action: z.enum(['get', 'set', 'applyPreset']),
        projectPath: z.string(),
        policyType: z.enum(['quota', 'retention', 'auto-capture']).optional(),
        config: z.record(z.unknown()).optional(),
        preset: z.enum(['strict', 'moderate', 'permissive']).optional(),
        changedBy: z.string().optional(),
      }),
      handler: async (params) => {
        const action = params.action as string;
        const projectPath = params.projectPath as string;
        if (action === 'get') {
          return governance.getPolicy(projectPath);
        }
        if (action === 'set') {
          governance.setPolicy(
            projectPath,
            params.policyType as PolicyType,
            params.config as Record<string, unknown>,
            params.changedBy as string | undefined,
          );
          return { updated: true, policy: governance.getPolicy(projectPath) };
        }
        if (action === 'applyPreset') {
          governance.applyPreset(
            projectPath,
            params.preset as PolicyPreset,
            params.changedBy as string | undefined,
          );
          return {
            applied: true,
            preset: params.preset,
            policy: governance.getPolicy(projectPath),
          };
        }
        return { error: 'Unknown action: ' + action };
      },
    },
    {
      name: 'governance_proposals',
      description:
        'Manage knowledge capture proposals — list, approve, reject, modify, get stats, or expire stale.',
      auth: 'write',
      schema: z.object({
        action: z.enum(['list', 'approve', 'reject', 'modify', 'stats', 'expire']),
        projectPath: z.string().optional(),
        proposalId: z.number().optional(),
        decidedBy: z.string().optional(),
        note: z.string().optional(),
        modifications: z.record(z.unknown()).optional(),
        maxAgeDays: z.number().optional(),
        limit: z.number().optional(),
      }),
      handler: async (params) => {
        const action = params.action as string;
        if (action === 'list') {
          return governance.listPendingProposals(
            params.projectPath as string | undefined,
            params.limit as number | undefined,
          );
        }
        if (action === 'approve') {
          return governance.approveProposal(
            params.proposalId as number,
            params.decidedBy as string | undefined,
          );
        }
        if (action === 'reject') {
          return governance.rejectProposal(
            params.proposalId as number,
            params.decidedBy as string | undefined,
            params.note as string | undefined,
          );
        }
        if (action === 'modify') {
          return governance.modifyProposal(
            params.proposalId as number,
            params.modifications as Record<string, unknown>,
            params.decidedBy as string | undefined,
          );
        }
        if (action === 'stats') {
          return governance.getProposalStats(params.projectPath as string | undefined);
        }
        if (action === 'expire') {
          const expired = governance.expireStaleProposals(params.maxAgeDays as number | undefined);
          return { expired };
        }
        return { error: 'Unknown action: ' + action };
      },
    },
    {
      name: 'governance_stats',
      description: 'Get governance statistics — quota status and proposal stats for a project.',
      auth: 'read',
      schema: z.object({
        projectPath: z.string(),
      }),
      handler: async (params) => {
        const projectPath = params.projectPath as string;
        return {
          quotaStatus: governance.getQuotaStatus(projectPath),
          proposalStats: governance.getProposalStats(projectPath),
        };
      },
    },
    {
      name: 'governance_expire',
      description: 'Expire stale pending proposals older than a threshold.',
      auth: 'write',
      schema: z.object({
        projectPath: z.string().optional(),
        maxAgeDays: z.number().optional().describe('Days threshold. Default 14.'),
      }),
      handler: async (params) => {
        const expired = governance.expireStaleProposals(params.maxAgeDays as number | undefined);
        return { expired };
      },
    },
    {
      name: 'governance_dashboard',
      description:
        'Get governance dashboard — vault size, quota usage, pending proposals, acceptance rate, evaluation trend.',
      auth: 'read',
      schema: z.object({
        projectPath: z.string(),
      }),
      handler: async (params) => {
        return governance.getDashboard(params.projectPath as string);
      },
    },
  ];
}
