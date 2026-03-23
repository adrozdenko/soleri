/**
 * E2E: Agent Behavioral Tests
 *
 * Tests OUTCOMES, not operations. Every test answers the question:
 * "Does the system produce the RIGHT result?"
 *
 * NOT: "does the op return success: true"
 * YES: "does captured knowledge actually appear when I search for it"
 * YES: "does accepted feedback make a pattern rank higher"
 * YES: "does a plan reference knowledge I captured earlier"
 *
 * These tests define what "working correctly" means.
 * If they fail, the agent is producing wrong answers, not just broken pipes.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createAgentRuntime,
  createSemanticFacades,
  registerFacade,
  seedDefaultPlaybooks,
} from '@soleri/core';
import type { FacadeConfig, AgentRuntime } from '@soleri/core';

// ─── Infrastructure ──────────────────────────────────────

const AGENT_ID = 'behav';

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

function parseEnvelope(raw: {
  content: Array<{ type: string; text: string }>;
}): Record<string, unknown> {
  const envelope = JSON.parse(raw.content[0].text);
  if (envelope.success === false)
    return { _failed: true, _error: envelope.error, ...(envelope.data ?? {}) };
  return envelope.data as Record<string, unknown>;
}

let runtime: AgentRuntime;
let handlers: Map<string, ReturnType<typeof captureHandler>>;
const workDir = join(tmpdir(), `soleri-behav-${Date.now()}`);

async function op(facade: string, opName: string, params: Record<string, unknown> = {}) {
  const h = handlers.get(`${AGENT_ID}_${facade}`);
  if (!h) throw new Error(`No facade: ${facade}`);
  return parseEnvelope(await h({ op: opName, params }));
}

// ─── Helpers ─────────────────────────────────────────────

async function capturePattern(
  title: string,
  description: string,
  domain: string,
  severity = 'warning',
) {
  const res = await op('vault', 'capture_knowledge', {
    entries: [
      {
        type: 'pattern',
        domain,
        title,
        description,
        severity,
        tags: [domain, 'behavioral-test'],
      },
    ],
  });
  const results = res.results as Array<{ id: string }> | undefined;
  if (!results || results.length === 0) {
    throw new Error(
      `capture_knowledge returned no results for "${title}". Response: ${JSON.stringify(res)}`,
    );
  }
  return results[0].id;
}

async function captureAntiPattern(title: string, description: string, domain: string) {
  const res = await op('vault', 'capture_knowledge', {
    entries: [
      {
        type: 'anti-pattern',
        domain,
        title,
        description,
        severity: 'critical',
        tags: [domain, 'behavioral-test'],
      },
    ],
  });
  const results = res.results as Array<{ id: string }> | undefined;
  if (!results || results.length === 0) {
    throw new Error(
      `capture_knowledge returned no results for "${title}". Response: ${JSON.stringify(res)}`,
    );
  }
  return results[0].id;
}

async function searchVault(
  query: string,
): Promise<
  Array<{ entry: { id: string; title: string; type: string; domain: string }; score: number }>
> {
  const res = await op('vault', 'search', { query });
  return (res as unknown as Array<{ entry: Record<string, string>; score: number }>) ?? [];
}

async function feedback(
  entryId: string,
  action: 'accepted' | 'dismissed',
  confidence: number,
  query = 'behavioral test',
) {
  return op('brain', 'brain_feedback', {
    query,
    entryId,
    action,
    source: 'search',
    confidence,
  });
}

// ═══════════════════════════════════════════════════════════

describe('Agent Behavioral Tests', () => {
  beforeAll(() => {
    mkdirSync(workDir, { recursive: true });
    runtime = createAgentRuntime({
      agentId: AGENT_ID,
      vaultPath: ':memory:',
      plansPath: join(workDir, 'plans.json'),
    });
    // Disable auto-linking so orphan detection tests are deterministic
    runtime.vault.setLinkManager(runtime.linkManager, { enabled: false });
    const facades = createSemanticFacades(runtime, AGENT_ID);
    handlers = new Map();
    for (const facade of facades) {
      handlers.set(facade.name, captureHandler(facade));
    }
    seedDefaultPlaybooks(runtime.vault);
  });

  afterAll(() => {
    runtime.close();
    rmSync(workDir, { recursive: true, force: true });
  });

  // ═══════════════════════════════════════════════════════════
  //  1. VAULT SEARCH QUALITY
  //  "Does captured knowledge actually appear ranked by relevance?"
  // ═══════════════════════════════════════════════════════════

  describe('Vault search ranks captured knowledge by relevance', () => {
    let errorBoundaryId: string;
    let retryLogicId: string;
    let cssGridId: string;

    beforeAll(async () => {
      errorBoundaryId = await capturePattern(
        'Use React Error Boundaries at route level',
        'Wrap each route component in an ErrorBoundary to prevent a single component crash from taking down the entire page. Display fallback UI and report to monitoring service.',
        'frontend',
        'critical',
      );

      retryLogicId = await capturePattern(
        'Exponential backoff with jitter for API retries',
        'When an API call fails, retry with exponential delay starting at 1 second, doubling each time up to 30 seconds. Add random jitter to prevent thundering herd problem. Include circuit breaker after 5 consecutive failures.',
        'backend',
        'warning',
      );

      cssGridId = await capturePattern(
        'Use CSS Grid for two-dimensional layouts',
        'CSS Grid is better than flexbox for layouts that need both row and column control. Use grid-template-areas for named regions. Fallback to flexbox for single-axis layouts.',
        'frontend',
        'info',
      );
    });

    it('searching "error boundary react" should rank error boundary FIRST', async () => {
      const results = await searchVault('error boundary react');

      expect(results.length).toBeGreaterThan(0);

      // The error boundary pattern should be the top result
      const topResult = results[0];
      expect(topResult.entry.title.toLowerCase()).toContain('error bound');
    });

    it('searching "API retry failure" should rank retry logic FIRST', async () => {
      const results = await searchVault('API retry backoff failure');

      expect(results.length).toBeGreaterThan(0);

      const topResult = results[0];
      expect(
        topResult.entry.title.toLowerCase().includes('retry') ||
          topResult.entry.title.toLowerCase().includes('retries') ||
          topResult.entry.title.toLowerCase().includes('backoff'),
      ).toBe(true);
    });

    it('searching "CSS layout grid" should rank CSS grid FIRST', async () => {
      const results = await searchVault('CSS grid layout');

      expect(results.length).toBeGreaterThan(0);

      const topResult = results[0];
      expect(topResult.entry.title.toLowerCase()).toContain('grid');
    });

    it('searching "error" should NOT rank CSS grid above error boundary', async () => {
      const results = await searchVault('error handling');

      const errorIdx = results.findIndex((r) => r.entry.id === errorBoundaryId);
      const cssIdx = results.findIndex((r) => r.entry.id === cssGridId);

      // Error boundary should appear; CSS grid should not (or rank much lower)
      expect(errorIdx).toBeGreaterThanOrEqual(0);
      if (cssIdx >= 0) {
        expect(errorIdx).toBeLessThan(cssIdx);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  2. BRAIN LEARNING AFFECTS PATTERN STRENGTH
  //  "Does accepting/dismissing feedback change what the brain recommends?"
  // ═══════════════════════════════════════════════════════════

  describe('Brain learning affects pattern strength', () => {
    let goodPatternId: string;
    let badPatternId: string;

    beforeAll(async () => {
      goodPatternId = await capturePattern(
        'Always validate user input on the server',
        'Client-side validation improves UX but server-side validation is the security boundary. Never trust client input. Validate types, ranges, and formats on every API endpoint.',
        'security',
        'critical',
      );

      badPatternId = await capturePattern(
        'Use console.log for production error tracking',
        'Log errors to the browser console so developers can debug production issues by opening DevTools on user machines.',
        'frontend',
        'info',
      );

      // User consistently accepts the good pattern
      await feedback(goodPatternId, 'accepted', 0.95, 'input validation security');
      await feedback(goodPatternId, 'accepted', 0.9, 'how to validate API input');
      await feedback(goodPatternId, 'accepted', 0.85, 'server side security');

      // User consistently dismisses the bad pattern
      await feedback(badPatternId, 'dismissed', 0.1, 'error tracking production');
      await feedback(badPatternId, 'dismissed', 0.2, 'monitoring errors');

      // Build intelligence from feedback
      await op('brain', 'rebuild_vocabulary');
      await op('brain', 'brain_build_intelligence');
    });

    it('brain should have recorded all feedback', async () => {
      const stats = await op('brain', 'brain_stats');
      expect(stats.feedbackCount as number).toBeGreaterThanOrEqual(5);
    });

    it('accepted pattern should have higher strength than dismissed pattern', async () => {
      const allStrengths = await op('brain', 'brain_strengths', {});

      // brain_strengths returns PatternStrength[] with { pattern (title), domain, strength, ... }
      const patterns = (
        Array.isArray(allStrengths) ? allStrengths : (allStrengths.patterns ?? [])
      ) as Array<{ pattern: string; strength: number }>;

      expect(Array.isArray(patterns)).toBe(true);
      expect(patterns.length).toBeGreaterThan(0);

      // Match by pattern title (PatternStrength uses entry title as the pattern key)
      const goodStrength = patterns.find(
        (p) => p.pattern === 'Always validate user input on the server',
      );
      const badStrength = patterns.find(
        (p) => p.pattern === 'Use console.log for production error tracking',
      );

      // After 3 accepts and 2 dismissals, both patterns must appear in strengths
      expect(goodStrength).toBeDefined();
      expect(badStrength).toBeDefined();

      // The consistently accepted pattern should be stronger
      expect(goodStrength!.strength).toBeGreaterThan(badStrength!.strength);
    });

    it('brain recommend for security should surface validated pattern', async () => {
      const recommendations = await op('brain', 'brain_recommend', {
        domain: 'security',
        task: 'securing API endpoints',
      });

      // brain_recommend returns PatternStrength[] with { pattern (title), domain, strength, ... }
      const recs = (
        Array.isArray(recommendations) ? recommendations : (recommendations.recommendations ?? [])
      ) as Array<{ pattern: string }>;

      expect(recs.length).toBeGreaterThan(0);

      const hasGoodPattern = recs.some(
        (r) => r.pattern === 'Always validate user input on the server',
      );
      const hasBadPattern = recs.some(
        (r) => r.pattern === 'Use console.log for production error tracking',
      );

      // Good pattern should be recommended; bad pattern should NOT
      expect(hasGoodPattern).toBe(true);
      expect(hasBadPattern).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  3. VAULT-INFORMED PLANNING
  //  "Does a plan reference knowledge that was captured earlier?"
  // ═══════════════════════════════════════════════════════════

  describe('Vault knowledge informs planning', () => {
    beforeAll(async () => {
      await capturePattern(
        'Implement circuit breaker for external API calls',
        'When an external service fails repeatedly, stop calling it temporarily. After a cooldown period, try again with a single probe request. This prevents cascading failures and gives the service time to recover.',
        'backend',
        'critical',
      );

      await captureAntiPattern(
        'Retrying failed requests without backoff causes thundering herd',
        'Immediate retries after failure amplify the problem. All clients retry at the same time, creating a spike that crashes the recovering service again. Always use exponential backoff with jitter.',
        'backend',
      );
    });

    it('searching vault before planning should find relevant knowledge', async () => {
      const results = await searchVault('circuit breaker external API failure');

      expect(results.length).toBeGreaterThan(0);

      const circuitBreaker = results.find((r) =>
        r.entry.title.toLowerCase().includes('circuit breaker'),
      );
      expect(circuitBreaker).toBeDefined();
    });

    it('searching vault should find anti-patterns too', async () => {
      const results = await searchVault('retry thundering herd backoff');

      expect(results.length).toBeGreaterThan(0);

      const antiPattern = results.find((r) => r.entry.type === 'anti-pattern');
      expect(antiPattern).toBeDefined();
    });

    it('plan for related work should capture vault-informed decisions', async () => {
      const plan = await op('plan', 'create_plan', {
        objective: 'Add resilience to the payment gateway integration',
        scope: 'Backend payment service API calls',
        decisions: [
          'Use circuit breaker pattern (from vault knowledge)',
          'Avoid thundering herd (anti-pattern from vault)',
        ],
      });

      expect(plan.created).toBe(true);
      const planData = plan.plan as Record<string, unknown>;

      const decisions = planData.decisions as string[];
      expect(decisions.some((d) => d.includes('circuit breaker'))).toBe(true);
      expect(decisions.some((d) => d.includes('thundering herd'))).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  4. ZETTELKASTEN GRAPH AFFECTS DISCOVERY
  //  "Do links between entries change what gets discovered?"
  // ═══════════════════════════════════════════════════════════

  describe('Zettelkasten links affect knowledge discovery', () => {
    let authPatternId: string;
    let rbacPatternId: string;
    let sqlInjectionId: string;
    let xssAntiPatternId: string;

    beforeAll(async () => {
      authPatternId = await capturePattern(
        'Implement JWT authentication with refresh tokens',
        'Use short-lived access tokens with long-lived refresh tokens. Store refresh tokens server-side. Rotate refresh tokens on each use to detect theft.',
        'security',
        'critical',
      );

      rbacPatternId = await capturePattern(
        'Role-based access control with permission hierarchy',
        'Define roles with hierarchical permissions. Admin inherits all editor permissions. Check permissions at the API layer, not just the UI.',
        'security',
        'critical',
      );

      sqlInjectionId = await captureAntiPattern(
        'String concatenation in SQL queries enables injection',
        'Building SQL queries with string concatenation allows attackers to inject malicious SQL. Always use parameterized queries or an ORM with prepared statements.',
        'security',
      );

      xssAntiPatternId = await captureAntiPattern(
        'Rendering unsanitized user HTML enables XSS attacks',
        'Using raw HTML insertion with user input allows cross-site scripting. Always sanitize HTML or use text content methods instead.',
        'security',
      );

      await op('vault', 'link_entries', {
        sourceId: authPatternId,
        targetId: rbacPatternId,
        linkType: 'supports',
        note: 'JWT auth provides identity; RBAC uses that identity for authorization',
      });

      await op('vault', 'link_entries', {
        sourceId: sqlInjectionId,
        targetId: authPatternId,
        linkType: 'contradicts',
        note: 'SQL injection can bypass authentication entirely',
      });

      await op('vault', 'link_entries', {
        sourceId: xssAntiPatternId,
        targetId: rbacPatternId,
        linkType: 'contradicts',
        note: 'XSS can escalate privileges by impersonating admin users',
      });
    });

    it('traversing from auth should find RBAC (supports link)', async () => {
      const res = await op('vault', 'traverse', { entryId: authPatternId, depth: 1 });
      const connected = res.connectedEntries as Array<{ id: string }>;

      expect(connected.find((c) => c.id === rbacPatternId)).toBeDefined();
    });

    it('traversing from auth should find SQL injection (contradicts)', async () => {
      const res = await op('vault', 'traverse', { entryId: authPatternId, depth: 1 });
      const connected = res.connectedEntries as Array<{ id: string }>;

      expect(connected.find((c) => c.id === sqlInjectionId)).toBeDefined();
    });

    it('traversing 2 hops from auth should find XSS (auth->RBAC->XSS)', async () => {
      const res = await op('vault', 'traverse', { entryId: authPatternId, depth: 2 });
      const connected = res.connectedEntries as Array<{ id: string }>;

      expect(connected.find((c) => c.id === xssAntiPatternId)).toBeDefined();
    });

    it('get_links should show contradicts links as incoming warnings', async () => {
      const links = await op('vault', 'get_links', { entryId: authPatternId });
      const incoming = links.incoming as Array<{ sourceId: string; linkType: string }>;

      const contradictions = incoming.filter((l) => l.linkType === 'contradicts');
      expect(contradictions.length).toBeGreaterThan(0);
      expect(contradictions.some((c) => c.sourceId === sqlInjectionId)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  5. CROSS-SESSION COMPOUND LEARNING
  //  "Does the second session benefit from the first?"
  // ═══════════════════════════════════════════════════════════

  describe('Cross-session compound learning', () => {
    it('capture session 1 summary', async () => {
      const res = await op('memory', 'session_capture', {
        summary:
          'Implemented JWT auth with refresh token rotation. Used RBAC for authorization. Fixed SQL injection vulnerability.',
        topics: ['security', 'authentication', 'authorization'],
        toolsUsed: ['capture_knowledge', 'link_entries', 'create_plan'],
      });
      expect(res.captured).toBe(true);
    });

    it('session 1 knowledge persists in vault', async () => {
      const results = await searchVault('JWT authentication refresh token');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entry.title.toLowerCase()).toContain('jwt');
    });

    it('vault knowledge from session 1 is findable in session 2', async () => {
      const results = await searchVault('authentication security patterns');
      expect(results.length).toBeGreaterThan(0);

      const authRelated = results.filter(
        (r) =>
          r.entry.title.toLowerCase().includes('auth') ||
          r.entry.title.toLowerCase().includes('jwt') ||
          r.entry.title.toLowerCase().includes('rbac'),
      );
      expect(authRelated.length).toBeGreaterThan(0);
    });

    it('brain feedback accumulates across sessions', async () => {
      const stats = await op('brain', 'brain_stats');
      expect(stats.feedbackCount as number).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  6. SEARCH QUALITY UNDER LOAD
  //  "Does search stay accurate with many entries?"
  // ═══════════════════════════════════════════════════════════

  describe('Search quality with many entries', () => {
    beforeAll(async () => {
      const patterns = [
        { t: 'Use React.memo for expensive render prevention', d: 'frontend' },
        { t: 'Implement database connection pooling', d: 'backend' },
        { t: 'Configure health check endpoints for load balancers', d: 'devops' },
        { t: 'Write unit tests for pure functions first', d: 'testing' },
        { t: 'Enable CORS with specific origin whitelist', d: 'security' },
        { t: 'Use React.lazy for code splitting at route level', d: 'frontend' },
        { t: 'Add database index on frequently queried columns', d: 'backend' },
        { t: 'Set up blue-green deployment for zero-downtime releases', d: 'devops' },
        { t: 'Use test fixtures for deterministic test data', d: 'testing' },
        { t: 'Implement rate limiting on authentication endpoints', d: 'security' },
        { t: 'Virtualize long lists with react-window', d: 'frontend' },
        { t: 'Use database transactions for multi-step operations', d: 'backend' },
        { t: 'Implement canary releases for gradual rollouts', d: 'devops' },
        { t: 'Mock external services in integration tests', d: 'testing' },
        { t: 'Rotate API keys and secrets on a schedule', d: 'security' },
      ];

      for (const p of patterns) {
        await capturePattern(p.t, `Detailed: ${p.t}`, p.d);
      }
    });

    it('searching "React render" should find React patterns first', async () => {
      const results = await searchVault('React render performance memo');
      expect(results.length).toBeGreaterThan(0);

      const topThree = results.slice(0, 3);
      const reactResults = topThree.filter(
        (r) =>
          r.entry.title.toLowerCase().includes('react') ||
          r.entry.title.toLowerCase().includes('render'),
      );
      expect(reactResults.length).toBeGreaterThan(0);
    });

    it('searching "database" should find database patterns, not React', async () => {
      const results = await searchVault('database performance index pooling');
      expect(results.length).toBeGreaterThan(0);

      const topResult = results[0];
      expect(
        topResult.entry.title.toLowerCase().includes('database') ||
          topResult.entry.title.toLowerCase().includes('index') ||
          topResult.entry.title.toLowerCase().includes('pool') ||
          topResult.entry.title.toLowerCase().includes('transaction'),
      ).toBe(true);
    });

    it('searching "deployment Kubernetes" should find devops patterns', async () => {
      const results = await searchVault('deployment canary blue green');
      expect(results.length).toBeGreaterThan(0);

      const topResult = results[0];
      expect(
        topResult.entry.title.toLowerCase().includes('deploy') ||
          topResult.entry.title.toLowerCase().includes('canary') ||
          topResult.entry.title.toLowerCase().includes('blue-green') ||
          topResult.entry.title.toLowerCase().includes('health'),
      ).toBe(true);
    });

    it('searching "secrets API keys" should find security patterns', async () => {
      const results = await searchVault('secrets API keys rotate');
      expect(results.length).toBeGreaterThan(0);

      const securityResults = results.filter(
        (r) =>
          r.entry.title.toLowerCase().includes('secret') ||
          r.entry.title.toLowerCase().includes('key') ||
          r.entry.title.toLowerCase().includes('rate limit'),
      );
      expect(securityResults.length).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  7. KNOWLEDGE HYGIENE
  //  "Does the system correctly identify unlinked knowledge?"
  // ═══════════════════════════════════════════════════════════

  describe('Knowledge hygiene', () => {
    it('orphan detection finds entries without links', async () => {
      const orphans = await op('vault', 'get_orphans', { limit: 50 });
      const orphanList = orphans.orphans as Array<{ id: string }>;

      expect(orphanList.length).toBeGreaterThan(0);
    });

    it('linking an orphan reduces orphan count', async () => {
      const before = await op('vault', 'get_orphans', { limit: 50 });
      const orphansBefore = before.orphans as Array<{ id: string }>;
      const beforeCount = before.totalOrphans as number;

      if (orphansBefore.length >= 2) {
        await op('vault', 'link_entries', {
          sourceId: orphansBefore[0].id,
          targetId: orphansBefore[1].id,
          linkType: 'supports',
        });

        const after = await op('vault', 'get_orphans', { limit: 50 });
        const afterCount = after.totalOrphans as number;

        expect(afterCount).toBeLessThan(beforeCount);
      }
    });

    it('curator health audit reflects vault quality', async () => {
      const audit = await op('curator', 'curator_health_audit');

      expect(audit.score).toBeDefined();
      expect(audit.score as number).toBeGreaterThan(0);
      expect(audit.recommendations).toBeDefined();
      expect(Array.isArray(audit.recommendations)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  8. INTENT ROUTING ACCURACY
  //  "Does the system correctly understand what the user wants?"
  // ═══════════════════════════════════════════════════════════

  describe('Intent routing accuracy', () => {
    const testCases: Array<{ prompt: string; expectedIntent: string; description: string }> = [
      {
        prompt: 'build me a user dashboard with charts',
        expectedIntent: 'build',
        description: 'explicit build',
      },
      {
        prompt: 'create a new notification system',
        expectedIntent: 'build',
        description: 'create = build',
      },
      {
        prompt: 'the login page crashes on mobile safari',
        expectedIntent: 'fix',
        description: 'crash = fix',
      },
      { prompt: 'fix the broken payment flow', expectedIntent: 'fix', description: 'explicit fix' },
      {
        prompt: 'review the authentication implementation',
        expectedIntent: 'review',
        description: 'explicit review',
      },
      {
        prompt: 'plan the database migration strategy',
        expectedIntent: 'plan',
        description: 'explicit plan',
      },
      {
        prompt: 'optimize the bundle size to reduce load time',
        expectedIntent: 'improve',
        description: 'optimize = improve',
      },
      {
        prompt: 'deploy to production and tag the release',
        expectedIntent: 'deliver',
        description: 'deploy = deliver',
      },
    ];

    for (const tc of testCases) {
      it(`"${tc.prompt}" should route to ${tc.expectedIntent} (${tc.description})`, async () => {
        const res = await op('control', 'route_intent', { prompt: tc.prompt });

        expect(res.intent).toBe(tc.expectedIntent);
        expect(typeof res.confidence).toBe('number');
        expect(res.confidence as number).toBeGreaterThan(0);
      });
    }
  });
});
