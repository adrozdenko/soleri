/**
 * Quality and substance analysis passes (5-8).
 * These passes examine clarity, semantic quality, knowledge depth,
 * and alternative analysis of plans.
 */

import type { Plan } from './planner.js';
import type { PlanGap } from './gap-types.js';
import { gap, taskText, decisionText, decisionsText, containsAny } from './gap-patterns.js';

// ─── Pattern Constants (Passes 5-8) ─────────────────────────────

export const AMBIGUOUS_WORDS = [
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

export const GENERIC_OBJECTIVE_PATTERNS = [
  /^(create|build|implement|add|make|do)\s+\w+$/i,
  /^fix\s+\w+$/i,
  /^update\s+\w+$/i,
];

export const RATIONALE_INDICATORS = [
  'because',
  'since',
  'due to',
  'in order to',
  'so that',
  'given that',
  'as a result',
];

export const SHALLOW_INDICATORS = ['better', 'good', 'best', 'nice', 'great', 'improved'];

export const KNOWLEDGE_INDICATORS = [
  /vault\s*pattern/i,
  /vault\s*patterns/i,
  /anti-pattern/i,
  /wcag\s*[\d.]+/i,
  /aria-[a-z]+/i,
  /\d+(\.\d+)?:\d+\s*(contrast|ratio)/i,
  /\d+px\s*(touch|target|minimum|min)/i,
  /acceptance\s*criteria/i,
];

/** Checks if task descriptions reference specific named patterns (e.g. "zod-form-validation"). */
export const NAMED_PATTERN_REGEX = /[a-z]+-[a-z]+-[a-z]+/;

// ─── Pass 5: Clarity ─────────────────────────────────────────────

export function analyzeClarity(plan: Plan): PlanGap[] {
  const gaps: PlanGap[] = [];
  const allText = `${plan.objective} ${plan.scope} ${decisionsText(plan)}`;
  const lower = allText.toLowerCase();

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

export function analyzeSemanticQuality(plan: Plan): PlanGap[] {
  const gaps: PlanGap[] = [];

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

// ─── Pass 7: Knowledge Depth (Substance Bonuses) ────────────────

export function analyzeKnowledgeDepth(plan: Plan): PlanGap[] {
  const gaps: PlanGap[] = [];
  const allTaskText = taskText(plan);

  let namedPatternCount = 0;
  for (const task of plan.tasks) {
    const desc = task.description || '';
    const matches = desc.match(/[a-z]+-[a-z]+(-[a-z]+)*/g) || [];
    const patternRefs = matches.filter(
      (m) =>
        m.length > 8 &&
        NAMED_PATTERN_REGEX.test(m) &&
        !['front-end', 'back-end', 'real-time', 'client-side', 'server-side'].includes(m),
    );
    namedPatternCount += patternRefs.length;
  }

  if (namedPatternCount >= 5) {
    gaps.push(
      gap(
        'bonus',
        'knowledge-depth',
        `${namedPatternCount} vault pattern references across tasks — strong knowledge-informed plan.`,
        '',
        'tasks',
        'vault_pattern_refs_high',
      ),
    );
    gaps.push(
      gap(
        'bonus',
        'knowledge-depth',
        'Vault pattern density indicates expert-level domain knowledge.',
        '',
        'tasks',
        'vault_pattern_density',
      ),
    );
  } else if (namedPatternCount >= 2) {
    gaps.push(
      gap(
        'bonus',
        'knowledge-depth',
        `${namedPatternCount} vault pattern references across tasks.`,
        '',
        'tasks',
        'vault_pattern_refs_medium',
      ),
    );
  }

  let tasksWithCriteria = 0;
  let totalCriteria = 0;
  for (const task of plan.tasks) {
    if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
      tasksWithCriteria++;
      totalCriteria += task.acceptanceCriteria.length;
    }
  }

  if (plan.tasks.length > 0 && tasksWithCriteria / plan.tasks.length >= 0.8) {
    gaps.push(
      gap(
        'bonus',
        'knowledge-depth',
        `${tasksWithCriteria}/${plan.tasks.length} tasks have acceptance criteria (${totalCriteria} total).`,
        '',
        'tasks',
        'high_acceptance_criteria',
      ),
    );
  }

  let indicatorHits = 0;
  for (const pattern of KNOWLEDGE_INDICATORS) {
    if (pattern.test(allTaskText)) indicatorHits++;
  }

  if (indicatorHits >= 4) {
    gaps.push(
      gap(
        'bonus',
        'knowledge-depth',
        `${indicatorHits} domain-specific knowledge indicators found (WCAG, ARIA, contrast ratios, touch targets, etc.).`,
        '',
        'tasks',
        'domain_knowledge_indicators',
      ),
    );
  }

  if (plan.tasks.length > 0) {
    const avgDescLength =
      plan.tasks.reduce((sum, t) => sum + (t.description?.length ?? 0), 0) / plan.tasks.length;
    if (avgDescLength >= 80) {
      gaps.push(
        gap(
          'bonus',
          'knowledge-depth',
          `Task descriptions average ${Math.round(avgDescLength)} chars — detailed and specific.`,
          '',
          'tasks',
          'rich_task_descriptions',
        ),
      );
    }
  }

  return gaps;
}

// ─── Pass 8: Alternative Analysis ────────────────────────────────

export function analyzeAlternatives(plan: Plan): PlanGap[] {
  const gaps: PlanGap[] = [];
  const alts = plan.alternatives;

  if (!alts || alts.length === 0) {
    gaps.push(
      gap(
        'major',
        'alternative-analysis',
        'No alternatives considered — risk of tunnel vision.',
        'Add at least 2 rejected alternatives with pros, cons, and rejection rationale.',
        'alternatives',
        'no_alternatives',
      ),
    );
    return gaps;
  }

  if (alts.length < 2) {
    gaps.push(
      gap(
        'minor',
        'alternative-analysis',
        `Only ${alts.length} alternative explored — consider at least 2.`,
        'Add another rejected alternative to strengthen decision rationale.',
        'alternatives',
        'few_alternatives',
      ),
    );
  }

  for (let i = 0; i < alts.length; i++) {
    if (!alts[i].rejected_reason || alts[i].rejected_reason.trim().length === 0) {
      gaps.push(
        gap(
          'minor',
          'alternative-analysis',
          `Alternative ${i + 1} ("${alts[i].approach}") missing rejection rationale.`,
          'Explain why this alternative was rejected.',
          `alternatives[${i}]`,
          'missing_rejection_rationale',
        ),
      );
    }
  }

  return gaps;
}
