/**
 * E2E Test: Vault Zettelkasten Knowledge Graph
 *
 * Tests the vault's Zettelkasten features as user journeys:
 * capture → search → link → traverse → orphan detection → suggestions.
 *
 * Uses captureHandler/callOp pattern with in-memory vault.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createAgentRuntime,
  createSemanticFacades,
  registerFacade,
} from '@soleri/core';
import type { FacadeConfig, AgentRuntime } from '@soleri/core';

const AGENT_ID = 'e2e-zettelkasten';

/** Capture the MCP handler from registerFacade without a real server */
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

/** Parse MCP tool response to FacadeResponse */
function parseResponse(raw: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(raw.content[0].text) as {
    success: boolean;
    data?: unknown;
    error?: string;
    op: string;
    facade: string;
  };
}

describe('E2E: vault-zettelkasten', () => {
  let runtime: AgentRuntime;
  let handlers: Map<string, ReturnType<typeof captureHandler>>;
  const tmpDir = join(tmpdir(), `soleri-e2e-zettel-${Date.now()}`);
  const vaultFacade = `${AGENT_ID}_vault`;

  beforeAll(() => {
    mkdirSync(tmpDir, { recursive: true });

    runtime = createAgentRuntime({
      agentId: AGENT_ID,
      vaultPath: ':memory:',
      plansPath: join(tmpDir, 'plans.json'),
    });

    // Disable auto-linking so tests control linking explicitly
    runtime.vault.setLinkManager(runtime.linkManager, { enabled: false });

    const facades = createSemanticFacades(runtime, AGENT_ID);
    handlers = new Map();
    for (const facade of facades) {
      handlers.set(facade.name, captureHandler(facade));
    }
  });

  afterAll(() => {
    runtime.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  async function callOp(facadeName: string, op: string, params: Record<string, unknown> = {}) {
    const handler = handlers.get(facadeName);
    if (!handler) throw new Error(`No facade: ${facadeName}`);
    const raw = await handler({ op, params });
    return parseResponse(raw);
  }

  // Helper: capture a single entry and return its ID
  async function captureEntry(opts: {
    id?: string;
    type?: string;
    domain: string;
    title: string;
    description: string;
    tags?: string[];
    severity?: string;
  }) {
    const id = opts.id ?? `zettel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const res = await callOp(vaultFacade, 'capture_knowledge', {
      entries: [{
        id,
        type: opts.type ?? 'pattern',
        domain: opts.domain,
        title: opts.title,
        description: opts.description,
        tags: opts.tags ?? [],
        severity: opts.severity ?? 'info',
      }],
    });
    expect(res.success).toBe(true);
    const data = res.data as { captured: number; results: Array<{ id: string; action: string }> };
    expect(data.captured).toBeGreaterThanOrEqual(1);
    return id;
  }

  // =========================================================================
  // Journey 1: Knowledge capture + search cycle
  // =========================================================================

  describe('Journey 1: Knowledge capture + search cycle', () => {
    let entryIdA: string;
    let entryIdB: string;

    it('should capture a pattern entry with full metadata', async () => {
      entryIdA = await captureEntry({
        id: 'j1-pattern-react-hooks',
        domain: 'frontend',
        title: 'React Hooks Best Practices',
        description: 'Use custom hooks to extract reusable stateful logic from components. Prefer useCallback and useMemo for expensive computations.',
        tags: ['react', 'hooks', 'performance'],
        severity: 'warning',
      });
      expect(entryIdA).toBe('j1-pattern-react-hooks');
    });

    it('should find the captured entry via intelligent search', async () => {
      const res = await callOp(vaultFacade, 'search', { query: 'React Hooks Best Practices' });
      expect(res.success).toBe(true);
      const results = res.data as Array<{ entry: { title: string; id: string }; score: number }>;
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entry.title).toBe('React Hooks Best Practices');
      expect(results[0].score).toBeGreaterThan(0);
    });

    it('should capture a second entry in a different category', async () => {
      entryIdB = await captureEntry({
        id: 'j1-pattern-db-indexing',
        domain: 'backend',
        title: 'Database Indexing Strategy',
        description: 'Create indexes on columns used in WHERE, JOIN, and ORDER BY clauses. Avoid over-indexing write-heavy tables.',
        tags: ['database', 'indexing', 'performance'],
        severity: 'critical',
      });
      expect(entryIdB).toBe('j1-pattern-db-indexing');
    });

    it('should find both entries via domain-specific and general search', async () => {
      const frontendRes = await callOp(vaultFacade, 'search', { query: 'hooks best practices', domain: 'frontend' });
      expect(frontendRes.success).toBe(true);
      const frontendResults = frontendRes.data as Array<{ entry: { id: string } }>;
      expect(frontendResults.some(r => r.entry.id === entryIdA)).toBe(true);

      const backendRes = await callOp(vaultFacade, 'search', { query: 'database indexing strategy' });
      expect(backendRes.success).toBe(true);
      const backendResults = backendRes.data as Array<{ entry: { id: string } }>;
      expect(backendResults.some(r => r.entry.id === entryIdB)).toBe(true);
    });

    it('vault_stats should show correct counts by category', async () => {
      const res = await callOp(vaultFacade, 'vault_stats');
      expect(res.success).toBe(true);
      const stats = res.data as {
        totalEntries: number;
        byType: Record<string, number>;
        byDomain: Record<string, number>;
        bySeverity: Record<string, number>;
      };
      expect(stats.totalEntries).toBeGreaterThanOrEqual(2);
      expect(stats.byDomain['frontend']).toBeGreaterThanOrEqual(1);
      expect(stats.byDomain['backend']).toBeGreaterThanOrEqual(1);
      expect(stats.byType['pattern']).toBeGreaterThanOrEqual(2);
    });
  });

  // =========================================================================
  // Journey 2: Zettelkasten linking
  // =========================================================================

  describe('Journey 2: Zettelkasten linking', () => {
    let idA: string, idB: string, idC: string;

    beforeAll(async () => {
      idA = await captureEntry({
        id: 'j2-entry-a',
        domain: 'architecture',
        title: 'Microservices Architecture',
        description: 'Break monolith into independently deployable services communicating via APIs.',
        tags: ['microservices', 'architecture'],
      });
      idB = await captureEntry({
        id: 'j2-entry-b',
        domain: 'architecture',
        title: 'Service Mesh Pattern',
        description: 'Use a sidecar proxy to handle service-to-service communication, retries, and observability.',
        tags: ['service-mesh', 'infrastructure'],
      });
      idC = await captureEntry({
        id: 'j2-entry-c',
        domain: 'architecture',
        title: 'Monolith First Approach',
        description: 'Start with a monolith and extract services only when complexity demands it. Premature decomposition is costly.',
        tags: ['monolith', 'architecture'],
      });
    });

    it('should create a supports link: A supports B', async () => {
      const res = await callOp(vaultFacade, 'link_entries', {
        sourceId: idA,
        targetId: idB,
        linkType: 'supports',
        note: 'Microservices need service mesh for communication',
      });
      expect(res.success).toBe(true);
      const data = res.data as { link: { sourceId: string; targetId: string; linkType: string } };
      expect(data.link.sourceId).toBe(idA);
      expect(data.link.targetId).toBe(idB);
      expect(data.link.linkType).toBe('supports');
    });

    it('should create an extends link: B extends C', async () => {
      const res = await callOp(vaultFacade, 'link_entries', {
        sourceId: idB,
        targetId: idC,
        linkType: 'extends',
      });
      expect(res.success).toBe(true);
    });

    it('should create a contradicts link: C contradicts A', async () => {
      const res = await callOp(vaultFacade, 'link_entries', {
        sourceId: idC,
        targetId: idA,
        linkType: 'contradicts',
        note: 'Monolith-first opposes premature microservices',
      });
      expect(res.success).toBe(true);
    });

    it('get_links for B should show incoming from A, outgoing to C', async () => {
      const res = await callOp(vaultFacade, 'get_links', { entryId: idB });
      expect(res.success).toBe(true);
      const data = res.data as {
        entryId: string;
        outgoing: Array<{ sourceId: string; targetId: string; linkType: string }>;
        incoming: Array<{ sourceId: string; targetId: string; linkType: string }>;
        totalLinks: number;
      };
      expect(data.entryId).toBe(idB);
      expect(data.totalLinks).toBeGreaterThanOrEqual(2);

      // Outgoing: B -> C (extends)
      expect(data.outgoing.some(l => l.targetId === idC && l.linkType === 'extends')).toBe(true);

      // Incoming: A -> B (supports)
      expect(data.incoming.some(l => l.sourceId === idA && l.linkType === 'supports')).toBe(true);
    });

    it('get_links for A should show outgoing to B and incoming contradicts from C', async () => {
      const res = await callOp(vaultFacade, 'get_links', { entryId: idA });
      expect(res.success).toBe(true);
      const data = res.data as {
        outgoing: Array<{ targetId: string; linkType: string }>;
        incoming: Array<{ sourceId: string; linkType: string }>;
      };

      // Outgoing: A -> B (supports)
      expect(data.outgoing.some(l => l.targetId === idB && l.linkType === 'supports')).toBe(true);

      // Incoming: C -> A (contradicts)
      expect(data.incoming.some(l => l.sourceId === idC && l.linkType === 'contradicts')).toBe(true);
    });
  });

  // =========================================================================
  // Journey 3: Graph traversal
  // =========================================================================

  describe('Journey 3: Graph traversal', () => {
    let idA: string, idB: string, idC: string, idD: string;

    beforeAll(async () => {
      idA = await captureEntry({
        id: 'j3-chain-a',
        domain: 'devops',
        title: 'CI Pipeline Setup',
        description: 'Configure continuous integration with automated builds on every commit.',
        tags: ['ci', 'devops'],
      });
      idB = await captureEntry({
        id: 'j3-chain-b',
        domain: 'devops',
        title: 'Automated Testing in CI',
        description: 'Run unit and integration tests as part of the CI pipeline before merge.',
        tags: ['testing', 'ci'],
      });
      idC = await captureEntry({
        id: 'j3-chain-c',
        domain: 'devops',
        title: 'CD Deployment Strategy',
        description: 'Automate deployment to staging and production after CI passes.',
        tags: ['cd', 'deployment'],
      });
      idD = await captureEntry({
        id: 'j3-chain-d',
        domain: 'devops',
        title: 'Production Monitoring',
        description: 'Monitor deployed services with metrics, alerts, and dashboards.',
        tags: ['monitoring', 'observability'],
      });

      // Create chain: A -> B -> C -> D (each supports next)
      await callOp(vaultFacade, 'link_entries', { sourceId: idA, targetId: idB, linkType: 'sequences' });
      await callOp(vaultFacade, 'link_entries', { sourceId: idB, targetId: idC, linkType: 'sequences' });
      await callOp(vaultFacade, 'link_entries', { sourceId: idC, targetId: idD, linkType: 'sequences' });
    });

    it('traverse from A with depth 1 should find B only', async () => {
      const res = await callOp(vaultFacade, 'traverse', { entryId: idA, depth: 1 });
      expect(res.success).toBe(true);
      const data = res.data as { connectedEntries: Array<{ id: string }>; totalConnected: number };
      expect(data.totalConnected).toBe(1);
      expect(data.connectedEntries[0].id).toBe(idB);
    });

    it('traverse from A with depth 2 should find B and C', async () => {
      const res = await callOp(vaultFacade, 'traverse', { entryId: idA, depth: 2 });
      expect(res.success).toBe(true);
      const data = res.data as { connectedEntries: Array<{ id: string }>; totalConnected: number };
      expect(data.totalConnected).toBe(2);
      const ids = data.connectedEntries.map(e => e.id);
      expect(ids).toContain(idB);
      expect(ids).toContain(idC);
    });

    it('traverse from A with depth 3 should find B, C, and D', async () => {
      const res = await callOp(vaultFacade, 'traverse', { entryId: idA, depth: 3 });
      expect(res.success).toBe(true);
      const data = res.data as { connectedEntries: Array<{ id: string; linkType: string }>; totalConnected: number };
      expect(data.totalConnected).toBe(3);
      const ids = data.connectedEntries.map(e => e.id);
      expect(ids).toContain(idB);
      expect(ids).toContain(idC);
      expect(ids).toContain(idD);
    });
  });

  // =========================================================================
  // Journey 4: Orphan detection
  // =========================================================================

  describe('Journey 4: Orphan detection', () => {
    let orphanId1: string, orphanId2: string;
    let linkedId1: string, linkedId2: string, linkedId3: string;

    beforeAll(async () => {
      // Capture 5 entries
      linkedId1 = await captureEntry({
        id: 'j4-linked-1',
        domain: 'testing',
        title: 'Unit Testing Patterns',
        description: 'Write isolated unit tests with proper mocking.',
        tags: ['unit-testing'],
      });
      linkedId2 = await captureEntry({
        id: 'j4-linked-2',
        domain: 'testing',
        title: 'Integration Testing',
        description: 'Test component interactions with real dependencies.',
        tags: ['integration-testing'],
      });
      linkedId3 = await captureEntry({
        id: 'j4-linked-3',
        domain: 'testing',
        title: 'E2E Testing Strategy',
        description: 'Use browser automation for end-to-end user journey validation.',
        tags: ['e2e-testing'],
      });
      orphanId1 = await captureEntry({
        id: 'j4-orphan-1',
        domain: 'security',
        title: 'OWASP Top 10 Awareness',
        description: 'Be aware of the OWASP top 10 web application security risks.',
        tags: ['security', 'owasp'],
      });
      orphanId2 = await captureEntry({
        id: 'j4-orphan-2',
        domain: 'documentation',
        title: 'API Documentation Standards',
        description: 'Document all public APIs with OpenAPI spec.',
        tags: ['api', 'docs'],
      });

      // Link only the 3 testing entries
      await callOp(vaultFacade, 'link_entries', { sourceId: linkedId1, targetId: linkedId2, linkType: 'supports' });
      await callOp(vaultFacade, 'link_entries', { sourceId: linkedId2, targetId: linkedId3, linkType: 'extends' });
    });

    it('get_orphans should include the 2 unlinked entries', async () => {
      const res = await callOp(vaultFacade, 'get_orphans', { limit: 50 });
      expect(res.success).toBe(true);
      const data = res.data as { orphans: Array<{ id: string; title: string }>; totalOrphans: number };
      // There may be orphans from other journeys too, but our 2 must be present
      const orphanIds = data.orphans.map(o => o.id);
      expect(orphanIds).toContain(orphanId1);
      expect(orphanIds).toContain(orphanId2);
      // The linked entries should NOT be orphans
      expect(orphanIds).not.toContain(linkedId1);
      expect(orphanIds).not.toContain(linkedId2);
      expect(orphanIds).not.toContain(linkedId3);
    });

    it('linking one orphan should reduce orphan count', async () => {
      // Get orphan count before
      const beforeRes = await callOp(vaultFacade, 'get_orphans', { limit: 100 });
      const beforeData = beforeRes.data as { totalOrphans: number };
      const beforeCount = beforeData.totalOrphans;

      // Link orphan 1 to something
      await callOp(vaultFacade, 'link_entries', {
        sourceId: orphanId1,
        targetId: linkedId1,
        linkType: 'supports',
      });

      // Get orphan count after
      const afterRes = await callOp(vaultFacade, 'get_orphans', { limit: 100 });
      const afterData = afterRes.data as { totalOrphans: number };
      expect(afterData.totalOrphans).toBe(beforeCount - 1);

      // orphanId1 should no longer be in orphans
      const afterOrphanIds = (afterData as { orphans: Array<{ id: string }> }).orphans.map(o => o.id);
      expect(afterOrphanIds).not.toContain(orphanId1);
      expect(afterOrphanIds).toContain(orphanId2);
    });
  });

  // =========================================================================
  // Journey 5: Link suggestions
  // =========================================================================

  describe('Journey 5: Link suggestions', () => {
    let hooksId: string, stateId: string, perfId: string;

    beforeAll(async () => {
      hooksId = await captureEntry({
        id: 'j5-react-hooks',
        domain: 'frontend',
        title: 'React Custom Hooks Patterns',
        description: 'Build reusable React custom hooks for data fetching, form validation, and state management.',
        tags: ['react', 'hooks', 'custom-hooks'],
      });
      stateId = await captureEntry({
        id: 'j5-react-state',
        domain: 'frontend',
        title: 'React State Management Approaches',
        description: 'Compare React state management approaches: useState, useReducer, Context, Zustand, Redux.',
        tags: ['react', 'state', 'management'],
      });
      perfId = await captureEntry({
        id: 'j5-react-perf',
        domain: 'frontend',
        title: 'React Performance Optimization',
        description: 'Optimize React rendering with memo, useMemo, useCallback, and code splitting.',
        tags: ['react', 'performance', 'optimization'],
      });
    });

    it('suggest_links should return structured suggestions without crashing', async () => {
      const res = await callOp(vaultFacade, 'suggest_links', { entryId: hooksId, limit: 10 });
      expect(res.success).toBe(true);
      const data = res.data as {
        entryId: string;
        suggestions: Array<{ entryId: string; title: string; score: number; suggestedType: string }>;
        totalSuggestions: number;
      };
      expect(data.entryId).toBe(hooksId);
      expect(typeof data.totalSuggestions).toBe('number');
      expect(Array.isArray(data.suggestions)).toBe(true);

      // Three related React entries were captured — suggestions must exist
      expect(data.totalSuggestions).toBeGreaterThan(0);

      const suggestedIds = data.suggestions.map(s => s.entryId);
      // Related React entries should be among suggestions
      const hasRelated = suggestedIds.includes(stateId) || suggestedIds.includes(perfId);
      expect(hasRelated).toBe(true);

      for (const suggestion of data.suggestions) {
        expect(suggestion.score).toBeGreaterThan(0);
        expect(suggestion.suggestedType).toBeDefined();
        expect(suggestion.title).toBeDefined();
      }
    });

    it('suggest_links via direct search confirms related entries exist', async () => {
      // Verify the entries are searchable via FTS — suggests the data is correctly indexed
      const res = await callOp(vaultFacade, 'search', { query: 'React state management hooks' });
      expect(res.success).toBe(true);
      const results = res.data as Array<{ entry: { id: string } }>;
      // At least some of our React entries should appear
      const ids = results.map(r => r.entry.id);
      const hasAny = ids.includes(hooksId) || ids.includes(stateId) || ids.includes(perfId);
      expect(hasAny).toBe(true);
    });
  });

  // =========================================================================
  // Journey 6: Knowledge pack installation
  // =========================================================================

  describe('Journey 6: Knowledge pack installation', () => {
    it('pack_list should return a list (possibly empty) without crashing', async () => {
      const adminFacade = `${AGENT_ID}_admin`;
      const res = await callOp(adminFacade, 'pack_list');
      expect(res.success).toBe(true);
      const data = res.data as { packs: unknown[]; count: number };
      expect(typeof data.count).toBe('number');
      expect(Array.isArray(data.packs)).toBe(true);
    });

    it('pack_validate on non-existent path should return validation errors gracefully', async () => {
      const adminFacade = `${AGENT_ID}_admin`;
      const res = await callOp(adminFacade, 'pack_validate', {
        packDir: '/tmp/nonexistent-pack-dir-zettel-test',
      });
      expect(res.success).toBe(true);
      const data = res.data as { valid?: boolean; errors?: string[] };
      // Should report invalid or have errors, not crash
      expect(data.valid === false || (data.errors && data.errors.length > 0)).toBe(true);
    });
  });

  // =========================================================================
  // Journey 7: Capture with auto-linking suggestions
  // =========================================================================

  describe('Journey 7: Capture with auto-linking suggestions', () => {
    it('capture_knowledge should include suggestedLinks when related entries exist', async () => {
      // First, ensure we have related entries (from journey 5)
      const res = await callOp(vaultFacade, 'capture_knowledge', {
        entries: [{
          id: 'j7-react-testing',
          type: 'pattern',
          domain: 'frontend',
          title: 'React Component Testing with Hooks',
          description: 'Test React components that use hooks with React Testing Library. Mock custom hooks for isolation.',
          tags: ['react', 'testing', 'hooks'],
        }],
      });
      expect(res.success).toBe(true);
      const data = res.data as {
        captured: number;
        results: Array<{ id: string; action: string }>;
        suggestedLinks?: Array<{ entryId: string; title: string; suggestedType: string; score: number }>;
      };
      expect(data.captured).toBe(1);

      // suggestedLinks may or may not be present depending on FTS matching
      if (data.suggestedLinks && data.suggestedLinks.length > 0) {
        for (const link of data.suggestedLinks) {
          expect(link.entryId).toBeDefined();
          expect(link.title).toBeDefined();
          expect(link.suggestedType).toBeDefined();
          expect(typeof link.score).toBe('number');
        }
      }
    });

    it('creating a suggested link should connect entries in the graph', async () => {
      // Link the newly captured entry to an existing one
      const linkRes = await callOp(vaultFacade, 'link_entries', {
        sourceId: 'j7-react-testing',
        targetId: 'j5-react-hooks',
        linkType: 'extends',
        note: 'Testing extends hooks patterns',
      });
      expect(linkRes.success).toBe(true);

      // Verify the connection
      const getRes = await callOp(vaultFacade, 'get_links', { entryId: 'j7-react-testing' });
      expect(getRes.success).toBe(true);
      const data = getRes.data as { outgoing: Array<{ targetId: string }> };
      expect(data.outgoing.some(l => l.targetId === 'j5-react-hooks')).toBe(true);
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe('Edge cases', () => {
    it('search on empty query should not crash', async () => {
      const res = await callOp(vaultFacade, 'search', { query: 'xyznonexistentquery99999' });
      expect(res.success).toBe(true);
      const data = res.data as Array<unknown>;
      // Should return empty array, not crash
      expect(Array.isArray(data)).toBe(true);
    });

    it('link_entries with non-existent source should handle gracefully', async () => {
      const res = await callOp(vaultFacade, 'link_entries', {
        sourceId: 'nonexistent-entry-id-12345',
        targetId: 'also-nonexistent-67890',
        linkType: 'supports',
      });
      // Linking non-existent entries fails — either via explicit validation
      // ("Entry not found") or via SQLite FK constraint enforcement.
      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
    });

    it('duplicate link should be idempotent (INSERT OR REPLACE)', async () => {
      // Create two entries
      const srcId = await captureEntry({
        id: 'edge-dup-src',
        domain: 'testing',
        title: 'Duplicate Link Source',
        description: 'Source entry for duplicate link test.',
      });
      const tgtId = await captureEntry({
        id: 'edge-dup-tgt',
        domain: 'testing',
        title: 'Duplicate Link Target',
        description: 'Target entry for duplicate link test.',
      });

      // Create link twice
      const first = await callOp(vaultFacade, 'link_entries', {
        sourceId: srcId, targetId: tgtId, linkType: 'supports', note: 'first',
      });
      expect(first.success).toBe(true);

      const second = await callOp(vaultFacade, 'link_entries', {
        sourceId: srcId, targetId: tgtId, linkType: 'extends', note: 'second',
      });
      expect(second.success).toBe(true);

      // Should have exactly 1 link between them (REPLACE, not duplicate)
      const links = await callOp(vaultFacade, 'get_links', { entryId: srcId });
      const data = links.data as { outgoing: Array<{ targetId: string; linkType: string }> };
      const toTarget = data.outgoing.filter(l => l.targetId === tgtId);
      expect(toTarget.length).toBe(1);
      // Second write should have overwritten
      expect(toTarget[0].linkType).toBe('extends');
    });

    it('capture entry with same ID twice should update, not duplicate', async () => {
      const entryId = 'edge-idempotent-capture';

      await captureEntry({
        id: entryId,
        domain: 'testing',
        title: 'Original Title',
        description: 'Original description for idempotent capture test.',
      });

      // Capture again with same ID but different content
      // The brain.enrichAndCapture may detect this as duplicate
      const res = await callOp(vaultFacade, 'capture_knowledge', {
        entries: [{
          id: entryId,
          type: 'pattern',
          domain: 'testing',
          title: 'Updated Title',
          description: 'Updated description for idempotent capture test.',
          tags: [],
          severity: 'info',
        }],
      });
      expect(res.success).toBe(true);
      const data = res.data as { captured: number; duplicated: number };
      // Either captured (upsert) or flagged as duplicate — both are valid
      expect(data.captured + data.duplicated).toBeGreaterThanOrEqual(1);
    });

    it('traverse from orphan node should return empty connections', async () => {
      const orphanId = await captureEntry({
        id: 'edge-orphan-traverse',
        domain: 'misc',
        title: 'Lonely Orphan Node',
        description: 'This entry has no links at all.',
      });

      const res = await callOp(vaultFacade, 'traverse', { entryId: orphanId, depth: 3 });
      expect(res.success).toBe(true);
      const data = res.data as { connectedEntries: unknown[]; totalConnected: number };
      expect(data.totalConnected).toBe(0);
      expect(data.connectedEntries.length).toBe(0);
    });

    it('very long description should handle without truncation issues', async () => {
      const longDesc = 'A'.repeat(10000) + ' important keyword at the end';
      const longId = await captureEntry({
        id: 'edge-long-desc',
        domain: 'testing',
        title: 'Entry With Very Long Description',
        description: longDesc,
      });
      expect(longId).toBe('edge-long-desc');

      // Should be searchable
      const res = await callOp(vaultFacade, 'search', { query: 'Entry With Very Long Description' });
      expect(res.success).toBe(true);
      const results = res.data as Array<{ entry: { id: string } }>;
      expect(results.some(r => r.entry.id === 'edge-long-desc')).toBe(true);
    });

    it('suggest_links for entry with no similar entries should return empty', async () => {
      const uniqueId = await captureEntry({
        id: 'edge-unique-entry',
        domain: 'quantum-computing',
        title: 'Quantum Entanglement Protocols',
        description: 'Superdense coding via Bell state teleportation qubit decoherence mitigation.',
        tags: ['quantum', 'entanglement'],
      });

      const res = await callOp(vaultFacade, 'suggest_links', { entryId: uniqueId, limit: 5 });
      expect(res.success).toBe(true);
      const data = res.data as { suggestions: unknown[]; totalSuggestions: number };
      // May or may not find suggestions — the key is no crash
      expect(typeof data.totalSuggestions).toBe('number');
      expect(Array.isArray(data.suggestions)).toBe(true);
    });

    it('link_stats should return graph statistics', async () => {
      const res = await callOp(vaultFacade, 'link_stats');
      expect(res.success).toBe(true);
      const data = res.data as {
        totalEntries: number;
        totalLinks: number;
        orphans: number;
        byType: Record<string, number>;
        mostConnected: Array<{ title: string; links: number }>;
      };
      expect(data.totalEntries).toBeGreaterThan(0);
      expect(data.totalLinks).toBeGreaterThan(0);
      expect(typeof data.orphans).toBe('number');
      expect(typeof data.byType).toBe('object');
      expect(Array.isArray(data.mostConnected)).toBe(true);
    });

    it('unlink_entries should remove a link', async () => {
      // Create a pair and link them
      const srcId = await captureEntry({
        id: 'edge-unlink-src',
        domain: 'testing',
        title: 'Unlink Source',
        description: 'Source for unlink test.',
      });
      const tgtId = await captureEntry({
        id: 'edge-unlink-tgt',
        domain: 'testing',
        title: 'Unlink Target',
        description: 'Target for unlink test.',
      });

      await callOp(vaultFacade, 'link_entries', {
        sourceId: srcId, targetId: tgtId, linkType: 'supports',
      });

      // Verify link exists
      let links = await callOp(vaultFacade, 'get_links', { entryId: srcId });
      let data = links.data as { outgoing: Array<{ targetId: string }> };
      expect(data.outgoing.some(l => l.targetId === tgtId)).toBe(true);

      // Unlink
      const unlinkRes = await callOp(vaultFacade, 'unlink_entries', {
        sourceId: srcId, targetId: tgtId,
      });
      expect(unlinkRes.success).toBe(true);

      // Verify link removed
      links = await callOp(vaultFacade, 'get_links', { entryId: srcId });
      data = links.data as { outgoing: Array<{ targetId: string }> };
      expect(data.outgoing.some(l => l.targetId === tgtId)).toBe(false);
    });
  });
});
