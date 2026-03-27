import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  workspaces: {
    '.': {
      entry: [],
      project: ['*.ts'],
      ignoreDependencies: [
        '@secretlint/secretlint-rule-preset-recommend', // secretlint plugin loaded by config
        'react-dom', // peer dependency of @astrojs/react
        '@types/react-dom', // types for react-dom peer dep
        'cspell', // invoked via npm script (lint:spell)
        'husky', // git hooks manager (prepare script)
        'lint-staged', // invoked by husky pre-commit hook
        'markdownlint-cli2', // invoked via npm script (lint:md)
        'oxfmt', // invoked via npm script and lint-staged
        'oxlint', // invoked via npm script and lint-staged
        'secretlint', // invoked via lint-staged
        'ts-prune', // invoked via npm script (deadcode:ts-prune)
        'tsx', // invoked via npm scripts as ts runner
      ],
    },
    'packages/core': {
      project: ['src/**/*.ts'],
      ignoreDependencies: [
        '@modelcontextprotocol/sdk', // optional peer dependency
      ],
    },
    'packages/engine': {
      entry: ['bin/*.js'],
      project: ['bin/*.js'],
      ignoreDependencies: [
        '@modelcontextprotocol/sdk', // MCP transport dependency
      ],
    },
    'packages/forge': {
      project: ['src/**/*.ts'],
    },
    'packages/cli': {
      project: ['src/**/*.ts'],
    },
    'packages/create-soleri': {
      project: ['src/**/*.ts'],
    },
  },
};

export default config;
