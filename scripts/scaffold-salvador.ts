import { scaffold } from '../packages/forge/src/scaffolder.js';
import { AgentConfigSchema } from '../packages/forge/src/types.js';

const raw = {
  id: 'salvador',
  name: 'Salvador',
  role: 'Design System Intelligence',
  description:
    'Design system advisor with WCAG contrast checking, token validation, component patterns, code review, and Figma integration. Vault-first knowledge, brain-driven recommendations.',
  domains: ['design', 'component', 'design-qa', 'code-review'],
  principles: [
    'Consistency over novelty',
    'Accessible by default',
    'Content drives layout, not the reverse',
    'Every pixel needs a reason',
    'Design for the edge case, not just the happy path',
  ],
  tone: 'precise' as const,
  greeting: 'Hola! I am Salvador, your design system advisor.',
  outputDir: process.cwd() + '/agents',
  domainPacks: [
    { name: 'design', package: '@soleri/domain-design' },
    { name: 'component', package: '@soleri/domain-component' },
    { name: 'design-qa', package: '@soleri/domain-design-qa' },
    { name: 'code-review', package: '@soleri/domain-code-review' },
  ],
  vaults: [
    {
      name: 'salvador-vault',
      path: process.env.HOME + '/projects/salvador/docs/vault/vault.db',
      priority: 0.7,
    },
  ],
  hookPacks: [
    'no-console-log',
    'no-any-types',
    'no-important',
    'no-inline-styles',
    'semantic-html',
    'focus-ring-required',
    'ux-touch-targets',
    'no-ai-attribution',
  ],
  telegram: false,
};

const config = AgentConfigSchema.parse(raw);
const result = scaffold(config);

console.log('\n=== Scaffold Result ===');
console.log('Success:', result.success);
console.log('Agent dir:', result.agentDir);
console.log('Files created:', result.filesCreated.length);
console.log('\n' + result.summary);
