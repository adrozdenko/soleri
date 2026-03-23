/**
 * Task Complexity Assessor — pure function that classifies tasks as simple or complex.
 *
 * Used by the planning module to decide whether a decomposed GH issue
 * needs a full plan or can be executed directly.
 */

// ─── Types ──────────────────────────────────────────────────────────

export interface AssessmentInput {
  /** User's task description. */
  prompt: string;
  /** Estimated number of files to touch. */
  filesEstimated?: number;
  /** GH issue body if available. */
  parentIssueContext?: string;
  /** Whether the approach is already described in a parent plan. */
  hasParentPlan?: boolean;
  /** Which domains are involved. */
  domains?: string[];
}

export interface AssessmentSignal {
  name: string;
  weight: number;
  triggered: boolean;
  detail: string;
}

export interface AssessmentResult {
  classification: 'simple' | 'complex';
  /** 0-100 complexity score. Threshold at 40. */
  score: number;
  signals: AssessmentSignal[];
  /** One-line explanation. */
  reasoning: string;
}

// ─── Signal Detectors ───────────────────────────────────────────────

const CROSS_CUTTING_PATTERNS = [
  /\bauth(?:entication|orization)?\b/i,
  /\bmigrat(?:e|ion|ing)\b/i,
  /\brefactor(?:ing)?\s+across\b/i,
  /\bcross[- ]cutting\b/i,
];

const NEW_DEPENDENCY_PATTERNS = [
  /\badd\s+dep(?:endency|endencies)?\b/i,
  /\binstall\b/i,
  /\bnew\s+package\b/i,
  /\bnpm\s+install\b/i,
  /\badd\s+(?:a\s+)?(?:new\s+)?(?:npm\s+)?package\b/i,
];

const DESIGN_DECISION_PATTERNS = [
  /\bhow\s+should\b/i,
  /\bwhich\s+approach\b/i,
  /\bdesign\s+decision\b/i,
  /\barchitectur(?:e|al)\s+(?:decision|choice)\b/i,
  /\btrade[- ]?off/i,
];

function detectFileCount(input: AssessmentInput): AssessmentSignal {
  const files = input.filesEstimated ?? 0;
  const triggered = files >= 3;
  return {
    name: 'file-count',
    weight: 25,
    triggered,
    detail: triggered
      ? `Estimated ${files} files (≥3 threshold)`
      : files > 0
        ? `Estimated ${files} file${files === 1 ? '' : 's'} (under threshold)`
        : 'No file estimate provided',
  };
}

function detectCrossCutting(input: AssessmentInput): AssessmentSignal {
  const text = input.prompt;
  const match = CROSS_CUTTING_PATTERNS.find((p) => p.test(text));
  return {
    name: 'cross-cutting-keywords',
    weight: 20,
    triggered: !!match,
    detail: match
      ? `Detected cross-cutting keyword: "${text.match(match)?.[0]}"`
      : 'No cross-cutting keywords detected',
  };
}

function detectNewDependencies(input: AssessmentInput): AssessmentSignal {
  const text = input.prompt;
  const match = NEW_DEPENDENCY_PATTERNS.find((p) => p.test(text));
  return {
    name: 'new-dependencies',
    weight: 15,
    triggered: !!match,
    detail: match
      ? `Detected dependency signal: "${text.match(match)?.[0]}"`
      : 'No new dependency signals detected',
  };
}

function detectDesignDecisions(input: AssessmentInput): AssessmentSignal {
  const text = input.prompt;
  const match = DESIGN_DECISION_PATTERNS.find((p) => p.test(text));
  return {
    name: 'design-decisions-needed',
    weight: 20,
    triggered: !!match,
    detail: match
      ? `Detected design decision signal: "${text.match(match)?.[0]}"`
      : 'No design decision signals detected',
  };
}

function detectApproachDescribed(input: AssessmentInput): AssessmentSignal {
  const hasContext = !!(input.hasParentPlan || input.parentIssueContext?.trim());
  return {
    name: 'approach-already-described',
    weight: -15,
    triggered: hasContext,
    detail: hasContext
      ? 'Approach already described in parent plan or issue'
      : 'No pre-existing approach context',
  };
}

function detectMultiDomain(input: AssessmentInput): AssessmentSignal {
  const domains = input.domains ?? [];
  const triggered = domains.length >= 2;
  return {
    name: 'multi-domain',
    weight: 5,
    triggered,
    detail: triggered
      ? `Involves ${domains.length} domains: ${domains.join(', ')}`
      : domains.length === 1
        ? `Single domain: ${domains[0]}`
        : 'No domains specified',
  };
}

// ─── Assessor ───────────────────────────────────────────────────────

const COMPLEXITY_THRESHOLD = 40;

/**
 * Assess task complexity from structured input.
 *
 * Returns a classification (`simple` | `complex`), a numeric score (0-100),
 * the individual signals that contributed, and a one-line reasoning string.
 *
 * Pure function — no side effects, no DB, no MCP calls.
 */
export function assessTaskComplexity(input: AssessmentInput): AssessmentResult {
  const signals: AssessmentSignal[] = [
    detectFileCount(input),
    detectCrossCutting(input),
    detectNewDependencies(input),
    detectDesignDecisions(input),
    detectApproachDescribed(input),
    detectMultiDomain(input),
  ];

  const rawScore = signals.reduce(
    (sum, s) => sum + (s.triggered ? s.weight : 0),
    0,
  );

  // Clamp to 0-100
  const score = Math.max(0, Math.min(100, rawScore));
  const classification = score >= COMPLEXITY_THRESHOLD ? 'complex' : 'simple';

  const triggered = signals.filter((s) => s.triggered);
  const reasoning =
    triggered.length === 0
      ? 'No complexity signals detected — treating as simple task'
      : `${classification === 'complex' ? 'Complex' : 'Simple'}: ${triggered.map((s) => s.name).join(', ')} (score ${score})`;

  return { classification, score, signals, reasoning };
}
