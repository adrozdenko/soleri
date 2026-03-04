// ─── Curator Types ──────────────────────────────────────────────────

export type EntryStatus = 'active' | 'stale' | 'archived';
export type EntrySource = 'manual' | 'capture' | 'seed' | 'unknown';

// ─── Tag Normalization ──────────────────────────────────────────────

export interface TagNormalizationResult {
  original: string;
  normalized: string;
  wasAliased: boolean;
}

export interface CanonicalTag {
  tag: string;
  description: string | null;
  usageCount: number;
  aliasCount: number;
}

// ─── Duplicate Detection ────────────────────────────────────────────

export interface DuplicateCandidate {
  entryId: string;
  title: string;
  similarity: number;
  suggestMerge: boolean;
}

export interface DuplicateDetectionResult {
  entryId: string;
  matches: DuplicateCandidate[];
  scannedCount: number;
}

// ─── Contradictions ─────────────────────────────────────────────────

export type ContradictionStatus = 'open' | 'resolved' | 'dismissed';

export interface Contradiction {
  id: number;
  patternId: string;
  antipatternId: string;
  similarity: number;
  status: ContradictionStatus;
  createdAt: number;
  resolvedAt: number | null;
}

// ─── Grooming ───────────────────────────────────────────────────────

export interface GroomResult {
  entryId: string;
  tagsNormalized: TagNormalizationResult[];
  stale: boolean;
  lastGroomedAt: number;
}

export interface GroomAllResult {
  totalEntries: number;
  groomedCount: number;
  tagsNormalized: number;
  staleCount: number;
  durationMs: number;
}

// ─── Consolidation ──────────────────────────────────────────────────

export interface ConsolidationOptions {
  dryRun?: boolean;
  staleDaysThreshold?: number;
  duplicateThreshold?: number;
  contradictionThreshold?: number;
}

export interface ConsolidationResult {
  dryRun: boolean;
  duplicates: DuplicateDetectionResult[];
  staleEntries: string[];
  contradictions: Contradiction[];
  mutations: number;
  durationMs: number;
}

// ─── Changelog & Health ─────────────────────────────────────────────

export interface ChangelogEntry {
  id: number;
  action: string;
  entryId: string;
  beforeValue: string | null;
  afterValue: string | null;
  reason: string;
  createdAt: number;
}

export interface HealthMetrics {
  coverage: number;
  freshness: number;
  quality: number;
  tagHealth: number;
}

export interface HealthAuditResult {
  score: number;
  metrics: HealthMetrics;
  recommendations: string[];
}

export interface CuratorStatus {
  initialized: boolean;
  tables: Record<string, number>;
  lastGroomedAt: number | null;
}
