import { describe, it, expect, afterEach } from 'vitest';
import { createAgentRuntime } from '../runtime/runtime.js';
import { createCuratorExtraOps } from '../runtime/curator-extra-ops.js';
import type { AgentRuntime } from '../runtime/types.js';
import type { OpDefinition } from '../facades/types.js';

describe('createCuratorExtraOps', () => {
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
      agentId: 'test-curator-extra',
      vaultPath: ':memory:',
    });
    ops = createCuratorExtraOps(runtime);
  }

  it('should return 9 ops', () => {
    setup();
    expect(ops).toHaveLength(9);
    const names = ops.map((o) => o.name);
    expect(names).toEqual([
      'curator_entry_history',
      'curator_record_snapshot',
      'curator_queue_stats',
      'curator_enrich',
      'curator_hybrid_contradictions',
      'curator_pipeline_status',
      'curator_enqueue_pipeline',
      'curator_schedule_start',
      'curator_schedule_stop',
    ]);
  });

  // ─── curator_record_snapshot ───────────────────────────────────

  describe('curator_record_snapshot', () => {
    it('should record a snapshot and return historyId', async () => {
      setup();
      runtime.vault.seed([
        {
          id: 'snap-1',
          type: 'pattern',
          domain: 'testing',
          title: 'Snapshot Test',
          severity: 'warning',
          description: 'A test entry for snapshots.',
          tags: ['test'],
        },
      ]);
      const result = (await findOp('curator_record_snapshot').handler({
        entryId: 'snap-1',
        changedBy: 'user',
        changeReason: 'manual snapshot',
      })) as { recorded: boolean; historyId: number };

      expect(result.recorded).toBe(true);
      expect(result.historyId).toBeGreaterThan(0);
    });

    it('should return recorded false for missing entry', async () => {
      setup();
      const result = (await findOp('curator_record_snapshot').handler({
        entryId: 'nonexistent',
      })) as { recorded: boolean; historyId: number };

      expect(result.recorded).toBe(false);
      expect(result.historyId).toBe(-1);
    });
  });

  // ─── curator_entry_history ─────────────────────────────────────

  describe('curator_entry_history', () => {
    it('should return version history with 2 snapshots in order', async () => {
      setup();
      runtime.vault.seed([
        {
          id: 'hist-1',
          type: 'pattern',
          domain: 'testing',
          title: 'History Test',
          severity: 'warning',
          description: 'Entry for history test.',
          tags: ['test'],
        },
      ]);

      // Record two snapshots
      runtime.curator.recordSnapshot('hist-1', 'user', 'first snapshot');
      runtime.curator.recordSnapshot('hist-1', 'system', 'second snapshot');

      const result = (await findOp('curator_entry_history').handler({
        entryId: 'hist-1',
      })) as {
        entryId: string;
        history: Array<{
          historyId: number;
          entryId: string;
          snapshot: { title: string };
          changedBy: string;
          changeReason: string | null;
          createdAt: number;
        }>;
        count: number;
      };

      expect(result.entryId).toBe('hist-1');
      expect(result.count).toBe(2);
      expect(result.history).toHaveLength(2);
      // First snapshot first (ASC order)
      expect(result.history[0].changedBy).toBe('user');
      expect(result.history[0].changeReason).toBe('first snapshot');
      expect(result.history[0].snapshot.title).toBe('History Test');
      expect(result.history[1].changedBy).toBe('system');
      expect(result.history[1].changeReason).toBe('second snapshot');
    });

    it('should return empty history for entry with no snapshots', async () => {
      setup();
      runtime.vault.seed([
        {
          id: 'hist-2',
          type: 'pattern',
          domain: 'testing',
          title: 'No History',
          severity: 'warning',
          description: 'Entry with no history.',
          tags: ['test'],
        },
      ]);

      const result = (await findOp('curator_entry_history').handler({
        entryId: 'hist-2',
      })) as { count: number };

      expect(result.count).toBe(0);
    });
  });

  // ─── curator_queue_stats ───────────────────────────────────────

  describe('curator_queue_stats', () => {
    it('should return correct grooming stats', async () => {
      setup();
      // Seed 3 entries
      runtime.vault.seed([
        {
          id: 'qs-1',
          type: 'pattern',
          domain: 'testing',
          title: 'Queue A',
          severity: 'warning',
          description: 'Test.',
          tags: ['test'],
        },
        {
          id: 'qs-2',
          type: 'pattern',
          domain: 'testing',
          title: 'Queue B',
          severity: 'warning',
          description: 'Test.',
          tags: ['test'],
        },
        {
          id: 'qs-3',
          type: 'pattern',
          domain: 'testing',
          title: 'Queue C',
          severity: 'warning',
          description: 'Test.',
          tags: ['test'],
        },
      ]);

      // Groom only 2 of the 3
      runtime.curator.groomEntry('qs-1');
      runtime.curator.groomEntry('qs-2');

      const result = (await findOp('curator_queue_stats').handler({})) as {
        totalEntries: number;
        groomedEntries: number;
        ungroomedEntries: number;
        staleEntries: number;
        freshEntries: number;
        avgDaysSinceGroom: number;
      };

      expect(result.totalEntries).toBe(3);
      expect(result.groomedEntries).toBe(2);
      expect(result.ungroomedEntries).toBe(1);
      // Just groomed, so they should be fresh
      expect(result.freshEntries).toBe(2);
      expect(result.staleEntries).toBe(0);
      expect(result.avgDaysSinceGroom).toBeGreaterThanOrEqual(0);
      expect(result.avgDaysSinceGroom).toBeLessThan(1);
    });

    it('should return zeroes for empty vault', async () => {
      setup();
      const result = (await findOp('curator_queue_stats').handler({})) as {
        totalEntries: number;
        groomedEntries: number;
        ungroomedEntries: number;
      };

      expect(result.totalEntries).toBe(0);
      expect(result.groomedEntries).toBe(0);
      expect(result.ungroomedEntries).toBe(0);
    });
  });

  // ─── curator_enrich ────────────────────────────────────────────

  describe('curator_enrich', () => {
    it('should enrich entry with messy metadata', async () => {
      setup();
      runtime.vault.seed([
        {
          id: 'enrich-1',
          type: 'pattern',
          domain: 'testing',
          title: 'avoid using any types',
          severity: 'suggestion',
          description: '  You should avoid using any types in TypeScript.  ',
          tags: ['TypeScript', ' testing ', 'typescript'],
        },
      ]);

      const result = (await findOp('curator_enrich').handler({
        entryId: 'enrich-1',
      })) as {
        enriched: boolean;
        changes: Array<{ field: string; before: string; after: string }>;
      };

      expect(result.enriched).toBe(true);
      expect(result.changes.length).toBeGreaterThan(0);

      // Check specific changes
      const fieldNames = result.changes.map((c) => c.field);

      // Title should be capitalized
      expect(fieldNames).toContain('title');
      const titleChange = result.changes.find((c) => c.field === 'title')!;
      expect(titleChange.after).toBe('Avoid using any types');

      // Tags should be normalized (lowercase, trimmed, deduped)
      expect(fieldNames).toContain('tags');
      const tagChange = result.changes.find((c) => c.field === 'tags')!;
      const normalizedTags = JSON.parse(tagChange.after);
      expect(normalizedTags).toEqual(['typescript', 'testing']);

      // Type should be inferred as anti-pattern (starts with "avoid")
      expect(fieldNames).toContain('type');
      const typeChange = result.changes.find((c) => c.field === 'type')!;
      expect(typeChange.after).toBe('anti-pattern');

      // Description should be trimmed
      expect(fieldNames).toContain('description');
      const descChange = result.changes.find((c) => c.field === 'description')!;
      expect(descChange.after).toBe('You should avoid using any types in TypeScript.');

      // Verify the entry was actually updated in the vault
      const updated = runtime.vault.get('enrich-1');
      expect(updated).not.toBeNull();
      expect(updated!.type).toBe('anti-pattern');
      expect(updated!.title).toBe('Avoid using any types');

      // Verify a snapshot was recorded
      const history = runtime.curator.getVersionHistory('enrich-1');
      expect(history.length).toBeGreaterThan(0);
    });

    it('should return enriched false for clean entry', async () => {
      setup();
      runtime.vault.seed([
        {
          id: 'enrich-2',
          type: 'pattern',
          domain: 'testing',
          title: 'Clean entry with proper metadata',
          severity: 'warning',
          description: 'This entry is already clean.',
          tags: ['clean', 'testing'],
        },
      ]);

      const result = (await findOp('curator_enrich').handler({
        entryId: 'enrich-2',
      })) as {
        enriched: boolean;
        changes: Array<{ field: string; before: string; after: string }>;
      };

      expect(result.enriched).toBe(false);
      expect(result.changes).toEqual([]);
    });

    it('should return enriched false for missing entry', async () => {
      setup();
      const result = (await findOp('curator_enrich').handler({
        entryId: 'nonexistent',
      })) as { enriched: boolean };

      expect(result.enriched).toBe(false);
    });

    it('should infer severity from critical keywords', async () => {
      setup();
      runtime.vault.seed([
        {
          id: 'enrich-3',
          type: 'rule',
          domain: 'security',
          title: 'Never expose API keys',
          severity: 'suggestion',
          description: 'API keys must not be committed to version control.',
          tags: ['security'],
        },
      ]);

      const result = (await findOp('curator_enrich').handler({
        entryId: 'enrich-3',
      })) as {
        enriched: boolean;
        changes: Array<{ field: string; before: string; after: string }>;
      };

      expect(result.enriched).toBe(true);
      const severityChange = result.changes.find((c) => c.field === 'severity');
      expect(severityChange).toBeDefined();
      expect(severityChange!.after).toBe('critical');
    });
  });

  // ─── curator_hybrid_contradictions ──────────────────────────────

  describe('curator_hybrid_contradictions', () => {
    it('should return empty contradictions and tfidf-only method', async () => {
      setup();
      const result = (await findOp('curator_hybrid_contradictions').handler({})) as {
        contradictions: unknown[];
        method: string;
      };
      expect(result.contradictions).toEqual([]);
      expect(result.method).toBe('tfidf-only');
    });

    it('should have read auth', () => {
      setup();
      expect(findOp('curator_hybrid_contradictions').auth).toBe('read');
    });
  });

  // ─── Auth levels ───────────────────────────────────────────────

  describe('auth levels', () => {
    it('should use read auth for query ops', () => {
      setup();
      expect(findOp('curator_entry_history').auth).toBe('read');
      expect(findOp('curator_queue_stats').auth).toBe('read');
    });

    it('should use write auth for mutation ops', () => {
      setup();
      expect(findOp('curator_record_snapshot').auth).toBe('write');
      expect(findOp('curator_enrich').auth).toBe('write');
    });
  });
});
