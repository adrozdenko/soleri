/**
 * Playbook data for the guided wizard.
 * Provides curated options with self-explanatory hints,
 * organized by category. Each list also supports a "custom" escape hatch
 * with examples and anti-examples so the user is never staring at a blank cursor.
 */

// ─── Domains ────────────────────────────────────────────────

interface DomainOption {
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
  {
    value: 'developer-experience',
    label: 'developer-experience',
    hint: 'Developer tooling, onboarding, and ergonomics',
  },
  {
    value: 'design-tokens',
    label: 'design-tokens',
    hint: 'Semantic tokens, color systems, spacing scales, typography',
  },
  {
    value: 'frontend',
    label: 'frontend',
    hint: 'Component patterns, state management, rendering, bundling',
  },
  {
    value: 'ux-design',
    label: 'ux-design',
    hint: 'User flows, conversion, onboarding, forms, navigation',
  },
  {
    value: 'knowledge-management',
    label: 'knowledge-management',
    hint: 'Vault curation, pattern lifecycle, cross-project learning',
  },
  {
    value: 'governance',
    label: 'governance',
    hint: 'Approval gates, policy enforcement, audit trails',
  },
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

interface PrincipleCategory {
  label: string;
  options: PrincipleOption[];
}

interface PrincipleOption {
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
      { value: 'Progressive enhancement', label: 'Progressive enhancement' },
    ],
  },
  {
    label: 'Safety',
    options: [
      { value: 'Security first', label: 'Security first' },
      { value: 'Fail closed, not open', label: 'Fail closed, not open' },
      { value: 'Zero trust by default', label: 'Zero trust by default' },
      { value: 'Least privilege always', label: 'Least privilege always' },
      { value: 'Defense in depth', label: 'Defense in depth' },
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
  {
    label: 'Code Review',
    options: [
      { value: 'Readable over clever', label: 'Readable over clever' },
      { value: 'Small PR scope', label: 'Small PR scope' },
    ],
  },
  {
    label: 'API Design',
    options: [
      { value: 'Backward compatibility by default', label: 'Backward compatibility by default' },
      { value: 'Consumer-driven contracts', label: 'Consumer-driven contracts' },
    ],
  },
  {
    label: 'Testing',
    options: [
      { value: 'Deterministic tests only', label: 'Deterministic tests only' },
      { value: 'Test at boundaries, not internals', label: 'Test at boundaries, not internals' },
    ],
  },
  {
    label: 'Operations',
    options: [
      { value: 'Infrastructure as code', label: 'Infrastructure as code' },
      { value: 'Blast radius awareness', label: 'Blast radius awareness' },
    ],
  },
  {
    label: 'Data',
    options: [
      {
        value: 'Schema evolution over breaking changes',
        label: 'Schema evolution over breaking changes',
      },
      { value: 'Query performance first', label: 'Query performance first' },
    ],
  },
  {
    label: 'Accessibility',
    options: [
      { value: 'WCAG compliance is non-negotiable', label: 'WCAG compliance is non-negotiable' },
      { value: 'Semantic HTML before ARIA', label: 'Semantic HTML before ARIA' },
      {
        value: 'Keyboard navigation for every interaction',
        label: 'Keyboard navigation for every interaction',
      },
    ],
  },
  {
    label: 'Documentation',
    options: [
      { value: 'Clarity over completeness', label: 'Clarity over completeness' },
      { value: 'Every concept needs an example', label: 'Every concept needs an example' },
      {
        value: 'Docs rot faster than code — keep current',
        label: 'Docs rot faster than code — keep current',
      },
    ],
  },
  {
    label: 'Design Systems',
    options: [
      { value: 'Semantic tokens over primitives', label: 'Semantic tokens over primitives' },
      {
        value: 'Component variant enum over boolean props',
        label: 'Component variant enum over boolean props',
      },
      {
        value: 'Atomic design classification for component hierarchy',
        label: 'Atomic design classification for component hierarchy',
      },
      {
        value: 'Token enforcement: blocked then forbidden then preferred',
        label: 'Token enforcement: blocked then forbidden then preferred',
      },
      {
        value: 'Respect existing design system patterns',
        label: 'Respect existing design system patterns',
      },
      {
        value: 'Every component needs accessibility baseline',
        label: 'Every component needs accessibility baseline',
      },
    ],
  },
  {
    label: 'Frontend Engineering',
    options: [
      {
        value: 'Stack-aware implementation over generic advice',
        label: 'Stack-aware implementation over generic advice',
      },
      { value: 'UX patterns inform code structure', label: 'UX patterns inform code structure' },
      {
        value: 'Performance budget before feature scope',
        label: 'Performance budget before feature scope',
      },
      {
        value: 'Accessible by default, not bolted on after',
        label: 'Accessible by default, not bolted on after',
      },
    ],
  },
  {
    label: 'UX Intelligence',
    options: [
      {
        value: 'User behavior drives design decisions',
        label: 'User behavior drives design decisions',
      },
      {
        value: 'Accessibility is not a feature, it is a baseline',
        label: 'Accessibility is not a feature, it is a baseline',
      },
      {
        value: 'Measure conversion impact of every UX change',
        label: 'Measure conversion impact of every UX change',
      },
      {
        value: 'Progressive disclosure over information overload',
        label: 'Progressive disclosure over information overload',
      },
    ],
  },
  {
    label: 'Knowledge Management',
    options: [
      {
        value: 'Knowledge-gather before execute, always',
        label: 'Knowledge-gather before execute, always',
      },
      {
        value: 'Vault is the single source of truth',
        label: 'Vault is the single source of truth',
      },
      {
        value: 'Capture lessons at the moment of discovery',
        label: 'Capture lessons at the moment of discovery',
      },
      {
        value: 'Cross-project patterns beat project-local fixes',
        label: 'Cross-project patterns beat project-local fixes',
      },
      {
        value: 'Domain vocabulary must be explicit and extensible',
        label: 'Domain vocabulary must be explicit and extensible',
      },
    ],
  },
  {
    label: 'Governance',
    options: [
      {
        value: 'Two-gate approval: plan then execute, never skip',
        label: 'Two-gate approval: plan then execute, never skip',
      },
      {
        value: 'Protocol enforcement via checkpoint gates',
        label: 'Protocol enforcement via checkpoint gates',
      },
      {
        value: 'Data-driven architecture: logic in config, not code',
        label: 'Data-driven architecture: logic in config, not code',
      },
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
  'writing-plans',
  'executing-plans',
] as const;

interface SkillCategory {
  label: string;
  options: SkillOption[];
}

interface SkillOption {
  value: string;
  label: string;
  hint: string;
}

export const SKILL_CATEGORIES: SkillCategory[] = [
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

interface ToneOption {
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
