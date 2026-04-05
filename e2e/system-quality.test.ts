/**
 * E2E: System Quality — Deeper Behavioral Tests
 *
 * Tests vault-informed orchestration, brain recommendation quality at scale,
 * LLM graceful degradation, search quality stress, and concurrent operations.
 *
 * Uses in-memory vault, same captureHandler/op/parseEnvelope pattern as
 * agent-simulation.test.ts.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createAgentRuntime,
  createSemanticFacades,
  createDomainFacades,
  registerFacade,
  seedDefaultPlaybooks,
} from '@soleri/core';
import type { FacadeConfig, AgentRuntime } from '@soleri/core';

// ─── Infrastructure ──────────────────────────────────────

const AGENT_ID = 'sq-agent';

function captureHandler(facade: FacadeConfig) {
  let captured:
    | ((args: { op: string; params: Record<string, unknown> }) => Promise<{
        content: Array<{ type: string; text: string }>;
      }>)
    | null = null;
  const mockServer = {
    tool: (_name: string, _desc: string, _schema: unknown, handler: unknown) => {
      captured = handler as typeof captured;
    },
  };
  registerFacade(mockServer as never, facade);
  return captured!;
}

function parse(raw: { content: Array<{ type: string; text: string }> }): Record<string, unknown> {
  return JSON.parse(raw.content[0].text);
}

// ─── Shared State ────────────────────────────────────────

let runtime: AgentRuntime;
let handlers: Map<string, ReturnType<typeof captureHandler>>;
const workDir = join(tmpdir(), `soleri-sq-${Date.now()}`);

async function op(facade: string, opName: string, params: Record<string, unknown> = {}) {
  const h = handlers.get(`${AGENT_ID}_${facade}`);
  if (!h) throw new Error(`No facade: ${facade}. Available: ${[...handlers.keys()].join(', ')}`);
  const raw = parse(await h({ op: opName, params }));
  if (raw.success === false) {
    return { _success: false, _error: raw.error, ...((raw.data as Record<string, unknown>) ?? {}) };
  }
  return raw.data as Record<string, unknown>;
}

async function opRaw(facade: string, opName: string, params: Record<string, unknown> = {}) {
  const h = handlers.get(`${AGENT_ID}_${facade}`);
  if (!h) throw new Error(`No facade: ${facade}`);
  return parse(await h({ op: opName, params }));
}

// ─── Helpers ─────────────────────────────────────────────

const DOMAINS = [
  'frontend',
  'backend',
  'security',
  'testing',
  'devops',
  'database',
  'api-design',
  'performance',
  'monitoring',
  'infrastructure',
];

function makePattern(domain: string, index: number, vocabulary: string[]) {
  return {
    type: 'pattern' as const,
    domain,
    title: `${domain} pattern ${index}: ${vocabulary.join(' ')}`,
    description: `Best practice for ${domain} involving ${vocabulary.join(', ')}. This pattern addresses common ${domain} challenges with proven solutions.`,
    severity: 'warning' as const,
    tags: [domain, ...vocabulary.slice(0, 2)],
  };
}

// Domain-specific vocabularies for search quality testing
const DOMAIN_VOCAB: Record<string, string[][]> = {
  frontend: [
    ['component', 'rendering', 'virtual-dom'],
    ['state-management', 'reducer', 'context'],
    ['lazy-loading', 'code-splitting', 'bundle'],
    ['accessibility', 'aria', 'screen-reader'],
    ['responsive', 'breakpoint', 'media-query'],
  ],
  backend: [
    ['middleware', 'pipeline', 'request-handler'],
    ['authentication', 'jwt', 'session'],
    ['rate-limiting', 'throttle', 'backpressure'],
    ['queue', 'worker', 'background-job'],
    ['logging', 'structured', 'correlation-id'],
  ],
  security: [
    ['csrf', 'token', 'origin-check'],
    ['xss', 'sanitization', 'content-policy'],
    ['encryption', 'aes', 'key-rotation'],
    ['rbac', 'permission', 'role-hierarchy'],
    ['audit-log', 'compliance', 'immutable'],
  ],
  testing: [
    ['unit-test', 'mock', 'isolation'],
    ['integration', 'test-container', 'database-seed'],
    ['snapshot', 'visual-regression', 'diff'],
    ['coverage', 'branch', 'mutation-testing'],
    ['e2e', 'playwright', 'selector-strategy'],
  ],
  devops: [
    ['ci-cd', 'pipeline', 'artifact'],
    ['container', 'dockerfile', 'multi-stage'],
    ['terraform', 'infrastructure-as-code', 'drift'],
    ['monitoring', 'alerting', 'slo'],
    ['rollback', 'canary', 'blue-green'],
  ],
  database: [
    ['index', 'query-plan', 'explain-analyze'],
    ['migration', 'schema-version', 'rollback'],
    ['connection-pool', 'max-connections', 'idle-timeout'],
    ['replication', 'read-replica', 'failover'],
    ['partitioning', 'sharding', 'range-key'],
  ],
  'api-design': [
    ['versioning', 'backward-compatible', 'deprecation'],
    ['pagination', 'cursor', 'offset-limit'],
    ['idempotency', 'retry-safe', 'dedup-key'],
    ['openapi', 'schema-validation', 'contract'],
    ['graphql', 'resolver', 'dataloader'],
  ],
  performance: [
    ['caching', 'ttl', 'invalidation'],
    ['profiling', 'flame-graph', 'bottleneck'],
    ['memory-leak', 'heap-snapshot', 'gc-pressure'],
    ['latency', 'p99', 'percentile'],
    ['throughput', 'concurrency', 'saturation'],
  ],
  monitoring: [
    ['tracing', 'span', 'propagation'],
    ['metric', 'counter', 'histogram'],
    ['dashboard', 'grafana', 'panel'],
    ['incident', 'runbook', 'escalation'],
    ['synthetic', 'health-check', 'probe'],
  ],
  infrastructure: [
    ['load-balancer', 'health-check', 'sticky-session'],
    ['dns', 'ttl', 'failover'],
    ['cdn', 'edge', 'cache-purge'],
    ['kubernetes', 'pod', 'horizontal-scaling'],
    ['secrets-manager', 'vault-rotation', 'envelope-encryption'],
  ],
};

// ═══════════════════════════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════════════════════════

describe('System Quality Tests', () => {
  beforeAll(() => {
    mkdirSync(workDir, { recursive: true });

    runtime = createAgentRuntime({
      agentId: AGENT_ID,
      vaultPath: ':memory:',
      plansPath: join(workDir, 'plans.json'),
    });

    const semanticFacades = createSemanticFacades(runtime, AGENT_ID);
    const domainFacades = createDomainFacades(runtime, AGENT_ID, [
      'frontend',
      'backend',
      'infrastructure',
    ]);
    const allFacades = [...semanticFacades, ...domainFacades];

    handlers = new Map();
    for (const facade of allFacades) {
      handlers.set(facade.name, captureHandler(facade));
    }

    seedDefaultPlaybooks(runtime.vault);
  });

  afterAll(() => {
    runtime.close();
    rmSync(workDir, { recursive: true, force: true });
  });

  // ═══════════════════════════════════════════════════════════
  //  SECTION 1: Vault-Informed Orchestration
  // ═══════════════════════════════════════════════════════════

  describe('Section 1: Vault-Informed Orchestration', () => {
    const dbPatternIds: string[] = [];

    it('1.1 Seed vault with 5 database optimization patterns', async () => {
      const res = await op('vault', 'capture_knowledge', {
        entries: [
          {
            type: 'pattern',
            domain: 'database',
            title: 'Use composite indexes for multi-column WHERE clauses',
            description:
              'When queries filter on multiple columns, a composite index matching the column order eliminates full table scans. Column order should follow selectivity — most selective first.',
            severity: 'critical',
            tags: ['database', 'indexing', 'optimization', 'query-plan'],
          },
          {
            type: 'pattern',
            domain: 'database',
            title: 'Enable query plan caching to avoid repeated parsing',
            description:
              'Prepared statements and query plan caching reduce CPU overhead from repeated query parsing. Parameterized queries also prevent SQL injection.',
            severity: 'warning',
            tags: ['database', 'optimization', 'caching', 'prepared-statements'],
          },
          {
            type: 'pattern',
            domain: 'database',
            title: 'Partition large tables by date range for faster scans',
            description:
              'Range partitioning on timestamp columns allows the query planner to skip irrelevant partitions. Especially effective for time-series data with queries filtering by date.',
            severity: 'warning',
            tags: ['database', 'partitioning', 'optimization', 'time-series'],
          },
          {
            type: 'anti-pattern',
            domain: 'database',
            title: 'Avoid SELECT star in production queries',
            description:
              'SELECT * fetches all columns including BLOBs and unused fields, increasing I/O and network transfer. Always specify the exact columns needed.',
            severity: 'critical',
            tags: ['database', 'query', 'optimization', 'anti-pattern'],
          },
          {
            type: 'pattern',
            domain: 'database',
            title: 'Use connection pooling to reduce connection overhead',
            description:
              'Connection pooling reuses database connections instead of creating new ones per request. PgBouncer or built-in pool managers reduce latency by 10-50x for short queries.',
            severity: 'warning',
            tags: ['database', 'connection-pool', 'optimization', 'performance'],
          },
        ],
      });

      expect(res.captured).toBe(5);
      expect(res.proposed).toBe(0);
      expect(res.rejected).toBe(0);
      const results = res.results as Array<{ id: string; action: string }>;
      expect(results.length).toBe(5);
      for (const r of results) {
        expect(r.action).toBe('capture');
        expect(typeof r.id).toBe('string');
        expect(r.id.length).toBeGreaterThan(0);
        dbPatternIds.push(r.id);
      }
    });

    it('1.2 orchestrate_plan for "optimize database queries" includes vault recommendations', async () => {
      const res = await op('orchestrate', 'orchestrate_plan', {
        prompt: 'optimize our database queries for better performance',
        scope: 'Database optimization sprint',
        domain: 'database',
      });

      const plan = res.plan as Record<string, unknown>;
      expect(plan).toBeDefined();
      expect(typeof plan.id).toBe('string');
      expect(typeof plan.objective).toBe('string');

      const flow = res.flow as Record<string, unknown>;
      expect(flow).toBeDefined();
      expect(typeof flow.planId).toBe('string');
      expect(typeof flow.intent).toBe('string');
      expect(typeof flow.stepsCount).toBe('number');

      const recommendations = res.recommendations as Array<{ pattern: string; strength: number }>;
      expect(Array.isArray(recommendations)).toBe(true);
      // orchestrate_plan searches vault when brain has no recommendations
      // It falls back to vault.search and returns patterns with strength=50
      expect(recommendations.length).toBeGreaterThan(0);

      // At least one recommendation should reference database-related knowledge
      const dbRelated = recommendations.some(
        (r) =>
          r.pattern.toLowerCase().includes('database') ||
          r.pattern.toLowerCase().includes('index') ||
          r.pattern.toLowerCase().includes('query') ||
          r.pattern.toLowerCase().includes('pool') ||
          r.pattern.toLowerCase().includes('partition'),
      );
      expect(dbRelated).toBe(true);

      // Vault recommendations have strength > 0 (80 for standard, 100 for critical)
      const vaultRecs = recommendations.filter((r) => r.strength > 0);
      expect(vaultRecs.length).toBeGreaterThan(0);
    });

    it('1.3 orchestrate_plan flow has correct intent detection', async () => {
      const res = await op('orchestrate', 'orchestrate_plan', {
        prompt: 'optimize our database queries for better performance',
        domain: 'database',
      });

      const flow = res.flow as Record<string, unknown>;
      // "optimize" should match ENHANCE intent
      expect(flow.intent).toBe('ENHANCE');
      expect(typeof flow.planId).toBe('string');
      expect(typeof flow.stepsCount).toBe('number');
      expect(flow.stepsCount as number).toBeGreaterThanOrEqual(0);
      expect(typeof flow.flowId).toBe('string');
      expect(Array.isArray(flow.warnings)).toBe(true);
    });

    it('1.4 Plan decisions include brain/vault pattern strings', async () => {
      const res = await op('orchestrate', 'orchestrate_plan', {
        prompt: 'optimize database indexes and connection pooling',
        domain: 'database',
        tasks: [
          {
            title: 'Audit existing indexes',
            description: 'Review EXPLAIN ANALYZE output for all slow queries',
          },
          {
            title: 'Set up connection pooling',
            description: 'Configure PgBouncer with transaction mode',
          },
        ],
      });

      const plan = res.plan as Record<string, unknown>;
      expect(typeof plan.id).toBe('string');
      expect(typeof plan.objective).toBe('string');
      // Decisions are populated from recommendations (orchestrate-ops.ts)
      const decisions = plan.decisions as string[];
      expect(Array.isArray(decisions)).toBe(true);
      expect(decisions.length).toBeGreaterThan(0);
      // Each decision is prefixed with "Brain pattern:" or "Vault pattern:"
      const hasPatternPrefix = decisions.some(
        (d) => d.startsWith('Brain pattern:') || d.startsWith('Vault pattern:'),
      );
      expect(hasPatternPrefix).toBe(true);
      // Decisions contain strength scores
      const hasStrength = decisions.some((d) => /\(strength: \d+\.?\d*\)/.test(d));
      expect(hasStrength).toBe(true);
    });

    it('1.5 Capture new caching knowledge', async () => {
      const res = await op('vault', 'capture_knowledge', {
        entries: [
          {
            type: 'pattern',
            domain: 'performance',
            title: 'Use Redis with LRU eviction for application-level caching',
            description:
              'Redis with maxmemory-policy allkeys-lru provides automatic eviction of least recently used keys when memory fills up. Set TTL on all keys to prevent stale data.',
            severity: 'warning',
            tags: ['caching', 'redis', 'performance', 'lru'],
          },
          {
            type: 'pattern',
            domain: 'performance',
            title: 'Cache invalidation via pub-sub for distributed systems',
            description:
              'Use Redis pub/sub or event bus to broadcast cache invalidation events across service instances. Prevents serving stale data after writes.',
            severity: 'warning',
            tags: ['caching', 'distributed', 'pub-sub', 'invalidation'],
          },
        ],
      });

      expect(res.captured).toBe(2);
      expect(res.proposed).toBe(0);
      expect(res.rejected).toBe(0);
      const results = res.results as Array<{ id: string; action: string }>;
      expect(results.length).toBe(2);
      for (const r of results) {
        expect(r.action).toBe('capture');
      }
    });

    it('1.6 orchestrate_plan for "add caching layer" includes new caching knowledge', async () => {
      const res = await op('orchestrate', 'orchestrate_plan', {
        prompt: 'add a caching layer with Redis to improve API response times',
        domain: 'performance',
      });

      const recommendations = res.recommendations as Array<{ pattern: string; strength: number; entryId?: string }>;
      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations.length).toBeGreaterThan(0);

      // Verify recommendation shape: each has pattern and strength
      for (const r of recommendations) {
        expect(typeof r.pattern).toBe('string');
        expect(typeof r.strength).toBe('number');
      }

      // Should find the newly captured caching patterns
      const cachingRelated = recommendations.some(
        (r) =>
          r.pattern.toLowerCase().includes('caching') ||
          r.pattern.toLowerCase().includes('redis') ||
          r.pattern.toLowerCase().includes('cache') ||
          r.pattern.toLowerCase().includes('lru'),
      );
      expect(cachingRelated).toBe(true);
    });

    it('1.7 Vault search confirms both database and caching patterns exist', async () => {
      const dbResults = await op('vault', 'search', {
        query: 'database index optimization query plan',
      });
      const dbArr = dbResults as unknown as Array<{ entry: { title: string }; score: number }>;
      expect(Array.isArray(dbArr)).toBe(true);
      expect(dbArr.length).toBeGreaterThan(0);

      const cacheResults = await op('vault', 'search', { query: 'redis caching lru eviction' });
      const cacheArr = cacheResults as unknown as Array<{
        entry: { title: string };
        score: number;
      }>;
      expect(Array.isArray(cacheArr)).toBe(true);
      expect(cacheArr.length).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  SECTION 2: Brain Recommendation Quality at Scale
  // ═══════════════════════════════════════════════════════════

  describe('Section 2: Brain Recommendation Quality at Scale', () => {
    const patternIds: Map<string, string[]> = new Map();

    it('2.1 Seed vault with 30 patterns across 5 domains', async () => {
      const domains = ['frontend', 'backend', 'security', 'testing', 'devops'];

      for (const domain of domains) {
        const vocabs = DOMAIN_VOCAB[domain];
        const entries = vocabs.map((vocab, i) => makePattern(domain, i, vocab));

        const res = await op('vault', 'capture_knowledge', { entries });
        expect(res.captured).toBeGreaterThanOrEqual(entries.length - 1); // allow 1 possible dedup

        const results = res.results as Array<{ id: string; action: string }>;
        const ids = results.filter((r) => r.action === 'capture').map((r) => r.id);
        patternIds.set(domain, ids);
      }

      // Total patterns seeded across 5 domains
      let totalSeeded = 0;
      for (const ids of patternIds.values()) {
        totalSeeded += ids.length;
      }
      expect(totalSeeded).toBeGreaterThanOrEqual(20); // at least 4 per domain
    });

    it('2.2 Initial brain_recommend has weak/no recommendations (no feedback yet)', async () => {
      const res = await op('brain', 'brain_recommend', {
        domain: 'frontend',
        task: 'building a component library',
      });

      // brain_recommend returns PatternStrength[] directly
      const results = res as unknown as Array<{ pattern: string; strength: number }>;
      expect(Array.isArray(results)).toBe(true);
      // No feedback recorded yet, so strengths should be default/zero
      // It may still return patterns but with low/uniform strength
    });

    it('2.3 Session 1: Accept 5 frontend patterns, dismiss 3 backend patterns', async () => {
      const frontendIds = patternIds.get('frontend') ?? [];
      const backendIds = patternIds.get('backend') ?? [];

      // Accept frontend patterns
      for (const id of frontendIds.slice(0, 5)) {
        const res = await op('brain', 'brain_feedback', {
          query: 'frontend component patterns',
          entryId: id,
          action: 'accepted',
          source: 'search',
          confidence: 0.9,
        });
        expect(res.id).toBeDefined();
        expect(res.action).toBe('accepted');
      }

      // Dismiss backend patterns
      for (const id of backendIds.slice(0, 3)) {
        const res = await op('brain', 'brain_feedback', {
          query: 'frontend component patterns',
          entryId: id,
          action: 'dismissed',
          source: 'search',
          confidence: 0.3,
        });
        expect(res.id).toBeDefined();
        expect(res.action).toBe('dismissed');
      }
    });

    it('2.4 Session 2: Accept 3 security patterns, dismiss 2 frontend patterns', async () => {
      const securityIds = patternIds.get('security') ?? [];
      const frontendIds = patternIds.get('frontend') ?? [];

      for (const id of securityIds.slice(0, 3)) {
        await op('brain', 'brain_feedback', {
          query: 'security hardening',
          entryId: id,
          action: 'accepted',
          source: 'recommendation',
          confidence: 0.85,
        });
      }

      for (const id of frontendIds.slice(3, 5)) {
        await op('brain', 'brain_feedback', {
          query: 'security hardening',
          entryId: id,
          action: 'dismissed',
          source: 'recommendation',
          confidence: 0.4,
        });
      }
    });

    it('2.5 Session 3: Accept 4 backend patterns (user learned backend)', async () => {
      const backendIds = patternIds.get('backend') ?? [];

      for (const id of backendIds.slice(0, 4)) {
        await op('brain', 'brain_feedback', {
          query: 'backend service architecture',
          entryId: id,
          action: 'accepted',
          source: 'search',
          confidence: 0.88,
        });
      }
    });

    it('2.6 Rebuild vocabulary after feedback sessions', async () => {
      const res = await op('brain', 'rebuild_vocabulary');
      expect(res.rebuilt).toBe(true);
      expect(res.vocabularySize).toBeGreaterThan(0);
    });

    it('2.7 Build intelligence from accumulated feedback', async () => {
      const res = await op('brain', 'brain_build_intelligence');
      expect(typeof res.strengthsComputed).toBe('number');
      // After 17 feedback entries across multiple patterns, strength computation must produce results
      expect(res.strengthsComputed as number).toBeGreaterThan(0);
    });

    it('2.8 brain_strengths shows patterns sorted by actual strength', async () => {
      const res = await op('brain', 'brain_strengths', { limit: 30 });
      const strengths = res as unknown as Array<{
        pattern: string;
        strength: number;
        domain?: string;
      }>;
      expect(Array.isArray(strengths)).toBe(true);

      // After 17 feedback entries, there must be at least 2 patterns with computed strengths
      expect(strengths.length).toBeGreaterThanOrEqual(2);

      // Should be sorted descending by strength
      for (let i = 1; i < strengths.length; i++) {
        expect(strengths[i - 1].strength).toBeGreaterThanOrEqual(strengths[i].strength);
      }

      // Strength values should NOT all be identical (they differ by feedback signals)
      const uniqueStrengths = new Set(strengths.map((s) => s.strength));
      expect(uniqueStrengths.size).toBeGreaterThan(1);
    });

    it('2.9 brain_recommend for frontend ranks accepted patterns high', async () => {
      const res = await op('brain', 'brain_recommend', {
        domain: 'frontend',
        task: 'building frontend components',
        limit: 10,
      });

      const results = res as unknown as Array<{
        pattern: string;
        strength: number;
        domain?: string;
      }>;
      expect(Array.isArray(results)).toBe(true);
      // With 5 frontend feedback entries, must return recommendations
      expect(results.length).toBeGreaterThan(0);
      // At least one recommendation should be from the frontend domain
      const hasFrontend = results.some(
        (r) =>
          r.pattern?.toLowerCase().includes('component') ||
          r.pattern?.toLowerCase().includes('rendering') ||
          r.pattern?.toLowerCase().includes('frontend') ||
          r.domain === 'frontend',
      );
      expect(hasFrontend).toBe(true);
    });

    it('2.10 brain_recommend for security ranks accepted patterns', async () => {
      const res = await op('brain', 'brain_recommend', {
        domain: 'security',
        task: 'security hardening and access control',
        limit: 10,
      });

      const results = res as unknown as Array<{
        pattern: string;
        strength: number;
        domain?: string;
      }>;
      expect(Array.isArray(results)).toBe(true);
      // With 3 security feedback entries, must return recommendations
      expect(results.length).toBeGreaterThan(0);
      // At least one recommendation should be from the security domain
      const hasSecurity = results.some(
        (r) =>
          r.pattern?.toLowerCase().includes('security') ||
          r.pattern?.toLowerCase().includes('csrf') ||
          r.pattern?.toLowerCase().includes('xss') ||
          r.pattern?.toLowerCase().includes('encryption') ||
          r.domain === 'security',
      );
      expect(hasSecurity).toBe(true);
    });

    it('2.11 brain_stats reflects all accumulated feedback', async () => {
      const res = await op('brain', 'brain_stats');

      // 5 frontend accepted + 3 backend dismissed + 3 security accepted + 2 frontend dismissed + 4 backend accepted = 17
      expect(res.feedbackCount).toBeGreaterThanOrEqual(17);
      expect(res.vocabularySize).toBeGreaterThan(0);

      const intelligence = res.intelligence as { sessions: number; strengths: number };
      expect(intelligence.strengths).toBeGreaterThan(0);
    });

    it('2.12 brain_feedback_stats shows correct action distribution', async () => {
      const res = await op('brain', 'brain_feedback_stats');

      expect(typeof res.total).toBe('number');
      expect(res.total as number).toBeGreaterThanOrEqual(17);
      const byAction = res.byAction as Record<string, number>;
      expect(byAction.accepted).toBeGreaterThanOrEqual(12); // 5 + 3 + 4
      expect(byAction.dismissed).toBeGreaterThanOrEqual(5); // 3 + 2
      // acceptanceRate = accepted / total, so 12/17 ≈ 0.706
      expect(typeof res.acceptanceRate).toBe('number');
      expect(res.acceptanceRate as number).toBeGreaterThan(0.5);
      expect(res.acceptanceRate as number).toBeLessThanOrEqual(1);
      // bySource should also be populated
      const bySource = res.bySource as Record<string, number>;
      expect(typeof bySource).toBe('object');
      expect(bySource.search).toBeGreaterThanOrEqual(1);
      expect(bySource.recommendation).toBeGreaterThanOrEqual(1);
      // averageConfidence should be between 0 and 1
      expect(typeof res.averageConfidence).toBe('number');
      expect(res.averageConfidence as number).toBeGreaterThan(0);
      expect(res.averageConfidence as number).toBeLessThanOrEqual(1);
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  SECTION 3: LLM Graceful Degradation
  // ═══════════════════════════════════════════════════════════

  describe('Section 3: LLM Graceful Degradation', () => {
    it('3.1 admin_health reports LLM availability status', async () => {
      const res = await op('admin', 'admin_health');

      expect(res.status).toBe('ok');
      // Vault stats
      const vault = res.vault as { entries: number; domains: string[] };
      expect(typeof vault.entries).toBe('number');
      expect(vault.entries).toBeGreaterThan(0);
      expect(Array.isArray(vault.domains)).toBe(true);
      // LLM availability
      const llm = res.llm as { openai: boolean; anthropic: boolean };
      expect(typeof llm.openai).toBe('boolean');
      expect(typeof llm.anthropic).toBe('boolean');
      // Brain stats
      const brain = res.brain as { vocabularySize: number; feedbackCount: number };
      expect(typeof brain.vocabularySize).toBe('number');
      expect(typeof brain.feedbackCount).toBe('number');
      // Curator
      const curator = res.curator as { initialized: boolean };
      expect(typeof curator.initialized).toBe('boolean');
    });

    it('3.2 brain_recommend works without LLM — returns TF-IDF results', async () => {
      const res = await op('brain', 'brain_recommend', {
        domain: 'frontend',
        task: 'component rendering optimization',
      });

      // Should not crash — returns PatternStrength[] (possibly empty) using TF-IDF
      const results = res as unknown as Array<{ pattern: string; strength: number }>;
      expect(Array.isArray(results)).toBe(true);
      // No LLM needed for pattern strength computation
    });

    it('3.3 route_intent works without LLM — keyword routing', async () => {
      const res = await op('control', 'route_intent', {
        prompt: 'fix the broken authentication flow',
      });

      expect(res.intent).toBe('fix');
      expect(res.mode).toBe('FIX-MODE');
      expect(typeof res.confidence).toBe('number');
      expect(res.confidence as number).toBeGreaterThan(0);
      expect(res.method).toBe('keyword');
      expect(Array.isArray(res.matchedKeywords)).toBe(true);
      const matched = res.matchedKeywords as string[];
      expect(matched.length).toBeGreaterThan(0);
      // "fix" and "broken" should be among matched keywords
      expect(matched.some((k) => k === 'fix' || k === 'broken')).toBe(true);
    });

    it('3.4 Vault search works without LLM — pure FTS5', async () => {
      const res = await op('vault', 'search', {
        query: 'database optimization index',
      });

      const results = res as unknown as Array<{ entry: { title: string }; score: number }>;
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      // FTS5 search is SQLite-native, no LLM needed
    });

    it('3.5 Plan creation works without LLM — pure logic', async () => {
      const res = await op('plan', 'create_plan', {
        objective: 'Add input validation to all API endpoints',
        scope: 'Backend security hardening',
        tasks: [
          {
            title: 'Add Zod schemas',
            description: 'Define validation schemas for all request bodies',
          },
        ],
      });

      expect(res.created).toBe(true);
      const plan = res.plan as Record<string, unknown>;
      expect(typeof plan.id).toBe('string');
      expect(plan.status).toBe('draft');
      expect(typeof plan.objective).toBe('string');
      expect(plan.objective).toBe('Add input validation to all API endpoints');
    });

    it('3.6 llm_status op reports correct state', async () => {
      const res = await op('brain', 'llm_status');

      const providers = res.providers as Record<string, { available: boolean; keyPool: unknown }>;
      expect(typeof providers.openai.available).toBe('boolean');
      expect(typeof providers.anthropic.available).toBe('boolean');
      // In test env, no API keys — keyPool should be null
      // (or have status if keys are configured)
      expect(providers.openai.keyPool === null || typeof providers.openai.keyPool === 'object').toBe(
        true,
      );
      const routes = res.routes as Array<unknown>;
      expect(Array.isArray(routes)).toBe(true);
    });

    it('3.7 admin_diagnostic reports LLM provider status', async () => {
      const res = await op('admin', 'admin_diagnostic');

      // Overall is derived from check statuses
      expect(['healthy', 'degraded', 'unhealthy']).toContain(res.overall);
      expect(typeof res.summary).toBe('string');
      const checks = res.checks as Array<{ name: string; status: string; detail: string }>;
      expect(Array.isArray(checks)).toBe(true);

      // Verify all expected check names are present
      const checkNames = checks.map((c) => c.name);
      expect(checkNames).toContain('vault');
      expect(checkNames).toContain('brain_vocabulary');
      expect(checkNames).toContain('brain_intelligence');
      expect(checkNames).toContain('llm_openai');
      expect(checkNames).toContain('llm_anthropic');
      expect(checkNames).toContain('curator');

      // Verify check shapes
      for (const check of checks) {
        expect(['ok', 'warn', 'error']).toContain(check.status);
        expect(typeof check.detail).toBe('string');
        expect(check.detail.length).toBeGreaterThan(0);
      }

      const llmOpenai = checks.find((c) => c.name === 'llm_openai')!;
      const llmAnthropic = checks.find((c) => c.name === 'llm_anthropic')!;
      // LLM status depends on env: 'ok' if API keys present, 'warn' if not
      expect(['ok', 'warn']).toContain(llmOpenai.status);
      expect(['ok', 'warn']).toContain(llmAnthropic.status);
      // Detail describes the state
      expect(llmOpenai.detail).toMatch(/keys/i);
      expect(llmAnthropic.detail).toMatch(/keys/i);
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  SECTION 4: Search Quality Stress Test
  // ═══════════════════════════════════════════════════════════

  describe('Section 4: Search Quality Stress Test', () => {
    it('4.1 Seed vault with 50 patterns across 10 domains', async () => {
      for (const domain of DOMAINS) {
        const vocabs = DOMAIN_VOCAB[domain];
        if (!vocabs) continue;
        const entries = vocabs.map((vocab, i) => makePattern(domain, i, vocab));

        const res = await op('vault', 'capture_knowledge', { entries });
        // Some may be duplicated from Section 2 seeding — that's fine
        expect((res.captured as number) + ((res.duplicated as number) ?? 0)).toBeGreaterThanOrEqual(
          1,
        );
      }

      // Rebuild vocabulary for TF-IDF scoring with full corpus
      await op('brain', 'rebuild_vocabulary');

      // Verify total entries
      const stats = await op('vault', 'vault_stats');
      expect(stats.totalEntries).toBeGreaterThanOrEqual(30); // 50 new + prior, minus dedup
    });

    it('4.2 Domain-specific search returns correct domain results', async () => {
      // Search for security-specific terms — should find security patterns
      const secRes = await op('vault', 'search', { query: 'csrf xss sanitization encryption' });
      const secArr = secRes as unknown as Array<{
        entry: { domain: string; title: string };
        score: number;
      }>;
      expect(secArr.length).toBeGreaterThan(0);

      // Top results should be from security domain
      const top3 = secArr.slice(0, 3);
      const securityCount = top3.filter((r) => r.entry.domain === 'security').length;
      expect(securityCount).toBeGreaterThanOrEqual(1);
    });

    it('4.3 DevOps-specific search returns devops patterns', async () => {
      const res = await op('vault', 'search', { query: 'ci-cd pipeline container dockerfile' });
      const arr = res as unknown as Array<{
        entry: { domain: string; title: string };
        score: number;
      }>;
      expect(arr.length).toBeGreaterThan(0);

      const devopsCount = arr.slice(0, 3).filter((r) => r.entry.domain === 'devops').length;
      expect(devopsCount).toBeGreaterThanOrEqual(1);
    });

    it('4.4 Cross-domain search finds patterns from multiple domains', async () => {
      // "monitoring" appears in both monitoring and devops domains
      const res = await op('vault', 'search', { query: 'monitoring alerting health-check' });
      const arr = res as unknown as Array<{
        entry: { domain: string; title: string };
        score: number;
      }>;
      expect(arr.length).toBeGreaterThan(0);

      const domains = new Set(arr.map((r) => r.entry.domain));
      // "monitoring alerting health-check" spans multiple domains (monitoring, devops, infrastructure)
      expect(domains.size).toBeGreaterThanOrEqual(2);
    });

    it('4.5 Porter stemmer handles related word forms', async () => {
      // "indexing" should match "index", "indexes" via stemming
      const res = await op('vault', 'search', { query: 'indexing queries optimization' });
      const arr = res as unknown as Array<{ entry: { title: string }; score: number }>;
      expect(arr.length).toBeGreaterThan(0);

      // Should find the database index pattern
      const hasIndexPattern = arr.some(
        (r) =>
          r.entry.title.toLowerCase().includes('index') ||
          r.entry.title.toLowerCase().includes('query'),
      );
      expect(hasIndexPattern).toBe(true);
    });

    it('4.6 Empty query handles gracefully', async () => {
      const res = await op('vault', 'search', { query: '' });
      const arr = res as unknown as Array<unknown>;
      expect(Array.isArray(arr)).toBe(true);
      // Empty query may return empty results or all results — should not crash
    });

    it('4.7 Search score ordering: higher scores for better matches', async () => {
      // Search for a very specific title
      const res = await op('vault', 'search', {
        query: 'Use composite indexes for multi-column WHERE clauses',
      });
      const arr = res as unknown as Array<{ entry: { title: string }; score: number }>;

      if (arr.length >= 2) {
        // Scores should be in descending order
        for (let i = 1; i < arr.length; i++) {
          expect(arr[i - 1].score).toBeGreaterThanOrEqual(arr[i].score);
        }

        // Exact title match should have highest score
        const exactMatch = arr.find((r) => r.entry.title.includes('composite indexes'));
        if (exactMatch) {
          expect(exactMatch.score).toBe(arr[0].score);
        }
      }
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  SECTION 5: Concurrent Operations
  // ═══════════════════════════════════════════════════════════

  describe('Section 5: Concurrent Operations', () => {
    it('5.1 10 concurrent vault captures — all succeed, no duplicates', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        op('vault', 'capture_quick', {
          type: 'pattern',
          domain: 'concurrent-test',
          title: `Concurrent capture stress pattern ${i} unique-${Date.now()}-${i}`,
          description: `Unique concurrent pattern number ${i} for stress testing vault write integrity.`,
          tags: ['concurrent', `batch-${i}`],
        }),
      );

      const results = await Promise.all(promises);
      const captured = results.filter((r) => r.captured === true);
      // All 10 should succeed (titles are unique)
      expect(captured.length).toBe(10);

      // Verify each got a unique ID with correct shape
      const ids = new Set<string>();
      for (const r of captured) {
        expect(typeof r.id).toBe('string');
        expect((r.id as string).length).toBeGreaterThan(0);
        const gov = r.governance as { action: string };
        expect(gov.action).toBe('capture');
        expect(typeof r.scope).toBe('object');
        ids.add(r.id as string);
      }
      expect(ids.size).toBe(10);
    });

    it('5.2 Concurrent searches while capturing — reads do not block writes', async () => {
      const ts = Date.now();
      const rand = Math.random().toString(36).slice(2, 10);
      const writes = Array.from({ length: 3 }, (_, i) =>
        op('vault', 'capture_quick', {
          type: 'pattern',
          domain: `concurrent-rw-${rand}`,
          title: `Unique read-write concurrency test ${rand}-${ts}-item-${i}`,
          description: `Completely unique pattern ${rand} number ${i} for testing concurrent read-write integrity under parallel load.`,
          tags: [`concurrent-rw-${rand}`, `item-${i}`],
        }),
      );

      const reads = Array.from({ length: 5 }, () =>
        op('vault', 'search', { query: 'database optimization' }),
      );

      const allResults = await Promise.all([...writes, ...reads]);

      // Writes should succeed — captured or proposed (governance may gate)
      const writeResults = allResults.slice(0, 3);
      for (const wr of writeResults) {
        // capture_quick returns { captured: bool, id: string, governance: { action } }
        expect(wr.id).toBeDefined();
        // Accept captured=true or governance-proposed (not an error)
        const gov = wr.governance as Record<string, unknown> | undefined;
        if (gov) {
          expect(['capture', 'propose']).toContain(gov.action);
        } else {
          expect(wr.captured).toBe(true);
        }
      }

      // All reads should succeed and return arrays
      const readResults = allResults.slice(3);
      for (const rr of readResults) {
        expect(Array.isArray(rr)).toBe(true);
      }
    });

    it('5.3 3 concurrent plan creations — each gets unique ID', async () => {
      const plans = await Promise.all([
        op('plan', 'create_plan', {
          objective: 'Concurrent plan A: add authentication',
          scope: 'Auth module',
        }),
        op('plan', 'create_plan', {
          objective: 'Concurrent plan B: add authorization',
          scope: 'RBAC module',
        }),
        op('plan', 'create_plan', {
          objective: 'Concurrent plan C: add audit logging',
          scope: 'Audit module',
        }),
      ]);

      const ids = new Set<string>();
      for (const res of plans) {
        expect(res.created).toBe(true);
        const plan = res.plan as Record<string, unknown>;
        expect(typeof plan.id).toBe('string');
        expect(plan.status).toBe('draft');
        expect(typeof plan.objective).toBe('string');
        ids.add(plan.id as string);
      }

      // All 3 plans should have unique IDs
      expect(ids.size).toBe(3);
    });

    it('5.4 Concurrent brain feedback — no corruption', async () => {
      // Get some entry IDs from vault
      const searchRes = await op('vault', 'search', { query: 'pattern' });
      const entries = searchRes as unknown as Array<{ entry: { id: string } }>;
      const entryIds = entries.slice(0, 5).map((e) => e.entry.id);

      if (entryIds.length >= 3) {
        const feedbackPromises = entryIds.map((id, i) =>
          op('brain', 'brain_feedback', {
            query: `concurrent feedback query ${i}`,
            entryId: id,
            action: i % 2 === 0 ? 'accepted' : 'dismissed',
            source: 'search',
            confidence: 0.7 + i * 0.05,
          }),
        );

        const results = await Promise.all(feedbackPromises);
        for (const res of results) {
          expect(res.id).toBeDefined();
          expect(typeof res.id).toBe('number');
        }

        // Verify total feedback count increased
        const stats = await op('brain', 'brain_stats');
        expect(stats.feedbackCount).toBeGreaterThanOrEqual(entryIds.length);
      }
    });

    it('5.5 Concurrent orchestrate_plan calls — each returns independent results', async () => {
      const orchPromises = await Promise.all([
        op('orchestrate', 'orchestrate_plan', {
          prompt: 'build a notification service',
        }),
        op('orchestrate', 'orchestrate_plan', {
          prompt: 'fix the payment processing bug',
        }),
      ]);

      for (const res of orchPromises) {
        const plan = res.plan as Record<string, unknown>;
        expect(typeof plan.id).toBe('string');
        const flow = res.flow as Record<string, unknown>;
        expect(typeof flow.planId).toBe('string');
        expect(typeof flow.intent).toBe('string');
        expect(Array.isArray(res.recommendations)).toBe(true);
      }

      // Plans should have different IDs
      const plan0 = orchPromises[0].plan as Record<string, unknown>;
      const plan1 = orchPromises[1].plan as Record<string, unknown>;
      expect(plan0.id).not.toBe(plan1.id);

      // Intents should differ: BUILD vs FIX
      const flow0 = orchPromises[0].flow as Record<string, unknown>;
      const flow1 = orchPromises[1].flow as Record<string, unknown>;
      expect(flow0.intent).toBe('BUILD');
      expect(flow1.intent).toBe('FIX');
    });
  });
});
