import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  workspaces: {
    '.': {
      entry: [],
      project: ['*.ts'],
      ignoreDependencies: [
        '@secretlint/secretlint-rule-preset-recommend', // secretlint plugin
      ],
    },
    'packages/core': {
      project: ['src/**/*.ts'],
      ignoreDependencies: [
        '@modelcontextprotocol/sdk', // optional peer dependency
      ],
    },
    'packages/forge': {
      project: ['src/**/*.ts'],
      ignoreDependencies: [
        '@vitest/coverage-v8', // optional vitest plugin
      ],
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
