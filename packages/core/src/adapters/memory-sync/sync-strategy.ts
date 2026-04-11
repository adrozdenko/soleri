/**
 * Sync strategy — selects which vault memories/entries to sync to host auto-memory.
 *
 * Priority order:
 * 1. User preferences (always sync, highest priority)
 * 2. Recent session summaries (high priority)
 * 3. User-facing vault patterns/rules (medium priority)
 * 4. Lessons / feedback (medium priority)
 *
 * Filters out: archived, stale (older than staleDays), anti-patterns, internal rules.
 */

import { createHash } from 'node:crypto';
import type { MemorySyncEntry, MemorySyncConfig } from './types.js';

// ─── Memory type from vault DB ─────────────────────────────────────

export interface VaultMemory {
  id: string;
  type: 'session' | 'lesson' | 'preference';
  context: string;
  summary: string;
  projectPath: string;
  createdAt: number;
  topics: string[];
  archivedAt: number | null;
}

export interface VaultEntry {
  id: string;
  type: string;
  domain: string;
  title: string;
  description: string;
  tags: string[];
  severity: string;
  createdAt: number;
  archivedAt: number | null;
}

// ─── Type mapping ──────────────────────────────────────────────────

/** Map vault memory types to sync entry types */
const MEMORY_TYPE_MAP: Record<string, MemorySyncEntry['type']> = {
  preference: 'user',
  session: 'project',
  lesson: 'feedback',
};

/** Priority weights — higher = more important */
const TYPE_PRIORITY: Record<string, number> = {
  preference: 100,
  session: 80,
  lesson: 60,
};

// ─── Content hashing ───────────────────────────────────────────────

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

// ─── One-line hook generation ──────────────────────────────────────

function truncateHook(text: string, maxLen = 147): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
}

// ─── Timestamp normalization ───────────────────────────────────────

/** Normalize a timestamp that might be in seconds or milliseconds */
function normalizeTs(ts: number): number {
  // If timestamp is less than 1e12, it's in seconds — convert to ms
  return ts > 1e12 ? ts : ts * 1000;
}

// ─── Score an entry for sorting ────────────────────────────────────

function scoreMemory(memory: VaultMemory, now: number): number {
  const typePriority = TYPE_PRIORITY[memory.type] ?? 50;
  const createdAtMs = normalizeTs(memory.createdAt);
  const ageMs = now - createdAtMs;
  const ageHours = ageMs / (1000 * 60 * 60);
  // Recency bonus: decays over 30 days (720 hours)
  const recencyBonus = Math.max(0, 50 * (1 - ageHours / 720));
  return typePriority + recencyBonus;
}

// ─── Main strategy function ────────────────────────────────────────

export function selectEntriesForSync(
  memories: VaultMemory[],
  vaultEntries: VaultEntry[],
  config: MemorySyncConfig,
): MemorySyncEntry[] {
  const now = Date.now();
  const staleCutoff = now - config.staleDays * 24 * 60 * 60 * 1000;
  const results: MemorySyncEntry[] = [];

  // ─── Process memories ────────────────────────────────────────
  const filteredMemories = memories.filter((m) => {
    if (m.archivedAt !== null && m.archivedAt !== undefined) return false;
    if (normalizeTs(m.createdAt) < staleCutoff) return false;
    return true;
  });

  // Sort by score (priority + recency)
  const scoredMemories = filteredMemories
    .map((m) => ({ memory: m, score: scoreMemory(m, now) }))
    .sort((a, b) => b.score - a.score);

  for (const { memory } of scoredMemories) {
    const syncType = MEMORY_TYPE_MAP[memory.type] ?? 'reference';
    const description = memory.summary || memory.context;
    const contentForHash = `${memory.type}:${description}`;

    results.push({
      id: memory.id,
      type: syncType,
      title: generateTitle(memory),
      description,
      oneLineHook: truncateHook(description.split('\n')[0]),
      sourceId: memory.id,
      sourceTable: 'memory',
      syncedAt: now,
      contentHash: hashContent(contentForHash),
    });
  }

  // ─── Process vault entries (user-facing only) ─────────────────
  const filteredEntries = vaultEntries.filter((e) => {
    // Only include user-facing entries
    if (!e.tags.includes('user-facing')) return false;
    // Exclude anti-patterns — those are for the engine, not the user
    if (e.type === 'anti-pattern') return false;
    // Exclude archived
    if (e.archivedAt !== null && e.archivedAt !== undefined) return false;
    // Exclude stale
    if (e.createdAt < staleCutoff) return false;
    return true;
  });

  for (const entry of filteredEntries) {
    const contentForHash = `${entry.type}:${entry.description}`;

    results.push({
      id: entry.id,
      type: 'reference',
      title: entry.title,
      description: entry.description,
      oneLineHook: truncateHook(entry.title),
      sourceId: entry.id,
      sourceTable: 'entry',
      syncedAt: now,
      contentHash: hashContent(contentForHash),
    });
  }

  // ─── Cap at maxEntries ────────────────────────────────────────
  // Memory entries are already sorted by score; vault entries come after
  return results.slice(0, config.maxEntries);
}

// ─── Title generation ──────────────────────────────────────────────

function generateTitle(memory: VaultMemory): string {
  // Use first line of summary, or first meaningful chunk
  const text = memory.summary || memory.context;
  const firstLine = text.split('\n')[0].trim();
  if (firstLine.length > 80) {
    return firstLine.slice(0, 77) + '...';
  }
  return firstLine || `${memory.type} memory`;
}
