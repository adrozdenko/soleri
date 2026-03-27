import { defineConfig } from 'vitest/config';

/**
 * Separate config for heavy scaffold/child-process tests.
 *
 * These tests call scaffold() which internally runs synchronous tsc compilation,
 * blocking the event loop for 60-100+ seconds. Under vitest's `forks` pool,
 * the blocked event loop prevents birpc RPC heartbeats, causing
 * "[vitest-worker]: Timeout calling onTaskUpdate" errors.
 *
 * Using `threads` pool avoids this: worker threads share the process but
 * communicate via MessagePort which doesn't depend on the event loop being free.
 */
export default defineConfig({
  test: {
    environment: 'node',
    pool: 'threads',
    testTimeout: 180_000,
    hookTimeout: 60_000,
    teardownTimeout: 60_000,
    include: [
      'e2e/cli-agent-lifecycle.test.ts',
      'e2e/scaffold-edge-cases.test.ts',
      'e2e/skills-and-domains.test.ts',
      'e2e/smoke-salvador-agent.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/.claude/worktrees/**'],
  },
});
