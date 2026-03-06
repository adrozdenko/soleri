/**
 * Cognee integration tests — run only when COGNEE_BASE_URL is set.
 * Skipped in local runs; executed in CI via the cognee-integration workflow.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CogneeClient } from '../cognee/client.js';

const COGNEE_BASE_URL = process.env.COGNEE_BASE_URL;

describe.skipIf(!COGNEE_BASE_URL)('Cognee Integration', () => {
  let client: CogneeClient;

  beforeAll(() => {
    client = new CogneeClient({
      baseUrl: COGNEE_BASE_URL!,
      dataset: 'soleri-integration-test',
      cognifyDebounceMs: 0, // No debounce in tests
    });
  });

  afterAll(() => {
    client.resetPendingCognify();
  });

  it('should pass health check', async () => {
    const status = await client.healthCheck();
    expect(status.available).toBe(true);
    expect(status.latencyMs).toBeLessThan(5000);
  });

  it('should add entries', async () => {
    // Prime the health cache
    await client.healthCheck();

    const result = await client.addEntries([
      {
        id: 'int-test-1',
        type: 'pattern',
        domain: 'integration',
        title: 'Test Pattern: Retry with Backoff',
        severity: 'warning',
        description: 'Always use exponential backoff when retrying failed network requests.',
        tags: ['networking', 'retry', 'resilience'],
      },
      {
        id: 'int-test-2',
        type: 'anti-pattern',
        domain: 'integration',
        title: 'Anti-Pattern: Polling Without Timeout',
        severity: 'critical',
        description: 'Never poll an external service without a maximum timeout or circuit breaker.',
        tags: ['networking', 'polling', 'timeout'],
      },
    ]);

    expect(result.added).toBe(2);
  });

  it('should cognify the dataset', async () => {
    const result = await client.cognify('soleri-integration-test');
    // Cognify may be "ok" or "unavailable" depending on LLM backend — both are valid in CI
    expect(['ok', 'unavailable']).toContain(result.status);
  });

  it('should search with CHUNKS type', async () => {
    const results = await client.search('retry network requests', {
      searchType: 'CHUNKS',
      limit: 5,
    });

    // Results may be empty if cognify hasn't completed, but the call should not throw
    expect(Array.isArray(results)).toBe(true);

    if (results.length > 0) {
      expect(results[0].score).toBeGreaterThan(0);
      expect(results[0].text).toBeTruthy();
      expect(results[0].searchType).toBe('CHUNKS');
    }
  });
});
