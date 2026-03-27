import { defineConfig } from 'vitest/config';

/**
 * Separate config for cli-agent-lifecycle.test.ts.
 *
 * This test spawns heavy child processes (npm install, tsc --noEmit, vitest run)
 * via execFileSync, which blocks the Node.js event loop. Under the main E2E
 * config's `singleFork: true`, the blocked event loop prevents the vitest
 * worker from responding to birpc RPC calls within the 60s timeout, causing
 * "[vitest-worker]: Timeout calling onTaskUpdate" errors.
 *
 * Running this test in its own vitest invocation (without singleFork) avoids
 * the issue: each test file gets its own fork, and the blocked event loop
 * only affects that fork's own communication channel.
 */
export default defineConfig({
  test: {
    environment: 'node',
    pool: 'forks',
    testTimeout: 120_000,
    hookTimeout: 60_000,
    include: ['e2e/cli-agent-lifecycle.test.ts'],
    exclude: ['**/node_modules/**', '**/.claude/worktrees/**'],
  },
});
