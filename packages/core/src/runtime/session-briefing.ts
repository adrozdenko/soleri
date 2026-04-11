/**
 * Session Briefing — proactive context loading on session start.
 *
 * Gathers data from all subsystems (sessions, plans, vault, brain, curator)
 * and produces a concise, structured briefing for the agent.
 *
 * Design: gather all data in parallel, skip sections with nothing to report.
 * Target: < 15 lines of output, < 3 seconds latency.
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from './types.js';
import type { OperatorProfile } from '../operator/operator-types.js';

export interface BriefingSection {
  label: string;
  content: string;
}

export interface SessionBriefing {
  sections: BriefingSection[];
  generatedAt: number;
  /** Total entries consulted across all data sources. */
  dataPointsConsulted: number;
}

export function createSessionBriefingOps(runtime: AgentRuntime): OpDefinition[] {
  const { brainIntelligence, planner, vault, curator } = runtime;

  return [
    {
      name: 'session_briefing',
      description:
        'Proactive session briefing — gathers last session, active plans, recent vault captures, brain recommendations, and stale knowledge warnings into a concise summary.',
      auth: 'read',
      schema: z.object({
        maxSections: z.number().optional().default(6).describe('Max sections to include'),
        recencyHours: z.number().optional().default(48).describe('Look back window in hours'),
      }),
      handler: async (params) => {
        const maxSections = params.maxSections as number;
        const sections: BriefingSection[] = [];
        let dataPoints = 0;
        let failedSections = 0;

        // 0. Day-one welcome (vault has few non-playbook entries)
        try {
          const stats = vault.stats();
          const nonPlaybook = stats.totalEntries - (stats.byType?.playbook ?? 0);
          if (nonPlaybook < 10) {
            sections.push({
              label: 'Welcome',
              content: `Vault has ${nonPlaybook} knowledge entries. Capture patterns as you work — the brain learns from every session. Use op:capture_knowledge to persist insights.`,
            });
          }
        } catch {
          failedSections++;
          // Vault stats unavailable — skip
        }

        // 1. Last session — cross-project, with staleness threshold
        try {
          const recencyMs = (params.recencyHours as number) * 3600_000;
          const cutoff = Date.now() - recencyMs;

          // Try cross-project memories first (most recent work, any project)
          const recentMemories = vault.listMemories({ type: 'session', limit: 3 });
          const freshMemory = recentMemories.find((m) => {
            const ts = m.createdAt > 1e12 ? m.createdAt : m.createdAt * 1000;
            return ts > cutoff;
          });

          if (freshMemory) {
            const ts =
              freshMemory.createdAt > 1e12 ? freshMemory.createdAt : freshMemory.createdAt * 1000;
            const ago = formatTimeAgo(ts);
            const project = freshMemory.projectPath
              ? ` [${freshMemory.projectPath.split('/').pop()}]`
              : '';
            const summary = freshMemory.summary
              ? `: ${freshMemory.summary.slice(0, 200)}`
              : freshMemory.context
                ? `: ${freshMemory.context.slice(0, 200)}`
                : '';

            // Enrich with structured metadata when available
            const extras: string[] = [];
            const filesModified = freshMemory.filesModified ?? [];
            const decisions = freshMemory.decisions ?? [];
            if (filesModified.length > 0) {
              extras.push(`${filesModified.length} file(s) changed`);
            }
            if (decisions.length > 0) {
              const topDecisions = decisions.slice(0, 2).join('; ');
              extras.push(topDecisions);
            }
            const extraStr = extras.length > 0 ? ` | ${extras.join(' | ')}` : '';

            dataPoints += recentMemories.length;
            sections.push({
              label: 'Last session',
              content: `(${ago})${project}${summary}${extraStr}`,
            });
          } else {
            // Fall back to brain sessions (same-project only) if no fresh memory
            const sessions = brainIntelligence.listSessions({ limit: 1, active: false });
            dataPoints += sessions.length;
            if (sessions.length > 0) {
              const last = sessions[0];
              const endTs = last.endedAt ? new Date(last.endedAt).getTime() : 0;
              if (endTs > cutoff) {
                const ago = formatTimeAgo(endTs);
                const domain = last.domain ? ` [${last.domain}]` : '';
                const context = last.context ? `: ${last.context.slice(0, 80)}` : '';
                const tools =
                  last.toolsUsed.length > 0 ? `, used ${last.toolsUsed.length} tools` : '';
                const files =
                  last.filesModified.length > 0
                    ? `, modified ${last.filesModified.length} files`
                    : '';
                sections.push({
                  label: 'Last session',
                  content: `(${ago})${domain}${context}${tools}${files}`,
                });
              }
            }
          }
        } catch {
          failedSections++;
          // Session data unavailable — skip
        }

        // 2. Active plans — auto-close ancient ones (>24h)
        try {
          // Auto-close plans stuck in non-terminal states for more than 24h
          const staleResult = planner.closeStale();
          if (staleResult.closedPlans.length > 0) {
            sections.push({
              label: 'Plans auto-closed',
              content: `${staleResult.closedPlans.length} stale plan(s) closed: ${staleResult.closedPlans.map((p) => `${p.id.slice(0, 25)}… (${p.reason})`).join(', ')}`,
            });
          }

          const plans = planner.list();
          const active = plans.filter(
            (p) =>
              p.status === 'executing' ||
              p.status === 'approved' ||
              p.status === 'reconciling' ||
              p.status === 'validating',
          );
          dataPoints += plans.length;
          if (active.length > 0) {
            const summaries = active.map((p) => {
              const tasksDone = p.tasks.filter((t) => t.status === 'completed').length;
              return `${p.objective?.slice(0, 40) || p.id} (${p.status}, ${tasksDone}/${p.tasks.length} tasks)`;
            });
            sections.push({
              label: active.length === 1 ? 'Active plan' : `Active plans (${active.length})`,
              content: summaries.join('; '),
            });
          }
        } catch {
          failedSections++;
          // Planner unavailable — skip
        }

        // 3. Recent vault captures
        try {
          const recent = vault.getRecent(10);
          dataPoints += recent.length;
          if (recent.length > 0) {
            const count = Math.min(recent.length, 5);
            const titles = recent.slice(0, 3).map((e) => e.title.slice(0, 50));
            sections.push({
              label: 'Recent captures',
              content: `${count} entries — ${titles.join(', ')}${count > 3 ? '...' : ''}`,
            });
          }
        } catch {
          failedSections++;
          // Vault unavailable — skip
        }

        // 4. Brain recommendations
        try {
          const recs = brainIntelligence.recommend({ limit: 3 });
          dataPoints += recs.length;
          if (recs.length > 0) {
            const items = recs.map((r) => `"${r.pattern}" (strength: ${r.strength.toFixed(2)})`);
            sections.push({
              label: 'Brain recommends',
              content: items.join(', '),
            });
          }
        } catch {
          failedSections++;
          // Brain unavailable — skip
        }

        // 5. Pending brain proposals
        try {
          const pending = brainIntelligence
            .getProposals({ promoted: false })
            .filter((p) => p.confidence >= 0.4)
            .sort((a, b) => b.confidence - a.confidence);
          dataPoints += pending.length;
          if (pending.length > 0) {
            const top = pending
              .slice(0, 3)
              .map(
                (p) =>
                  `"${p.title.slice(0, 50)}" (confidence: ${p.confidence.toFixed(2)}, type: ${p.type})`,
              );
            const lines = [`${pending.length} awaiting review`, ...top.map((t) => `  - ${t}`)];
            if (pending.length > 3) {
              lines.push(
                `  Use \`brain_promote_proposals\` to review, or \`radar_flush\` to batch-approve above threshold.`,
              );
            }
            sections.push({
              label: 'Pending proposals',
              content: lines.join('\n'),
            });
          }
        } catch {
          failedSections++;
          // Brain proposals unavailable — skip
        }

        // 6. Stale knowledge / health warnings
        try {
          const health = curator.healthAudit();
          dataPoints += 1;
          const warnings: string[] = [];
          if (health.score < 70) {
            warnings.push(`vault health: ${health.score}/100`);
          }
          if (health.recommendations && health.recommendations.length > 0) {
            warnings.push(health.recommendations[0]);
          }
          if (warnings.length > 0) {
            sections.push({
              label: 'Attention',
              content: warnings.join('. '),
            });
          }
        } catch {
          failedSections++;
          // Curator unavailable — skip
        }

        // 7. Operator adaptation
        try {
          const profile = runtime.operatorProfile.getProfile();
          if (profile) {
            const summary = buildAdaptationSummary(profile);
            if (summary) {
              sections.push({ label: 'Operator Adaptation', content: summary });
              dataPoints += 1;
            }
          }
        } catch {
          failedSections++;
          // Operator profile unavailable — skip
        }

        // Warn when majority of subsystems failed
        if (failedSections > 3) {
          sections.push({
            label: 'Warning',
            content: `\u26A0\uFE0F ${failedSections} of 8 briefing sections failed to load. Some subsystems may be unavailable.`,
          });
        }

        return {
          sections: sections.slice(0, maxSections),
          generatedAt: Date.now(),
          dataPointsConsulted: dataPoints,
        } satisfies SessionBriefing;
      },
    },
  ];
}

/** Build a concise adaptation summary from an operator profile (5-8 lines max). */
export function buildAdaptationSummary(profile: OperatorProfile): string | null {
  const lines: string[] = [];
  const { communication, trustModel, workingRules, growthEdges } = profile;

  // Communication style
  if (communication.style && communication.style !== 'mixed') {
    const formality =
      communication.formality >= 0.7 ? 'formal' : communication.formality <= 0.3 ? 'casual' : '';
    const parts = [communication.style, formality].filter(Boolean);
    lines.push(`Communication: ${parts.join(', ')}`);
  }

  // Challenge threshold / pushback level
  if (trustModel.level !== 'new') {
    const autonomy =
      trustModel.currentLevel >= 0.7
        ? 'high autonomy'
        : trustModel.currentLevel <= 0.3
          ? 'check before acting'
          : 'moderate autonomy';
    lines.push(`Trust: ${trustModel.level} — ${autonomy}`);
  }

  // Work priorities (from top working rules)
  const topRules = workingRules.rules.slice(0, 3);
  if (topRules.length > 0) {
    const ruleTexts = topRules.map((r) => r.rule.slice(0, 60));
    lines.push(`Priorities: ${ruleTexts.join('; ')}`);
  }

  // Growth edges
  const edges = [...growthEdges.observed, ...growthEdges.selfReported];
  if (edges.length > 0) {
    const edgeNames = edges.slice(0, 3).map((e) => e.area);
    lines.push(`Growth edges: ${edgeNames.join(', ')}`);
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
