/**
 * Default canonical tag taxonomy for Soleri agents.
 *
 * These tags represent the most common knowledge domains. When a vault is
 * configured with tagConstraintMode 'suggest' or 'enforce', incoming tags
 * are mapped to the nearest entry in this list via edit-distance matching.
 *
 * To use these defaults in your agent runtime config:
 *   import { DEFAULT_CANONICAL_TAGS } from '@soleri/core';
 *   // ...
 *   canonicalTags: DEFAULT_CANONICAL_TAGS,
 *   tagConstraintMode: 'suggest',
 */
export const DEFAULT_CANONICAL_TAGS: string[] = [
  'architecture',
  'typescript',
  'react',
  'testing',
  'workflow',
  'design-tokens',
  'accessibility',
  'performance',
  'security',
  'planning',
  'soleri',
  'vault',
  'mcp',
  'claude-code',
  'ai',
  'learning',
  'gamification',
  'education',
  'adhd',
  'routing',
  'orchestration',
  'skills',
  'automation',
  'git',
  'database',
  'api',
  'authentication',
  'subagent',
  'design-system',
  'component',
  'frontend',
  'backend',
  'tooling',
  'monorepo',
  'refactoring',
  'debugging',
  'deployment',
  'configuration',
  'documentation',
  'pattern',
  'anti-pattern',
  'principle',
  'decision',
  'migration',
  'plugin',
  'hook',
  'schema',
  'pipeline',
  'ingestion',
];
