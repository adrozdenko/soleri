import type { IntelligenceEntry } from '../intelligence/types.js';

// ─── Existing Brain Types (moved from brain.ts) ────────────────────

export interface ScoringWeights {
  semantic: number;
  vector: number;
  severity: number;
  temporalDecay: number;
  tagOverlap: number;
  domainMatch: number;
}

export interface ScoreBreakdown {
  semantic: number;
  vector: number;
  severity: number;
  temporalDecay: number;
  tagOverlap: number;
  domainMatch: number;
  total: number;
}

export interface RankedResult {
  entry: IntelligenceEntry;
  score: number;
  breakdown: ScoreBreakdown;
}

export interface SearchOptions {
  domain?: string;
  type?: string;
  severity?: string;
  limit?: number;
  tags?: string[];
  /** 'full' returns RankedResult[] with complete entries (default). 'scan' returns ScanResult[] — lightweight titles + scores for two-pass retrieval. */
  mode?: 'full' | 'scan';
}

/** Lightweight search result for scan mode — titles + scores without full entry body. */
export interface ScanResult {
  id: string;
  title: string;
  score: number;
  type: string;
  domain: string;
  severity: string;
  tags: string[];
  snippet: string;
  /** Estimated tokens if this entry were loaded in full. */
  tokenEstimate: number;
}

export interface CaptureResult {
  captured: boolean;
  id: string;
  autoTags: string[];
  duplicate?: { id: string; similarity: number };
  blocked?: boolean;
}

export interface BrainStats {
  vocabularySize: number;
  feedbackCount: number;
  weights: ScoringWeights;
}

export interface QueryContext {
  query: string;
  domain?: string;
  tags?: string[];
}

// ─── Feedback Types ───────────────────────────────────────────────

export type FeedbackType = 'accepted' | 'dismissed' | 'modified' | 'failed';
export type FeedbackSource = 'search' | 'recommendation' | 'tool-execution' | 'explicit';

export interface FeedbackInput {
  query: string;
  entryId: string;
  action: FeedbackType;
  source?: FeedbackSource;
  confidence?: number;
  duration?: number;
  context?: string;
  reason?: string;
}

export interface FeedbackEntry {
  id: number;
  query: string;
  entryId: string;
  action: FeedbackType;
  source: FeedbackSource;
  confidence: number;
  duration: number | null;
  context: string;
  reason: string | null;
  createdAt: number;
}

export interface FeedbackStats {
  total: number;
  byAction: Record<string, number>;
  bySource: Record<string, number>;
  acceptanceRate: number;
  averageConfidence: number;
}

// ─── Brain Intelligence Types ──────────────────────────────────────

export interface PatternStrength {
  pattern: string;
  domain: string;
  strength: number;
  usageScore: number;
  spreadScore: number;
  successScore: number;
  recencyScore: number;
  usageCount: number;
  uniqueContexts: number;
  successRate: number;
  lastUsed: string;
}

export interface StrengthsQuery {
  domain?: string;
  minStrength?: number;
  limit?: number;
}

export interface BrainSession {
  id: string;
  startedAt: string;
  endedAt: string | null;
  domain: string | null;
  context: string | null;
  toolsUsed: string[];
  filesModified: string[];
  planId: string | null;
  planOutcome: string | null;
  extractedAt: string | null;
}

export interface SessionLifecycleInput {
  action: 'start' | 'end';
  sessionId?: string;
  domain?: string;
  context?: string;
  toolsUsed?: string[];
  filesModified?: string[];
  planId?: string;
  planOutcome?: string;
}

export interface KnowledgeProposal {
  id: string;
  sessionId: string;
  rule: string;
  type: 'pattern' | 'anti-pattern' | 'workflow';
  title: string;
  description: string;
  confidence: number;
  promoted: boolean;
  createdAt: string;
}

export interface ExtractionResult {
  sessionId: string;
  proposals: KnowledgeProposal[];
  rulesApplied: string[];
}

export interface GlobalPattern {
  pattern: string;
  domains: string[];
  totalStrength: number;
  avgStrength: number;
  domainCount: number;
}

export interface DomainProfile {
  domain: string;
  topPatterns: Array<{ pattern: string; strength: number }>;
  sessionCount: number;
  avgSessionDuration: number;
  lastActivity: string;
}

export interface BuildIntelligenceResult {
  strengthsComputed: number;
  globalPatterns: number;
  domainProfiles: number;
}

export interface BrainIntelligenceStats {
  strengths: number;
  sessions: number;
  activeSessions: number;
  proposals: number;
  promotedProposals: number;
  globalPatterns: number;
  domainProfiles: number;
}

export interface SessionContext {
  recentSessions: BrainSession[];
  toolFrequency: Array<{ tool: string; count: number }>;
  fileFrequency: Array<{ file: string; count: number }>;
}

export interface BrainExportData {
  strengths: PatternStrength[];
  sessions: BrainSession[];
  proposals: KnowledgeProposal[];
  globalPatterns: GlobalPattern[];
  domainProfiles: DomainProfile[];
  exportedAt: string;
}

export interface BrainImportResult {
  imported: {
    strengths: number;
    sessions: number;
    proposals: number;
    globalPatterns: number;
    domainProfiles: number;
  };
}

// ─── Session Management Types ─────────────────────────────────────

export interface SessionListQuery {
  domain?: string;
  active?: boolean;
  extracted?: boolean;
  limit?: number;
  offset?: number;
}

export interface SessionQuality {
  sessionId: string;
  overall: number;
  completeness: number;
  artifactDensity: number;
  toolEngagement: number;
  outcomeClarity: number;
}

export interface SessionReplay {
  session: BrainSession;
  quality: SessionQuality;
  proposals: KnowledgeProposal[];
  durationMinutes: number | null;
}
