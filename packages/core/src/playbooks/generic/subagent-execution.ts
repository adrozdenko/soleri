/**
 * Generic Playbook: Subagent-Driven Execution
 *
 * One fresh subagent per task with two-stage review.
 * Ported from Salvador's subagent-execution playbook.
 */

import type { PlaybookDefinition } from '../playbook-types.js';

export const subagentExecutionPlaybook: PlaybookDefinition = {
  id: 'generic-subagent-execution',
  tier: 'generic',
  title: 'Subagent-Driven Execution',
  trigger:
    'Use when a plan has 3 or more tasks. Dispatches a fresh subagent per task with two-stage review (spec compliance, then code quality). The controller agent manages the queue but never implements.',
  description:
    'Each plan task is executed by a fresh subagent that receives the full task spec, context, and self-review checklist. After each task completes, two reviewer subagents verify the work: first for spec compliance (did it do what was asked?), then for code quality (is it well-built?). The controller never writes implementation code — it only dispatches, reviews, and integrates.',
  steps: `1. PREPARE DISPATCH
   - Read the full task spec from the plan
   - Gather relevant vault knowledge for this task
   - Build the implementer prompt with task spec + context + self-review checklist

2. DISPATCH IMPLEMENTER
   - Spawn a fresh subagent with the implementer prompt
   - Subagent asks clarifying questions before starting (blockers gate)
   - Subagent implements, self-reviews, and reports back

3. REVIEW STAGE 1: SPEC COMPLIANCE
   - Spawn spec-reviewer subagent
   - Reviewer reads ACTUAL CODE, not the implementer's report
   - Compares implementation against task acceptance criteria line by line
   - Returns: pass or fail with specific file:line references

4. REVIEW STAGE 2: CODE QUALITY (only if Stage 1 passes)
   - Spawn code-quality-reviewer subagent
   - Reviews architecture, naming, error handling, test quality
   - Returns: pass or issues by severity (critical blocks, others noted)

5. INTEGRATE OR RETRY
   - If both stages pass: mark task complete, move to next
   - If Stage 1 fails: dispatch new implementer with failure feedback
   - If Stage 2 has critical issues: dispatch targeted fix subagent
   - Maximum 2 retries per task before escalating to human

6. FINAL REVIEW
   - After all tasks: one final review of the complete implementation
   - Check cross-cutting concerns (consistency, integration points)`,
  expectedOutcome:
    'Each task is independently verified by reviewers who read actual code. The controller maintains oversight without implementation bias. Failed tasks get specific feedback and retry.',
  category: 'methodology',
  tags: ['subagent', 'execution', 'review', 'dispatch', 'generic'],
  matchIntents: ['BUILD', 'IMPROVE'],
  matchKeywords: ['implement', 'execute', 'build', 'multi-step', 'parallel'],
  gates: [
    {
      phase: 'post-task',
      requirement: 'Spec compliance review must pass before code quality review',
      checkType: 'spec-review',
    },
    {
      phase: 'post-task',
      requirement:
        'Code quality review must pass (no critical issues) before task is marked complete',
      checkType: 'quality-review',
    },
  ],
  taskTemplates: [],
  toolInjections: [],
  verificationCriteria: [
    'All tasks passed spec compliance review',
    'All tasks passed code quality review (no critical issues)',
    'Final cross-cutting review completed',
  ],
};
