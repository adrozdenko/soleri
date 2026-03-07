/**
 * Playbook data for the guided wizard.
 * Provides curated options with self-explanatory hints,
 * organized by category. Each list also supports a "custom" escape hatch
 * with examples and anti-examples so the user is never staring at a blank cursor.
 */

// ─── Domains ────────────────────────────────────────────────

export interface DomainOption {
  value: string;
  label: string;
  hint: string;
}

export const DOMAIN_OPTIONS: DomainOption[] = [
  {
    value: 'security',
    label: 'security',
    hint: 'Vulnerability scanning, threat modeling, secrets detection',
  },
  {
    value: 'code-review',
    label: 'code-review',
    hint: 'Pattern enforcement, anti-pattern detection, PR review',
  },
  {
    value: 'testing',
    label: 'testing',
    hint: 'Test generation, coverage analysis, mutation testing',
  },
  {
    value: 'api-design',
    label: 'api-design',
    hint: 'REST/GraphQL contracts, versioning, error handling',
  },
  {
    value: 'performance',
    label: 'performance',
    hint: 'Budgets, profiling, bundle size, query optimization',
  },
  {
    value: 'accessibility',
    label: 'accessibility',
    hint: 'WCAG compliance, screen readers, keyboard navigation',
  },
  {
    value: 'architecture',
    label: 'architecture',
    hint: 'System design, boundaries, dependency management',
  },
  {
    value: 'database',
    label: 'database',
    hint: 'Schema design, migrations, indexing, query tuning',
  },
  {
    value: 'documentation',
    label: 'documentation',
    hint: 'API docs, READMEs, changelogs, code comments',
  },
  { value: 'devops', label: 'devops', hint: 'CI/CD pipelines, infrastructure as code, deployment' },
];

export const CUSTOM_DOMAIN_GUIDANCE = {
  instruction: 'Define a custom domain (kebab-case)',
  examples: [
    'graphql-federation — Schema stitching, subgraph validation, entity resolution',
    'data-pipeline — ETL jobs, stream processing, data quality checks',
    'mobile-ux — Touch targets, gesture handling, responsive layouts',
  ],
  antiExamples: [
    'stuff — too vague, what kind of stuff?',
    'MyDomain — must be kebab-case, not camelCase',
  ],
};

// ─── Principles ─────────────────────────────────────────────

export interface PrincipleCategory {
  label: string;
  options: PrincipleOption[];
}

export interface PrincipleOption {
  value: string;
  label: string;
}

export const PRINCIPLE_CATEGORIES: PrincipleCategory[] = [
  {
    label: 'Quality',
    options: [
      { value: 'Simplicity over cleverness', label: 'Simplicity over cleverness' },
      { value: 'Convention over configuration', label: 'Convention over configuration' },
      { value: 'Test everything that can break', label: 'Test everything that can break' },
      { value: 'Respect existing patterns', label: 'Respect existing patterns' },
    ],
  },
  {
    label: 'Safety',
    options: [
      { value: 'Security first', label: 'Security first' },
      { value: 'Fail closed, not open', label: 'Fail closed, not open' },
      { value: 'Zero trust by default', label: 'Zero trust by default' },
      { value: 'Least privilege always', label: 'Least privilege always' },
    ],
  },
  {
    label: 'Developer Experience',
    options: [
      { value: 'Actionable feedback only', label: 'Actionable feedback only' },
      { value: 'Explain the why, not just the what', label: 'Explain the why, not just the what' },
      {
        value: 'Every comment includes a fix suggestion',
        label: 'Every comment includes a fix suggestion',
      },
      {
        value: 'Design for the consumer, not the implementer',
        label: 'Design for the consumer, not the implementer',
      },
    ],
  },
  {
    label: 'Reliability',
    options: [
      {
        value: 'Graceful degradation over hard failures',
        label: 'Graceful degradation over hard failures',
      },
      { value: 'Automate everything repeatable', label: 'Automate everything repeatable' },
      {
        value: 'Observability built in from day one',
        label: 'Observability built in from day one',
      },
      { value: 'Every migration must be reversible', label: 'Every migration must be reversible' },
    ],
  },
];

export const CUSTOM_PRINCIPLE_GUIDANCE = {
  instruction: 'Write a custom principle',
  examples: [
    'Never suggest any in production without a feature flag',
    'Prefer composition over inheritance',
    'Every public API must have a deprecation path before removal',
  ],
  antiExamples: [
    'Write good code — too vague, what does "good" mean?',
    'Follow best practices — which ones? Be specific.',
  ],
};

// ─── Skills ─────────────────────────────────────────────────

/** Core skills — always included, never shown in picker. */
export const CORE_SKILLS = [
  'brainstorming',
  'systematic-debugging',
  'verification-before-completion',
  'health-check',
  'context-resume',
] as const;

export interface SkillCategory {
  label: string;
  options: SkillOption[];
}

export interface SkillOption {
  value: string;
  label: string;
  hint: string;
}

export const SKILL_CATEGORIES: SkillCategory[] = [
  {
    label: 'Planning & Execution',
    options: [
      {
        value: 'writing-plans',
        label: 'writing-plans',
        hint: 'Structured multi-step planning before code changes',
      },
      {
        value: 'executing-plans',
        label: 'executing-plans',
        hint: 'Execute approved plans with review checkpoints',
      },
    ],
  },
  {
    label: 'Knowledge & Learning',
    options: [
      {
        value: 'vault-navigator',
        label: 'vault-navigator',
        hint: 'Deep-dive vault search and exploration',
      },
      {
        value: 'vault-capture',
        label: 'vault-capture',
        hint: 'Persist lessons learned to the knowledge vault',
      },
      {
        value: 'knowledge-harvest',
        label: 'knowledge-harvest',
        hint: 'Extract patterns from completed work',
      },
      {
        value: 'brain-debrief',
        label: 'brain-debrief',
        hint: 'Post-task intelligence summary and debriefing',
      },
    ],
  },
  {
    label: 'Code Quality',
    options: [
      {
        value: 'code-patrol',
        label: 'code-patrol',
        hint: 'Scan for anti-patterns and code violations',
      },
      {
        value: 'test-driven-development',
        label: 'test-driven-development',
        hint: 'TDD workflow: red, green, refactor',
      },
      {
        value: 'fix-and-learn',
        label: 'fix-and-learn',
        hint: 'Fix bugs and capture the lesson for next time',
      },
    ],
  },
  {
    label: 'Team & Process',
    options: [
      {
        value: 'retrospective',
        label: 'retrospective',
        hint: 'End-of-session retrospective and reflection',
      },
      {
        value: 'second-opinion',
        label: 'second-opinion',
        hint: 'Get a fresh perspective on tough decisions',
      },
      {
        value: 'onboard-me',
        label: 'onboard-me',
        hint: 'Guided codebase onboarding for new team members',
      },
    ],
  },
];

/** Flat list of all optional skill values. */
export const ALL_OPTIONAL_SKILLS = SKILL_CATEGORIES.flatMap((c) => c.options.map((o) => o.value));

// ─── Tones ──────────────────────────────────────────────────

export interface ToneOption {
  value: 'precise' | 'mentor' | 'pragmatic';
  label: string;
  hint: string;
}

export const TONE_OPTIONS: ToneOption[] = [
  { value: 'precise', label: 'Precise', hint: 'Direct, factual, minimal commentary' },
  { value: 'mentor', label: 'Mentor', hint: 'Educational, explains the "why" behind suggestions' },
  { value: 'pragmatic', label: 'Pragmatic', hint: 'Balanced, focuses on actionable outcomes' },
];

// ─── Custom field guidance (role, description, greeting) ────

export const CUSTOM_ROLE_GUIDANCE = {
  instruction: 'Describe what your agent does (one sentence)',
  examples: [
    'Enforces accessibility standards across React components',
    'Generates and maintains API documentation from code',
    'Monitors performance budgets and flags regressions',
  ],
};

export const CUSTOM_DESCRIPTION_GUIDANCE = {
  instruction: 'Describe your agent in detail (10-500 characters)',
  examples: [
    'This agent validates GraphQL schemas against federation rules, checks for breaking changes, and ensures consistent naming conventions across subgraphs.',
  ],
};

export const CUSTOM_GREETING_GUIDANCE = {
  instruction: 'Write a custom greeting (first thing users see)',
  examples: [
    "Hola! I'm Salvador — your design system guardian.",
    'Ready to review. Drop a PR link or describe the issue.',
    "Hey! Let's make sure your APIs are rock solid.",
  ],
};
