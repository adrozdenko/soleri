/**
 * Generic Playbook: Systematic Debugging
 *
 * 4-phase root cause process. No fixes without understanding.
 * Ported from Salvador's systematic-debugging playbook.
 */

import type { PlaybookDefinition } from '../playbook-types.js';

export const systematicDebuggingPlaybook: PlaybookDefinition = {
  id: 'generic-systematic-debugging',
  tier: 'generic',
  title: 'Systematic Debugging',
  trigger:
    'Use when something is broken, failing, or behaving unexpectedly. Activates for any FIX intent. Prevents the common failure mode of guessing at fixes without understanding the root cause.',
  description:
    'Four-phase root cause analysis: gather evidence, analyze patterns, form and test hypotheses, then implement the minimal fix. No fix is applied without first understanding WHY the bug exists. If 3+ fix attempts fail, the architecture is questioned rather than trying more patches.',
  steps: `1. ROOT CAUSE ANALYSIS
   - Reproduce the bug reliably (exact steps, exact output)
   - Trace backward: symptom → immediate cause → what called this → original trigger
   - Read the actual error output — do not guess from the description
   - Search vault for similar bugs and their root causes

2. PATTERN ANALYSIS
   - Is this a known pattern? (race condition, stale cache, off-by-one, null ref)
   - Has this module had bugs before? Check git history
   - Are there related symptoms elsewhere?
   - Map the failure boundary: what works, what doesn't, what's the edge

3. HYPOTHESIS TESTING
   - Form 1-3 specific hypotheses about the root cause
   - For each: predict what you'd see if this hypothesis is correct
   - Test each prediction with the smallest possible experiment
   - One hypothesis at a time — don't combine changes

4. MINIMAL FIX
   - Fix the root cause, not the symptom
   - Write a test that reproduces the bug FIRST (RED)
   - Apply the smallest change that fixes it (GREEN)
   - Verify no regressions (run full test suite)
   - If 3+ fixes fail: stop and question the architecture

IRON LAW: No fix without root cause understanding. No "try this and see."`,
  expectedOutcome:
    'Bug is fixed at the root cause with a regression test. The fix is minimal and targeted. Understanding is documented for future reference.',
  category: 'methodology',
  tags: ['debugging', 'root-cause', 'systematic', 'fix', 'generic'],
  matchIntents: ['FIX'],
  matchKeywords: [
    'bug',
    'broken',
    'fix',
    'error',
    'failing',
    'crash',
    'wrong',
    'unexpected',
    'regression',
  ],
  gates: [
    {
      phase: 'pre-execution',
      requirement: 'Root cause must be identified before any fix is attempted',
      checkType: 'root-cause',
    },
    {
      phase: 'completion',
      requirement: 'Regression test exists and passes',
      checkType: 'regression-test',
    },
  ],
  taskTemplates: [
    {
      taskType: 'test',
      titleTemplate: 'Write regression test reproducing: {objective}',
      acceptanceCriteria: [
        'Test reproduces the exact bug (fails without fix)',
        'Test passes after fix is applied',
        'Test is specific enough to catch this exact regression',
      ],
      tools: ['search_intelligent'],
      order: 'before-implementation',
    },
  ],
  toolInjections: ['search_intelligent'],
  verificationCriteria: [
    'Root cause is documented (not just "it works now")',
    'Regression test exists and fails without fix, passes with fix',
    'Full test suite passes (no new regressions)',
    'Fix is minimal — only the root cause is addressed',
  ],
};
