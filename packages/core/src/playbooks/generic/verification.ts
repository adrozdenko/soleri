/**
 * Generic Playbook: Verification Before Completion
 *
 * Evidence-based completion — no self-reported success.
 * Ported from Salvador's verification playbook.
 */

import type { PlaybookDefinition } from '../playbook-types.js';

export const verificationPlaybook: PlaybookDefinition = {
  id: 'generic-verification',
  tier: 'generic',
  title: 'Verification Before Completion',
  trigger:
    'Use at the completion of any task or plan. Activates automatically as a completion gate. Prevents the common failure mode of claiming success without running verification commands.',
  description:
    'Every completion claim must be backed by evidence: run the command, read the output, only then assert the result. No self-reported success. No "the tests should pass." Actual output or it didn\'t happen.',
  steps: `1. IDENTIFY VERIFICATION COMMANDS
   - What commands prove this works? (test runner, build, lint, type check)
   - What manual checks are needed? (UI renders, API responds, file exists)
   - What acceptance criteria need evidence?

2. RUN EACH COMMAND
   - Execute each verification command
   - READ THE ACTUAL OUTPUT (not just the exit code)
   - If any command fails: the task is NOT complete

3. COLLECT EVIDENCE
   - For each claim, record the command and its output
   - "Tests pass" → show the test runner output
   - "Build succeeds" → show the build output
   - "No regressions" → show the full test suite output

4. VERIFY AGAINST ACCEPTANCE CRITERIA
   - Check each acceptance criterion against collected evidence
   - Mark each as: VERIFIED (with evidence) or UNVERIFIED
   - If any criterion is UNVERIFIED: the task is NOT complete

COMMON FALSE COMPLETIONS:
| Claim | NOT Sufficient | Required |
|-------|---------------|----------|
| "Tests pass" | "I believe tests pass" | npm test output showing all pass |
| "Build works" | "Should compile fine" | npm run build output with 0 errors |
| "No regressions" | "Didn't change much" | Full test suite output |
| "Types correct" | "Looks right to me" | tsc --noEmit output |`,
  expectedOutcome:
    'Every completion claim is backed by command output evidence. No ambiguity about whether the work is actually done.',
  category: 'methodology',
  tags: ['verification', 'evidence', 'completion', 'discipline', 'generic'],
  matchIntents: ['BUILD', 'FIX', 'IMPROVE', 'DELIVER'],
  matchKeywords: ['done', 'complete', 'finish', 'ship', 'merge', 'deploy', 'release'],
  gates: [
    {
      phase: 'completion',
      requirement: 'All acceptance criteria must have evidence (command output, not self-report)',
      checkType: 'verification-evidence',
    },
  ],
  taskTemplates: [
    {
      taskType: 'verification',
      titleTemplate: 'Verify: {objective}',
      acceptanceCriteria: [
        'All verification commands executed and output read',
        'All acceptance criteria matched against evidence',
        'No unverified claims remain',
      ],
      tools: [],
      order: 'after-implementation',
    },
  ],
  toolInjections: [],
  verificationCriteria: [
    'Test suite passes (actual output, not self-report)',
    'Build succeeds (actual output)',
    'Type checking passes (actual output)',
    'All acceptance criteria have matching evidence',
  ],
};
