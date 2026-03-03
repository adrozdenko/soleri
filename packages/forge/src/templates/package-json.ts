import type { AgentConfig } from '../types.js';

export function generatePackageJson(config: AgentConfig): string {
  const pkg = {
    name: `${config.id}-mcp`,
    version: '1.0.0',
    description: config.description,
    type: 'module',
    main: 'dist/index.js',
    bin: { [`${config.id}-mcp`]: 'dist/index.js' },
    scripts: {
      dev: 'tsx src/index.ts',
      build: 'tsc && node scripts/copy-assets.js',
      start: 'node dist/index.js',
      typecheck: 'tsc --noEmit',
      test: 'vitest run',
      'test:watch': 'vitest',
      'test:coverage': 'vitest run --coverage',
    },
    keywords: ['mcp', 'agent', config.id, ...config.domains.slice(0, 5)],
    license: 'MIT',
    engines: { node: '>=18.0.0' },
    dependencies: {
      '@anthropic-ai/sdk': '^0.39.0',
      '@modelcontextprotocol/sdk': '^1.12.1',
      'better-sqlite3': '^11.8.1',
      'zod': '^3.24.2',
    },
    devDependencies: {
      '@types/better-sqlite3': '^7.6.12',
      '@types/node': '^22.13.4',
      '@vitest/coverage-v8': '^3.0.5',
      'tsx': '^4.19.2',
      'typescript': '^5.7.3',
      'vitest': '^3.0.5',
    },
  };

  return JSON.stringify(pkg, null, 2);
}
