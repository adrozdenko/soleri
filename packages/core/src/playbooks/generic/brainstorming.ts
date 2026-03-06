/**
 * Generic Playbook: Brainstorming
 *
 * Design-before-code enforcement.
 * Ported from Salvador's brainstorming playbook.
 */

import type { PlaybookDefinition } from '../playbook-types.js';

export const brainstormingPlaybook: PlaybookDefinition = {
  id: 'generic-brainstorming',
  tier: 'generic',
  title: 'Brainstorming — Design Before Code',
  trigger:
    'Use when the request is creative, ambiguous, or involves building something new. Activates before any implementation work to ensure design is explored and approved.',
  description:
    'Structured design exploration before writing any code. The agent explores context, asks clarifying questions, proposes 2-3 approaches with trade-offs, and presents the design in digestible sections for approval. No code is written until the design is approved. This prevents the common failure mode of jumping into implementation before understanding what to build.',
  steps: `1. EXPLORE CONTEXT
   - What exists? Read relevant code, docs, prior art
   - What constraints apply? Tech stack, patterns, conventions
   - What's been tried before? Search vault for related patterns

2. ASK CLARIFYING QUESTIONS
   - Surface assumptions that could derail implementation
   - Ask about edge cases, error handling, user expectations
   - Ask about scope boundaries — what's explicitly NOT included

3. PROPOSE 2-3 APPROACHES
   - Each approach with clear trade-offs (complexity, performance, maintainability)
   - Recommend one with rationale
   - Wait for user feedback before proceeding

4. PRESENT DESIGN IN SECTIONS
   - Break design into chunks short enough to read and digest
   - Architecture, data flow, API surface, error handling, testing strategy
   - Get approval on each section before moving to next

5. WRITE DESIGN DOCUMENT
   - Save approved design to docs/ or vault
   - Include decisions and rationale
   - This becomes the source of truth for implementation

HARD GATE: No implementation code until design is approved.`,
  expectedOutcome:
    'A clear, approved design document that eliminates ambiguity. Implementation follows a known path. Decisions are documented with rationale. No surprises during coding.',
  category: 'methodology',
  tags: ['brainstorming', 'design', 'planning', 'exploration', 'generic'],
  matchIntents: ['BUILD', 'PLAN'],
  matchKeywords: [
    'build',
    'create',
    'design',
    'architect',
    'plan',
    'new feature',
    'from scratch',
    'rethink',
  ],
  brainstormSections: [
    {
      title: 'Architecture',
      description: 'High-level structure, components, and their relationships.',
      questions: [
        'What are the main building blocks?',
        'How do they communicate?',
        'What are the boundaries and interfaces?',
      ],
    },
    {
      title: 'Data Flow',
      description: 'How data moves through the system — inputs, transformations, outputs.',
      questions: [
        'What data does this consume and produce?',
        'Where does state live?',
        'What are the data dependencies?',
      ],
    },
    {
      title: 'Error Handling',
      description: 'What can go wrong and how to handle it gracefully.',
      questions: [
        'What are the failure modes?',
        'How should errors be surfaced to users?',
        'What recovery strategies are needed?',
      ],
    },
    {
      title: 'Testing Strategy',
      description: 'How to verify correctness at each level.',
      questions: [
        'What are the critical behaviors to test?',
        'Unit vs integration vs e2e — what balance?',
        'What edge cases matter most?',
      ],
    },
  ],
  gates: [
    {
      phase: 'brainstorming',
      requirement: 'Design must be explored and approved before plan creation',
      checkType: 'brainstorm',
    },
  ],
  taskTemplates: [],
  toolInjections: ['search_intelligent'],
  verificationCriteria: [
    'Design document exists and covers architecture, data flow, and error handling',
    'User approved the design before implementation started',
  ],
};
