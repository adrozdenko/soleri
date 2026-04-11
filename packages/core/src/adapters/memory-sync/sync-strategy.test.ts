import { describe, it, expect } from 'vitest';
import { selectEntriesForSync } from './sync-strategy.js';
import type { MemorySyncConfig } from './types.js';
import { DEFAULT_SYNC_CONFIG } from './types.js';

// ─── Test Helpers ───────────────────────────────────────────────────

interface MockMemory {
  id: string;
  type: 'session' | 'lesson' | 'preference';
  context: string;
  summary: string;
  projectPath: string;
  createdAt: number;
  topics: string[];
  archivedAt: number | null;
}

function createMockMemory(overrides: Partial<MockMemory> = {}): MockMemory {
  return {
    id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: 'lesson',
    context: 'Test context',
    summary: 'Test summary for this memory entry',
    projectPath: '.',
    createdAt: Date.now(),
    topics: [],
    archivedAt: null,
    ...overrides,
  };
}

function createConfig(overrides: Partial<MemorySyncConfig> = {}): MemorySyncConfig {
  return { ...DEFAULT_SYNC_CONFIG, ...overrides };
}

// ─── Sync Strategy ──────────────────────────────────────────────────

describe('selectEntriesForSync', () => {
  it('should convert memories to MemorySyncEntry format', () => {
    const memories = [createMockMemory({ type: 'preference', summary: 'User prefers dark mode' })];
    const entries = selectEntriesForSync(memories, [], createConfig());

    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('user');
    expect(entries[0].sourceTable).toBe('memory');
    expect(entries[0].contentHash).toBeTruthy();
  });

  it('should prioritize preferences over sessions over lessons', () => {
    const memories = [
      createMockMemory({
        id: 'lesson',
        type: 'lesson',
        summary: 'A lesson',
        createdAt: Date.now(),
      }),
      createMockMemory({
        id: 'pref',
        type: 'preference',
        summary: 'A preference',
        createdAt: Date.now() - 10000,
      }),
      createMockMemory({
        id: 'session',
        type: 'session',
        summary: 'A session',
        createdAt: Date.now() - 5000,
      }),
    ];
    const entries = selectEntriesForSync(memories, [], createConfig({ maxEntries: 3 }));

    // Preferences first, then sessions, then lessons
    expect(entries[0].sourceId).toBe('pref');
    expect(entries[1].sourceId).toBe('session');
    expect(entries[2].sourceId).toBe('lesson');
  });

  it('should respect maxEntries cap', () => {
    const memories = Array.from({ length: 100 }, (_, i) =>
      createMockMemory({ id: `mem-${i}`, summary: `Memory ${i}` }),
    );
    const entries = selectEntriesForSync(memories, [], createConfig({ maxEntries: 10 }));

    expect(entries.length).toBeLessThanOrEqual(10);
  });

  it('should filter out archived memories', () => {
    const memories = [
      createMockMemory({ id: 'active', archivedAt: null }),
      createMockMemory({ id: 'archived', archivedAt: Date.now() - 1000 }),
    ];
    const entries = selectEntriesForSync(memories, [], createConfig());

    expect(entries).toHaveLength(1);
    expect(entries[0].sourceId).toBe('active');
  });

  it('should filter out stale memories based on staleDays', () => {
    const now = Date.now();
    const oldDate = now - 91 * 24 * 60 * 60 * 1000; // 91 days ago

    const memories = [
      createMockMemory({ id: 'fresh', createdAt: now }),
      createMockMemory({ id: 'stale', createdAt: oldDate }),
    ];
    const entries = selectEntriesForSync(memories, [], createConfig({ staleDays: 90 }));

    expect(entries).toHaveLength(1);
    expect(entries[0].sourceId).toBe('fresh');
  });

  it('should return empty array for empty input', () => {
    const entries = selectEntriesForSync([], [], createConfig());
    expect(entries).toHaveLength(0);
  });

  it('should generate stable content hashes for same content', () => {
    const memory = createMockMemory({ id: 'stable', summary: 'Same content' });
    const entries1 = selectEntriesForSync([memory], [], createConfig());
    const entries2 = selectEntriesForSync([memory], [], createConfig());

    expect(entries1[0].contentHash).toBe(entries2[0].contentHash);
  });

  it('should map memory types to sync entry types correctly', () => {
    const memories = [
      createMockMemory({ id: 'pref', type: 'preference' }),
      createMockMemory({ id: 'session', type: 'session' }),
      createMockMemory({ id: 'lesson', type: 'lesson' }),
    ];
    const entries = selectEntriesForSync(memories, [], createConfig());

    const pref = entries.find((e) => e.sourceId === 'pref');
    const session = entries.find((e) => e.sourceId === 'session');
    const lesson = entries.find((e) => e.sourceId === 'lesson');

    expect(pref!.type).toBe('user');
    expect(session!.type).toBe('project');
    expect(lesson!.type).toBe('feedback');
  });

  it('should truncate oneLineHook to under 150 chars', () => {
    const longSummary = 'A'.repeat(300);
    const memories = [createMockMemory({ summary: longSummary })];
    const entries = selectEntriesForSync(memories, [], createConfig());

    expect(entries[0].oneLineHook.length).toBeLessThanOrEqual(150);
  });

  it('should include vault entries tagged as user-facing', () => {
    const vaultEntries = [
      {
        id: 've-1',
        type: 'pattern' as const,
        domain: 'workflow',
        title: 'Always use conventional commits',
        description: 'Use feat:, fix:, chore: prefixes.',
        tags: ['user-facing', 'workflow'],
        severity: 'suggestion' as const,
        createdAt: Date.now(),
        archivedAt: null as number | null,
      },
    ];
    const entries = selectEntriesForSync([], vaultEntries, createConfig());

    expect(entries).toHaveLength(1);
    expect(entries[0].sourceTable).toBe('entry');
  });

  it('should exclude anti-patterns from vault entries', () => {
    const vaultEntries = [
      {
        id: 've-anti',
        type: 'anti-pattern' as const,
        domain: 'workflow',
        title: 'Do not use any types',
        description: 'Internal rule.',
        tags: ['user-facing'],
        severity: 'critical' as const,
        createdAt: Date.now(),
        archivedAt: null as number | null,
      },
    ];
    const entries = selectEntriesForSync([], vaultEntries, createConfig());

    expect(entries).toHaveLength(0);
  });
});
