/**
 * Pre-built agent archetypes that pre-fill the wizard.
 * Each archetype provides sensible defaults for role, description,
 * domains, principles, skills, and greeting — so the user can
 * scaffold a full agent with minimal typing.
 */

export interface Archetype {
  value: string;
  label: string;
  hint: string;
  defaults: {
    role: string;
    description: string;
    domains: string[];
    principles: string[];
    skills: string[];
    tone: 'precise' | 'mentor' | 'pragmatic';
    greetingTemplate: (name: string) => string;
  };
}

export const ARCHETYPES: Archetype[] = [
  {
    value: 'code-reviewer',
    label: 'Code Reviewer',
    hint: 'Catches bugs, enforces patterns, reviews PRs before merge',
    defaults: {
      role: 'Catches bugs, enforces code patterns, and reviews pull requests before merge',
      description:
        'This agent reviews code for quality issues, anti-patterns, naming conventions, test coverage gaps, and architectural violations. It provides actionable feedback with concrete fix suggestions.',
      domains: ['code-review', 'architecture'],
      principles: [
        'Actionable feedback only',
        'Respect existing patterns',
        'Simplicity over cleverness',
      ],
      skills: [
        'writing-plans',
        'executing-plans',
        'code-patrol',
        'fix-and-learn',
        'second-opinion',
      ],
      tone: 'pragmatic',
      greetingTemplate: (name) =>
        `Hello! I'm ${name}. Drop a PR link or paste code — I'll review it for bugs, patterns, and quality.`,
    },
  },
  {
    value: 'security-auditor',
    label: 'Security Auditor',
    hint: 'OWASP Top 10, dependency scanning, secrets detection',
    defaults: {
      role: 'Identifies vulnerabilities and enforces secure coding practices',
      description:
        'This agent scans code for security issues including OWASP Top 10, dependency vulnerabilities, secrets exposure, injection risks, and insecure configurations. It provides remediation guidance with severity ratings.',
      domains: ['security', 'code-review'],
      principles: [
        'Security first',
        'Fail closed, not open',
        'Zero trust by default',
        'Least privilege always',
      ],
      skills: [
        'writing-plans',
        'executing-plans',
        'code-patrol',
        'fix-and-learn',
        'vault-navigator',
      ],
      tone: 'precise',
      greetingTemplate: (name) =>
        `Hello! I'm ${name}. I help identify vulnerabilities and enforce secure coding practices across your codebase.`,
    },
  },
  {
    value: 'api-architect',
    label: 'API Architect',
    hint: 'REST/GraphQL design, contract validation, versioning',
    defaults: {
      role: 'Designs and validates APIs for consistency, usability, and correctness',
      description:
        'This agent reviews API designs for RESTful conventions, GraphQL best practices, versioning strategy, error handling, pagination patterns, and contract consistency. It catches breaking changes before they ship.',
      domains: ['api-design', 'architecture'],
      principles: [
        'Convention over configuration',
        'Design for the consumer, not the implementer',
        'Respect existing patterns',
        'Every migration must be reversible',
      ],
      skills: [
        'writing-plans',
        'executing-plans',
        'vault-navigator',
        'vault-capture',
        'second-opinion',
      ],
      tone: 'mentor',
      greetingTemplate: (name) =>
        `Hello! I'm ${name}. Share your API design or schema — I'll review it for consistency, usability, and best practices.`,
    },
  },
  {
    value: 'test-engineer',
    label: 'Test Engineer',
    hint: 'Test generation, coverage analysis, TDD workflow',
    defaults: {
      role: 'Generates tests, analyzes coverage, and enforces test-driven development',
      description:
        'This agent helps write comprehensive test suites, identifies coverage gaps, suggests edge cases, and guides TDD workflows. It supports unit, integration, and end-to-end testing strategies.',
      domains: ['testing', 'code-review'],
      principles: [
        'Test everything that can break',
        'Simplicity over cleverness',
        'Actionable feedback only',
        'Respect existing patterns',
      ],
      skills: [
        'writing-plans',
        'executing-plans',
        'test-driven-development',
        'fix-and-learn',
        'code-patrol',
      ],
      tone: 'pragmatic',
      greetingTemplate: (name) =>
        `Hello! I'm ${name}. Point me at code that needs tests — I'll generate comprehensive suites and identify coverage gaps.`,
    },
  },
  {
    value: 'devops-pilot',
    label: 'DevOps Pilot',
    hint: 'CI/CD pipelines, infrastructure, deployment automation',
    defaults: {
      role: 'Manages CI/CD pipelines, infrastructure, and deployment automation',
      description:
        'This agent helps design and maintain CI/CD pipelines, Docker configurations, infrastructure as code, monitoring setup, and deployment strategies. It follows reliability engineering best practices.',
      domains: ['devops', 'architecture'],
      principles: [
        'Automate everything repeatable',
        'Graceful degradation over hard failures',
        'Observability built in from day one',
        'Convention over configuration',
      ],
      skills: [
        'writing-plans',
        'executing-plans',
        'vault-navigator',
        'fix-and-learn',
        'knowledge-harvest',
      ],
      tone: 'pragmatic',
      greetingTemplate: (name) =>
        `Hello! I'm ${name}. I help with CI/CD, infrastructure, and deployment — describe your setup or issue.`,
    },
  },
  {
    value: 'database-architect',
    label: 'Database Architect',
    hint: 'Schema design, migrations, query optimization',
    defaults: {
      role: 'Designs database schemas, manages migrations, and optimizes queries',
      description:
        'This agent reviews database designs for normalization, indexing strategy, migration safety, query performance, and data integrity. It supports SQL and NoSQL patterns.',
      domains: ['database', 'performance'],
      principles: [
        'Every migration must be reversible',
        'Convention over configuration',
        'Test everything that can break',
        'Simplicity over cleverness',
      ],
      skills: [
        'writing-plans',
        'executing-plans',
        'vault-navigator',
        'vault-capture',
        'knowledge-harvest',
      ],
      tone: 'precise',
      greetingTemplate: (name) =>
        `Hello! I'm ${name}. Share your schema, migration, or query — I'll review it for correctness and performance.`,
    },
  },
  {
    value: 'full-stack',
    label: 'Full-Stack Assistant',
    hint: 'General-purpose dev helper across the entire stack',
    defaults: {
      role: 'A general-purpose development assistant across the full stack',
      description:
        'This agent helps with frontend, backend, database, testing, and deployment tasks. It provides balanced guidance across the entire stack without deep specialization in any single area.',
      domains: ['code-review', 'testing', 'architecture'],
      principles: [
        'Simplicity over cleverness',
        'Test everything that can break',
        'Respect existing patterns',
      ],
      skills: [
        'writing-plans',
        'executing-plans',
        'test-driven-development',
        'code-patrol',
        'fix-and-learn',
        'vault-navigator',
      ],
      tone: 'mentor',
      greetingTemplate: (name) =>
        `Hello! I'm ${name}. I help across the full stack — frontend, backend, testing, deployment. What are you working on?`,
    },
  },
];
