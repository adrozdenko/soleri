/**
 * Playbook Type System
 *
 * Two-tier playbook architecture ported from Salvador:
 * - Generic playbooks: process discipline (TDD, brainstorming, debugging, etc.)
 * - Domain playbooks: agent-specific workflows that extend generics
 *
 * Playbooks compose at plan creation time via the `extends` relationship.
 * Generic provides the rhythm, domain fills in domain-specific beats.
 */

// =============================================================================
// TIERS & INTENTS
// =============================================================================

export type PlaybookTier = 'generic' | 'domain';
export type PlaybookIntent = 'BUILD' | 'FIX' | 'REVIEW' | 'PLAN' | 'IMPROVE' | 'DELIVER';

// =============================================================================
// BRAINSTORM SECTIONS
// =============================================================================

/**
 * A structured brainstorming section returned by the brainstorm op.
 * The LLM uses these to guide design conversation with the user.
 */
export interface BrainstormSection {
  /** Section title (e.g., "Component API", "Color Requirements") */
  title: string;
  /** What this section covers */
  description: string;
  /** Guiding questions for the user */
  questions: string[];
}

// =============================================================================
// GATES
// =============================================================================

/**
 * A gate that must be satisfied at a given lifecycle phase.
 * Gates inject checkId requirements into the planning lifecycle.
 */
export interface PlaybookGate {
  /** Which lifecycle phase this gate applies to */
  phase: 'brainstorming' | 'pre-execution' | 'post-task' | 'completion';
  /** Human-readable requirement description */
  requirement: string;
  /** Check type to create/validate */
  checkType: string;
  /** Whether this gate blocks progression (blocking) or is advisory only (advisory). Defaults to 'blocking'. */
  severity?: 'blocking' | 'advisory';
}

// =============================================================================
// TASK TEMPLATES
// =============================================================================

/**
 * A task template that the playbook injects into generated plans.
 * These become PlanTask entries during task splitting.
 */
export interface PlaybookTaskTemplate {
  /** Task type for the generated task */
  taskType: 'implementation' | 'test' | 'story' | 'documentation' | 'verification';
  /** Title template — may contain {objective} placeholder */
  titleTemplate: string;
  /** Acceptance criteria injected into the task */
  acceptanceCriteria: string[];
  /** Tools relevant to this task */
  tools: string[];
  /** When this task should execute relative to implementation */
  order: 'before-implementation' | 'after-implementation' | 'parallel';
}

// =============================================================================
// PLAYBOOK DEFINITION
// =============================================================================

/**
 * Complete playbook definition — the core data type.
 * Playbooks are pure data objects with no logic.
 */
export interface PlaybookDefinition {
  /** Unique identifier (e.g., 'generic-tdd', 'domain-component-build') */
  id: string;
  /** Which tier this playbook belongs to */
  tier: PlaybookTier;
  /** Human-readable title */
  title: string;
  /** When to activate — maps to vault entry 'context' field */
  trigger: string;
  /** Overview of what this playbook does — maps to vault 'description' field */
  description: string;
  /** Step-by-step process — maps to vault 'example' field */
  steps: string;
  /** What success looks like — maps to vault 'why' field */
  expectedOutcome: string;
  /** ID of generic playbook this extends (domain playbooks only) */
  extends?: string;
  /** Free string category (agents define their own domains) */
  category: string;
  /** Searchable tags */
  tags: string[];
  /** Intents that trigger this playbook */
  matchIntents: PlaybookIntent[];
  /** Keywords in plan objective/scope that trigger this playbook */
  matchKeywords: string[];

  // --- What this playbook injects into plans ---

  /** Brainstorming sections for design exploration (used by brainstorm op) */
  brainstormSections?: BrainstormSection[];

  /** Lifecycle gates to enforce */
  gates: PlaybookGate[];
  /** Task templates to inject during task generation */
  taskTemplates: PlaybookTaskTemplate[];
  /** Generic op names to auto-inject into tool chain (not agent-prefixed) */
  toolInjections: string[];
  /** Verification criteria for completion gate */
  verificationCriteria: string[];
}

// =============================================================================
// MERGED PLAYBOOK
// =============================================================================

/**
 * Result of matching and merging a generic + domain playbook pair.
 * This is the shape that plan-handler receives after playbook resolution.
 */
export interface MergedPlaybook {
  /** The generic playbook (if matched) */
  generic?: PlaybookDefinition;
  /** The domain playbook (if matched) */
  domain?: PlaybookDefinition;
  /** Combined gates from both tiers (generic first, then domain) */
  mergedGates: PlaybookGate[];
  /** Combined task templates (domain overrides generic where order conflicts) */
  mergedTasks: PlaybookTaskTemplate[];
  /** Combined tool injections (deduplicated) */
  mergedTools: string[];
  /** Combined verification criteria */
  mergedVerification: string[];
  /** Human-readable label for the matched playbook(s) */
  label: string;
}

// =============================================================================
// MATCH RESULT
// =============================================================================

/**
 * Result of playbook matching — includes the source of each match.
 */
export interface PlaybookMatchResult {
  /** The merged playbook (null if no match) */
  playbook: MergedPlaybook | null;
  /** Which generic matched and why */
  genericMatch?: { id: string; source: 'vault' | 'builtin'; score: number };
  /** Which domain matched and why */
  domainMatch?: { id: string; source: 'vault' | 'builtin'; score: number };
}
