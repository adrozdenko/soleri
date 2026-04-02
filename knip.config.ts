import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  workspaces: {
    '.': {
      entry: [],
      project: ['*.ts'],
      ignoreDependencies: [
        '@secretlint/secretlint-rule-preset-recommend', // secretlint plugin loaded by config
      ],
    },
    'packages/core': {
      project: ['src/**/*.ts'],
      ignore: [
        'src/adapters/index.ts', // barrel file for external consumers
        'src/subagent/index.ts', // barrel file for external consumers
      ],
      ignoreDependencies: [],
    },
    'packages/engine': {
      entry: ['bin/*.js'],
      project: ['bin/*.js'],
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
