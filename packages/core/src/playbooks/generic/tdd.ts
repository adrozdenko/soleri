/**
 * Generic Playbook: Test-Driven Development
 *
 * RED -> GREEN -> REFACTOR cycle.
 * Ported from Salvador's TDD playbook with agent-agnostic tool injections.
 */

import type { PlaybookDefinition } from '../playbook-types.js';

export const tddPlaybook: PlaybookDefinition = {
  id: 'generic-tdd',
  tier: 'generic',
  title: 'Test-Driven Development',
  trigger:
    'Use when intent is BUILD or FIX and implementation involves writing new code or modifying existing behavior. Activates for any task that produces production code.',
  description:
    'Enforces the RED-GREEN-REFACTOR cycle: write a failing test first, implement minimal code to pass it, then refactor. No production code exists without a test that demanded it. Tests drive the design — if something is hard to test, the design needs simplification.',
  steps: `1. RED — Write the test first
   - Write a test that describes the desired behavior
   - Run it and watch it FAIL (read the actual output)
   - If it passes without new code, the test is wrong or the feature already exists

2. GREEN — Write minimal code to pass
   - Write the simplest implementation that makes the test pass
   - Do NOT write more code than the test demands
   - Run the test and watch it PASS (read the actual output)

3. REFACTOR — Clean up while green
   - Improve structure, naming, duplication — without changing behavior
   - Run tests after every change — they must stay green
   - Commit when clean

4. REPEAT — Next behavior, next test
   - Each cycle should take 2-5 minutes
   - If a cycle takes longer, the step is too big — break it down

IRON LAW: If you wrote production code before the test, DELETE IT and start over.`,
  expectedOutcome:
    'Every piece of production code is demanded by a failing test. Test suite is comprehensive, fast, and trustworthy. Design emerges from testing pressure — simple, decoupled, focused.',
  category: 'methodology',
  tags: ['tdd', 'testing', 'red-green-refactor', 'discipline', 'generic'],
  matchIntents: ['BUILD', 'FIX'],
  matchKeywords: ['implement', 'build', 'create', 'add', 'fix', 'refactor', 'feature', 'code'],
  gates: [
    {
      phase: 'post-task',
      requirement: 'Test must exist and fail before implementation code is written',
      checkType: 'tdd-red',
    },
    {
      phase: 'completion',
      requirement: 'All tests pass with actual output verified (not self-reported)',
      checkType: 'tdd-green',
    },
  ],
  taskTemplates: [
    {
      taskType: 'test',
      titleTemplate: 'Write failing tests for: {objective}',
      acceptanceCriteria: [
        'Tests describe desired behavior, not implementation details',
        'Tests run and FAIL (output read and verified)',
        'No production code written yet',
      ],
      tools: ['search_intelligent'],
      order: 'before-implementation',
    },
  ],
  toolInjections: ['search_intelligent'],
  verificationCriteria: [
    'Test suite passes (run command, read output)',
    'No skipped or pending tests',
    'Coverage covers the new/modified code paths',
  ],
};
