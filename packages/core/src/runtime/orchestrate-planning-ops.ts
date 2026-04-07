import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import { buildPlan, type VaultConstraint } from '../flows/plan-builder.js';
import {
  detectGitHubContext,
  findMatchingMilestone,
  findDuplicateIssue,
  formatIssueBody,
  createGitHubIssue,
  updateGitHubIssueBody,
} from '../planning/github-projection.js';
import type { GitHubProjection, PlanMetadataForIssue } from '../planning/github-projection.js';
import {
  extractIssueNumber,
  detectGitHubRemote as detectGitHubRemoteAsync,
  getIssueDetails,
} from './github-integration.js';
import { loadAgentConfig, DEFAULT_AGENT_CONFIG } from './agent-config.js';
import { loadAgentWorkflows, getWorkflowForIntent } from '../workflows/workflow-loader.js';
import type { AgentRuntime } from './types.js';
import {
  applyWorkflowOverride,
  detectIntent,
  mapVaultResults,
  planStore,
  type PlanRecommendation,
} from './orchestrate-shared.js';

export interface OrchestratePlanningContext {
  runtime: AgentRuntime;
  planner: AgentRuntime['planner'];
  brain: AgentRuntime['brain'];
  brainIntelligence: AgentRuntime['brainIntelligence'];
  agentId: string;
}

export function createOrchestratePlanOp(ctx: OrchestratePlanningContext): OpDefinition {
  const { runtime, planner, brain, brainIntelligence, agentId } = ctx;

  return {
    name: 'orchestrate_plan',
    description:
      'Create a flow-engine-driven plan. Detects intent from the prompt, ' +
      'loads the matching YAML flow, probes runtime capabilities, and builds ' +
      'a pruned orchestration plan with gate-guarded steps.',
    auth: 'write',
    schema: z.object({
      prompt: z
        .string()
        .optional()
        .describe('Natural language description of what to do (or use objective)'),
      projectPath: z.string().optional().default('.').describe('Project root path'),
      // Legacy params — still accepted for backward compat
      objective: z.string().optional().describe('(Legacy) Plan objective — use prompt instead'),
      scope: z.string().optional().describe('(Legacy) Plan scope'),
      domain: z.string().optional().describe('Domain hint for brain recommendations'),
      tasks: z
        .array(z.object({ title: z.string(), description: z.string() }))
        .optional()
        .describe('Optional pre-defined tasks'),
    }),
    handler: async (params) => {
      const prompt = (params.prompt as string) ?? (params.objective as string) ?? '';
      const projectPath = (params.projectPath as string) ?? '.';
      const domain = params.domain as string | undefined;

      // 1. Detect intent from prompt
      const intent = detectIntent(prompt);

      // 2. Build recommendations — vault first (authoritative), brain enriches (additive)
      let recommendations: PlanRecommendation[] = [];

      // Vault always runs first — curated explicit knowledge takes precedence.
      // Prefer semantic search (vector-scored); fall back to keyword search.

      try {
        const vaultResults = await brain.intelligentSearch(prompt, {
          domain,
          limit: 5,
        });
        recommendations = mapVaultResults(vaultResults);
      } catch {
        // Semantic search unavailable — fall back to keyword search
        try {
          const vaultResults = runtime.vault.search(prompt, { domain, limit: 5 });
          recommendations = mapVaultResults(vaultResults);
        } catch {
          // Vault unavailable — brain will cover below
        }
      }

      // Brain enriches with learned usage patterns — additive, never replaces vault
      try {
        const brainResults = brainIntelligence.recommend({
          domain,
          task: prompt,
          limit: 5,
        });
        for (const r of brainResults) {
          if (!recommendations.find((rec) => rec.pattern === r.pattern)) {
            recommendations.push({
              pattern: r.pattern,
              strength: r.strength,
              source: 'brain',
              mandatory: false,
            });
          }
        }
      } catch {
        // Brain has no data yet
      }

      // 3. Load agent config once — single wiring point for data-driven workflow + probe config
      const agentDir = runtime.config?.agentDir ?? '';
      const agentConfig = loadAgentConfig(agentDir);

      // Resolve workflow mapping: agent.yaml wins; fall back to DEFAULT_AGENT_CONFIG
      const workflowMapping =
        agentConfig.workflows && Object.keys(agentConfig.workflows).length > 0
          ? agentConfig.workflows
          : DEFAULT_AGENT_CONFIG.workflows;

      // Resolve probe filter: agent.yaml wins; undefined = run all (backward compat)
      const probeNames =
        agentConfig.probes && agentConfig.probes.length > 0 ? agentConfig.probes : undefined;

      // Merge capability maps: defaults first, agent wins on conflict
      const capabilityMap = {
        ...DEFAULT_AGENT_CONFIG.capabilityMap,
        ...agentConfig.capabilityMap,
      };

      // Build flow-engine plan — pass vault constraints for gate injection
      const vaultConstraints: VaultConstraint[] = recommendations
        .filter((r) => r.source === 'vault' && r.entryId)
        .map((r) => ({
          entryId: r.entryId!,
          title: r.pattern,
          context: r.context,
          mandatory: r.mandatory,
          entryType: r.entryType,
        }));
      // Auto-wire flowsDir from agentDir if not explicitly set
      if (!runtime.config.flowsDir && runtime.config.agentDir) {
        const inferredFlowsDir = path.join(runtime.config.agentDir, 'flows');
        if (fs.existsSync(inferredFlowsDir)) {
          (runtime.config as unknown as Record<string, unknown>).flowsDir = inferredFlowsDir;
        }
      }

      const plan = await buildPlan(
        intent,
        agentId,
        projectPath,
        runtime,
        prompt,
        vaultConstraints,
        probeNames,
        capabilityMap,
      );

      // 3b. Merge workflow overrides (gates + tools) if agent has a matching workflow
      let workflowApplied: string | undefined;
      if (agentDir) {
        try {
          const workflowsDir = path.join(agentDir, 'workflows');
          const agentWorkflows = loadAgentWorkflows(workflowsDir);
          const workflowOverride = getWorkflowForIntent(agentWorkflows, intent, workflowMapping);
          if (workflowOverride) {
            applyWorkflowOverride(plan, workflowOverride);
            workflowApplied = workflowOverride.name;
          }
        } catch {
          // Workflow loading failed — plan is still valid without overrides
        }
      }

      // 4. Store in planStore
      planStore.set(plan.planId, { plan, createdAt: Date.now() });

      // 5. Also create a planner plan for lifecycle tracking (backward compat)
      const decisions = recommendations.map((r) => {
        const label = r.source === 'vault' ? 'Vault pattern' : 'Brain pattern';
        const base = `${label}: ${r.pattern} (strength: ${r.strength.toFixed(1)})`;
        return r.entryId ? `${base} [entryId:${r.entryId}]` : base;
      });
      const tasks = (params.tasks as Array<{ title: string; description: string }>) ?? [];

      // 5b. Extract GitHub issue context if prompt references #NNN
      let githubIssue: { owner: string; repo: string; number: number } | undefined;
      const issueNum = extractIssueNumber(prompt);
      if (issueNum) {
        const remote = await detectGitHubRemoteAsync(projectPath);
        if (remote) {
          githubIssue = { owner: remote.owner, repo: remote.repo, number: issueNum };
          const details = await getIssueDetails(remote.owner, remote.repo, issueNum);
          if (details) {
            // Enrich objective with issue context
            const enriched = `${prompt}\n\n--- GitHub Issue #${issueNum}: ${details.title} ---\n${details.body}`;
            decisions.unshift(`Source: GitHub issue #${issueNum} — ${details.title}`);
            // Replace prompt for plan creation
            Object.assign(params, { _enrichedObjective: enriched });
          }
        }
      }

      const planObjective =
        ((params as Record<string, unknown>)._enrichedObjective as string | undefined) ?? prompt;

      let legacyPlan;
      try {
        legacyPlan = planner.create({
          objective: planObjective,
          scope: (params.scope as string) ?? `${intent} workflow`,
          decisions,
          tasks,
        });
        if (legacyPlan && githubIssue) {
          legacyPlan.githubIssue = githubIssue;
        }
      } catch {
        // Planner creation failed — flow plan still valid
      }

      return {
        plan: legacyPlan ?? {
          id: plan.planId,
          objective: prompt,
          decisions,
        },
        recommendations,
        flow: {
          planId: plan.planId,
          intent: plan.intent,
          flowId: plan.flowId,
          stepsCount: plan.steps.length,
          skippedCount: plan.skipped.length,
          warnings: plan.warnings,
          estimatedTools: plan.estimatedTools,
          ...(plan.recommendations ? { vaultConstraints: plan.recommendations } : {}),
          ...(workflowApplied ? { workflowOverride: workflowApplied } : {}),
        },
      };
    },
  };
}

export function createOrchestrateProjectToGitHubOp(planner: AgentRuntime['planner']): OpDefinition {
  return {
    name: 'orchestrate_project_to_github',
    description:
      'Project plan tasks as GitHub issues. Detects the GitHub remote, checks milestones ' +
      'and existing issues for duplicates, creates issues with plan metadata linked, and ' +
      'stores the projection on the plan. Opt-in: the agent suggests, user confirms.',
    auth: 'write',
    schema: z.object({
      planId: z.string().describe('ID of the plan to project to GitHub'),
      projectPath: z
        .string()
        .optional()
        .default('.')
        .describe('Project root path for git detection'),
      milestone: z.number().optional().describe('GitHub milestone number to assign issues to'),
      labels: z.array(z.string()).optional().describe('Labels to apply to created issues'),
      linkToIssue: z
        .number()
        .optional()
        .describe('Existing issue number to link plan to instead of creating new issues'),
      dryRun: z
        .boolean()
        .optional()
        .default(false)
        .describe('Preview what would be created without actually creating issues'),
    }),
    handler: async (params) => {
      const planId = params.planId as string;
      const projectPath = (params.projectPath as string) ?? '.';
      const milestone = params.milestone as number | undefined;
      const labels = (params.labels as string[]) ?? [];
      const linkToIssue = params.linkToIssue as number | undefined;
      const dryRun = (params.dryRun as boolean) ?? false;

      // 1. Find the plan
      const plan = planner.get(planId);
      if (!plan) throw new Error(`Plan not found: ${planId}`);

      if (plan.tasks.length === 0) {
        throw new Error(
          'Plan has no tasks — run plan_split first to define tasks before projecting to GitHub',
        );
      }

      // 2. Detect GitHub context
      const ctx = await detectGitHubContext(projectPath);
      if (!ctx) {
        return {
          status: 'skipped',
          reason: 'No GitHub remote detected or gh CLI not authenticated',
        };
      }

      const repoSlug = `${ctx.repo.owner}/${ctx.repo.repo}`;

      // 3. Build plan metadata for issue body
      const planMeta: PlanMetadataForIssue = {
        planId: plan.id,
        grade: plan.latestCheck?.grade ?? 'N/A',
        score: plan.latestCheck?.score ?? 0,
        objective: plan.objective,
        decisions: plan.decisions,
        tasks: plan.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          dependsOn: t.dependsOn,
        })),
      };

      // 4. Handle "link to existing issue" flow
      if (linkToIssue) {
        const body = formatIssueBody(planMeta, plan.objective, plan.scope);
        if (dryRun) {
          return {
            status: 'dry_run',
            action: 'update_existing',
            repo: repoSlug,
            issueNumber: linkToIssue,
            bodyPreview: body.slice(0, 500),
          };
        }

        const updated = await updateGitHubIssueBody(ctx.repo, linkToIssue, body);
        if (!updated) {
          return {
            status: 'error',
            reason: `Failed to update issue #${linkToIssue}`,
          };
        }

        const projection: GitHubProjection = {
          repo: repoSlug,
          issues: [{ taskId: 'all', issueNumber: linkToIssue }],
          projectedAt: Date.now(),
        };
        planner.setGitHubProjection(planId, projection);

        return {
          status: 'linked',
          repo: repoSlug,
          issueNumber: linkToIssue,
          message: `Plan linked to existing issue #${linkToIssue}`,
        };
      }

      // 5. Milestone matching
      let milestoneNumber = milestone;
      let milestoneMatch: string | undefined;
      if (!milestoneNumber && ctx.milestones.length > 0 && plan.scope) {
        const match = findMatchingMilestone(plan.scope, ctx.milestones);
        if (match) {
          milestoneNumber = match.number;
          milestoneMatch = match.title;
        }
      }

      // 6. Create issues per task (with duplicate detection)
      const created: Array<{ taskId: string; issueNumber: number; title: string }> = [];
      const skipped: Array<{
        taskId: string;
        title: string;
        existingIssue: number;
        reason: string;
      }> = [];
      const failed: Array<{ taskId: string; title: string; reason: string }> = [];

      for (const task of plan.tasks) {
        // Duplicate detection
        const dup = findDuplicateIssue(task.title, ctx.existingIssues);
        if (dup) {
          skipped.push({
            taskId: task.id,
            title: task.title,
            existingIssue: dup.number,
            reason: `Existing issue #${dup.number} "${dup.title}" looks like it covers this task`,
          });
          continue;
        }

        const body = formatIssueBody(planMeta, task.title, task.description);

        if (dryRun) {
          created.push({ taskId: task.id, issueNumber: 0, title: task.title });
          continue;
        }

        const issueNumber = await createGitHubIssue(ctx.repo, task.title, body, {
          milestone: milestoneNumber,
          labels: labels.length > 0 ? labels : undefined,
        });

        if (issueNumber) {
          created.push({ taskId: task.id, issueNumber, title: task.title });
        } else {
          failed.push({ taskId: task.id, title: task.title, reason: 'gh issue create failed' });
        }
      }

      // 7. Store projection on the plan (unless dry run)
      if (!dryRun && created.length > 0) {
        const projection: GitHubProjection = {
          repo: repoSlug,
          milestone: milestoneNumber,
          issues: created.map((c) => ({ taskId: c.taskId, issueNumber: c.issueNumber })),
          projectedAt: Date.now(),
        };
        planner.setGitHubProjection(planId, projection);
      }

      return {
        status: dryRun ? 'dry_run' : 'projected',
        repo: repoSlug,
        milestone: milestoneMatch
          ? { number: milestoneNumber, title: milestoneMatch }
          : milestoneNumber
            ? { number: milestoneNumber }
            : null,
        created,
        skipped,
        failed,
        context: {
          milestonesFound: ctx.milestones.length,
          existingIssuesChecked: ctx.existingIssues.length,
          labelsAvailable: ctx.labels.length,
        },
      };
    },
  };
}
