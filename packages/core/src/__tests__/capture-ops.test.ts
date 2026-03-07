import { describe, it, expect, afterEach } from 'vitest';
import { createAgentRuntime } from '../runtime/runtime.js';
import { createCaptureOps } from '../runtime/capture-ops.js';
import type { AgentRuntime } from '../runtime/types.js';
import type { OpDefinition } from '../facades/types.js';

describe('createCaptureOps', () => {
  let runtime: AgentRuntime;
  let ops: OpDefinition[];

  function findOp(name: string): OpDefinition {
    const op = ops.find((o) => o.name === name);
    if (!op) throw new Error(`Op "${name}" not found`);
    return op;
  }

  afterEach(() => {
    runtime?.close();
  });

  function setup() {
    runtime = createAgentRuntime({
      agentId: 'test-capture',
      vaultPath: ':memory:',
    });
    ops = createCaptureOps(runtime);
  }

  it('should return 4 ops', () => {
    setup();
    expect(ops).toHaveLength(4);
    const names = ops.map((o) => o.name);
    expect(names).toEqual([
      'capture_knowledge',
      'capture_quick',
      'search_intelligent',
      'search_feedback',
    ]);
  });

  // ─── capture_knowledge ──────────────────────────────────────────

  describe('capture_knowledge', () => {
    it('should batch-capture multiple entries', async () => {
      setup();
      const result = (await findOp('capture_knowledge').handler({
        projectPath: '/test',
        entries: [
          {
            type: 'pattern',
            domain: 'testing',
            title: 'Batch capture pattern one',
            description: 'First test pattern for batch capture.',
            tags: ['test', 'batch'],
          },
          {
            type: 'anti-pattern',
            domain: 'testing',
            title: 'Batch capture anti-pattern two',
            description: 'Second test entry for batch capture.',
            tags: ['test'],
          },
        ],
      })) as { captured: number; proposed: number; rejected: number; results: unknown[] };

      expect(result.captured).toBe(2);
      expect(result.proposed).toBe(0);
      expect(result.rejected).toBe(0);
      expect(result.results).toHaveLength(2);
    });

    it('should auto-generate ID when not provided', async () => {
      setup();
      const result = (await findOp('capture_knowledge').handler({
        entries: [
          {
            type: 'rule',
            domain: 'api',
            title: 'Auto ID test',
            description: 'Should get an auto-generated ID.',
          },
        ],
      })) as { results: Array<{ id: string; action: string }> };

      expect(result.results[0].id).toContain('api-');
      expect(result.results[0].action).toBe('capture');
    });

    it('should use provided ID when specified', async () => {
      setup();
      const result = (await findOp('capture_knowledge').handler({
        entries: [
          {
            id: 'custom-id-123',
            type: 'pattern',
            domain: 'testing',
            title: 'Custom ID test',
            description: 'Has a custom ID.',
          },
        ],
      })) as { results: Array<{ id: string; action: string }> };

      expect(result.results[0].id).toBe('custom-id-123');
      expect(result.results[0].action).toBe('capture');

      // Verify entry actually in vault
      const entry = runtime.vault.get('custom-id-123');
      expect(entry).not.toBeNull();
      expect(entry!.title).toBe('Custom ID test');
    });

    it('should map extended types to vault-compatible types', async () => {
      setup();
      const result = (await findOp('capture_knowledge').handler({
        entries: [
          {
            id: 'wf-1',
            type: 'workflow',
            domain: 'ops',
            title: 'Workflow test',
            description: 'A workflow entry.',
          },
          {
            id: 'pr-1',
            type: 'principle',
            domain: 'ops',
            title: 'Principle test',
            description: 'A principle entry.',
          },
          {
            id: 'ref-1',
            type: 'reference',
            domain: 'ops',
            title: 'Reference test',
            description: 'A reference entry.',
          },
        ],
      })) as { captured: number };

      expect(result.captured).toBe(3);

      // All mapped to 'rule' in vault
      expect(runtime.vault.get('wf-1')!.type).toBe('rule');
      expect(runtime.vault.get('pr-1')!.type).toBe('rule');
      expect(runtime.vault.get('ref-1')!.type).toBe('rule');
    });

    it('should map severity info to suggestion', async () => {
      setup();
      await findOp('capture_knowledge').handler({
        entries: [
          {
            id: 'sev-1',
            type: 'pattern',
            domain: 'testing',
            title: 'Severity mapping test',
            severity: 'info',
            description: 'Info severity entry.',
          },
        ],
      });

      const entry = runtime.vault.get('sev-1');
      expect(entry).not.toBeNull();
      expect(entry!.severity).toBe('suggestion');
    });

    it('should include optional fields', async () => {
      setup();
      await findOp('capture_knowledge').handler({
        entries: [
          {
            id: 'full-1',
            type: 'pattern',
            domain: 'testing',
            title: 'Full entry test',
            severity: 'critical',
            description: 'Full entry with all fields.',
            context: 'Test context',
            example: 'Good example',
            counterExample: 'Bad example',
            why: 'Because testing.',
            tags: ['full', 'complete'],
          },
        ],
      });

      const entry = runtime.vault.get('full-1');
      expect(entry).not.toBeNull();
      expect(entry!.severity).toBe('critical');
      expect(entry!.context).toBe('Test context');
      expect(entry!.example).toBe('Good example');
      expect(entry!.counterExample).toBe('Bad example');
      expect(entry!.why).toBe('Because testing.');
      expect(entry!.tags).toContain('full');
      expect(entry!.tags).toContain('complete');
    });
  });

  // ─── capture_knowledge content-hash dedup ──────────────────────

  describe('capture_knowledge content-hash dedup', () => {
    it('should skip duplicate entries with identical content', async () => {
      setup();
      const entry = {
        type: 'pattern',
        domain: 'testing',
        title: 'Dedup test',
        description: 'Should only be captured once.',
        tags: ['dedup'],
      };

      // First capture succeeds
      const first = (await findOp('capture_knowledge').handler({
        entries: [entry],
      })) as { captured: number; duplicated: number; results: Array<{ action: string }> };
      expect(first.captured).toBe(1);
      expect(first.duplicated).toBe(0);

      // Second capture of same content is skipped
      const second = (await findOp('capture_knowledge').handler({
        entries: [entry],
      })) as {
        captured: number;
        duplicated: number;
        results: Array<{ id: string; action: string }>;
      };
      expect(second.captured).toBe(0);
      expect(second.duplicated).toBe(1);
      expect(second.results[0].action).toBe('duplicate');
    });

    it('should not flag entries with different content as duplicates', async () => {
      setup();
      const result = (await findOp('capture_knowledge').handler({
        entries: [
          { type: 'pattern', domain: 'a', title: 'One', description: 'First.' },
          { type: 'pattern', domain: 'a', title: 'Two', description: 'Second.' },
        ],
      })) as { captured: number; duplicated: number };
      expect(result.captured).toBe(2);
      expect(result.duplicated).toBe(0);
    });
  });

  // ─── capture_quick content-hash dedup ─────────────────────────

  describe('capture_quick content-hash dedup', () => {
    it('should skip duplicate on second quick capture', async () => {
      setup();
      const params = {
        type: 'rule',
        domain: 'testing',
        title: 'Quick dedup',
        description: 'Should only be captured once.',
      };

      const first = (await findOp('capture_quick').handler(params)) as {
        captured: boolean;
        governance: { action: string };
      };
      expect(first.captured).toBe(true);

      const second = (await findOp('capture_quick').handler(params)) as {
        captured: boolean;
        governance: { action: string };
      };
      expect(second.captured).toBe(false);
      expect(second.governance.action).toBe('duplicate');
    });
  });

  // ─── capture_knowledge with governance gating ───────────────────

  describe('capture_knowledge governance gating', () => {
    it('should route entries to proposals under strict preset', async () => {
      setup();
      runtime.governance.applyPreset('/test', 'strict');

      const result = (await findOp('capture_knowledge').handler({
        projectPath: '/test',
        entries: [
          {
            type: 'pattern',
            domain: 'testing',
            title: 'Strict gated entry',
            description: 'Should be proposed, not captured.',
          },
        ],
      })) as { captured: number; proposed: number; results: Array<{ action: string }> };

      expect(result.captured).toBe(0);
      expect(result.proposed).toBe(1);
      expect(result.results[0].action).toBe('propose');
    });
  });

  // ─── capture_quick ──────────────────────────────────────────────

  describe('capture_quick', () => {
    it('should capture a single entry with minimal fields', async () => {
      setup();
      const result = (await findOp('capture_quick').handler({
        type: 'pattern',
        domain: 'testing',
        title: 'Quick capture test',
        description: 'A quickly captured pattern.',
        tags: ['quick'],
      })) as { captured: boolean; id: string; governance: { action: string } };

      expect(result.captured).toBe(true);
      expect(result.id).toContain('testing-');
      expect(result.governance.action).toBe('capture');

      // Verify in vault
      const entry = runtime.vault.get(result.id);
      expect(entry).not.toBeNull();
      expect(entry!.title).toBe('Quick capture test');
      expect(entry!.severity).toBe('suggestion'); // defaults to info -> suggestion
      expect(entry!.tags).toContain('quick');
    });

    it('should propose under strict governance', async () => {
      setup();
      runtime.governance.applyPreset('/test', 'strict');

      const result = (await findOp('capture_quick').handler({
        projectPath: '/test',
        type: 'anti-pattern',
        domain: 'security',
        title: 'Quick gated entry',
        description: 'Should be proposed.',
      })) as { captured: boolean; governance: { action: string; reason?: string } };

      expect(result.captured).toBe(false);
      expect(result.governance.action).toBe('propose');
    });

    it('should default tags to empty array', async () => {
      setup();
      const result = (await findOp('capture_quick').handler({
        type: 'rule',
        domain: 'testing',
        title: 'No tags test',
        description: 'Entry without tags.',
      })) as { captured: boolean; id: string };

      expect(result.captured).toBe(true);
      const entry = runtime.vault.get(result.id);
      expect(entry).not.toBeNull();
      // Tags may include auto-generated ones from brain enrichment
      expect(Array.isArray(entry!.tags)).toBe(true);
    });
  });

  // ─── search_intelligent ─────────────────────────────────────────

  describe('search_intelligent', () => {
    it('should return ranked results from vault', async () => {
      setup();
      runtime.vault.seed([
        {
          id: 'si-1',
          type: 'pattern',
          domain: 'testing',
          title: 'Intelligent search pattern',
          severity: 'warning',
          description: 'A pattern for intelligent search testing.',
          tags: ['search', 'intelligent'],
        },
        {
          id: 'si-2',
          type: 'rule',
          domain: 'testing',
          title: 'Another search rule',
          severity: 'critical',
          description: 'Another entry for search testing.',
          tags: ['search'],
        },
      ]);
      runtime.brain.rebuildVocabulary();

      // Recreate ops after seeding
      ops = createCaptureOps(runtime);
      const results = (await findOp('search_intelligent').handler({
        query: 'intelligent search pattern',
      })) as Array<{ source: string; score?: number }>;

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].source).toBe('vault');
      expect(typeof (results[0] as { score: number }).score).toBe('number');
    });

    it('should filter by domain', async () => {
      setup();
      runtime.vault.seed([
        {
          id: 'sd-1',
          type: 'pattern',
          domain: 'security',
          title: 'Security pattern',
          severity: 'critical',
          description: 'Security search test.',
          tags: ['sec'],
        },
        {
          id: 'sd-2',
          type: 'pattern',
          domain: 'testing',
          title: 'Testing pattern',
          severity: 'warning',
          description: 'Testing search test.',
          tags: ['test'],
        },
      ]);
      runtime.brain.rebuildVocabulary();
      ops = createCaptureOps(runtime);

      const results = (await findOp('search_intelligent').handler({
        query: 'pattern',
        domain: 'security',
      })) as Array<{ entry?: { domain: string } }>;

      for (const r of results) {
        if (r.entry) {
          expect(r.entry.domain).toBe('security');
        }
      }
    });

    it('should include memories when includeMemories is true', async () => {
      setup();
      // Seed vault entries
      runtime.vault.seed([
        {
          id: 'sm-1',
          type: 'pattern',
          domain: 'testing',
          title: 'Memory search vault entry',
          severity: 'warning',
          description: 'Vault entry for memory search test.',
          tags: ['mem'],
        },
      ]);
      // Capture a memory
      runtime.vault.captureMemory({
        projectPath: '/test',
        type: 'lesson',
        context: 'Testing search with memories',
        summary: 'Memory search integration test works correctly',
        topics: ['testing', 'search'],
        filesModified: [],
        toolsUsed: [],
      });
      runtime.brain.rebuildVocabulary();
      ops = createCaptureOps(runtime);

      const results = (await findOp('search_intelligent').handler({
        query: 'memory search',
        includeMemories: true,
      })) as Array<{ source: string }>;

      const sources = results.map((r) => r.source);
      // Should have both vault and memory sources
      expect(sources).toContain('vault');
      expect(sources).toContain('memory');
    });

    it('should not include memories when includeMemories is false', async () => {
      setup();
      runtime.vault.captureMemory({
        projectPath: '/test',
        type: 'lesson',
        context: 'Hidden memory',
        summary: 'This memory should not appear without includeMemories',
        topics: ['hidden'],
        filesModified: [],
        toolsUsed: [],
      });

      const results = (await findOp('search_intelligent').handler({
        query: 'hidden memory',
        includeMemories: false,
      })) as Array<{ source: string }>;

      const memorySources = results.filter((r) => r.source === 'memory');
      expect(memorySources).toHaveLength(0);
    });

    it('should respect limit parameter', async () => {
      setup();
      const seedEntries = Array.from({ length: 10 }, (_, i) => ({
        id: `lim-${i}`,
        type: 'pattern' as const,
        domain: 'testing',
        title: `Limit test pattern ${i}`,
        severity: 'warning' as const,
        description: `Testing limit functionality pattern number ${i}.`,
        tags: ['limit'],
      }));
      runtime.vault.seed(seedEntries);
      runtime.brain.rebuildVocabulary();
      ops = createCaptureOps(runtime);

      const results = (await findOp('search_intelligent').handler({
        query: 'limit test pattern',
        limit: 3,
      })) as unknown[];

      expect(results.length).toBeLessThanOrEqual(3);
    });
  });

  // ─── search_feedback ────────────────────────────────────────────

  describe('search_feedback', () => {
    it('should record positive feedback', async () => {
      setup();
      runtime.vault.seed([
        {
          id: 'fb-1',
          type: 'pattern',
          domain: 'testing',
          title: 'Feedback test entry',
          severity: 'warning',
          description: 'Entry for feedback testing.',
          tags: ['feedback'],
        },
      ]);

      const result = (await findOp('search_feedback').handler({
        query: 'feedback test',
        entryId: 'fb-1',
        helpful: true,
      })) as { recorded: boolean; action: string };

      expect(result.recorded).toBe(true);
      expect(result.action).toBe('accepted');
    });

    it('should record negative feedback', async () => {
      setup();
      const result = (await findOp('search_feedback').handler({
        query: 'irrelevant query',
        entryId: 'some-entry',
        helpful: false,
      })) as { recorded: boolean; action: string };

      expect(result.recorded).toBe(true);
      expect(result.action).toBe('dismissed');
    });

    it('should include context when provided', async () => {
      setup();
      const result = (await findOp('search_feedback').handler({
        query: 'test query',
        entryId: 'some-entry',
        helpful: true,
        context: 'This was very relevant to my task',
      })) as { recorded: boolean; context: string | null };

      expect(result.recorded).toBe(true);
      expect(result.context).toBe('This was very relevant to my task');
    });
  });

  // ─── Auth levels ───────────────────────────────────────────────

  describe('auth levels', () => {
    it('should use read auth for search ops', () => {
      setup();
      expect(findOp('search_intelligent').auth).toBe('read');
    });

    it('should use write auth for capture and feedback ops', () => {
      setup();
      expect(findOp('capture_knowledge').auth).toBe('write');
      expect(findOp('capture_quick').auth).toBe('write');
      expect(findOp('search_feedback').auth).toBe('write');
    });
  });
});
