/**
 * Generic Playbook: Code Review
 *
 * Structured PR review discipline — 7-category grading with smell detection.
 * Ported from Salvador's code-review playbook.
 * Based on vault knowledge: "Structured Code Review: Grade Each Category Then Provide Verdict"
 * and "5-Step Systematic Refactoring: Ingest → Scan → Plan → Edit → Verify".
 */

import type { PlaybookDefinition } from '../playbook-types.js';

export const codeReviewPlaybook: PlaybookDefinition = {
  id: 'generic-code-review',
  tier: 'generic',
  title: 'Structured Code Review',
  trigger:
    'Use when reviewing a pull request, code diff, or any code submission. Activates for REVIEW intent or when keywords like "review", "PR", "pull request", "diff", "check code" appear.',
  description:
    'Systematic code review using 7 independent grading categories (A-F). Each category is evaluated separately so no area hides behind others. Combines automated smell detection heuristics with human judgment. Produces a structured verdict with prioritized action items.',
  steps: `1. UNDERSTAND THE CHANGE
   - Read the PR description, linked issues, and acceptance criteria
   - Understand the WHY before judging the HOW
   - Identify the blast radius — what areas of the codebase are touched?
   - Check: is this a feature, bugfix, refactor, or infrastructure change?

2. AUTOMATED SMELL SCAN
   - Deep nesting: any indentation 8+ spaces (3+ levels)
   - Else after return: guard clause opportunities missed
   - Long functions: >35 LOC = critical, 25-35 = warning, <15 = ideal
   - Long parameter lists: >5 params = data clump smell
   - Magic numbers: unnamed numeric literals in conditions
   - Duplication: similar blocks of 3+ lines
   - Dead code: commented-out code, unreachable branches
   - Utils/helpers anti-modules: catch-all files with unrelated functions

3. GRADE 7 CATEGORIES (A-F each)
   A. NAMING
      - Variables, functions, classes reveal intent?
      - Consistent naming convention (camelCase, PascalCase, etc.)?
      - No abbreviations or single-letter names (except i/j in loops)?
      - Boolean names read as questions (isActive, hasPermission)?

   B. FUNCTION DESIGN
      - Each function does ONE thing (the "and" test)?
      - Function length within limits (<15 ideal, >35 critical)?
      - Parameters count reasonable (<5)?
      - Return types explicit and consistent?
      - Pure functions where possible?

   C. COMMENTS & DOCUMENTATION
      - Comments explain WHY, never WHAT?
      - No commented-out code (version control is your backup)?
      - Public API has JSDoc/TSDoc?
      - Complex algorithms are documented?
      - No redundant comments restating the code?

   D. STRUCTURE & LAYOUT
      - Single Responsibility at file/module level?
      - Imports organized and minimal?
      - No circular dependencies introduced?
      - Consistent file organization matching project conventions?
      - Changes are in the right place architecturally?

   E. ERROR HANDLING
      - Errors handled at the right level (not swallowed)?
      - Error messages are actionable (not just "Something went wrong")?
      - Edge cases covered (null, empty, boundary values)?
      - No bare catch blocks that hide failures?
      - Async errors properly propagated?

   F. CODE SMELLS & CLEANLINESS
      - No duplication (DRY without premature abstraction)?
      - Guard clauses used instead of deep nesting?
      - Early returns flatten control flow?
      - No feature envy (method using another object's data excessively)?
      - No shotgun surgery risk (change requires touching many files)?

   G. SOLID & DESIGN PRINCIPLES
      - Open/Closed: can this be extended without modification?
      - Dependency Inversion: depends on abstractions, not concretions?
      - Interface Segregation: no forcing unused dependencies on consumers?
      - Liskov: subtypes are substitutable without surprises?
      - Single Responsibility (already in Structure, reinforce here)?

4. SECURITY & PERFORMANCE QUICK-CHECK
   - No secrets, tokens, or credentials in code?
   - No SQL injection, XSS, or command injection vectors?
   - No N+1 query patterns or unbounded loops?
   - No memory leaks (event listeners, subscriptions not cleaned up)?

5. DELIVER VERDICT
   - Overall grade (A-F) based on category grades
   - Top 3 prioritized action items (most impactful first)
   - Specific line references for each issue
   - Praise what's done well — reinforcement matters
   - Classify: APPROVE, REQUEST CHANGES, or COMMENT

GRADING SCALE:
| Grade | Meaning |
|-------|---------|
| A | Excellent — clean, idiomatic, well-designed |
| B | Good — minor issues, mostly clean |
| C | Acceptable — some issues need attention |
| D | Below standard — significant issues |
| F | Critical — must fix before merge |`,
  expectedOutcome:
    'Every PR receives a structured, fair, and thorough review. Each category is graded independently. The verdict includes specific, actionable feedback with line references. Good patterns are celebrated, problems are caught early.',
  category: 'methodology',
  tags: ['code-review', 'pr-review', 'quality', 'refactoring', 'smells', 'grading', 'generic'],
  matchIntents: ['REVIEW'],
  matchKeywords: [
    'review',
    'code review',
    'pr review',
    'pull request',
    'diff',
    'check code',
    'review code',
    'critique',
    'feedback',
    'approve',
    'merge',
  ],
  gates: [
    {
      phase: 'pre-execution',
      requirement: 'PR description and linked issues must be read before reviewing code',
      checkType: 'review-context',
    },
    {
      phase: 'post-task',
      requirement: 'All 7 categories must have an explicit grade (A-F) with notes',
      checkType: 'review-grading-complete',
    },
    {
      phase: 'completion',
      requirement: 'Verdict must include prioritized action items with specific line references',
      checkType: 'review-verdict',
    },
  ],
  taskTemplates: [
    {
      taskType: 'verification',
      titleTemplate: 'Automated smell scan for: {objective}',
      acceptanceCriteria: [
        'Scanned for deep nesting (8+ spaces / 3+ levels)',
        'Scanned for else-after-return patterns',
        'Scanned for long functions (>35 LOC)',
        'Scanned for long parameter lists (>5 params)',
        'Scanned for magic numbers in conditions',
        'Scanned for dead/commented-out code',
        'Scanned for duplication across changed files',
      ],
      tools: [],
      order: 'before-implementation',
    },
    {
      taskType: 'verification',
      titleTemplate: 'Grade 7 categories for: {objective}',
      acceptanceCriteria: [
        'Naming graded A-F with specific notes',
        'Function Design graded A-F with specific notes',
        'Comments graded A-F with specific notes',
        'Structure graded A-F with specific notes',
        'Error Handling graded A-F with specific notes',
        'Smells graded A-F with specific notes',
        'SOLID graded A-F with specific notes',
      ],
      tools: [],
      order: 'after-implementation',
    },
  ],
  toolInjections: [],
  verificationCriteria: [
    'All 7 categories have explicit A-F grades',
    'At least 3 prioritized action items with line references',
    'Security quick-check completed (no secrets, no injection vectors)',
    'Automated smell scan results documented',
    'Overall verdict delivered: APPROVE, REQUEST CHANGES, or COMMENT',
  ],
};
