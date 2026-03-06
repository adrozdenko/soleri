/**
 * Playbook Registry
 *
 * Matches playbooks to plan context (intent + keywords) and merges
 * generic + domain tiers into a single MergedPlaybook.
 *
 * Resolution order: vault first (user overrides), built-in fallback.
 */

import type {
  PlaybookDefinition,
  PlaybookMatchResult,
  MergedPlaybook,
  PlaybookGate,
  PlaybookTaskTemplate,
  PlaybookIntent,
} from './playbook-types.js';

// Built-in generic playbook definitions
import { tddPlaybook } from './generic/tdd.js';
import { brainstormingPlaybook } from './generic/brainstorming.js';
import { codeReviewPlaybook } from './generic/code-review.js';
import { subagentExecutionPlaybook } from './generic/subagent-execution.js';
import { systematicDebuggingPlaybook } from './generic/systematic-debugging.js';
import { verificationPlaybook } from './generic/verification.js';

// =============================================================================
// SCORING WEIGHTS
// =============================================================================

/** Points awarded when the plan intent matches a playbook's matchIntents. */
const INTENT_MATCH_SCORE = 10;

/** Points awarded per keyword hit in the plan text. */
const KEYWORD_MATCH_SCORE = 5;

/** Minimum total score for a playbook to be considered a match. */
const MIN_MATCH_SCORE = 5;

// =============================================================================
// BUILT-IN REGISTRY
// =============================================================================

const BUILTIN_PLAYBOOKS: PlaybookDefinition[] = [
  // Generic tier
  tddPlaybook,
  brainstormingPlaybook,
  codeReviewPlaybook,
  subagentExecutionPlaybook,
  systematicDebuggingPlaybook,
  verificationPlaybook,
];

/**
 * Get a built-in playbook by ID.
 */
export function getBuiltinPlaybook(id: string): PlaybookDefinition | undefined {
  return BUILTIN_PLAYBOOKS.find((p) => p.id === id);
}

/**
 * Get all built-in playbooks.
 */
export function getAllBuiltinPlaybooks(): readonly PlaybookDefinition[] {
  return BUILTIN_PLAYBOOKS;
}

// =============================================================================
// MATCHING
// =============================================================================

/**
 * Score a playbook against the given intent and text.
 * Returns 0 if no match, positive score if matched.
 */
export function scorePlaybook(
  playbook: PlaybookDefinition,
  intent: PlaybookIntent | undefined,
  text: string,
): number {
  let score = 0;
  const lowerText = text.toLowerCase();

  // Intent match
  if (intent && playbook.matchIntents.includes(intent)) {
    score += INTENT_MATCH_SCORE;
  }

  // Keyword match
  for (const keyword of playbook.matchKeywords) {
    if (lowerText.includes(keyword.toLowerCase())) {
      score += KEYWORD_MATCH_SCORE;
    }
  }

  return score;
}

/**
 * Find the best matching playbook from a list for the given context.
 * Returns the highest-scoring playbook above the threshold, or undefined.
 */
function findBestMatch(
  playbooks: PlaybookDefinition[],
  intent: PlaybookIntent | undefined,
  text: string,
  minScore: number = MIN_MATCH_SCORE,
): { playbook: PlaybookDefinition; score: number } | undefined {
  let best: { playbook: PlaybookDefinition; score: number } | undefined;

  for (const playbook of playbooks) {
    const score = scorePlaybook(playbook, intent, text);
    if (score >= minScore && (!best || score > best.score)) {
      best = { playbook, score };
    }
  }

  return best;
}

// =============================================================================
// MERGING
// =============================================================================

/**
 * Merge gates from generic and domain playbooks.
 * Domain gates come after generic gates. No deduplication — they serve different purposes.
 */
function mergeGates(generic?: PlaybookDefinition, domain?: PlaybookDefinition): PlaybookGate[] {
  const gates: PlaybookGate[] = [];
  if (generic) gates.push(...generic.gates);
  if (domain) gates.push(...domain.gates);
  return gates;
}

/**
 * Merge task templates from generic and domain playbooks.
 * Domain templates with the same order position override generic ones of the same taskType.
 */
function mergeTaskTemplates(
  generic?: PlaybookDefinition,
  domain?: PlaybookDefinition,
): PlaybookTaskTemplate[] {
  const genericTemplates = generic?.taskTemplates ?? [];
  const domainTemplates = domain?.taskTemplates ?? [];

  // Start with generic templates
  const merged = [...genericTemplates];

  for (const domainTemplate of domainTemplates) {
    // Check if domain overrides a generic template at the same order + taskType
    const overrideIndex = merged.findIndex(
      (g) => g.order === domainTemplate.order && g.taskType === domainTemplate.taskType,
    );

    if (overrideIndex >= 0) {
      // Domain overrides generic
      merged[overrideIndex] = domainTemplate;
    } else {
      // Domain adds a new template
      merged.push(domainTemplate);
    }
  }

  return merged;
}

/**
 * Merge tool injections from generic and domain playbooks.
 * Deduplicated — each tool appears only once.
 */
function mergeTools(generic?: PlaybookDefinition, domain?: PlaybookDefinition): string[] {
  const tools = new Set<string>();
  if (generic) {
    for (const tool of generic.toolInjections) tools.add(tool);
  }
  if (domain) {
    for (const tool of domain.toolInjections) tools.add(tool);
  }
  return Array.from(tools);
}

/**
 * Merge verification criteria from generic and domain playbooks.
 * All criteria from both tiers — domain typically adds domain-specific checks.
 */
function mergeVerification(generic?: PlaybookDefinition, domain?: PlaybookDefinition): string[] {
  const criteria: string[] = [];
  if (generic) criteria.push(...generic.verificationCriteria);
  if (domain) criteria.push(...domain.verificationCriteria);
  // Deduplicate exact matches
  return [...new Set(criteria)];
}

/**
 * Build a human-readable label for the merged playbook.
 */
function buildLabel(generic?: PlaybookDefinition, domain?: PlaybookDefinition): string {
  if (generic && domain) {
    return `${domain.title} (extends ${generic.title})`;
  }
  if (domain) return domain.title;
  if (generic) return generic.title;
  return 'Unknown';
}

/**
 * Create a MergedPlaybook from a generic and/or domain match.
 */
export function mergePlaybooks(
  generic?: PlaybookDefinition,
  domain?: PlaybookDefinition,
): MergedPlaybook {
  return {
    generic,
    domain,
    mergedGates: mergeGates(generic, domain),
    mergedTasks: mergeTaskTemplates(generic, domain),
    mergedTools: mergeTools(generic, domain),
    mergedVerification: mergeVerification(generic, domain),
    label: buildLabel(generic, domain),
  };
}

// =============================================================================
// MAIN API
// =============================================================================

/**
 * Match playbooks for a plan based on intent and objective/scope text.
 *
 * Resolution:
 * 1. Search built-in playbooks (vault search is wired separately by the caller)
 * 2. Find best generic match
 * 3. Find best domain match
 * 4. If domain has `extends`, resolve the generic it extends
 * 5. Merge into MergedPlaybook
 *
 * @param intent - The detected intent (BUILD, FIX, REVIEW, etc.)
 * @param text - The plan objective + scope text to match against
 * @param vaultPlaybooks - Optional vault-stored playbooks (searched first, override builtins)
 */
export function matchPlaybooks(
  intent: PlaybookIntent | undefined,
  text: string,
  vaultPlaybooks?: PlaybookDefinition[],
): PlaybookMatchResult {
  // Combine vault (higher priority) and built-in playbooks
  const allPlaybooks = [...(vaultPlaybooks ?? []), ...BUILTIN_PLAYBOOKS];

  const generics = allPlaybooks.filter((p) => p.tier === 'generic');
  const domains = allPlaybooks.filter((p) => p.tier === 'domain');

  // Find best domain match first (domain is more specific)
  const domainMatch = findBestMatch(domains, intent, text);

  // Find best generic match
  let genericMatch = findBestMatch(generics, intent, text);

  // If domain extends a specific generic, prefer that one
  if (domainMatch?.playbook.extends) {
    const extendedGeneric = allPlaybooks.find((p) => p.id === domainMatch.playbook.extends);
    if (extendedGeneric) {
      genericMatch = { playbook: extendedGeneric, score: domainMatch.score };
    }
  }

  // No match at all
  if (!genericMatch && !domainMatch) {
    return { playbook: null };
  }

  const merged = mergePlaybooks(genericMatch?.playbook, domainMatch?.playbook);

  return {
    playbook: merged,
    genericMatch: genericMatch
      ? { id: genericMatch.playbook.id, source: 'builtin', score: genericMatch.score }
      : undefined,
    domainMatch: domainMatch
      ? { id: domainMatch.playbook.id, source: 'builtin', score: domainMatch.score }
      : undefined,
  };
}
