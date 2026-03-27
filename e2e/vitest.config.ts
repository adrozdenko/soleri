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
      // Heavy scaffold/child-process tests (npm install, tsc, vitest) block the
      // event loop for >60s under singleFork, exceeding the birpc RPC timeout.
      // They run in a separate vitest invocation (vitest.heavy.config.ts) instead.
      '**/cli-agent-lifecycle.test.ts',
      '**/scaffold-edge-cases.test.ts',
      '**/skills-and-domains.test.ts',
      '**/smoke-salvador-agent.test.ts',
    ],
  },
});
