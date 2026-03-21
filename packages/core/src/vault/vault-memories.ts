/**
 * Vault memory/session operations — capture, search, list, export, import, prune, dedup.
 * Extracted from vault.ts as part of Wave 0C decomposition.
 */
import type { PersistenceProvider } from '../persistence/types.js';
import type { Memory, MemoryStats } from './vault.js';

export function captureMemory(
  provider: PersistenceProvider,
  memory: Omit<Memory, 'id' | 'createdAt' | 'archivedAt'>,
): Memory {
  const id = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  provider.run(
    `INSERT INTO memories (id, project_path, type, context, summary, topics, files_modified, tools_used, intent, decisions, current_state, next_steps, vault_entries_referenced)
     VALUES (@id, @projectPath, @type, @context, @summary, @topics, @filesModified, @toolsUsed, @intent, @decisions, @currentState, @nextSteps, @vaultEntriesReferenced)`,
    {
      id,
      projectPath: memory.projectPath,
      type: memory.type,
      context: memory.context,
      summary: memory.summary,
      topics: JSON.stringify(memory.topics),
      filesModified: JSON.stringify(memory.filesModified),
      toolsUsed: JSON.stringify(memory.toolsUsed),
      intent: memory.intent ?? null,
      decisions: JSON.stringify(memory.decisions ?? []),
      currentState: memory.currentState ?? null,
      nextSteps: JSON.stringify(memory.nextSteps ?? []),
      vaultEntriesReferenced: JSON.stringify(memory.vaultEntriesReferenced ?? []),
    },
  );
  return getMemory(provider, id)!;
}

export function getMemory(provider: PersistenceProvider, id: string): Memory | null {
  const row = provider.get<Record<string, unknown>>('SELECT * FROM memories WHERE id = ?', [id]);
  return row ? rowToMemory(row) : null;
}

export function deleteMemory(provider: PersistenceProvider, id: string): boolean {
  return provider.run('DELETE FROM memories WHERE id = ?', [id]).changes > 0;
}

export function searchMemories(
  provider: PersistenceProvider,
  query: string,
  options?: { type?: string; projectPath?: string; intent?: string; limit?: number },
): Memory[] {
  const limit = options?.limit ?? 10;
  const filters: string[] = ['m.archived_at IS NULL'];
  const fp: Record<string, unknown> = {};
  if (options?.type) {
    filters.push('m.type = @type');
    fp.type = options.type;
  }
  if (options?.projectPath) {
    filters.push('m.project_path = @projectPath');
    fp.projectPath = options.projectPath;
  }
  if (options?.intent) {
    filters.push('m.intent = @intent');
    fp.intent = options.intent;
  }
  const wc = filters.length > 0 ? `AND ${filters.join(' AND ')}` : '';
  try {
    const rows = provider.all<Record<string, unknown>>(
      `SELECT m.* FROM memories_fts fts JOIN memories m ON m.rowid = fts.rowid WHERE memories_fts MATCH @query ${wc} ORDER BY rank LIMIT @limit`,
      { query, limit, ...fp },
    );
    return rows.map(rowToMemory);
  } catch {
    return [];
  }
}

export function listMemories(
  provider: PersistenceProvider,
  options?: { type?: string; projectPath?: string; limit?: number; offset?: number },
): Memory[] {
  const filters: string[] = ['archived_at IS NULL'];
  const params: Record<string, unknown> = {};
  if (options?.type) {
    filters.push('type = @type');
    params.type = options.type;
  }
  if (options?.projectPath) {
    filters.push('project_path = @projectPath');
    params.projectPath = options.projectPath;
  }
  const wc = `WHERE ${filters.join(' AND ')}`;
  const rows = provider.all<Record<string, unknown>>(
    `SELECT * FROM memories ${wc} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`,
    { ...params, limit: options?.limit ?? 50, offset: options?.offset ?? 0 },
  );
  return rows.map(rowToMemory);
}

export function memoryStats(provider: PersistenceProvider): MemoryStats {
  const total = provider.get<{ count: number }>(
    'SELECT COUNT(*) as count FROM memories WHERE archived_at IS NULL',
  )!.count;
  const byTypeRows = provider.all<{ key: string; count: number }>(
    'SELECT type as key, COUNT(*) as count FROM memories WHERE archived_at IS NULL GROUP BY type',
  );
  const byProjectRows = provider.all<{ key: string; count: number }>(
    'SELECT project_path as key, COUNT(*) as count FROM memories WHERE archived_at IS NULL GROUP BY project_path',
  );
  return {
    total,
    byType: Object.fromEntries(byTypeRows.map((r) => [r.key, r.count])),
    byProject: Object.fromEntries(byProjectRows.map((r) => [r.key, r.count])),
  };
}

export function memoryStatsDetailed(
  provider: PersistenceProvider,
  options?: { projectPath?: string; fromDate?: number; toDate?: number },
): MemoryStats & { oldest: number | null; newest: number | null; archivedCount: number } {
  const filters: string[] = [];
  const params: Record<string, unknown> = {};
  if (options?.projectPath) {
    filters.push('project_path = @projectPath');
    params.projectPath = options.projectPath;
  }
  if (options?.fromDate) {
    filters.push('created_at >= @fromDate');
    params.fromDate = options.fromDate;
  }
  if (options?.toDate) {
    filters.push('created_at <= @toDate');
    params.toDate = options.toDate;
  }
  const wc = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  const total = provider.get<{ count: number }>(
    `SELECT COUNT(*) as count FROM memories ${wc}${wc ? ' AND' : ' WHERE'} archived_at IS NULL`,
    params,
  )!.count;

  const archivedCount = provider.get<{ count: number }>(
    `SELECT COUNT(*) as count FROM memories ${wc}${wc ? ' AND' : ' WHERE'} archived_at IS NOT NULL`,
    params,
  )!.count;

  const byTypeRows = provider.all<{ key: string; count: number }>(
    `SELECT type as key, COUNT(*) as count FROM memories ${wc}${wc ? ' AND' : ' WHERE'} archived_at IS NULL GROUP BY type`,
    params,
  );

  const byProjectRows = provider.all<{ key: string; count: number }>(
    `SELECT project_path as key, COUNT(*) as count FROM memories ${wc}${wc ? ' AND' : ' WHERE'} archived_at IS NULL GROUP BY project_path`,
    params,
  );

  const dateRange = provider.get<{ oldest: number | null; newest: number | null }>(
    `SELECT MIN(created_at) as oldest, MAX(created_at) as newest FROM memories ${wc}${wc ? ' AND' : ' WHERE'} archived_at IS NULL`,
    params,
  )!;

  return {
    total,
    byType: Object.fromEntries(byTypeRows.map((r) => [r.key, r.count])),
    byProject: Object.fromEntries(byProjectRows.map((r) => [r.key, r.count])),
    oldest: dateRange.oldest,
    newest: dateRange.newest,
    archivedCount,
  };
}

export function exportMemories(
  provider: PersistenceProvider,
  options?: { projectPath?: string; type?: string; includeArchived?: boolean },
): Memory[] {
  const filters: string[] = [];
  const params: Record<string, unknown> = {};
  if (!options?.includeArchived) {
    filters.push('archived_at IS NULL');
  }
  if (options?.projectPath) {
    filters.push('project_path = @projectPath');
    params.projectPath = options.projectPath;
  }
  if (options?.type) {
    filters.push('type = @type');
    params.type = options.type;
  }
  const wc = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = provider.all<Record<string, unknown>>(
    `SELECT * FROM memories ${wc} ORDER BY created_at ASC`,
    Object.keys(params).length > 0 ? params : undefined,
  );
  return rows.map(rowToMemory);
}

export function importMemories(
  provider: PersistenceProvider,
  memories: Memory[],
): { imported: number; skipped: number } {
  const sql = `
    INSERT OR IGNORE INTO memories (id, project_path, type, context, summary, topics, files_modified, tools_used, created_at, archived_at)
    VALUES (@id, @projectPath, @type, @context, @summary, @topics, @filesModified, @toolsUsed, @createdAt, @archivedAt)
  `;
  let imported = 0;
  let skipped = 0;
  provider.transaction(() => {
    for (const m of memories) {
      const result = provider.run(sql, {
        id: m.id,
        projectPath: m.projectPath,
        type: m.type,
        context: m.context,
        summary: m.summary,
        topics: JSON.stringify(m.topics),
        filesModified: JSON.stringify(m.filesModified),
        toolsUsed: JSON.stringify(m.toolsUsed),
        createdAt: m.createdAt,
        archivedAt: m.archivedAt,
      });
      if (result.changes > 0) imported++;
      else skipped++;
    }
  });
  return { imported, skipped };
}

export function pruneMemories(
  provider: PersistenceProvider,
  olderThanDays: number,
): { pruned: number } {
  const cutoff = Math.floor(Date.now() / 1000) - olderThanDays * 86400;
  const result = provider.run(
    'DELETE FROM memories WHERE created_at < ? AND archived_at IS NULL',
    [cutoff],
  );
  return { pruned: result.changes };
}

export function deduplicateMemories(
  provider: PersistenceProvider,
): { removed: number; groups: Array<{ kept: string; removed: string[] }> } {
  const dupeRows = provider.all<{ id1: string; id2: string }>(`
      SELECT m1.id as id1, m2.id as id2
      FROM memories m1
      JOIN memories m2 ON m1.summary = m2.summary
        AND m1.project_path = m2.project_path
        AND m1.type = m2.type
        AND m1.id < m2.id
        AND m1.archived_at IS NULL
        AND m2.archived_at IS NULL
    `);

  const groupMap = new Map<string, Set<string>>();
  for (const row of dupeRows) {
    if (!groupMap.has(row.id1)) groupMap.set(row.id1, new Set());
    groupMap.get(row.id1)!.add(row.id2);
  }

  const groups: Array<{ kept: string; removed: string[] }> = [];
  const toRemove = new Set<string>();
  for (const [kept, removedSet] of groupMap) {
    const removed = [...removedSet].filter((id) => !toRemove.has(id));
    if (removed.length > 0) {
      groups.push({ kept, removed });
      for (const id of removed) toRemove.add(id);
    }
  }

  if (toRemove.size > 0) {
    provider.transaction(() => {
      for (const id of toRemove) {
        provider.run('DELETE FROM memories WHERE id = ?', [id]);
      }
    });
  }

  return { removed: toRemove.size, groups };
}

export function memoryTopics(
  provider: PersistenceProvider,
): Array<{ topic: string; count: number }> {
  const rows = provider.all<{ topics: string }>(
    'SELECT topics FROM memories WHERE archived_at IS NULL',
  );

  const topicCounts = new Map<string, number>();
  for (const row of rows) {
    const topics: string[] = JSON.parse(row.topics || '[]');
    for (const topic of topics) {
      topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    }
  }

  return [...topicCounts.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count);
}

export function memoriesByProject(
  provider: PersistenceProvider,
): Array<{ project: string; count: number; memories: Memory[] }> {
  const rows = provider.all<{ project: string; count: number }>(
    'SELECT project_path as project, COUNT(*) as count FROM memories WHERE archived_at IS NULL GROUP BY project_path ORDER BY count DESC',
  );

  return rows.map((row) => {
    const mems = provider.all<Record<string, unknown>>(
      'SELECT * FROM memories WHERE project_path = ? AND archived_at IS NULL ORDER BY created_at DESC',
      [row.project],
    );
    return {
      project: row.project,
      count: row.count,
      memories: mems.map(rowToMemory),
    };
  });
}

// ── Helper ──────────────────────────────────────────────────────────────

export function rowToMemory(row: Record<string, unknown>): Memory {
  return {
    id: row.id as string,
    projectPath: row.project_path as string,
    type: row.type as Memory['type'],
    context: row.context as string,
    summary: row.summary as string,
    topics: JSON.parse((row.topics as string) || '[]'),
    filesModified: JSON.parse((row.files_modified as string) || '[]'),
    toolsUsed: JSON.parse((row.tools_used as string) || '[]'),
    intent: (row.intent as string) ?? null,
    decisions: JSON.parse((row.decisions as string) || '[]'),
    currentState: (row.current_state as string) ?? null,
    nextSteps: JSON.parse((row.next_steps as string) || '[]'),
    vaultEntriesReferenced: JSON.parse((row.vault_entries_referenced as string) || '[]'),
    createdAt: row.created_at as number,
    archivedAt: (row.archived_at as number) ?? null,
  };
}
