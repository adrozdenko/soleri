/**
 * Gap analysis engine for plan grading.
 * Ported from Salvador MCP's plan-gap-content.ts / plan-gap-technical.ts /
 * plan-gap-domain.ts / plan-gap-antipattern.ts.
 *
 * 8 built-in passes (always run):
 *   1. Structure     — required fields present and sufficiently long
 *   2. Completeness  — measurable objectives, decision rationale, scope exclusions
 *   3. Feasibility   — overly broad scope, missing dependency awareness
 *   4. Risk          — breaking changes without mitigation, missing verification
 *   5. Clarity       — ambiguous language, vague criteria
 *   6. Semantic Quality — generic objectives, shallow rationale, non-concrete approach
 *   7. Knowledge Depth — BONUS: vault pattern refs, acceptance criteria, domain indicators
 *   8. Alternative Analysis — rejected alternatives prevent tunnel vision (caps at ~85 without)
 *
 * Opt-in pass factories (registered via customPasses):
 *   - createToolFeasibilityPass  — validates tool_chain entries and ordering
 *   - createFlowAlignmentPass    — validates flow and target_mode against registries
 *   - createAntiPatternPass      — detects content anti-patterns and vague criteria
 */

import type { Plan, ConstraintDefinition, CompositionRule } from './planner-types.js';
import { MAX_CONSTRAINT_PATTERN_LENGTH } from './planner-types.js';
import type { PlanGap, GapSeverity } from './gap-types.js';

// ─── Pass imports ────────────────────────────────────────────────

import {
  gap,
  analyzeStructure,
  analyzeCompleteness,
  analyzeFeasibility,
  analyzeRisk,
} from './gap-patterns.js';

import {
  analyzeClarity,
  analyzeSemanticQuality,
  analyzeKnowledgeDepth,
  analyzeAlternatives,
} from './gap-passes.js';

// ─── Types ───────────────────────────────────────────────────────

/** A custom gap analysis pass that agents can register. */
export type GapAnalysisPass = (plan: Plan) => PlanGap[];

export interface GapAnalysisOptions {
  /** Custom gap analysis passes appended after the 8 built-in passes. */
  customPasses?: GapAnalysisPass[];
  /** Vault-sourced constraint definitions evaluated during grading. */
  constraints?: ConstraintDefinition[];
  /** Vault-sourced composition rules requiring companion tasks. */
  compositionRules?: CompositionRule[];
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

// ─── Constraint Pass Factories ──────────────────────────────────

/**
 * Factory: constraint validation pass.
 * Checks plan text fields against vault-sourced constraint patterns.
 * Returns gaps with category 'constraint' matching the constraint's severity.
 *
 * @param constraints - Constraint definitions from vault (domain:constraint entries)
 */
export function createConstraintPass(constraints?: ConstraintDefinition[]): GapAnalysisPass {
  return (plan: Plan) => {
    const gaps: PlanGap[] = [];
    if (!constraints || constraints.length === 0) return gaps;

    // Collect plan text fields to check
    const fields: Array<{ name: string; text: string }> = [
      { name: 'objective', text: plan.objective || '' },
      { name: 'scope', text: plan.scope || '' },
      { name: 'approach', text: plan.approach || '' },
    ];
    for (let i = 0; i < plan.tasks.length; i++) {
      const t = plan.tasks[i];
      fields.push({
        name: `tasks[${i}]`,
        text: `${t.title} ${t.description}`,
      });
    }

    for (const constraint of constraints) {
      // ReDoS guard: skip overly long patterns
      if (constraint.pattern.length > MAX_CONSTRAINT_PATTERN_LENGTH) continue;

      let regex: RegExp;
      try {
        regex = new RegExp(constraint.pattern, 'i');
      } catch {
        // Skip malformed patterns
        continue;
      }

      for (const field of fields) {
        if (regex.test(field.text)) {
          gaps.push(
            gap(
              constraint.severity,
              'constraint',
              `Constraint "${constraint.name}" violated in ${field.name}: ${constraint.description}`,
              `Address the constraint or remove the violating content.`,
              field.name,
              `constraint:${constraint.id}`,
            ),
          );
          // One gap per constraint — don't flag every field
          break;
        }
      }
    }

    return gaps;
  };
}

/**
 * Validate composition rules against plan tasks.
 * Returns gaps when a task matches a trigger but required companion tasks are missing.
 *
 * @param rules - Composition rules from vault (entries tagged 'composition-rule')
 * @param tasks - Plan tasks to validate
 */
export function validateCompositionRules(
  rules?: CompositionRule[],
  tasks?: Plan['tasks'],
): PlanGap[] {
  const gaps: PlanGap[] = [];
  if (!rules || rules.length === 0 || !tasks || tasks.length === 0) return gaps;

  const taskTexts = tasks.map((t) => `${t.title} ${t.description}`.toLowerCase());

  for (const rule of rules) {
    if (rule.trigger.length > MAX_CONSTRAINT_PATTERN_LENGTH) continue;

    let triggerRegex: RegExp;
    try {
      triggerRegex = new RegExp(rule.trigger, 'i');
    } catch {
      continue;
    }

    // Does any task match the trigger?
    const triggerMatchIndices = new Set<number>();
    taskTexts.forEach((text, i) => {
      if (triggerRegex.test(text)) triggerMatchIndices.add(i);
    });
    if (triggerMatchIndices.size === 0) continue;

    // Check that all required companion tasks exist.
    // A companion must be a *separate* task from the trigger — a single task
    // satisfying both trigger and required does not count.
    for (const required of rule.requires) {
      if (required.length > MAX_CONSTRAINT_PATTERN_LENGTH) continue;

      let requiredRegex: RegExp;
      try {
        requiredRegex = new RegExp(required, 'i');
      } catch {
        continue;
      }

      const companionExists = taskTexts.some(
        (text, i) => requiredRegex.test(text) && !triggerMatchIndices.has(i),
      );
      if (!companionExists) {
        gaps.push(
          gap(
            rule.severity,
            'constraint',
            `Composition rule: tasks matching /${rule.trigger}/ require a companion task matching /${required}/. ${rule.description || ''}`.trim(),
            `Add a task that satisfies the requirement: ${required}`,
            'tasks',
            `composition:${rule.trigger}->${required}`,
          ),
        );
      }
    }
  }

  return gaps;
}

// ─── Orchestrator ────────────────────────────────────────────────

/**
 * Run all 8 built-in gap analysis passes on a plan, plus any custom passes.
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
    ...analyzeKnowledgeDepth(plan),
    ...analyzeAlternatives(plan),
  ];

  // Run constraint pass (vault-sourced constraints)
  if (options?.constraints && options.constraints.length > 0) {
    gaps.push(...createConstraintPass(options.constraints)(plan));
  }

  // Run composition rule validation (vault-sourced rules)
  if (options?.compositionRules && options.compositionRules.length > 0) {
    gaps.push(...validateCompositionRules(options.compositionRules, plan.tasks));
  }

  // Run custom passes (domain-specific checks like tool-feasibility, UI context, etc.)
  if (options?.customPasses) {
    for (const pass of options.customPasses) {
      gaps.push(...pass(plan));
    }
  }

  return gaps;
}
