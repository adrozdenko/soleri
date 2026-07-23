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
  synonymMerges: number;
}

// ─── Consolidation ──────────────────────────────────────────────────

export interface ConsolidationOptions {
  dryRun?: boolean;
  staleDaysThreshold?: number;
  duplicateThreshold?: number;
  contradictionThreshold?: number;
  /** When true, run all entries through canonical tag normalization. Dry-run by default. */
  retag?: boolean;
  /** Canonical tag list for retag operation. Required when retag is true. */
  canonicalTags?: string[];
  /** Tag constraint mode for retag. Default: 'suggest'. */
  tagConstraintMode?: 'enforce' | 'suggest' | 'off';
  /** Metadata tag prefixes exempt from canonical normalization. Default: ['source:']. */
  metadataTagPrefixes?: string[];
}

export interface ConsolidationResult {
  dryRun: boolean;
  duplicates: DuplicateDetectionResult[];
  staleEntries: string[];
  contradictions: Contradiction[];
  mutations: number;
  durationMs: number;
  retagged?: number;
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

// ─── Edit-Source Learning Loop (WS6) ────────────────────────────────

/**
 * Classification of a human edit to an agent-produced output.
 * Drawn from §6.3's own examples — normalizes an edit into "the same kind
 * of thing" so recurrence is detectable without literal-identical matching.
 */
export type DiffKind =
  | 'tightened_opening'
  | 'tone_shift'
  | 'length_trim'
  | 'terminology'
  | 'structure_reorder'
  | 'constraint_added';

/** The three named source-level remedies from §6.3. */
export type ProposedChangeType = 'contract_amendment' | 'reference_update' | 'new_constraint';

/** Human review status. NEVER transitions to applied automatically. */
export type EditProposalStatus = 'pending' | 'approved' | 'rejected';

/** A recorded diff between agent output (before) and human edit (after). */
export interface EditDiffRow {
  id: number;
  outputId: string;
  sourceRef: string;
  runId: string;
  beforeText: string;
  afterText: string;
  diffKind: DiffKind;
  createdAt: number;
}

/** The source-level change the loop proposes (never auto-applied). */
export interface ProposedChange {
  type: ProposedChangeType;
  target: string;
  suggestion: string;
}

/**
 * Emitted when a recurring correction crosses the threshold (≥3 diffs sharing
 * source_ref + diff_kind across ≥3 distinct run_ids). Surfaced through the
 * brain-proposals channel; requires an explicit human approve op to ratify.
 */
export interface EditSourceProposal {
  id: string;
  kind: 'edit_source';
  sourceRef: string;
  diffKind: DiffKind;
  evidenceRuns: string[];
  evidenceDiffIds: number[];
  proposedChange: ProposedChange;
  /** Advisory only — derived from recurrence count + kind cohesion. Never gates apply. */
  confidence: number;
  status: EditProposalStatus;
}
