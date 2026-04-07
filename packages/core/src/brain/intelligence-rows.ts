import type {
  BrainSession,
  KnowledgeProposal,
  PatternStrength,
  SessionContext,
  GlobalPattern,
  DomainProfile,
} from './types.js';

export interface BrainSessionRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  domain: string | null;
  context: string | null;
  tools_used: string;
  files_modified: string;
  plan_id: string | null;
  plan_outcome: string | null;
  extracted_at: string | null;
}

export interface BrainProposalRow {
  id: string;
  session_id: string;
  rule: string;
  type: string;
  title: string;
  description: string;
  confidence: number;
  promoted: number;
  created_at: string;
}

export interface BrainStrengthRow {
  pattern: string;
  domain: string;
  strength: number;
  usage_score: number;
  spread_score: number;
  success_score: number;
  recency_score: number;
  usage_count: number;
  unique_contexts: number;
  success_rate: number;
  last_used: string;
}

export interface BrainGlobalPatternRow {
  pattern: string;
  domains: string;
  total_strength: number;
  avg_strength: number;
  domain_count: number;
}

export interface BrainDomainProfileRow {
  domain: string;
  top_patterns: string;
  session_count: number;
  avg_session_duration: number;
  last_activity: string;
}

export function rowToSession(row: BrainSessionRow): BrainSession {
  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    domain: row.domain,
    context: row.context,
    toolsUsed: JSON.parse(row.tools_used) as string[],
    filesModified: JSON.parse(row.files_modified) as string[],
    planId: row.plan_id,
    planOutcome: row.plan_outcome,
    extractedAt: row.extracted_at,
  };
}

export function rowToProposal(row: BrainProposalRow): KnowledgeProposal {
  return {
    id: row.id,
    sessionId: row.session_id,
    rule: row.rule,
    type: row.type as 'pattern' | 'anti-pattern' | 'workflow',
    title: row.title,
    description: row.description,
    confidence: row.confidence,
    promoted: row.promoted === 1,
    createdAt: row.created_at,
  };
}

export function rowToStrength(row: BrainStrengthRow): PatternStrength {
  return {
    pattern: row.pattern,
    domain: row.domain,
    strength: row.strength,
    usageScore: row.usage_score,
    spreadScore: row.spread_score,
    successScore: row.success_score,
    recencyScore: row.recency_score,
    usageCount: row.usage_count,
    uniqueContexts: row.unique_contexts,
    successRate: row.success_rate,
    lastUsed: row.last_used,
  };
}

export function rowToGlobalPattern(row: BrainGlobalPatternRow): GlobalPattern {
  return {
    pattern: row.pattern,
    domains: JSON.parse(row.domains) as string[],
    totalStrength: row.total_strength,
    avgStrength: row.avg_strength,
    domainCount: row.domain_count,
  };
}

export function rowToDomainProfile(row: BrainDomainProfileRow): DomainProfile {
  return {
    domain: row.domain,
    topPatterns: JSON.parse(row.top_patterns) as Array<{ pattern: string; strength: number }>,
    sessionCount: row.session_count,
    avgSessionDuration: row.avg_session_duration,
    lastActivity: row.last_activity,
  };
}

export function buildSessionFrequencies(
  sessions: BrainSession[],
): Pick<SessionContext, 'toolFrequency' | 'fileFrequency'> {
  const toolCounts = new Map<string, number>();
  const fileCounts = new Map<string, number>();

  for (const session of sessions) {
    for (const tool of session.toolsUsed) {
      toolCounts.set(tool, (toolCounts.get(tool) ?? 0) + 1);
    }
    for (const file of session.filesModified) {
      fileCounts.set(file, (fileCounts.get(file) ?? 0) + 1);
    }
  }

  const toolFrequency = [...toolCounts.entries()]
    .map(([tool, count]) => ({ tool, count }))
    .sort((a, b) => b.count - a.count);
  const fileFrequency = [...fileCounts.entries()]
    .map(([file, count]) => ({ file, count }))
    .sort((a, b) => b.count - a.count);

  return { toolFrequency, fileFrequency };
}

export function extractObjectiveFromContext(context: string): string {
  if (!context || context.trim().length === 0) return '';
  const objectiveMatch = context.match(/objective[:\s]+(.+)/i);
  if (objectiveMatch) return objectiveMatch[1].trim().replace(/\s+/g, ' ');

  const firstLine = context
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return firstLine ? firstLine.replace(/\s+/g, ' ') : '';
}
