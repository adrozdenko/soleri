/**
 * Gap analysis engine for plan grading.
 * Ported from Salvador MCP's plan-gap-content.ts / plan-gap-technical.ts /
 * plan-gap-domain.ts / plan-gap-antipattern.ts.
 *
 * 6 built-in passes (always run):
 *   1. Structure     — required fields present and sufficiently long
 *   2. Completeness  — measurable objectives, decision rationale, scope exclusions
 *   3. Feasibility   — overly broad scope, missing dependency awareness
 *   4. Risk          — breaking changes without mitigation, missing verification
 *   5. Clarity       — ambiguous language, vague criteria
 *   6. Semantic Quality — generic objectives, shallow rationale, non-concrete approach
 *
 * Opt-in pass factories (registered via customPasses):
 *   - createToolFeasibilityPass  — validates tool_chain entries and ordering
 *   - createFlowAlignmentPass    — validates flow and target_mode against registries
 *   - createAntiPatternPass      — detects content anti-patterns and vague criteria
 */

import type { Plan, PlanDecision } from './planner.js';
import type { PlanGap, GapSeverity, GapCategory } from './gap-types.js';
import {
  generateGapId,
  MIN_OBJECTIVE_LENGTH,
  MIN_SCOPE_LENGTH,
  MIN_DECISION_LENGTH,
} from './gap-types.js';

// ─── Helpers ─────────────────────────────────────────────────────

function gap(
  severity: GapSeverity,
  category: GapCategory,
  description: string,
  recommendation: string,
  location?: string,
  trigger?: string,
): PlanGap {
  return {
    id: generateGapId(),
    severity,
    category,
    description,
    recommendation,
    ...(location ? { location } : {}),
    ...(trigger ? { _trigger: trigger } : {}),
  };
}

/** Combine all task descriptions + titles into a single text blob for analysis. */
function taskText(plan: Plan): string {
  return plan.tasks.map((t) => `${t.title} ${t.description}`).join(' ');
}

/** Extract text from a decision (supports both string and structured format). */
function decisionText(d: string | PlanDecision): string {
  return typeof d === 'string' ? d : `${d.decision} ${d.rationale}`;
}

/** Combine all decisions into a single text blob. */
function decisionsText(plan: Plan): string {
  return plan.decisions.map(decisionText).join(' ');
}

/** Check if text contains any of the given patterns (case-insensitive). */
function containsAny(text: string, patterns: string[]): boolean {
  const lower = text.toLowerCase();
  return patterns.some((p) => lower.includes(p.toLowerCase()));
}

// ─── Pass 1: Structure ───────────────────────────────────────────

function analyzeStructure(plan: Plan): PlanGap[] {
  const gaps: PlanGap[] = [];

  if (!plan.objective || plan.objective.trim().length < MIN_OBJECTIVE_LENGTH) {
    gaps.push(
      gap(
        'critical',
        'structure',
        plan.objective
          ? `Objective too short (${plan.objective.trim().length} chars, need ${MIN_OBJECTIVE_LENGTH}+).`
          : 'Plan has no objective.',
        'Add a clear objective describing what this plan achieves.',
        'objective',
        'missing_or_short_objective',
      ),
    );
  }

  if (!plan.scope || plan.scope.trim().length < MIN_SCOPE_LENGTH) {
    gaps.push(
      gap(
        'critical',
        'structure',
        plan.scope
          ? `Scope too short (${plan.scope.trim().length} chars, need ${MIN_SCOPE_LENGTH}+).`
          : 'Plan has no scope defined.',
        'Define the scope — what is included and excluded.',
        'scope',
        'missing_or_short_scope',
      ),
    );
  }

  if (plan.tasks.length === 0) {
    gaps.push(
      gap(
        'critical',
        'structure',
        'Plan has no tasks.',
        'Add at least one task to make the plan actionable.',
        'tasks',
        'no_tasks',
      ),
    );
  }

  return gaps;
}

// ─── Pass 2: Completeness ────────────────────────────────────────

const METRIC_PATTERNS = [
  /\d+/,
  /percent/i,
  /reduce/i,
  /increase/i,
  /measure/i,
  /target/i,
  /goal/i,
  /kpi/i,
  /metric/i,
  /benchmark/i,
];

const EXCLUSION_KEYWORDS = [
  'not',
  'exclude',
  'outside',
  'beyond',
  'limit',
  'except',
  "won't",
  'will not',
];

function analyzeCompleteness(plan: Plan): PlanGap[] {
  const gaps: PlanGap[] = [];

  // Objective lacks measurable indicators
  if (plan.objective && !METRIC_PATTERNS.some((p) => p.test(plan.objective))) {
    gaps.push(
      gap(
        'minor',
        'completeness',
        'Objective has no measurable targets or metrics.',
        'Include quantifiable success criteria (numbers, percentages, concrete outcomes).',
        'objective',
        'no_metrics_in_objective',
      ),
    );
  }

  // Decisions without rationale-like content
  if (plan.decisions.length > 0) {
    for (let i = 0; i < plan.decisions.length; i++) {
      const d = plan.decisions[i];
      const text = decisionText(d);
      if (text.trim().length < MIN_DECISION_LENGTH) {
        gaps.push(
          gap(
            'major',
            'completeness',
            `Decision ${i + 1} is too short (${text.trim().length} chars) — lacks rationale.`,
            'Expand each decision to include the reasoning (why this choice over alternatives).',
            `decisions[${i}]`,
            'short_decision',
          ),
        );
      }
    }
  }

  // Scope missing exclusions
  if (plan.scope && !containsAny(plan.scope, EXCLUSION_KEYWORDS)) {
    gaps.push(
      gap(
        'minor',
        'completeness',
        'Scope does not mention what is excluded.',
        'Add explicit exclusions to prevent scope creep (e.g., "does NOT include…").',
        'scope',
        'no_exclusions_in_scope',
      ),
    );
  }

  return gaps;
}

// ─── Pass 3: Feasibility ─────────────────────────────────────────

const OVERLY_BROAD_PATTERNS = [
  'everything',
  'all systems',
  'entire codebase',
  'complete rewrite',
  'from scratch',
  'total overhaul',
  'rewrite everything',
];

const DEPENDENCY_KEYWORDS = [
  'depends',
  'dependency',
  'prerequisite',
  'requires',
  'blocked',
  'before',
];

function analyzeFeasibility(plan: Plan): PlanGap[] {
  const gaps: PlanGap[] = [];
  const scopeAndTasks = `${plan.scope} ${taskText(plan)}`;

  // Overly broad scope
  if (containsAny(scopeAndTasks, OVERLY_BROAD_PATTERNS)) {
    gaps.push(
      gap(
        'major',
        'feasibility',
        'Scope contains overly broad indicators — risk of unrealistic delivery.',
        'Narrow the scope to a well-defined subset. Prefer incremental delivery over big-bang rewrites.',
        'scope',
        'overly_broad_scope',
      ),
    );
  }

  // No dependency awareness in tasks
  if (plan.tasks.length > 3 && !containsAny(scopeAndTasks, DEPENDENCY_KEYWORDS)) {
    const hasDeps = plan.tasks.some((t) => t.dependsOn && t.dependsOn.length > 0);
    if (!hasDeps) {
      gaps.push(
        gap(
          'minor',
          'feasibility',
          `${plan.tasks.length} tasks with no dependency mentions — execution order unclear.`,
          'Identify dependencies between tasks or add explicit ordering notes.',
          'tasks',
          'no_dependency_awareness',
        ),
      );
    }
  }

  return gaps;
}

// ─── Pass 4: Risk ────────────────────────────────────────────────

const BREAKING_CHANGE_KEYWORDS = [
  'breaking change',
  'breaking',
  'migration',
  'deprecate',
  'remove api',
  'remove endpoint',
  'schema change',
  'database migration',
];

const MITIGATION_KEYWORDS = [
  'rollback',
  'backward compatible',
  'backwards compatible',
  'feature flag',
  'gradual',
  'phased',
  'fallback',
  'backup',
  'canary',
  'blue-green',
];

const VERIFICATION_KEYWORDS = [
  'test',
  'verify',
  'validate',
  'check',
  'assert',
  'confirm',
  'spec',
  'coverage',
];

function analyzeRisk(plan: Plan): PlanGap[] {
  const gaps: PlanGap[] = [];
  const allText = `${plan.objective} ${plan.scope} ${taskText(plan)} ${decisionsText(plan)}`;

  // Breaking changes without mitigation
  if (
    containsAny(allText, BREAKING_CHANGE_KEYWORDS) &&
    !containsAny(allText, MITIGATION_KEYWORDS)
  ) {
    gaps.push(
      gap(
        'major',
        'risk',
        'Plan involves breaking changes but mentions no mitigation strategy.',
        'Add a rollback plan, feature flags, or phased migration approach.',
        undefined,
        'breaking_without_mitigation',
      ),
    );
  }

  // No verification/testing mentioned
  if (plan.tasks.length > 0 && !containsAny(allText, VERIFICATION_KEYWORDS)) {
    gaps.push(
      gap(
        'minor',
        'risk',
        'No verification or testing mentioned in the plan.',
        'Add at least one task or note about testing/validation.',
        'tasks',
        'no_verification_mentioned',
      ),
    );
  }

  return gaps;
}

// ─── Pass 5: Clarity ─────────────────────────────────────────────

const AMBIGUOUS_WORDS = [
  'maybe',
  'perhaps',
  'might',
  'could',
  'some',
  'etc',
  'soon',
  'simple',
  'easy',
  'appropriate',
  'various',
  'several',
  'probably',
  'possibly',
  'somehow',
];

function analyzeClarity(plan: Plan): PlanGap[] {
  const gaps: PlanGap[] = [];
  const allText = `${plan.objective} ${plan.scope} ${decisionsText(plan)}`;
  const lower = allText.toLowerCase();

  // Ambiguous language
  const found = AMBIGUOUS_WORDS.filter((w) => {
    const regex = new RegExp(`\\b${w}\\b`, 'i');
    return regex.test(lower);
  });

  if (found.length > 0) {
    gaps.push(
      gap(
        'minor',
        'clarity',
        `Ambiguous language detected: ${found.slice(0, 5).join(', ')}${found.length > 5 ? ` (+${found.length - 5} more)` : ''}.`,
        'Replace vague terms with concrete, specific language.',
        undefined,
        `ambiguous_words:${found.join(',')}`,
      ),
    );
  }

  // Tasks with very short or missing descriptions
  const shortTasks = plan.tasks.filter((t) => !t.description || t.description.trim().length < 10);
  if (shortTasks.length > 0) {
    gaps.push(
      gap(
        'minor',
        'clarity',
        `${shortTasks.length} task(s) with very short descriptions: ${shortTasks.map((t) => t.id).join(', ')}.`,
        'Add detailed descriptions to all tasks explaining what needs to be done.',
        'tasks',
        'short_task_descriptions',
      ),
    );
  }

  return gaps;
}

// ─── Pass 6: Semantic Quality ────────────────────────────────────

const GENERIC_OBJECTIVE_PATTERNS = [
  /^(create|build|implement|add|make|do)\s+\w+$/i,
  /^fix\s+\w+$/i,
  /^update\s+\w+$/i,
];

const RATIONALE_INDICATORS = [
  'because',
  'since',
  'due to',
  'in order to',
  'so that',
  'given that',
  'as a result',
];
const SHALLOW_INDICATORS = ['better', 'good', 'best', 'nice', 'great', 'improved'];

function analyzeSemanticQuality(plan: Plan): PlanGap[] {
  const gaps: PlanGap[] = [];

  // Generic/too-short objective
  if (plan.objective) {
    const words = plan.objective.trim().split(/\s+/);
    const isGeneric = GENERIC_OBJECTIVE_PATTERNS.some((p) => p.test(plan.objective.trim()));

    if (isGeneric || words.length < 5) {
      gaps.push(
        gap(
          'major',
          'semantic-quality',
          `Objective is too generic${words.length < 5 ? ` (${words.length} words)` : ''}: "${plan.objective.trim()}".`,
          'Expand the objective to describe the specific outcome, context, and constraints.',
          'objective',
          'generic_objective',
        ),
      );
    }
  }

  // Task granularity check (too few or too many)
  if (plan.tasks.length > 0 && plan.tasks.length < 3) {
    gaps.push(
      gap(
        'minor',
        'semantic-quality',
        `Only ${plan.tasks.length} task(s) — plan may lack sufficient breakdown.`,
        'Break down the work into 3-15 well-defined tasks for better tracking.',
        'tasks',
        'too_few_tasks',
      ),
    );
  } else if (plan.tasks.length > 20) {
    gaps.push(
      gap(
        'major',
        'semantic-quality',
        `${plan.tasks.length} tasks — plan scope may be too large.`,
        'Split into multiple plans or consolidate related tasks to stay under 20.',
        'tasks',
        'too_many_tasks',
      ),
    );
  }

  // Decisions with shallow rationale (uses "better/good" without "because/since")
  for (let i = 0; i < plan.decisions.length; i++) {
    const d = decisionText(plan.decisions[i]);
    const hasShallow = containsAny(d, SHALLOW_INDICATORS);
    const hasRationale = containsAny(d, RATIONALE_INDICATORS);
    if (hasShallow && !hasRationale) {
      gaps.push(
        gap(
          'minor',
          'semantic-quality',
          `Decision ${i + 1} uses subjective language without justification.`,
          'Replace "better/good/best" with concrete reasoning using "because/since/due to".',
          `decisions[${i}]`,
          'shallow_rationale',
        ),
      );
    }
  }

  // All task titles must be unique
  const titleSet = new Set<string>();
  const duplicates: string[] = [];
  for (const t of plan.tasks) {
    if (titleSet.has(t.title)) duplicates.push(t.title);
    titleSet.add(t.title);
  }
  if (duplicates.length > 0) {
    gaps.push(
      gap(
        'minor',
        'semantic-quality',
        `Duplicate task titles: ${[...new Set(duplicates)].join(', ')}.`,
        'Give each task a unique, descriptive title.',
        'tasks',
        'duplicate_task_titles',
      ),
    );
  }

  // No decisions at all for multi-task plans
  if (plan.tasks.length >= 3 && plan.decisions.length === 0) {
    gaps.push(
      gap(
        'major',
        'semantic-quality',
        `${plan.tasks.length} tasks but no decisions documented.`,
        'Document key decisions and their rationale — at least 1 per 3 tasks.',
        'decisions',
        'no_decisions',
      ),
    );
  }

  return gaps;
}

// ─── Types ───────────────────────────────────────────────────────

/** A custom gap analysis pass that agents can register. */
export type GapAnalysisPass = (plan: Plan) => PlanGap[];

export interface GapAnalysisOptions {
  /** Custom gap analysis passes appended after the 6 built-in passes. */
  customPasses?: GapAnalysisPass[];
}

// ─── Opt-In Pass Factories ──────────────────────────────────────
// Ported from Salvador's plan-gap-technical.ts, plan-gap-domain.ts,
// and plan-gap-antipattern.ts. These are parameterized factories that
// agents register via customPasses.

/**
 * Factory: tool chain feasibility pass.
 * Validates that tool_chain entries are known and ordering rules are respected.
 * Ported from Salvador's analyzeToolFeasibility.
 *
 * @param validTools - Set of valid tool names for this agent
 * @param orderingRules - Ordering constraints (e.g., search before create)
 */
export function createToolFeasibilityPass(
  validTools: Set<string>,
  orderingRules?: Array<{ before: string; after: string; reason: string }>,
): GapAnalysisPass {
  return (plan: Plan) => {
    const gaps: PlanGap[] = [];
    const toolChain = plan.tool_chain;
    if (!toolChain || toolChain.length === 0) return gaps;

    // Validate tool names
    const invalidTools = toolChain.filter((t) => !validTools.has(t));
    if (invalidTools.length > 0) {
      gaps.push(
        gap(
          'critical',
          'tool-feasibility',
          `Invalid tool names in tool_chain: ${invalidTools.join(', ')}`,
          'Use valid tool names. Check available tools for this agent.',
          'tool_chain',
          `invalid_tools:${invalidTools.join(',')}`,
        ),
      );
    }

    // Validate ordering rules
    if (orderingRules) {
      for (const rule of orderingRules) {
        const beforeIndex = toolChain.indexOf(rule.before);
        const afterIndex = toolChain.indexOf(rule.after);
        if (beforeIndex !== -1 && afterIndex !== -1 && beforeIndex > afterIndex) {
          gaps.push(
            gap(
              'major',
              'tool-feasibility',
              `Tool ordering violation: ${rule.before} must come before ${rule.after}`,
              rule.reason,
              'tool_chain',
              `ordering:${rule.before}>${rule.after}`,
            ),
          );
        }
      }
    }

    return gaps;
  };
}

/**
 * Factory: flow and mode alignment pass.
 * Validates flow and target_mode against known values and intent alignment.
 * Ported from Salvador's analyzeFlowAlignment.
 *
 * @param validFlows - Set of valid flow names for this agent
 * @param validModes - Set of valid operational modes for this agent
 * @param intentFlowMap - Maps detected intents to expected flows
 */
export function createFlowAlignmentPass(
  validFlows: Set<string>,
  validModes: Set<string>,
  intentFlowMap?: Record<string, string[]>,
): GapAnalysisPass {
  return (plan: Plan) => {
    const gaps: PlanGap[] = [];

    if (plan.flow && !validFlows.has(plan.flow)) {
      gaps.push(
        gap(
          'major',
          'flow-alignment',
          `Invalid flow: ${plan.flow}`,
          `Valid flows are: ${Array.from(validFlows).join(', ')}`,
          'flow',
          `invalid_flow:${plan.flow}`,
        ),
      );
    }

    if (plan.target_mode && !validModes.has(plan.target_mode)) {
      gaps.push(
        gap(
          'major',
          'flow-alignment',
          `Invalid target_mode: ${plan.target_mode}`,
          `Valid modes are: ${Array.from(validModes).join(', ')}`,
          'target_mode',
          `invalid_mode:${plan.target_mode}`,
        ),
      );
    }

    // Intent-flow alignment (optional)
    if (intentFlowMap && plan.flow) {
      const objectiveLower = (plan.objective || '').toLowerCase();
      let detectedIntent: string | null = null;

      if (/\b(create|build|implement|add|new)\b/.test(objectiveLower)) {
        detectedIntent = 'CREATE';
      } else if (/\b(fix|debug|repair|resolve|bug)\b/.test(objectiveLower)) {
        detectedIntent = 'FIX';
      } else if (/\b(review|audit|check|validate|inspect)\b/.test(objectiveLower)) {
        detectedIntent = 'REVIEW';
      } else if (/\b(plan|design|architect|structure)\b/.test(objectiveLower)) {
        detectedIntent = 'PLAN';
      } else if (/\b(enhance|improve|refactor|optimize)\b/.test(objectiveLower)) {
        detectedIntent = 'ENHANCE';
      } else if (/\b(deliver|package|publish|deploy|release)\b/.test(objectiveLower)) {
        detectedIntent = 'DELIVER';
      }

      if (detectedIntent) {
        const expectedFlows = intentFlowMap[detectedIntent] || [];
        if (expectedFlows.length > 0 && !expectedFlows.includes(plan.flow)) {
          gaps.push(
            gap(
              'minor',
              'flow-alignment',
              `Flow '${plan.flow}' may not align with detected intent '${detectedIntent}'`,
              `Consider using flow: ${expectedFlows.join(' or ')}`,
              'flow',
              `intent_flow_mismatch:${detectedIntent}->${plan.flow}`,
            ),
          );
        }
      }
    }

    return gaps;
  };
}

/**
 * Factory: content anti-pattern pass.
 * Detects common anti-patterns in plan content.
 * Ported from Salvador's analyzeContentAntiPatterns.
 *
 * @param antiPatterns - Regex patterns to check against approach text
 * @param mitigationPatterns - Patterns that indicate the plan is already mitigating
 */
export function createAntiPatternPass(
  antiPatterns?: Array<{
    pattern: RegExp;
    severity: GapSeverity;
    description: string;
    recommendation: string;
  }>,
  mitigationPatterns?: RegExp[],
): GapAnalysisPass {
  const VAGUE_CRITERIA_PATTERNS: RegExp[] = [
    /^it (looks?|works?|is) (good|nice|fine|great|ok|correct)/i,
    /^(looks?|works?) (good|nice|fine|great|ok)/i,
    /^it('s| is) (done|complete|finished)/i,
    /\bmy machine\b/i,
  ];

  return (plan: Plan) => {
    const gaps: PlanGap[] = [];
    const approach = (plan.approach || '').toLowerCase();
    const criteria = plan.success_criteria || [];
    const fullText = [approach, ...criteria].join(' ').toLowerCase();

    // Check if plan is actively mitigating known anti-patterns
    const isMitigating = mitigationPatterns
      ? mitigationPatterns.some((p) => p.test(fullText))
      : false;

    // Custom anti-pattern checks
    if (!isMitigating && antiPatterns) {
      for (const ap of antiPatterns) {
        if (ap.pattern.test(approach)) {
          gaps.push(
            gap(
              ap.severity,
              'anti-pattern',
              ap.description,
              ap.recommendation,
              'approach',
              `anti_pattern:${ap.description}`,
            ),
          );
        }
      }
    }

    // Vague success criteria (generic — always checked)
    for (const criterion of criteria) {
      const isVague = VAGUE_CRITERIA_PATTERNS.some((p) => p.test(criterion));
      if (isVague) {
        gaps.push(
          gap(
            'minor',
            'anti-pattern',
            `Success criterion is not measurable: "${criterion}"`,
            'Rewrite as a verifiable assertion: "Component renders X", "All Y pass Z", "No A in B".',
            'success_criteria',
            `vague_criterion:${criterion}`,
          ),
        );
      }
    }

    return gaps;
  };
}

// ─── Orchestrator ────────────────────────────────────────────────

/**
 * Run all 6 built-in gap analysis passes on a plan, plus any custom passes.
 * Returns a combined list of all gaps found, ordered by pass.
 *
 * @param plan - The plan to analyze
 * @param options - Optional config with custom passes for domain-specific checks
 */
export function runGapAnalysis(plan: Plan, options?: GapAnalysisOptions): PlanGap[] {
  const gaps = [
    ...analyzeStructure(plan),
    ...analyzeCompleteness(plan),
    ...analyzeFeasibility(plan),
    ...analyzeRisk(plan),
    ...analyzeClarity(plan),
    ...analyzeSemanticQuality(plan),
  ];

  // Run custom passes (domain-specific checks like tool-feasibility, UI context, etc.)
  if (options?.customPasses) {
    for (const pass of options.customPasses) {
      gaps.push(...pass(plan));
    }
  }

  return gaps;
}
