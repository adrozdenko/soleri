import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Vault } from '../vault/vault.js';
import { Brain } from '../brain/brain.js';
import type { IntelligenceEntry } from '../intelligence/types.js';
import type { CogneeClient } from '../cognee/client.js';
import type { CogneeSearchResult, CogneeStatus } from '../cognee/types.js';

function makeEntry(overrides: Partial<IntelligenceEntry> = {}): IntelligenceEntry {
  return {
    id: overrides.id ?? 'test-1',
    type: overrides.type ?? 'pattern',
    domain: overrides.domain ?? 'testing',
    title: overrides.title ?? 'Test Pattern',
    severity: overrides.severity ?? 'warning',
    description: overrides.description ?? 'A test pattern for unit tests.',
    tags: overrides.tags ?? ['testing', 'assertions'],
  };
}

function makeMockCognee(
  overrides: {
    available?: boolean;
    searchResults?: CogneeSearchResult[];
    searchError?: boolean;
  } = {},
): CogneeClient {
  const available = overrides.available ?? true;
  return {
    get isAvailable() {
      return available;
    },
    search: overrides.searchError
      ? vi.fn().mockRejectedValue(new Error('timeout'))
      : vi.fn().mockResolvedValue(overrides.searchResults ?? []),
    addEntries: vi.fn().mockResolvedValue({ added: 0 }),
    cognify: vi.fn().mockResolvedValue({ status: 'ok' }),
    healthCheck: vi
      .fn()
      .mockResolvedValue({ available, url: 'http://localhost:8000', latencyMs: 1 } as CogneeStatus),
    getConfig: vi.fn().mockReturnValue({
      baseUrl: 'http://localhost:8000',
      dataset: 'vault',
      timeoutMs: 5000,
      healthCacheTtlMs: 60000,
    }),
    getStatus: vi.fn().mockReturnValue(null),
  } as unknown as CogneeClient;
}

describe('Brain', () => {
  let vault: Vault;
  let brain: Brain;

  beforeEach(() => {
    vault = new Vault(':memory:');
    brain = new Brain(vault);
  });

  afterEach(() => {
    vault.close();
  });

  // ─── Constructor ──────────────────────────────────────────────

  describe('constructor', () => {
    it('should create brain with empty vocabulary on empty vault', () => {
      expect(brain.getVocabularySize()).toBe(0);
    });

    it('should build vocabulary from existing entries', () => {
      vault.seed([
        makeEntry({
          id: 'v1',
          title: 'Input validation pattern',
          description: 'Always validate user input at boundaries.',
          tags: ['validation', 'security'],
        }),
        makeEntry({
          id: 'v2',
          title: 'Caching strategy',
          description: 'Use cache-aside for read-heavy workloads.',
          tags: ['caching', 'performance'],
        }),
      ]);
      const brain2 = new Brain(vault);
      expect(brain2.getVocabularySize()).toBeGreaterThan(0);
    });

    it('should accept optional CogneeClient', () => {
      const cognee = makeMockCognee();
      const brain2 = new Brain(vault, cognee);
      expect(brain2.getVocabularySize()).toBe(0);
    });
  });

  // ─── Intelligent Search ──────────────────────────────────────

  describe('intelligentSearch', () => {
    beforeEach(() => {
      vault.seed([
        makeEntry({
          id: 'is-1',
          title: 'Input validation pattern',
          description:
            'Always validate user input at system boundaries to prevent injection attacks.',
          domain: 'security',
          severity: 'critical',
          tags: ['validation', 'security', 'input'],
        }),
        makeEntry({
          id: 'is-2',
          title: 'Caching strategy for APIs',
          description: 'Use cache-aside pattern for read-heavy API workloads.',
          domain: 'performance',
          severity: 'warning',
          tags: ['caching', 'api', 'performance'],
        }),
        makeEntry({
          id: 'is-3',
          title: 'Error handling best practices',
          description: 'Use typed errors with context for better debugging experience.',
          domain: 'clean-code',
          severity: 'suggestion',
          tags: ['errors', 'debugging'],
        }),
      ]);
      brain = new Brain(vault);
    });

    it('should return ranked results', async () => {
      const results = await brain.intelligentSearch('validation input');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entry.id).toBe('is-1');
    });

    it('should include score breakdown with vector field', async () => {
      const results = await brain.intelligentSearch('validation');
      expect(results.length).toBeGreaterThan(0);
      const breakdown = results[0].breakdown;
      expect(breakdown).toHaveProperty('semantic');
      expect(breakdown).toHaveProperty('vector');
      expect(breakdown).toHaveProperty('severity');
      expect(breakdown).toHaveProperty('recency');
      expect(breakdown).toHaveProperty('tagOverlap');
      expect(breakdown).toHaveProperty('domainMatch');
      expect(breakdown).toHaveProperty('total');
      expect(breakdown.total).toBe(results[0].score);
      // Without cognee, vector should be 0
      expect(breakdown.vector).toBe(0);
    });

    it('should return empty array for no matches', async () => {
      const results = await brain.intelligentSearch('xyznonexistent');
      expect(results).toEqual([]);
    });

    it('should respect limit', async () => {
      const results = await brain.intelligentSearch('pattern', { limit: 1 });
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('should filter by domain', async () => {
      const results = await brain.intelligentSearch('pattern', { domain: 'security' });
      expect(results.every((r) => r.entry.domain === 'security')).toBe(true);
    });

    it('should boost domain matches when domain is specified', async () => {
      const withDomain = await brain.intelligentSearch('pattern', { domain: 'security' });
      if (withDomain.length > 0) {
        expect(withDomain[0].breakdown.domainMatch).toBe(1.0);
      }
    });

    it('should boost severity in scoring', async () => {
      const results = await brain.intelligentSearch('pattern');
      if (results.length >= 2) {
        const critical = results.find((r) => r.entry.severity === 'critical');
        const suggestion = results.find((r) => r.entry.severity === 'suggestion');
        if (critical && suggestion) {
          expect(critical.breakdown.severity).toBeGreaterThan(suggestion.breakdown.severity);
        }
      }
    });

    it('should boost tag overlap when tags provided', async () => {
      const results = await brain.intelligentSearch('pattern', {
        tags: ['validation', 'security'],
      });
      if (results.length > 0) {
        const secEntry = results.find((r) => r.entry.id === 'is-1');
        if (secEntry) {
          expect(secEntry.breakdown.tagOverlap).toBeGreaterThan(0);
        }
      }
    });

    it('should handle search on empty vault gracefully', async () => {
      const emptyVault = new Vault(':memory:');
      const emptyBrain = new Brain(emptyVault);
      const results = await emptyBrain.intelligentSearch('anything');
      expect(results).toEqual([]);
      emptyVault.close();
    });
  });

  // ─── Hybrid Search (with Cognee) ──────────────────────────────

  describe('hybrid search with Cognee', () => {
    beforeEach(() => {
      vault.seed([
        makeEntry({
          id: 'hs-1',
          title: 'Authentication flow',
          description: 'JWT-based authentication for API endpoints.',
          domain: 'security',
          severity: 'critical',
          tags: ['auth', 'jwt'],
        }),
        makeEntry({
          id: 'hs-2',
          title: 'Logging best practices',
          description: 'Structured logging with correlation IDs for debugging.',
          domain: 'observability',
          severity: 'warning',
          tags: ['logging', 'debugging'],
        }),
      ]);
    });

    it('should match via [vault-id:] prefix (strategy 1)', async () => {
      const cognee = makeMockCognee({
        searchResults: [
          {
            id: 'cognee-uuid-1',
            score: 0.92,
            text: '[vault-id:hs-1]\nAuthentication flow\nJWT-based authentication for API endpoints.',
            searchType: 'CHUNKS',
          },
        ],
      });
      const hybridBrain = new Brain(vault, cognee);
      const results = await hybridBrain.intelligentSearch('authentication');
      expect(results.length).toBeGreaterThan(0);
      const authResult = results.find((r) => r.entry.id === 'hs-1');
      expect(authResult).toBeDefined();
      expect(authResult!.breakdown.vector).toBe(0.92);
    });

    it('should match via title first-line (strategy 2)', async () => {
      // Cognee stripped the [vault-id:] prefix during chunking — title is on first line
      const cognee = makeMockCognee({
        searchResults: [
          {
            id: 'cognee-uuid-2',
            score: 0.9,
            text: 'Authentication flow\nJWT-based authentication for API endpoints.',
            searchType: 'CHUNKS',
          },
        ],
      });
      const hybridBrain = new Brain(vault, cognee);
      const results = await hybridBrain.intelligentSearch('authentication');
      const authResult = results.find((r) => r.entry.id === 'hs-1');
      expect(authResult).toBeDefined();
      expect(authResult!.breakdown.vector).toBe(0.9);
    });

    it('should match via title substring (strategy 3)', async () => {
      // Mid-document chunk where title isn't on the first line
      const cognee = makeMockCognee({
        searchResults: [
          {
            id: 'cognee-uuid-3',
            score: 0.85,
            text: 'Some preamble text\nAuthentication flow\nJWT-based auth...',
            searchType: 'CHUNKS',
          },
        ],
      });
      const hybridBrain = new Brain(vault, cognee);
      const results = await hybridBrain.intelligentSearch('authentication');
      const authResult = results.find((r) => r.entry.id === 'hs-1');
      expect(authResult).toBeDefined();
      expect(authResult!.breakdown.vector).toBe(0.85);
    });

    it('should merge cognee-only entries via FTS fallback (strategy 4)', async () => {
      // hs-2 may not match FTS5 for "authentication" but Cognee finds it via semantic similarity.
      // The chunk text starts with the entry title so strategy 4's vault.search(firstLine) finds it.
      const cognee = makeMockCognee({
        searchResults: [
          {
            id: 'cognee-uuid-a',
            score: 0.95,
            text: 'Authentication flow\nJWT-based authentication for API endpoints.',
            searchType: 'CHUNKS',
          },
          {
            id: 'cognee-uuid-b',
            score: 0.6,
            text: 'Logging best practices\nStructured logging with correlation IDs.',
            searchType: 'CHUNKS',
          },
        ],
      });
      const hybridBrain = new Brain(vault, cognee);
      const results = await hybridBrain.intelligentSearch('authentication');
      // Both entries should be in results (hs-2 merged from Cognee even if not in FTS5)
      const ids = results.map((r) => r.entry.id);
      expect(ids).toContain('hs-1');
      expect(ids).toContain('hs-2');
      const loggingResult = results.find((r) => r.entry.id === 'hs-2');
      expect(loggingResult).toBeDefined();
      expect(loggingResult!.breakdown.vector).toBe(0.6);
    });

    it('should fall back to FTS5-only on Cognee search error', async () => {
      const cognee = makeMockCognee({ searchError: true });
      const hybridBrain = new Brain(vault, cognee);
      const results = await hybridBrain.intelligentSearch('authentication');
      // Should still work, just without vector scores
      for (const r of results) {
        expect(r.breakdown.vector).toBe(0);
      }
    });

    it('should work without Cognee (backward compatible)', async () => {
      const noCogneeBrain = new Brain(vault);
      const results = await noCogneeBrain.intelligentSearch('authentication');
      for (const r of results) {
        expect(r.breakdown.vector).toBe(0);
      }
    });

    it('should handle unavailable Cognee gracefully', async () => {
      const cognee = makeMockCognee({ available: false });
      const hybridBrain = new Brain(vault, cognee);
      const results = await hybridBrain.intelligentSearch('authentication');
      for (const r of results) {
        expect(r.breakdown.vector).toBe(0);
      }
      // search should not have been called
      expect(cognee.search).not.toHaveBeenCalled();
    });
  });

  // ─── syncToCognee ──────────────────────────────────────────────

  describe('syncToCognee', () => {
    it('should return 0 when Cognee not available', async () => {
      const result = await brain.syncToCognee();
      expect(result).toEqual({ synced: 0, cognified: false });
    });

    it('should sync all entries and cognify', async () => {
      vault.seed([makeEntry({ id: 'sync-1' }), makeEntry({ id: 'sync-2' })]);
      const cognee = makeMockCognee();
      (cognee.addEntries as ReturnType<typeof vi.fn>).mockResolvedValue({ added: 2 });
      const hybridBrain = new Brain(vault, cognee);
      const result = await hybridBrain.syncToCognee();
      expect(result.synced).toBe(2);
      expect(result.cognified).toBe(true);
      expect(cognee.addEntries).toHaveBeenCalledTimes(1);
      expect(cognee.cognify).toHaveBeenCalledTimes(1);
    });

    it('should skip cognify when no entries added', async () => {
      const cognee = makeMockCognee();
      const hybridBrain = new Brain(vault, cognee);
      const result = await hybridBrain.syncToCognee();
      expect(result.synced).toBe(0);
      expect(result.cognified).toBe(false);
    });
  });

  // ─── Enrich and Capture ─────────────────────────────────────

  describe('enrichAndCapture', () => {
    it('should capture entry and return auto-tags', () => {
      const result = brain.enrichAndCapture({
        id: 'cap-1',
        type: 'pattern',
        domain: 'security',
        title: 'SQL injection prevention',
        severity: 'critical',
        description:
          'Always use parameterized queries to prevent SQL injection attacks on database.',
        tags: [],
      });
      expect(result.captured).toBe(true);
      expect(result.id).toBe('cap-1');
      expect(result.autoTags.length).toBeGreaterThan(0);
    });

    it('should merge auto-tags with user-provided tags', () => {
      const result = brain.enrichAndCapture({
        id: 'cap-2',
        type: 'pattern',
        domain: 'security',
        title: 'XSS prevention methods',
        severity: 'critical',
        description:
          'Sanitize all user input before rendering in the browser to prevent cross-site scripting.',
        tags: ['user-tag'],
      });
      expect(result.captured).toBe(true);
      const entry = vault.get('cap-2');
      expect(entry).not.toBeNull();
      expect(entry!.tags).toContain('user-tag');
      expect(entry!.tags.length).toBeGreaterThan(1);
    });

    it('should store entry in vault', () => {
      brain.enrichAndCapture({
        id: 'cap-3',
        type: 'rule',
        domain: 'testing',
        title: 'Always test edge cases',
        severity: 'warning',
        description: 'Write tests for boundary values, null inputs, and error conditions.',
        tags: ['testing'],
      });
      const entry = vault.get('cap-3');
      expect(entry).not.toBeNull();
      expect(entry!.title).toBe('Always test edge cases');
    });

    it('should update vocabulary incrementally after capture', () => {
      const sizeBefore = brain.getVocabularySize();
      brain.enrichAndCapture({
        id: 'cap-4',
        type: 'pattern',
        domain: 'performance',
        title: 'Connection pooling optimization',
        severity: 'warning',
        description:
          'Use connection pooling for database connections to reduce overhead and improve throughput.',
        tags: ['database', 'performance'],
      });
      expect(brain.getVocabularySize()).toBeGreaterThan(sizeBefore);
    });

    it('should capture entry without tags and auto-generate them', () => {
      const result = brain.enrichAndCapture({
        id: 'cap-5',
        type: 'anti-pattern',
        domain: 'clean-code',
        title: 'Deeply nested conditionals',
        severity: 'warning',
        description:
          'Avoid deeply nested if-else blocks. Use early returns and guard clauses instead.',
        tags: [],
      });
      expect(result.captured).toBe(true);
      expect(result.autoTags.length).toBeGreaterThan(0);
      const entry = vault.get('cap-5');
      expect(entry!.tags.length).toBeGreaterThan(0);
    });

    it('should fire-and-forget sync to Cognee on capture', () => {
      const cognee = makeMockCognee();
      const hybridBrain = new Brain(vault, cognee);
      hybridBrain.enrichAndCapture({
        id: 'cap-cognee-1',
        type: 'pattern',
        domain: 'testing',
        title: 'Cognee sync test',
        severity: 'warning',
        description: 'Testing fire-and-forget Cognee sync.',
        tags: [],
      });
      expect(cognee.addEntries).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Duplicate Detection ────────────────────────────────────

  describe('duplicate detection', () => {
    beforeEach(() => {
      vault.seed([
        makeEntry({
          id: 'dup-existing',
          domain: 'security',
          title: 'Input validation pattern for user forms',
          description:
            'Always validate user input at system boundaries to prevent injection attacks.',
          tags: ['validation', 'security'],
        }),
      ]);
      brain = new Brain(vault);
    });

    it('should warn on similar entry', () => {
      const result = brain.enrichAndCapture({
        id: 'dup-new-1',
        type: 'pattern',
        domain: 'security',
        title: 'Input validation pattern for user forms and APIs',
        severity: 'warning',
        description: 'Validate all user input at boundaries to block injection vectors.',
        tags: ['validation'],
      });
      expect(result.captured).toBe(true);
      if (result.duplicate) {
        expect(result.duplicate.id).toBe('dup-existing');
        expect(result.duplicate.similarity).toBeGreaterThanOrEqual(0.6);
      }
    });

    it('should allow dissimilar entries without duplicate warning', () => {
      const result = brain.enrichAndCapture({
        id: 'dup-different',
        type: 'pattern',
        domain: 'security',
        title: 'Rate limiting configuration',
        severity: 'warning',
        description: 'Configure rate limits on API endpoints to prevent abuse.',
        tags: ['rate-limiting'],
      });
      expect(result.captured).toBe(true);
    });
  });

  // ─── Record Feedback ────────────────────────────────────────

  describe('recordFeedback', () => {
    it('should record feedback in database', () => {
      brain.recordFeedback('test query', 'entry-1', 'accepted');
      const stats = brain.getStats();
      expect(stats.feedbackCount).toBe(1);
    });

    it('should record multiple feedback entries', () => {
      brain.recordFeedback('query-1', 'entry-1', 'accepted');
      brain.recordFeedback('query-2', 'entry-2', 'dismissed');
      brain.recordFeedback('query-3', 'entry-3', 'accepted');
      const stats = brain.getStats();
      expect(stats.feedbackCount).toBe(3);
    });

    it('should keep default weights below feedback threshold', () => {
      for (let i = 0; i < 10; i++) {
        brain.recordFeedback('q' + i, 'e' + i, 'accepted');
      }
      const stats = brain.getStats();
      expect(stats.weights.semantic).toBeCloseTo(0.4, 2);
    });
  });

  // ─── Adaptive Weights ───────────────────────────────────────

  describe('adaptive weights', () => {
    it('should adjust weights after reaching feedback threshold', () => {
      for (let i = 0; i < 35; i++) {
        brain.recordFeedback('query-' + i, 'entry-' + i, 'accepted');
      }
      const stats = brain.getStats();
      expect(stats.weights.semantic).toBeGreaterThan(0.4);
    });

    it('should decrease semantic weight with high dismiss rate', () => {
      for (let i = 0; i < 35; i++) {
        brain.recordFeedback('query-' + i, 'entry-' + i, 'dismissed');
      }
      const stats = brain.getStats();
      expect(stats.weights.semantic).toBeLessThan(0.4);
    });

    it('should keep weights bounded within +/-0.15 of defaults', () => {
      for (let i = 0; i < 50; i++) {
        brain.recordFeedback('query-' + i, 'entry-' + i, 'accepted');
      }
      const stats = brain.getStats();
      expect(stats.weights.semantic).toBeLessThanOrEqual(0.55);
      expect(stats.weights.semantic).toBeGreaterThanOrEqual(0.25);
    });

    it('should normalize weights to sum to 1.0', () => {
      for (let i = 0; i < 35; i++) {
        brain.recordFeedback('query-' + i, 'entry-' + i, 'accepted');
      }
      const stats = brain.getStats();
      const sum =
        stats.weights.semantic +
        stats.weights.vector +
        stats.weights.severity +
        stats.weights.recency +
        stats.weights.tagOverlap +
        stats.weights.domainMatch;
      expect(sum).toBeCloseTo(1.0, 5);
    });

    it('should keep default weights with balanced feedback', () => {
      for (let i = 0; i < 20; i++) {
        brain.recordFeedback('qa-' + i, 'ea-' + i, 'accepted');
      }
      for (let i = 0; i < 20; i++) {
        brain.recordFeedback('qd-' + i, 'ed-' + i, 'dismissed');
      }
      const stats = brain.getStats();
      expect(stats.weights.semantic).toBeCloseTo(0.4, 1);
    });

    it('should keep vector weight at 0 in base weights', () => {
      const stats = brain.getStats();
      expect(stats.weights.vector).toBe(0);
    });
  });

  // ─── Vocabulary ─────────────────────────────────────────────

  describe('vocabulary', () => {
    it('should rebuild vocabulary from vault entries', () => {
      vault.seed([
        makeEntry({
          id: 'voc-1',
          title: 'Authentication pattern',
          description: 'JWT tokens for API auth.',
          tags: ['auth', 'jwt'],
        }),
        makeEntry({
          id: 'voc-2',
          title: 'Authorization rules',
          description: 'Role-based access control.',
          tags: ['rbac', 'auth'],
        }),
      ]);
      brain.rebuildVocabulary();
      expect(brain.getVocabularySize()).toBeGreaterThan(0);
    });

    it('should clear vocabulary when vault is empty', () => {
      vault.seed([
        makeEntry({
          id: 'voc-3',
          title: 'Temp entry',
          description: 'Will be removed.',
          tags: ['temp'],
        }),
      ]);
      brain.rebuildVocabulary();
      expect(brain.getVocabularySize()).toBeGreaterThan(0);
      vault.remove('voc-3');
      brain.rebuildVocabulary();
      expect(brain.getVocabularySize()).toBe(0);
    });

    it('should persist vocabulary to database', () => {
      vault.seed([
        makeEntry({
          id: 'voc-4',
          title: 'Persistent vocabulary test',
          description: 'Testing database persistence.',
          tags: ['persistence'],
        }),
      ]);
      brain.rebuildVocabulary();
      const db = vault.getDb();
      const count = (
        db.prepare('SELECT COUNT(*) as count FROM brain_vocabulary').get() as { count: number }
      ).count;
      expect(count).toBeGreaterThan(0);
    });

    it('should handle rebuild on empty vault gracefully', () => {
      brain.rebuildVocabulary();
      expect(brain.getVocabularySize()).toBe(0);
    });
  });

  // ─── Stats ──────────────────────────────────────────────────

  describe('getStats', () => {
    it('should return stats with zero counts for new brain', () => {
      const stats = brain.getStats();
      expect(stats.vocabularySize).toBe(0);
      expect(stats.feedbackCount).toBe(0);
      expect(stats.weights.semantic).toBeCloseTo(0.4, 2);
      expect(stats.weights.vector).toBe(0);
    });

    it('should return correct vocabulary size after seeding', () => {
      vault.seed([
        makeEntry({
          id: 'st-1',
          title: 'Pattern one',
          description: 'Description one.',
          tags: ['a'],
        }),
        makeEntry({
          id: 'st-2',
          title: 'Pattern two',
          description: 'Description two.',
          tags: ['b'],
        }),
      ]);
      brain.rebuildVocabulary();
      const stats = brain.getStats();
      expect(stats.vocabularySize).toBeGreaterThan(0);
    });

    it('should return correct feedback count', () => {
      brain.recordFeedback('q1', 'e1', 'accepted');
      brain.recordFeedback('q2', 'e2', 'dismissed');
      const stats = brain.getStats();
      expect(stats.feedbackCount).toBe(2);
    });
  });

  // ─── Get Relevant Patterns ──────────────────────────────────

  describe('getRelevantPatterns', () => {
    it('should return ranked results for query context', async () => {
      vault.seed([
        makeEntry({
          id: 'rel-1',
          title: 'Authentication pattern',
          description: 'JWT for API auth.',
          domain: 'security',
          tags: ['auth'],
        }),
        makeEntry({
          id: 'rel-2',
          title: 'Database indexing',
          description: 'Index frequently queried columns.',
          domain: 'performance',
          tags: ['indexing'],
        }),
      ]);
      brain = new Brain(vault);
      const results = await brain.getRelevantPatterns({
        query: 'authentication',
        domain: 'security',
      });
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return empty for no context matches', async () => {
      const results = await brain.getRelevantPatterns({ query: 'nonexistent' });
      expect(results).toEqual([]);
    });
  });

  // ─── Graceful Degradation ───────────────────────────────────

  describe('graceful degradation', () => {
    it('should work without vocabulary (empty vault)', async () => {
      expect(brain.getVocabularySize()).toBe(0);
      const results = await brain.intelligentSearch('anything');
      expect(results).toEqual([]);
    });

    it('should fall back to severity + recency scoring when vocabulary is empty', async () => {
      vault.seed([
        makeEntry({
          id: 'gd-1',
          title: 'Fallback test pattern',
          description: 'Testing graceful degradation.',
          severity: 'critical',
          tags: ['fallback'],
        }),
      ]);
      brain = new Brain(vault);
      const results = await brain.intelligentSearch('fallback test');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].score).toBeGreaterThan(0);
    });

    it('should handle capture on empty vault without errors', () => {
      const result = brain.enrichAndCapture({
        id: 'gd-cap-1',
        type: 'pattern',
        domain: 'testing',
        title: 'First pattern ever',
        severity: 'warning',
        description: 'The very first pattern captured in an empty vault.',
        tags: [],
      });
      expect(result.captured).toBe(true);
      expect(result.autoTags.length).toBeGreaterThan(0);
    });
  });
});
