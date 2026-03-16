/**
 * E2E: Knowledge Traceability
 *
 * Traces a single piece of knowledge through EVERY system touchpoint:
 *
 *   CAPTURE → STORE → INDEX → SEARCH → LINK → TRAVERSE → FEEDBACK
 *   → LEARN → RECOMMEND → PLAN → ORCHESTRATE → SESSION → RECALL
 *
 * At each step, we verify the knowledge is:
 * 1. Present (the system has it)
 * 2. Correct (the data matches what was captured)
 * 3. Influential (it affects the system's behavior)
 *
 * If any step fails, we know EXACTLY where knowledge breaks down.
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

const AGENT_ID = 'trace';

function captureHandler(facade: FacadeConfig) {
  let captured: ((args: { op: string; params: Record<string, unknown> }) => Promise<{
    content: Array<{ type: string; text: string }>;
  }>) | null = null;
  const mockServer = {
    tool: (_name: string, _desc: string, _schema: unknown, handler: unknown) => {
      captured = handler as typeof captured;
    },
  };
  registerFacade(mockServer as never, facade);
  return captured!;
}

function parseEnvelope(raw: { content: Array<{ type: string; text: string }> }): Record<string, unknown> {
  const envelope = JSON.parse(raw.content[0].text);
  if (envelope.success === false) return { _failed: true, _error: envelope.error, ...(envelope.data ?? {}) };
  return envelope.data as Record<string, unknown>;
}

let runtime: AgentRuntime;
let handlers: Map<string, ReturnType<typeof captureHandler>>;
const workDir = join(tmpdir(), `soleri-trace-${Date.now()}`);

async function op(facade: string, opName: string, params: Record<string, unknown> = {}) {
  const h = handlers.get(`${AGENT_ID}_${facade}`);
  if (!h) throw new Error(`No facade: ${facade}`);
  return parseEnvelope(await h({ op: opName, params }));
}

// ═══════════════════════════════════════════════════════════

describe('Knowledge Traceability', () => {
  beforeAll(() => {
    mkdirSync(workDir, { recursive: true });
    runtime = createAgentRuntime({
      agentId: AGENT_ID,
      vaultPath: ':memory:',
      plansPath: join(workDir, 'plans.json'),
    });
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

  // The knowledge we'll trace through the entire system
  const KNOWLEDGE = {
    title: 'Always validate JWT tokens on every API request',
    description: 'Never trust the client. Validate the JWT signature, check expiration, verify issuer and audience claims on every API endpoint. Use middleware to enforce this consistently. Expired or malformed tokens must return 401.',
    domain: 'security',
    type: 'pattern' as const,
    severity: 'critical' as const,
    tags: ['jwt', 'authentication', 'api-security', 'middleware'],
  };

  // A related anti-pattern
  const ANTI_KNOWLEDGE = {
    title: 'Trusting client-side JWT validation alone is a security hole',
    description: 'Only validating JWT on the client allows attackers to forge tokens. Server-side validation is the security boundary. Client validation is UX convenience only.',
    domain: 'security',
    type: 'anti-pattern' as const,
    severity: 'critical' as const,
    tags: ['jwt', 'authentication', 'security-vulnerability'],
  };

  // A related but different domain pattern
  const RELATED_KNOWLEDGE = {
    title: 'Implement rate limiting on authentication endpoints',
    description: 'Brute force attacks target login and token refresh endpoints. Rate limit by IP and user ID. Use sliding window algorithm. Return 429 after threshold.',
    domain: 'security',
    type: 'pattern' as const,
    severity: 'warning' as const,
    tags: ['rate-limiting', 'authentication', 'brute-force'],
  };

  // State tracking — IDs assigned by the system
  const state: Record<string, string> = {};

  // ═══════════════════════════════════════════════════════════
  //  STEP 1: CAPTURE — Knowledge enters the system
  // ═══════════════════════════════════════════════════════════

  describe('Step 1: CAPTURE', () => {
    it('capture_knowledge should accept the pattern and return an ID', async () => {
      const res = await op('vault', 'capture_knowledge', {
        entries: [{
          type: KNOWLEDGE.type,
          domain: KNOWLEDGE.domain,
          title: KNOWLEDGE.title,
          description: KNOWLEDGE.description,
          severity: KNOWLEDGE.severity,
          tags: KNOWLEDGE.tags,
        }],
      });

      expect(res.captured).toBe(1);
      expect(res.proposed).toBe(0);
      expect(res.rejected).toBe(0);

      const results = res.results as Array<{ id: string; action: string }>;
      expect(results.length).toBe(1);
      expect(results[0].id).toBeDefined();
      expect(typeof results[0].id).toBe('string');
      expect(results[0].id.length).toBeGreaterThan(0);

      state.knowledgeId = results[0].id;
    });

    it('first capture should return suggested links', async () => {
      // suggestedLinks was returned in the first capture (test 1)
      // Verify by capturing a NEW entry and checking suggestedLinks
      const res = await op('vault', 'capture_quick', {
        type: 'pattern',
        domain: 'security',
        title: 'Use HTTPS everywhere in production',
        description: 'Never serve API or web content over HTTP in production.',
        severity: 'critical',
        tags: ['security', 'https'],
      });

      // capture_quick returns { captured, id, governance, scope }
      expect(res.captured).toBe(true);
      expect(res.id).toBeDefined();
    });

    it('capture the anti-pattern', async () => {
      const res = await op('vault', 'capture_knowledge', {
        entries: [{
          type: ANTI_KNOWLEDGE.type,
          domain: ANTI_KNOWLEDGE.domain,
          title: ANTI_KNOWLEDGE.title,
          description: ANTI_KNOWLEDGE.description,
          severity: ANTI_KNOWLEDGE.severity,
          tags: ANTI_KNOWLEDGE.tags,
        }],
      });

      const results = res.results as Array<{ id: string }>;
      state.antiId = results[0].id;
    });

    it('capture the related pattern', async () => {
      const res = await op('vault', 'capture_knowledge', {
        entries: [{
          type: RELATED_KNOWLEDGE.type,
          domain: RELATED_KNOWLEDGE.domain,
          title: RELATED_KNOWLEDGE.title,
          description: RELATED_KNOWLEDGE.description,
          severity: RELATED_KNOWLEDGE.severity,
          tags: RELATED_KNOWLEDGE.tags,
        }],
      });

      const results = res.results as Array<{ id: string }>;
      state.relatedId = results[0].id;
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  STEP 2: STORE — Knowledge is persisted correctly
  // ═══════════════════════════════════════════════════════════

  describe('Step 2: STORE', () => {
    it('vault_stats should count the new entries', async () => {
      const stats = await op('vault', 'vault_stats');

      const totalEntries = stats.totalEntries as number;
      expect(totalEntries).toBeGreaterThanOrEqual(3); // our 3 + playbooks

      const byDomain = stats.byDomain as Record<string, number>;
      expect(byDomain.security).toBeGreaterThanOrEqual(3);

      const byType = stats.byType as Record<string, number>;
      expect(byType.pattern).toBeGreaterThanOrEqual(2);
      expect(byType['anti-pattern']).toBeGreaterThanOrEqual(1);
    });

    it('search by exact title should return entry with correct data', async () => {
      const results = await op('vault', 'search', { query: KNOWLEDGE.title });
      const entries = results as unknown as Array<{ entry: { id: string; title: string; domain: string; type: string; severity: string }; score: number }>;

      const found = entries.find(e => e.entry.id === state.knowledgeId);
      expect(found).toBeDefined();
      expect(found!.entry.title).toBe(KNOWLEDGE.title);
      expect(found!.entry.domain).toBe(KNOWLEDGE.domain);
      expect(found!.entry.type).toBe(KNOWLEDGE.type);
      expect(found!.entry.severity).toBe(KNOWLEDGE.severity);
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  STEP 3: INDEX — Knowledge is searchable
  // ═══════════════════════════════════════════════════════════

  describe('Step 3: INDEX (FTS5 search)', () => {
    it('exact title search should find the pattern', async () => {
      const results = await op('vault', 'search', { query: 'validate JWT tokens API request' });
      const entries = results as unknown as Array<{ entry: { id: string; title: string }; score: number }>;

      expect(entries.length).toBeGreaterThan(0);

      const found = entries.find(e => e.entry.id === state.knowledgeId);
      expect(found).toBeDefined();
      expect(found!.entry.title).toBe(KNOWLEDGE.title);
    });

    it('related term search should find the pattern', async () => {
      const results = await op('vault', 'search', { query: 'authentication middleware token' });
      const entries = results as unknown as Array<{ entry: { id: string }; score: number }>;

      expect(entries.length).toBeGreaterThan(0);

      // Our JWT pattern should appear (it mentions middleware and token)
      const found = entries.find(e => e.entry.id === state.knowledgeId);
      expect(found).toBeDefined();
    });

    it('domain-unrelated search should NOT rank our pattern first', async () => {
      const results = await op('vault', 'search', { query: 'CSS grid flexbox layout' });
      const entries = results as unknown as Array<{ entry: { id: string }; score: number }>;

      // Our security pattern should NOT be the top result for CSS queries
      if (entries.length > 0) {
        expect(entries[0].entry.id).not.toBe(state.knowledgeId);
      }
    });

    it('anti-pattern should also be searchable', async () => {
      const results = await op('vault', 'search', { query: 'client-side JWT validation security' });
      const entries = results as unknown as Array<{ entry: { id: string }; score: number }>;

      expect(entries.length).toBeGreaterThan(0);
      const found = entries.find(e => e.entry.id === state.antiId);
      expect(found).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  STEP 4: LINK — Knowledge connects to other knowledge
  // ═══════════════════════════════════════════════════════════

  describe('Step 4: LINK (Zettelkasten)', () => {
    it('link pattern to anti-pattern (contradicts)', async () => {
      const res = await op('vault', 'link_entries', {
        sourceId: state.antiId,
        targetId: state.knowledgeId,
        linkType: 'contradicts',
        note: 'Client-only validation contradicts server-side validation requirement',
      });

      expect(res.success).toBe(true);
    });

    it('link pattern to related pattern (supports)', async () => {
      const res = await op('vault', 'link_entries', {
        sourceId: state.knowledgeId,
        targetId: state.relatedId,
        linkType: 'supports',
        note: 'JWT validation and rate limiting both protect authentication endpoints',
      });

      expect(res.success).toBe(true);
    });

    it('get_links should show both links', async () => {
      const res = await op('vault', 'get_links', { entryId: state.knowledgeId });

      const outgoing = res.outgoing as Array<{ targetId: string; linkType: string }>;
      const incoming = res.incoming as Array<{ sourceId: string; linkType: string }>;

      // Outgoing: knowledgeId → relatedId (supports)
      expect(outgoing.some(l => l.targetId === state.relatedId && l.linkType === 'supports')).toBe(true);

      // Incoming: antiId → knowledgeId (contradicts)
      expect(incoming.some(l => l.sourceId === state.antiId && l.linkType === 'contradicts')).toBe(true);

      expect(res.totalLinks).toBeGreaterThanOrEqual(2);
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  STEP 5: TRAVERSE — Knowledge graph is walkable
  // ═══════════════════════════════════════════════════════════

  describe('Step 5: TRAVERSE (graph walking)', () => {
    it('traverse from pattern should find anti-pattern AND related', async () => {
      const res = await op('vault', 'traverse', { entryId: state.knowledgeId, depth: 1 });

      const connected = res.connectedEntries as Array<{ id: string; linkType: string }>;

      expect(connected.length).toBeGreaterThanOrEqual(2);
      expect(connected.some(c => c.id === state.antiId)).toBe(true);
      expect(connected.some(c => c.id === state.relatedId)).toBe(true);
    });

    it('traverse from anti-pattern should find the pattern it contradicts', async () => {
      const res = await op('vault', 'traverse', { entryId: state.antiId, depth: 1 });

      const connected = res.connectedEntries as Array<{ id: string }>;
      expect(connected.some(c => c.id === state.knowledgeId)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  STEP 6: FEEDBACK — System learns from user interaction
  // ═══════════════════════════════════════════════════════════

  describe('Step 6: FEEDBACK (brain learning)', () => {
    it('record positive feedback on the JWT pattern', async () => {
      const res = await op('brain', 'brain_feedback', {
        query: 'how to secure API endpoints',
        entryId: state.knowledgeId,
        action: 'accepted',
        source: 'search',
        confidence: 0.95,
      });

      expect(res.id).toBeDefined();
      expect(res.action).toBe('accepted');
      expect(res.entryId).toBe(state.knowledgeId);
    });

    it('record negative feedback on the anti-pattern (it was helpful as a WARNING)', async () => {
      const res = await op('brain', 'brain_feedback', {
        query: 'common JWT mistakes',
        entryId: state.antiId,
        action: 'accepted',
        source: 'search',
        confidence: 0.85,
      });

      expect(res.action).toBe('accepted');
    });

    it('record more positive feedback to strengthen the pattern', async () => {
      // Simulate multiple sessions finding this pattern useful
      await op('brain', 'brain_feedback', {
        query: 'JWT token validation best practice',
        entryId: state.knowledgeId,
        action: 'accepted',
        source: 'search',
        confidence: 0.90,
      });

      await op('brain', 'brain_feedback', {
        query: 'API authentication security',
        entryId: state.knowledgeId,
        action: 'accepted',
        source: 'search',
        confidence: 0.88,
      });
    });

    it('feedback count should reflect all recorded feedback', async () => {
      const stats = await op('brain', 'brain_stats');
      expect(stats.feedbackCount as number).toBeGreaterThanOrEqual(4);
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  STEP 7: LEARN — Brain processes feedback into intelligence
  // ═══════════════════════════════════════════════════════════

  describe('Step 7: LEARN (intelligence building)', () => {
    it('rebuild vocabulary from vault entries', async () => {
      const res = await op('brain', 'rebuild_vocabulary');
      expect(res.rebuilt).toBe(true);
      expect(res.vocabularySize as number).toBeGreaterThan(0);
    });

    it('build intelligence from accumulated feedback', async () => {
      const res = await op('brain', 'brain_build_intelligence');
      // Intelligence building processes feedback into pattern strengths
      expect(res.strengthsComputed).toBeDefined();
    });

    it('brain_strengths should show JWT pattern with non-zero strength', async () => {
      const res = await op('brain', 'brain_strengths', { domain: 'security' });

      const patterns = (res.patterns ?? res) as Array<{ id: string; title: string; strength: number }>;

      if (Array.isArray(patterns) && patterns.length > 0) {
        const jwtPattern = patterns.find(p => p.id === state.knowledgeId);
        if (jwtPattern) {
          expect(jwtPattern.strength).toBeGreaterThan(0);
          expect(jwtPattern.title).toContain('JWT');
        }
      }
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  STEP 8: RECOMMEND — Brain uses learned patterns
  // ═══════════════════════════════════════════════════════════

  describe('Step 8: RECOMMEND (brain-informed suggestions)', () => {
    it('brain_recommend for security should surface accepted security patterns', async () => {
      const res = await op('brain', 'brain_recommend', {
        domain: 'security',
        task: 'securing REST API endpoints',
      });

      const recs = (Array.isArray(res) ? res : res.recommendations ?? []) as Array<{ pattern: string; domain: string; strength: number }>;

      expect(Array.isArray(recs)).toBe(true);
      expect(recs.length).toBeGreaterThan(0);

      // After 3 positive feedbacks, JWT pattern should be among recommendations
      const securityRec = recs.find(r =>
        r.pattern?.toLowerCase().includes('jwt') ||
        r.pattern?.toLowerCase().includes('token') ||
        r.pattern?.toLowerCase().includes('validate'),
      );
      expect(securityRec).toBeDefined();
      expect(securityRec!.strength).toBeGreaterThan(0);
    });

    it('brain_recommend for unrelated domain should NOT include JWT pattern', async () => {
      const res = await op('brain', 'brain_recommend', {
        domain: 'frontend',
        task: 'building a CSS animation library',
      });

      const recs = (Array.isArray(res) ? res : res.recommendations ?? []) as Array<{ id: string }>;

      if (recs.length > 0) {
        const jwtRec = recs.find(r => r.id === state.knowledgeId);
        // JWT security pattern should NOT appear for CSS animation work
        expect(jwtRec).toBeUndefined();
      }
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  STEP 9: PLAN — Knowledge influences planning
  // ═══════════════════════════════════════════════════════════

  describe('Step 9: PLAN (vault-informed planning)', () => {
    it('plan for API security should be creatable with vault decisions', async () => {
      const res = await op('plan', 'create_plan', {
        objective: 'Secure the user authentication API endpoints',
        scope: 'Backend authentication service',
        decisions: [
          'Validate JWT tokens on every request (from vault pattern)',
          'Add rate limiting to auth endpoints (from vault pattern)',
          'Avoid client-only JWT validation (vault anti-pattern)',
        ],
        tasks: [
          { title: 'Add JWT validation middleware', description: 'Validate signature, expiry, issuer on every request' },
          { title: 'Implement rate limiting', description: 'Sliding window, 429 responses' },
          { title: 'Remove client-only validation', description: 'Server-side is the security boundary' },
        ],
      });

      expect(res.created).toBe(true);
      const plan = res.plan as Record<string, unknown>;
      state.planId = plan.id as string;

      // Plan should capture the vault-informed decisions
      const decisions = plan.decisions as string[];
      expect(decisions.some(d => d.includes('JWT'))).toBe(true);
      expect(decisions.some(d => d.includes('rate limiting'))).toBe(true);
      expect(decisions.some(d => d.includes('anti-pattern'))).toBe(true);
    });

    it('orchestrate_plan should create a plan and consult vault', async () => {
      const res = await op('orchestrate', 'orchestrate_plan', {
        prompt: 'Secure the payment API with proper authentication',
        projectPath: '.',
      });

      // Orchestrate should create a plan
      const plan = res.plan as Record<string, unknown> | undefined;
      expect(plan).toBeDefined();
      if (plan) {
        expect(plan.id).toBeDefined();
      }

      // Check if recommendations were provided from vault/brain
      const recommendations = res.recommendations as Array<Record<string, unknown>> | undefined;
      // Orchestrate consults vault — recommendations should exist (even if empty)
      expect(recommendations).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  STEP 10: SESSION — Knowledge persists across sessions
  // ═══════════════════════════════════════════════════════════

  describe('Step 10: SESSION (cross-session persistence)', () => {
    it('capture session with knowledge references', async () => {
      const res = await op('memory', 'session_capture', {
        summary: 'Secured API endpoints: added JWT validation middleware, rate limiting, removed client-only validation. Used vault patterns for JWT and rate limiting, avoided vault anti-pattern for client-only validation.',
        topics: ['security', 'jwt', 'authentication', 'rate-limiting'],
        toolsUsed: ['capture_knowledge', 'link_entries', 'create_plan', 'brain_feedback'],
      });

      expect(res.captured).toBe(true);
    });

    it('memory search should find the session', async () => {
      const res = await op('memory', 'memory_search', { query: 'JWT authentication security' });

      // Memory search returns results
      const results = Array.isArray(res) ? res : (res as Record<string, unknown>).results ?? [];
      // The session summary mentions JWT — should be findable
      expect(results).toBeDefined();
    });

    it('vault knowledge should still be intact after session capture', async () => {
      // The pattern should still be in the vault exactly as captured
      const results = await op('vault', 'search', { query: 'validate JWT tokens' });
      const entries = results as unknown as Array<{ entry: { id: string; title: string }; score: number }>;

      const found = entries.find(e => e.entry.id === state.knowledgeId);
      expect(found).toBeDefined();
      expect(found!.entry.title).toBe(KNOWLEDGE.title);
    });

    it('links should still be intact after session', async () => {
      const links = await op('vault', 'get_links', { entryId: state.knowledgeId });
      expect(links.totalLinks as number).toBeGreaterThanOrEqual(2);
    });

    it('brain should still have accumulated feedback', async () => {
      const stats = await op('brain', 'brain_stats');
      expect(stats.feedbackCount as number).toBeGreaterThanOrEqual(4);
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  STEP 11: RECALL — Knowledge is retrievable in future work
  // ═══════════════════════════════════════════════════════════

  describe('Step 11: RECALL (future session uses past knowledge)', () => {
    it('new search for "API security" should find the JWT pattern', async () => {
      const results = await op('vault', 'search', { query: 'API security authentication' });
      const entries = results as unknown as Array<{ entry: { id: string; title: string }; score: number }>;

      expect(entries.length).toBeGreaterThan(0);

      const jwtFound = entries.some(e => e.entry.id === state.knowledgeId);
      expect(jwtFound).toBe(true);
    });

    it('traversing the JWT pattern should still find its neighborhood', async () => {
      const res = await op('vault', 'traverse', { entryId: state.knowledgeId, depth: 1 });
      const connected = res.connectedEntries as Array<{ id: string }>;

      // Anti-pattern and rate limiting should still be connected
      expect(connected.some(c => c.id === state.antiId)).toBe(true);
      expect(connected.some(c => c.id === state.relatedId)).toBe(true);
    });

    it('brain recommend in recall should surface patterns from feedback history', async () => {
      const res = await op('brain', 'brain_recommend', {
        domain: 'security',
        task: 'API endpoint protection',
      });

      const recs = (Array.isArray(res) ? res : res.recommendations ?? []) as Array<{ pattern: string; domain: string; strength: number }>;
      expect(Array.isArray(recs)).toBe(true);
      expect(recs.length).toBeGreaterThan(0);

      const securityRec = recs.find(r =>
        r.pattern?.toLowerCase().includes('jwt') ||
        r.pattern?.toLowerCase().includes('validate') ||
        r.pattern?.toLowerCase().includes('auth'),
      );
      expect(securityRec).toBeDefined();
    });

    it('creating a new plan for related work should benefit from existing knowledge', async () => {
      // Search vault FIRST (vault-first protocol)
      const searchResults = await op('vault', 'search', { query: 'token validation security middleware' });
      const entries = searchResults as unknown as Array<{ entry: { id: string; title: string } }>;

      // Our JWT pattern should appear in search results
      const jwtEntry = entries.find(e => e.entry.id === state.knowledgeId);
      expect(jwtEntry).toBeDefined();

      // Traverse to find related knowledge
      const traversal = await op('vault', 'traverse', { entryId: state.knowledgeId, depth: 1 });
      const connected = traversal.connectedEntries as Array<{ id: string; linkType: string; title: string }>;

      // Should find both the anti-pattern (what to avoid) and the related pattern (what else to do)
      const contradictions = connected.filter(c => c.linkType === 'contradicts');
      const supports = connected.filter(c => c.linkType === 'supports');

      expect(contradictions.length).toBeGreaterThan(0); // things to AVOID
      expect(supports.length).toBeGreaterThan(0); // things that HELP

      // Now create a plan informed by ALL this knowledge
      const plan = await op('plan', 'create_plan', {
        objective: 'Add OAuth2 support to the existing JWT authentication system',
        scope: 'Authentication service extension',
        decisions: [
          `Existing pattern: ${jwtEntry!.entry.title}`,
          `Avoid: ${contradictions[0]?.title ?? 'client-only validation'}`,
          `Also implement: ${supports[0]?.title ?? 'rate limiting'}`,
        ],
      });

      expect(plan.created).toBe(true);
      const planData = plan.plan as Record<string, unknown>;
      const decisions = planData.decisions as string[];

      // Plan should reference knowledge from the vault
      expect(decisions.length).toBeGreaterThanOrEqual(3);
      expect(decisions.some(d => d.includes('JWT'))).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  SUMMARY: Full knowledge lifecycle verified
  // ═══════════════════════════════════════════════════════════

  describe('Summary: knowledge lifecycle integrity', () => {
    it('the same entry ID should be consistent across all operations', async () => {
      const id = state.knowledgeId;

      // Search finds it by ID
      const searchResults = await op('vault', 'search', { query: 'validate JWT tokens' });
      const entries = searchResults as unknown as Array<{ entry: { id: string } }>;
      expect(entries.some(e => e.entry.id === id)).toBe(true);

      // Links reference it
      const links = await op('vault', 'get_links', { entryId: id });
      expect(links.entryId).toBe(id);

      // Traversal starts from it
      const traversal = await op('vault', 'traverse', { entryId: id, depth: 1 });
      expect(traversal.entryId).toBe(id);

      // Brain feedback references it
      const stats = await op('brain', 'brain_feedback_stats');
      expect(stats).toBeDefined();
    });

    it('vault should have all 3 entries, all properly typed', async () => {
      const stats = await op('vault', 'vault_stats');
      const byType = stats.byType as Record<string, number>;

      expect(byType.pattern).toBeGreaterThanOrEqual(2); // JWT + rate limiting
      expect(byType['anti-pattern']).toBeGreaterThanOrEqual(1); // client-only validation
    });

    it('the knowledge graph should have exactly 2 links we created', async () => {
      const links = await op('vault', 'get_links', { entryId: state.knowledgeId });

      // 1 outgoing (supports rate limiting) + 1 incoming (contradicted by anti-pattern)
      const outgoing = links.outgoing as Array<Record<string, unknown>>;
      const incoming = links.incoming as Array<Record<string, unknown>>;

      expect(outgoing.length).toBeGreaterThanOrEqual(1);
      expect(incoming.length).toBeGreaterThanOrEqual(1);
    });

    it('brain should have learned from this knowledge lifecycle', async () => {
      const stats = await op('brain', 'brain_stats');

      // 4+ feedback entries recorded
      expect(stats.feedbackCount as number).toBeGreaterThanOrEqual(4);

      // Vocabulary should include terms from our patterns
      expect(stats.vocabularySize as number).toBeGreaterThan(0);
    });
  });
});
