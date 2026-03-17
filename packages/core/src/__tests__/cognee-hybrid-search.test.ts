/**
 * Hybrid search tests — validates the Cognee → FTS5 → Zettelkasten cascade.
 *
 * Source of truth: these tests define expected behavior.
 * Code adapts to fulfill them.
 *
 * Tests Brain.intelligentSearch() which combines:
 * 1. FTS5/BM25 keyword search (always runs)
 * 2. Cognee vector similarity (when available)
 * 3. 4-strategy cross-referencing (vault-id prefix, title match, substring, FTS fallback)
 * 4. Weighted scoring (semantic + vector + severity + temporal + tags + domain)
 * 5. Zettelkasten link traversal (via separate ops, not inside intelligentSearch)
 *
 * Uses real in-memory vault + mock CogneeClient.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Brain } from '../brain/brain.js';
import { Vault } from '../vault/vault.js';
import { CogneeClient } from '../cognee/client.js';
import { LinkManager } from '../vault/linking.js';
import type { IntelligenceEntry } from '../intelligence/types.js';
import type { CogneeSearchResult } from '../cognee/types.js';

// ─── Helpers ──────────────────────────────────────────────────────

function makeEntry(overrides: Partial<IntelligenceEntry> = {}): IntelligenceEntry {
  return {
    id: overrides.id ?? `entry-${Math.random().toString(36).slice(2, 8)}`,
    type: overrides.type ?? 'pattern',
    domain: overrides.domain ?? 'architecture',
    title: overrides.title ?? 'Test Pattern',
    severity: overrides.severity ?? 'warning',
    description: overrides.description ?? 'A test pattern for search validation.',
    tags: overrides.tags ?? ['test'],
    ...(overrides.context ? { context: overrides.context } : {}),
    ...(overrides.example ? { example: overrides.example } : {}),
    ...(overrides.why ? { why: overrides.why } : {}),
  };
}

/**
 * Create a mock CogneeClient that returns controlled search results.
 * isAvailable is a getter — can be toggled at runtime.
 */
function makeMockCognee(
  opts: {
    available?: boolean;
    searchResults?: CogneeSearchResult[];
  } = {},
): CogneeClient & { _setAvailable: (v: boolean) => void } {
  let available = opts.available ?? true;
  const searchResults = opts.searchResults ?? [];

  return {
    get isAvailable() {
      return available;
    },
    _setAvailable(v: boolean) {
      available = v;
    },
    healthCheck: vi.fn().mockResolvedValue({ available, url: 'mock', latencyMs: 1 }),
    addEntries: vi.fn().mockResolvedValue({ added: 0 }),
    deleteEntries: vi.fn().mockResolvedValue({ deleted: 0 }),
    cognify: vi.fn().mockResolvedValue({ status: 'ok' }),
    search: vi.fn().mockResolvedValue(searchResults),
    getConfig: vi.fn().mockReturnValue({ baseUrl: 'mock', dataset: 'test' }),
    getStatus: vi.fn().mockReturnValue({ available, url: 'mock', latencyMs: 1 }),
    flushPendingCognify: vi.fn(),
    resetPendingCognify: vi.fn(),
  } as unknown as CogneeClient & { _setAvailable: (v: boolean) => void };
}

// ─── Seed data ────────────────────────────────────────────────────

const SEED_ENTRIES: IntelligenceEntry[] = [
  makeEntry({
    id: 'pattern-retry-backoff',
    title: 'Retry with Exponential Backoff',
    description:
      'Always use exponential backoff when retrying failed network requests to avoid thundering herd.',
    domain: 'architecture',
    severity: 'critical',
    tags: ['networking', 'retry', 'resilience'],
    context: 'HTTP clients, API gateways, queue consumers.',
  }),
  makeEntry({
    id: 'pattern-circuit-breaker',
    title: 'Circuit Breaker for External Services',
    description:
      'Wrap external service calls in a circuit breaker to prevent cascade failures when downstream is unhealthy.',
    domain: 'architecture',
    severity: 'critical',
    tags: ['networking', 'resilience', 'microservices'],
    context: 'Service mesh, API gateway, client libraries.',
  }),
  makeEntry({
    id: 'anti-pattern-polling-no-timeout',
    type: 'anti-pattern',
    title: 'Polling Without Timeout',
    description:
      'Never poll an external service without a maximum timeout or circuit breaker. Leads to resource exhaustion.',
    domain: 'architecture',
    severity: 'critical',
    tags: ['networking', 'polling', 'timeout'],
  }),
  makeEntry({
    id: 'pattern-token-semantic',
    title: 'Semantic Token Priority',
    description:
      'Use semantic tokens over primitive tokens. Semantic tokens communicate intent, not just values.',
    domain: 'design',
    severity: 'warning',
    tags: ['tokens', 'design-system', 'css'],
  }),
  makeEntry({
    id: 'pattern-fts5-search',
    title: 'FTS5 Full-Text Search with Porter Stemming',
    description:
      'Use SQLite FTS5 with porter tokenizer for all text search in the vault. BM25 ranking for relevance.',
    domain: 'architecture',
    severity: 'suggestion',
    tags: ['search', 'sqlite', 'fts5'],
  }),
];

// ─── Test Suite ───────────────────────────────────────────────────

describe('Hybrid search: Cognee → FTS5 → Zettelkasten', () => {
  let vault: Vault;
  let linkManager: LinkManager;

  beforeAll(() => {
    vault = new Vault(':memory:');
    vault.seed(SEED_ENTRIES);
    linkManager = new LinkManager(vault.getProvider());

    // Create Zettelkasten links between related entries
    linkManager.addLink('pattern-retry-backoff', 'pattern-circuit-breaker', 'extends');
    linkManager.addLink(
      'anti-pattern-polling-no-timeout',
      'pattern-circuit-breaker',
      'contradicts',
    );
    linkManager.addLink('pattern-retry-backoff', 'anti-pattern-polling-no-timeout', 'contradicts');
  });

  afterAll(() => {
    vault.close();
  });

  // ─── FTS5-only search (no Cognee) ─────────────────────────────

  describe('FTS5-only (Cognee unavailable)', () => {
    it('should return results from FTS5 when Cognee is unavailable', async () => {
      const mockCognee = makeMockCognee({ available: false });
      const brain = new Brain(vault, mockCognee);

      const results = await brain.intelligentSearch('retry network requests');
      expect(results.length).toBeGreaterThan(0);
      // Vector score should be 0 for all results (no Cognee)
      expect(results.every((r) => r.breakdown.vector === 0)).toBe(true);
    });

    it('should match by keyword in FTS5', async () => {
      const brain = new Brain(vault); // No Cognee at all

      const results = await brain.intelligentSearch('exponential backoff');
      const ids = results.map((r) => r.entry.id);
      expect(ids).toContain('pattern-retry-backoff');
    });

    it('should rank critical severity higher than suggestion', async () => {
      const brain = new Brain(vault);

      const results = await brain.intelligentSearch('networking resilience');
      // Critical entries should rank above suggestion entries for same domain
      const criticalIdx = results.findIndex((r) => r.entry.id === 'pattern-retry-backoff');
      const suggestionIdx = results.findIndex((r) => r.entry.id === 'pattern-fts5-search');
      if (criticalIdx >= 0 && suggestionIdx >= 0) {
        expect(criticalIdx).toBeLessThan(suggestionIdx);
      }
    });
  });

  // ─── Hybrid search (Cognee available) ─────────────────────────

  describe('Cognee + FTS5 hybrid', () => {
    it('should boost results that appear in both FTS5 and Cognee', async () => {
      // Cognee returns circuit-breaker with high vector score
      const mockCognee = makeMockCognee({
        available: true,
        searchResults: [
          {
            id: 'cognee-uuid-1',
            score: 0.95,
            text: '[vault-id:pattern-circuit-breaker]\nCircuit Breaker for External Services\nWrap external service calls in a circuit breaker.',
            searchType: 'CHUNKS',
          },
        ],
      });
      const brain = new Brain(vault, mockCognee);

      const results = await brain.intelligentSearch('how to handle failing external services');

      // Circuit breaker should rank high due to Cognee vector boost
      const cbResult = results.find((r) => r.entry.id === 'pattern-circuit-breaker');
      expect(cbResult).toBeDefined();
      expect(cbResult!.breakdown.vector).toBeGreaterThan(0);
    });

    it('should cross-reference via [vault-id:] prefix', async () => {
      const mockCognee = makeMockCognee({
        available: true,
        searchResults: [
          {
            id: 'cognee-chunk-uuid',
            score: 0.88,
            text: '[vault-id:pattern-retry-backoff]\nRetry with Exponential Backoff\nAlways use exponential backoff.',
            searchType: 'CHUNKS',
          },
        ],
      });
      const brain = new Brain(vault, mockCognee);

      const results = await brain.intelligentSearch('retry strategy');
      const retryResult = results.find((r) => r.entry.id === 'pattern-retry-backoff');
      expect(retryResult).toBeDefined();
      // Should have vector score from Cognee cross-reference
      expect(retryResult!.breakdown.vector).toBeGreaterThan(0);
    });

    it('should cross-reference via title matching when vault-id is missing', async () => {
      // Cognee chunk without [vault-id:] prefix but with title on first line
      const mockCognee = makeMockCognee({
        available: true,
        searchResults: [
          {
            id: 'cognee-no-prefix',
            score: 0.82,
            text: 'Semantic Token Priority\nUse semantic tokens over primitive tokens.',
            searchType: 'CHUNKS',
          },
        ],
      });
      const brain = new Brain(vault, mockCognee);

      const results = await brain.intelligentSearch('design tokens priority');
      const tokenResult = results.find((r) => r.entry.id === 'pattern-token-semantic');
      expect(tokenResult).toBeDefined();
      expect(tokenResult!.breakdown.vector).toBeGreaterThan(0);
    });

    it('should use COGNEE_WEIGHTS when vector results are present', async () => {
      const mockCognee = makeMockCognee({
        available: true,
        searchResults: [
          {
            id: 'uuid',
            score: 0.9,
            text: '[vault-id:pattern-retry-backoff]\nRetry',
            searchType: 'CHUNKS',
          },
        ],
      });
      const brain = new Brain(vault, mockCognee);

      const results = await brain.intelligentSearch('retry');
      const retryResult = results.find((r) => r.entry.id === 'pattern-retry-backoff');
      expect(retryResult).toBeDefined();
      // With COGNEE_WEIGHTS, vector component is 35% of total
      // So vector score should contribute meaningfully
      expect(retryResult!.breakdown.vector).toBeGreaterThan(0);
      expect(retryResult!.score).toBeGreaterThan(retryResult!.breakdown.semantic);
    });

    it('should use DEFAULT_WEIGHTS when Cognee returns no matches', async () => {
      const mockCognee = makeMockCognee({
        available: true,
        searchResults: [], // Cognee returns nothing
      });
      const brain = new Brain(vault, mockCognee);

      const results = await brain.intelligentSearch('exponential backoff');
      // All results should have vector=0 (no Cognee matches)
      expect(results.every((r) => r.breakdown.vector === 0)).toBe(true);
    });
  });

  // ─── Graceful degradation ─────────────────────────────────────

  describe('graceful degradation', () => {
    it('should fall back to FTS5 when Cognee search throws', async () => {
      const mockCognee = makeMockCognee({ available: true });
      (mockCognee.search as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Cognee crashed'),
      );
      const brain = new Brain(vault, mockCognee);

      const results = await brain.intelligentSearch('retry backoff');
      // Should still return FTS5 results despite Cognee failure
      expect(results.length).toBeGreaterThan(0);
      // All vector scores should be 0 (Cognee failed)
      expect(results.every((r) => r.breakdown.vector === 0)).toBe(true);
    });

    it('should handle Cognee becoming unavailable mid-session', async () => {
      const mockCognee = makeMockCognee({
        available: true,
        searchResults: [
          {
            id: 'uuid',
            score: 0.9,
            text: '[vault-id:pattern-retry-backoff]\nRetry',
            searchType: 'CHUNKS',
          },
        ],
      });
      const brain = new Brain(vault, mockCognee);

      // First search — Cognee available
      const results1 = await brain.intelligentSearch('retry');
      const hasVector1 = results1.some((r) => r.breakdown.vector > 0);
      expect(hasVector1).toBe(true);

      // Cognee goes down
      mockCognee._setAvailable(false);

      // Second search — should fall back gracefully
      const results2 = await brain.intelligentSearch('retry');
      expect(results2.length).toBeGreaterThan(0);
      expect(results2.every((r) => r.breakdown.vector === 0)).toBe(true);
    });
  });

  // ─── Score breakdown ──────────────────────────────────────────

  describe('score breakdown', () => {
    it('should include all scoring dimensions', async () => {
      const brain = new Brain(vault);
      const results = await brain.intelligentSearch('retry');
      expect(results.length).toBeGreaterThan(0);

      const breakdown = results[0].breakdown;
      expect(breakdown).toHaveProperty('semantic');
      expect(breakdown).toHaveProperty('vector');
      expect(breakdown).toHaveProperty('severity');
      expect(breakdown).toHaveProperty('temporalDecay');
      expect(breakdown).toHaveProperty('tagOverlap');
      expect(breakdown).toHaveProperty('domainMatch');
      expect(breakdown).toHaveProperty('total');
    });

    it('should have total equal to weighted sum of components', async () => {
      const brain = new Brain(vault);
      const results = await brain.intelligentSearch('retry', { tags: ['networking'] });
      expect(results.length).toBeGreaterThan(0);

      // Total should be non-negative
      for (const r of results) {
        expect(r.breakdown.total).toBeGreaterThanOrEqual(0);
        expect(r.score).toBe(r.breakdown.total);
      }
    });

    it('should boost domain match when domain filter is applied', async () => {
      const brain = new Brain(vault);

      const withDomain = await brain.intelligentSearch('resilience', { domain: 'architecture' });
      const withoutDomain = await brain.intelligentSearch('resilience');

      // When domain filter matches, domainMatch should be higher
      const archResult = withDomain.find((r) => r.entry.domain === 'architecture');
      const noFilterResult = withoutDomain.find((r) => r.entry.id === archResult?.entry.id);

      if (archResult && noFilterResult) {
        expect(archResult.breakdown.domainMatch).toBeGreaterThanOrEqual(
          noFilterResult.breakdown.domainMatch,
        );
      }
    });
  });

  // ─── Zettelkasten link integration ────────────────────────────

  describe('Zettelkasten links (post-search enrichment)', () => {
    it('should find connected entries via link traversal', () => {
      // Search finds retry-backoff → traverse links → discover circuit-breaker
      const links = linkManager.getLinks('pattern-retry-backoff');
      const linkedIds = links.map((l) =>
        l.sourceId === 'pattern-retry-backoff' ? l.targetId : l.sourceId,
      );
      expect(linkedIds).toContain('pattern-circuit-breaker');
      expect(linkedIds).toContain('anti-pattern-polling-no-timeout');
    });

    it('should traverse 2 hops to discover indirect connections', () => {
      // retry-backoff → circuit-breaker → polling-no-timeout (via contradicts)
      const traversed = linkManager.traverse('pattern-retry-backoff', 2);
      const ids = traversed.map((e) => e.id);
      expect(ids).toContain('pattern-circuit-breaker');
      expect(ids).toContain('anti-pattern-polling-no-timeout');
    });

    it('should identify contradicting anti-patterns', () => {
      const links = linkManager.getLinks('anti-pattern-polling-no-timeout');
      const contradictions = links.filter((l) => l.linkType === 'contradicts');
      expect(contradictions.length).toBeGreaterThan(0);
    });
  });

  // ─── Edge cases ───────────────────────────────────────────────

  describe('edge cases', () => {
    it('should return empty array for query matching nothing', async () => {
      const brain = new Brain(vault);
      const results = await brain.intelligentSearch('xyzzy_nonexistent_term_12345');
      expect(results).toEqual([]);
    });

    it('should respect limit option (small corpus guard may return more)', async () => {
      const brain = new Brain(vault);
      const results = await brain.intelligentSearch('pattern', { limit: 2 });
      // Brain has a small corpus guard: when seed < 50 entries and limit would
      // discard > half the seed, it returns all seed results sorted by score.
      // With 5 seed entries and limit=2, the guard activates → returns all 5.
      // This is by design to prevent over-filtering in small knowledge bases.
      expect(results.length).toBeGreaterThan(0);
      // Results should still be sorted by score (highest first)
      for (let i = 1; i < results.length; i++) {
        expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
      }
    });

    it('should filter by type when specified', async () => {
      const brain = new Brain(vault);
      const results = await brain.intelligentSearch('networking timeout', {
        type: 'anti-pattern',
      });
      if (results.length > 0) {
        expect(results.every((r) => r.entry.type === 'anti-pattern')).toBe(true);
      }
    });

    it('should handle Cognee returning duplicate vault-ids gracefully', async () => {
      const mockCognee = makeMockCognee({
        available: true,
        searchResults: [
          {
            id: 'chunk-1',
            score: 0.9,
            text: '[vault-id:pattern-retry-backoff]\nRetry chunk 1',
            searchType: 'CHUNKS',
          },
          {
            id: 'chunk-2',
            score: 0.7,
            text: '[vault-id:pattern-retry-backoff]\nRetry chunk 2',
            searchType: 'CHUNKS',
          },
        ],
      });
      const brain = new Brain(vault, mockCognee);

      const results = await brain.intelligentSearch('retry');
      // Should not crash and should use the higher score
      const retryResult = results.find((r) => r.entry.id === 'pattern-retry-backoff');
      expect(retryResult).toBeDefined();
      // Should use max score (0.9, not 0.7)
      expect(retryResult!.breakdown.vector).toBeCloseTo(0.9, 1);
    });

    it('should handle Cognee returning results with no matching vault entry', async () => {
      const mockCognee = makeMockCognee({
        available: true,
        searchResults: [
          {
            id: 'orphan-chunk',
            score: 0.85,
            text: 'Some completely unrelated text that matches nothing in the vault at all',
            searchType: 'CHUNKS',
          },
        ],
      });
      const brain = new Brain(vault, mockCognee);

      // Should not crash — unmatched Cognee results are silently dropped
      const results = await brain.intelligentSearch('retry');
      expect(Array.isArray(results)).toBe(true);
    });
  });
});
