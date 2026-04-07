import type { PersistenceProvider } from '../persistence/types.js';
import type { BrainSession, KnowledgeProposal } from './types.js';
import {
  EXTRACTION_TOOL_THRESHOLD,
  EXTRACTION_FILE_THRESHOLD,
  EXTRACTION_HIGH_FEEDBACK_RATIO,
} from './intelligence-constants.js';

type ProposalType = 'pattern' | 'anti-pattern' | 'workflow';

type CreateProposal = (
  sessionId: string,
  rule: string,
  type: ProposalType,
  data: { title: string; description: string; confidence: number },
) => KnowledgeProposal;

interface ExtractKnowledgeInput {
  sessionId: string;
  session: BrainSession;
  provider: PersistenceProvider;
  createProposal: CreateProposal;
  extractObjective: (context: string) => string;
}

export function extractKnowledgeProposals({
  sessionId,
  session,
  provider,
  createProposal,
  extractObjective,
}: ExtractKnowledgeInput): { proposals: KnowledgeProposal[]; rulesApplied: string[] } {
  const proposals: KnowledgeProposal[] = [];
  const rulesApplied: string[] = [];

  const toolCounts = new Map<string, number>();
  for (const tool of session.toolsUsed) {
    toolCounts.set(tool, (toolCounts.get(tool) ?? 0) + 1);
  }

  for (const [tool, count] of toolCounts) {
    if (count >= EXTRACTION_TOOL_THRESHOLD) {
      rulesApplied.push('repeated_tool_usage');
      const context = session.context ?? '';
      const objective = extractObjective(context);
      const toolTitle = objective
        ? `Tool pattern: ${tool} (${count}x) during ${objective.slice(0, 60)}`
        : `Frequent use of ${tool} (${count}x)`;
      const toolDescription = objective
        ? `Tool ${tool} used ${count} times while working on: ${objective}. This tool-task pairing may indicate a reusable workflow.`
        : `Tool ${tool} was used ${count} times in session. Consider automating or abstracting this workflow.`;

      proposals.push(
        createProposal(sessionId, 'repeated_tool_usage', 'pattern', {
          title: toolTitle,
          description: toolDescription,
          confidence: Math.min(0.9, 0.5 + count * 0.1),
        }),
      );
    }
  }

  if (session.filesModified.length >= EXTRACTION_FILE_THRESHOLD) {
    const dirGroups = new Map<string, string[]>();
    for (const file of session.filesModified) {
      const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '.';
      const filesInDir = dirGroups.get(dir) ?? [];
      filesInDir.push(file);
      dirGroups.set(dir, filesInDir);
    }

    const significantDirs = [...dirGroups.entries()].filter(
      ([, files]) => files.length >= EXTRACTION_FILE_THRESHOLD,
    );

    if (significantDirs.length > 0) {
      const [topDir, topFiles] = significantDirs.sort((a, b) => b[1].length - a[1].length)[0];
      rulesApplied.push('multi_file_edit');
      const context = session.context ?? '';
      const objective = extractObjective(context);
      const isRefactor = /refactor|rename|move|extract|consolidat/i.test(context);
      const isFeature = /feat|add|implement|create|new/i.test(context);
      const inferredPattern = isRefactor
        ? 'Refactoring'
        : isFeature
          ? 'Feature'
          : 'Cross-cutting change';
      const title = objective
        ? `${inferredPattern}: ${objective.slice(0, 70)}`
        : `${inferredPattern} in ${topDir} (${topFiles.length} files)`;
      const description = objective
        ? `${inferredPattern} across ${topFiles.length} files in ${topDir}: ${objective}`
        : `Session modified ${topFiles.length} files in ${topDir}: ${topFiles.slice(0, 5).join(', ')}${topFiles.length > 5 ? '...' : ''}.`;

      proposals.push(
        createProposal(sessionId, 'multi_file_edit', 'pattern', {
          title,
          description,
          confidence: Math.min(0.8, 0.4 + topFiles.length * 0.05),
        }),
      );
    }
  }

  if (session.planId && session.planOutcome === 'completed') {
    rulesApplied.push('plan_completed');
    const context = session.context ?? '';
    const objective = extractObjective(context);
    const hasScope = /scope|included|excluded/i.test(context);
    const hasCriteria = /criteria|acceptance|verification/i.test(context);
    const confidence =
      context.length > 0
        ? hasScope && hasCriteria
          ? 0.85
          : hasScope || hasCriteria
            ? 0.8
            : 0.75
        : 0.5;
    const title = objective
      ? `Workflow: ${objective.slice(0, 80)}`
      : `Successful plan: ${session.planId}`;
    const description = objective
      ? `Completed: ${objective}${hasScope ? '. Scope and constraints documented in session context.' : ''}`
      : `Plan ${session.planId} completed successfully. This workflow can be reused for similar tasks.`;

    proposals.push(
      createProposal(sessionId, 'plan_completed', 'workflow', {
        title,
        description,
        confidence,
      }),
    );
  }

  if (session.planId && session.planOutcome === 'abandoned') {
    rulesApplied.push('plan_abandoned');
    const context = session.context ?? '';
    const objective = extractObjective(context);
    const hasFailureReason = /blocked|failed|wrong|mistake|abandoned|reverted|conflict/i.test(
      context,
    );
    const confidence = context.length > 0 ? (hasFailureReason ? 0.85 : 0.75) : 0.5;
    const title = objective
      ? `Anti-pattern: ${objective.slice(0, 80)}`
      : `Abandoned plan: ${session.planId}`;
    const description = objective
      ? `Abandoned: ${objective}${hasFailureReason ? '. Failure indicators found in session context — review for root cause.' : '. Review what went wrong to avoid repeating.'}`
      : `Plan ${session.planId} was abandoned. Review what went wrong to avoid repeating in future sessions.`;

    proposals.push(
      createProposal(sessionId, 'plan_abandoned', 'anti-pattern', {
        title,
        description,
        confidence,
      }),
    );
  }

  if (session.planId && session.planOutcome === 'completed' && session.context) {
    const driftPattern =
      /drift|skipped|added.*unplanned|changed scope|out of scope|deviat|unplanned/i;
    if (driftPattern.test(session.context)) {
      rulesApplied.push('drift_detected');
      const objective = extractObjective(session.context);
      const driftMatch =
        session.context.match(/drift[:\s]+(.{1,120})/i) ??
        session.context.match(/skipped[:\s]+(.{1,120})/i) ??
        session.context.match(/unplanned[:\s]+(.{1,120})/i);
      const driftDetail = driftMatch ? driftMatch[1].trim() : 'scope changed during execution';

      proposals.push(
        createProposal(sessionId, 'drift_detected', 'anti-pattern', {
          title: `Plan drift: ${objective ? objective.slice(0, 60) : session.planId} — ${driftDetail.slice(0, 40)}`,
          description: `Plan ${objective ?? session.planId} completed with drift: ${driftDetail}. Review scope controls for future planning.`,
          confidence: 0.8,
        }),
      );
    }
  }

  const feedbackRow = provider.get<{ total: number; accepted: number; dismissed: number }>(
    `SELECT COUNT(*) as total,
            SUM(CASE WHEN action = 'accepted' THEN 1 ELSE 0 END) as accepted,
            SUM(CASE WHEN action = 'dismissed' THEN 1 ELSE 0 END) as dismissed
     FROM brain_feedback
     WHERE created_at >= ? AND created_at <= ?`,
    [session.startedAt, session.endedAt ?? new Date().toISOString()],
  ) as {
    total: number;
    accepted: number;
    dismissed: number;
  };

  if (feedbackRow.total >= 3) {
    const acceptRate = feedbackRow.accepted / feedbackRow.total;
    const dismissRate = feedbackRow.dismissed / feedbackRow.total;

    if (acceptRate >= EXTRACTION_HIGH_FEEDBACK_RATIO) {
      rulesApplied.push('high_accept_ratio');
      proposals.push(
        createProposal(sessionId, 'high_accept_ratio', 'pattern', {
          title: `High search acceptance rate (${Math.round(acceptRate * 100)}%)`,
          description: `Search results were accepted ${Math.round(acceptRate * 100)}% of the time. Brain scoring is well-calibrated for this type of work.`,
          confidence: 0.7,
        }),
      );
    } else if (dismissRate >= EXTRACTION_HIGH_FEEDBACK_RATIO) {
      rulesApplied.push('high_dismiss_ratio');
      proposals.push(
        createProposal(sessionId, 'high_dismiss_ratio', 'anti-pattern', {
          title: `High search dismissal rate (${Math.round(dismissRate * 100)}%)`,
          description: `Search results were dismissed ${Math.round(dismissRate * 100)}% of the time. Brain scoring may need recalibration for this domain.`,
          confidence: 0.7,
        }),
      );
    }
  }

  return { proposals, rulesApplied: [...new Set(rulesApplied)] };
}
