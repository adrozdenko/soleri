import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 120_000, // E2E tests may need time for npm install + build
    exclude: ['**/node_modules/**', '**/.claude/worktrees/**'],
  },
});
