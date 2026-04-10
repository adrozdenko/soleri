import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Vault } from '../vault/vault.js';
import { Brain } from './brain.js';
import { LinkManager } from '../vault/linking.js';
import type { IntelligenceEntry } from '../intelligence/types.js';

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

    it('should include score breakdown with vector and graphProximity fields', async () => {
      const results = await brain.intelligentSearch('validation');
      expect(results.length).toBeGreaterThan(0);
      const breakdown = results[0].breakdown;
      expect(breakdown).toHaveProperty('semantic');
      expect(breakdown).toHaveProperty('vector');
      expect(breakdown).toHaveProperty('severity');
      expect(breakdown).toHaveProperty('temporalDecay');
      expect(breakdown).toHaveProperty('tagOverlap');
      expect(breakdown).toHaveProperty('domainMatch');
      expect(breakdown).toHaveProperty('graphProximity');
      expect(breakdown).toHaveProperty('total');
      expect(breakdown.total).toBe(results[0].score);
      expect(breakdown.vector).toBe(0);
      expect(breakdown.graphProximity).toBe(0);
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
      expect(stats.weights.semantic).toBeCloseTo(0.35, 2);
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
      expect(stats.weights.semantic).toBeLessThan(0.35);
    });

    it('should keep weights bounded within +/-0.15 of defaults', () => {
      for (let i = 0; i < 50; i++) {
        brain.recordFeedback('query-' + i, 'entry-' + i, 'accepted');
      }
      const stats = brain.getStats();
      expect(stats.weights.semantic).toBeLessThanOrEqual(0.5);
      expect(stats.weights.semantic).toBeGreaterThanOrEqual(0.2);
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
        stats.weights.temporalDecay +
        stats.weights.tagOverlap +
        stats.weights.domainMatch +
        stats.weights.graphProximity;
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
      expect(stats.weights.semantic).toBeCloseTo(0.35, 1);
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
      expect(stats.weights.semantic).toBeCloseTo(0.35, 2);
      expect(stats.weights.vector).toBe(0);
      expect(stats.weights.graphProximity).toBeCloseTo(0.15, 2);
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

  // ─── Enhanced Feedback ─────────────────────────────────────

  describe('enhanced feedback', () => {
    beforeEach(() => {
      vault.seed([makeEntry({ id: 'fb-1', title: 'Feedback test pattern', tags: ['feedback'] })]);
      brain = new Brain(vault);
    });

    it('should accept legacy 3-arg form (backward compat)', () => {
      brain.recordFeedback('test query', 'fb-1', 'accepted');
      const stats = brain.getFeedbackStats();
      expect(stats.total).toBe(1);
      expect(stats.byAction['accepted']).toBe(1);
    });

    it('should accept FeedbackInput and return FeedbackEntry', () => {
      const entry = brain.recordFeedback({
        query: 'test query',
        entryId: 'fb-1',
        action: 'modified',
        source: 'recommendation',
        confidence: 0.85,
        duration: 1200,
        reason: 'adjusted wording',
      });
      expect(entry).toBeDefined();
      expect(entry.action).toBe('modified');
      expect(entry.source).toBe('recommendation');
      expect(entry.confidence).toBe(0.85);
      expect(entry.duration).toBe(1200);
      expect(entry.reason).toBe('adjusted wording');
      expect(entry.id).toBeGreaterThan(0);
    });

    it('should accept modified and failed action types', () => {
      brain.recordFeedback({ query: 'q1', entryId: 'fb-1', action: 'modified' });
      brain.recordFeedback({ query: 'q2', entryId: 'fb-1', action: 'failed' });
      const stats = brain.getFeedbackStats();
      expect(stats.total).toBe(2);
      expect(stats.byAction['modified']).toBe(1);
      expect(stats.byAction['failed']).toBe(1);
    });

    it('should use default source and confidence when not provided', () => {
      const entry = brain.recordFeedback({ query: 'q1', entryId: 'fb-1', action: 'accepted' });
      expect(entry.source).toBe('search');
      expect(entry.confidence).toBe(0.6);
    });
  });

  // ─── Feedback Stats ───────────────────────────────────────

  describe('getFeedbackStats', () => {
    beforeEach(() => {
      vault.seed([makeEntry({ id: 'fs-1', tags: ['stats'] })]);
      brain = new Brain(vault);
    });

    it('should return zero stats on empty feedback', () => {
      const stats = brain.getFeedbackStats();
      expect(stats.total).toBe(0);
      expect(stats.acceptanceRate).toBe(0);
      expect(stats.averageConfidence).toBe(0);
    });

    it('should compute acceptance rate correctly', () => {
      brain.recordFeedback('q1', 'fs-1', 'accepted');
      brain.recordFeedback('q2', 'fs-1', 'dismissed');
      brain.recordFeedback('q3', 'fs-1', 'accepted');
      const stats = brain.getFeedbackStats();
      expect(stats.total).toBe(3);
      expect(stats.acceptanceRate).toBeCloseTo(2 / 3, 2);
    });

    it('should group by action and source', () => {
      brain.recordFeedback({ query: 'q1', entryId: 'fs-1', action: 'accepted', source: 'search' });
      brain.recordFeedback({
        query: 'q2',
        entryId: 'fs-1',
        action: 'modified',
        source: 'recommendation',
      });
      brain.recordFeedback({
        query: 'q3',
        entryId: 'fs-1',
        action: 'failed',
        source: 'tool-execution',
      });
      const stats = brain.getFeedbackStats();
      expect(stats.byAction['accepted']).toBe(1);
      expect(stats.byAction['modified']).toBe(1);
      expect(stats.byAction['failed']).toBe(1);
      expect(stats.bySource['search']).toBe(1);
      expect(stats.bySource['recommendation']).toBe(1);
      expect(stats.bySource['tool-execution']).toBe(1);
    });

    it('should compute average confidence', () => {
      brain.recordFeedback({ query: 'q1', entryId: 'fs-1', action: 'accepted', confidence: 0.9 });
      brain.recordFeedback({ query: 'q2', entryId: 'fs-1', action: 'dismissed', confidence: 0.3 });
      const stats = brain.getFeedbackStats();
      expect(stats.averageConfidence).toBeCloseTo(0.6, 2);
    });
  });

  // ─── Recompute Weights with Modified/Failed ──────────────

  describe('recomputeWeights with modified/failed', () => {
    beforeEach(() => {
      vault.seed([makeEntry({ id: 'rw-1', tags: ['weights'] })]);
      brain = new Brain(vault);
    });

    it('should exclude failed from weight computation', () => {
      // Add enough feedback to exceed threshold (30)
      for (let i = 0; i < 20; i++) {
        brain.recordFeedback('q', 'rw-1', 'accepted');
      }
      for (let i = 0; i < 10; i++) {
        brain.recordFeedback({ query: 'q', entryId: 'rw-1', action: 'failed' });
      }
      // Failed entries should not count toward total for weight adaptation
      // 20 accepted out of 20 relevant = 100% accept rate
      const stats = brain.getStats();
      // Weights should have adapted since we have 30+ total but only 20 non-failed
      // (threshold is 30, total is 30, but only 20 are non-failed so threshold not met)
      // The recomputeWeights() counts non-failed, which is 20 < 30, so weights stay default
      expect(stats.weights.semantic).toBeCloseTo(0.35, 2);
    });
  });

  // ─── Graceful Degradation ───────────────────────────────────

  describe('graceful degradation', () => {
    it('should work without vocabulary (empty vault)', async () => {
      expect(brain.getVocabularySize()).toBe(0);
      const results = await brain.intelligentSearch('anything');
      expect(results).toEqual([]);
    });

    it('should fall back to severity + temporalDecay scoring when vocabulary is empty', async () => {
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

  // ─── Graph Proximity Scoring ────────────────────────────────────

  describe('graph proximity scoring', () => {
    let linkManager: LinkManager;

    beforeEach(() => {
      vault.seed([
        makeEntry({
          id: 'gp-1',
          title: 'Input validation pattern',
          description: 'Always validate user input at system boundaries.',
          domain: 'security',
          severity: 'critical',
          tags: ['validation', 'security'],
        }),
        makeEntry({
          id: 'gp-2',
          title: 'SQL injection prevention',
          description: 'Parameterize queries to prevent SQL injection attacks.',
          domain: 'security',
          severity: 'critical',
          tags: ['sql', 'security'],
        }),
        makeEntry({
          id: 'gp-3',
          title: 'XSS prevention guide',
          description: 'Escape output to prevent cross-site scripting vulnerabilities.',
          domain: 'security',
          severity: 'warning',
          tags: ['xss', 'security'],
        }),
        makeEntry({
          id: 'gp-4',
          title: 'Caching strategy for APIs',
          description: 'Use cache-aside pattern for read-heavy API workloads.',
          domain: 'performance',
          severity: 'suggestion',
          tags: ['caching', 'api'],
        }),
      ]);
      linkManager = new LinkManager(vault.getProvider());
    });

    it('should boost directly linked entries', async () => {
      // Link gp-1 → gp-2 (directly related security patterns)
      linkManager.addLink('gp-1', 'gp-2', 'supports');

      const brainWithLinks = new Brain(vault, undefined, undefined, linkManager);
      const results = await brainWithLinks.intelligentSearch('input validation security');

      // gp-2 should have a non-zero graphProximity because it's linked to gp-1 (top result)
      const gp2 = results.find((r) => r.entry.id === 'gp-2');
      expect(gp2).toBeDefined();
      expect(gp2!.breakdown.graphProximity).toBeGreaterThan(0);
    });

    it('should give higher proximity to direct links than depth-2', async () => {
      // Set up isolated entries where only one matches the query strongly
      const isolatedVault = new Vault(':memory:');
      isolatedVault.seed([
        makeEntry({
          id: 'dp-1',
          title: 'Input validation pattern',
          description: 'Always validate user input at system boundaries.',
          domain: 'security',
          severity: 'critical',
          tags: ['validation'],
        }),
        makeEntry({
          id: 'dp-2',
          title: 'Middleware chaining technique',
          description: 'Chain middleware functions for layered processing.',
          domain: 'architecture',
          severity: 'suggestion',
          tags: ['middleware'],
        }),
        makeEntry({
          id: 'dp-3',
          title: 'Rate limiting strategy',
          description: 'Throttle requests to protect backend resources.',
          domain: 'infrastructure',
          severity: 'suggestion',
          tags: ['rate-limiting'],
        }),
      ]);
      const isolatedLM = new LinkManager(isolatedVault.getProvider());
      // Chain: dp-1 → dp-2 → dp-3
      isolatedLM.addLink('dp-1', 'dp-2', 'supports');
      isolatedLM.addLink('dp-2', 'dp-3', 'extends');

      const brainWithLinks = new Brain(isolatedVault, undefined, undefined, isolatedLM);
      // Query matches dp-1 strongly — dp-2 and dp-3 have no keyword overlap
      const results = await brainWithLinks.intelligentSearch('input validation');

      const dp2 = results.find((r) => r.entry.id === 'dp-2');
      const dp3 = results.find((r) => r.entry.id === 'dp-3');
      expect(dp2).toBeDefined();
      expect(dp3).toBeDefined();
      // Direct link (distance 1) = 0.5, depth-2 (distance 2) = 0.33
      expect(dp2!.breakdown.graphProximity).toBeGreaterThan(dp3!.breakdown.graphProximity);
      isolatedVault.close();
    });

    it('should gracefully degrade without LinkManager', async () => {
      const brainNoLinks = new Brain(vault);
      const results = await brainNoLinks.intelligentSearch('input validation security');
      expect(results.length).toBeGreaterThan(0);
      // All graphProximity should be 0
      for (const r of results) {
        expect(r.breakdown.graphProximity).toBe(0);
      }
    });

    it('should handle circular links without infinite loops', async () => {
      // Create a cycle: gp-1 → gp-2 → gp-3 → gp-1
      linkManager.addLink('gp-1', 'gp-2', 'supports');
      linkManager.addLink('gp-2', 'gp-3', 'extends');
      linkManager.addLink('gp-3', 'gp-1', 'extends');

      const brainWithLinks = new Brain(vault, undefined, undefined, linkManager);
      // Should not hang or throw
      const results = await brainWithLinks.intelligentSearch('input validation security');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should not boost unlinked entries', async () => {
      // Only link gp-1 → gp-2, gp-4 is isolated
      linkManager.addLink('gp-1', 'gp-2', 'supports');

      const brainWithLinks = new Brain(vault, undefined, undefined, linkManager);
      const results = await brainWithLinks.intelligentSearch('input validation security');

      const gp4 = results.find((r) => r.entry.id === 'gp-4');
      if (gp4) {
        expect(gp4.breakdown.graphProximity).toBe(0);
      }
    });
  });
});
