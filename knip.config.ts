import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  workspaces: {
    '.': {
      entry: [],
      project: ['*.ts'],
      ignoreDependencies: [
        '@secretlint/secretlint-rule-preset-recommend', // secretlint plugin loaded by config
      ],
      // wrangler is fetched on demand via `npx wrangler` in deploy-docs.yml (CI-only);
      // it is intentionally not a local devDependency.
      ignoreBinaries: ['wrangler'],
    },
    'packages/core': {
      project: ['src/**/*.ts'],
      ignore: [],
      ignoreDependencies: [
        // Transitive deps of @vitest/coverage-v8 — added explicitly because
        // npm workspace hoisting doesn't resolve them. Not dead code.
        '@bcoe/v8-coverage',
        'ast-v8-to-istanbul',
        'istanbul-lib-coverage',
        'istanbul-lib-report',
        'istanbul-reports',
        'magicast',
        'obug',
      ],
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
