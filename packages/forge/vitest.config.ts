import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    // Scaffold tests spawn npm/tsc subprocesses; shared CI runners (macOS
    // especially) can be 3-4x slower than local, so give them headroom there.
    testTimeout: process.env.CI ? 120_000 : 30_000,
    hookTimeout: process.env.CI ? 120_000 : 10_000,
    exclude: ['**/node_modules/**', '**/.claude/worktrees/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/__tests__/**', 'src/index.ts'],
    },
  },
});
