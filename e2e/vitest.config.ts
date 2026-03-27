import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 120_000, // E2E tests may need time for npm install + build
    hookTimeout: 60_000, // afterAll cleanup (rmSync of node_modules) can be slow on CI
    teardownTimeout: 60_000, // worker teardown after heavy child-process tests
    exclude: [
      '**/node_modules/**',
      '**/.claude/worktrees/**',
      // cli-agent-lifecycle runs heavy child processes (npm install, tsc, vitest)
      // that block the event loop for >60s, exceeding the birpc RPC timeout.
      // It runs as a separate vitest invocation in the test:e2e script instead.
      '**/cli-agent-lifecycle.test.ts',
    ],
  },
});
