/**
 * Memory sync adapter abstraction — sync vault memories to host auto-memory.
 *
 * SEPARATE from enforcement HostAdapter (which translates rules) and
 * RuntimeAdapter (which dispatches tasks). This is about syncing knowledge
 * from the vault DB to the host's native memory format so it's always
 * loaded into context without MCP tool calls.
 *
 * One-directional: vault → host. Vault remains the source of truth.
 */

// ─── Sync Entry ────────────────────────────────────────────────────

/** A memory entry prepared for syncing to a host */
export interface MemorySyncEntry {
  /** Unique identifier for this synced entry */
  id: string;
  /** Memory type: user, feedback, project, reference (maps to Claude Code memory types) */
  type: 'user' | 'feedback' | 'project' | 'reference';
  /** Short title for the memory file */
  title: string;
  /** Full description / memory content */
  description: string;
  /** One-line summary for the index (< 150 chars) */
  oneLineHook: string;
  /** Source ID in the vault DB (memory.id or entry.id) */
  sourceId: string;
  /** Source table: 'memory' or 'entry' */
  sourceTable: 'memory' | 'entry';
  /** When this entry was last synced */
  syncedAt: number;
  /** Content hash for idempotent diffing */
  contentHash: string;
}

// ─── Sync Result ───────────────────────────────────────────────────

/** Result of a sync operation */
export interface MemorySyncResult {
  /** Number of entries written (new or updated) */
  synced: number;
  /** Number of entries skipped (unchanged) */
  skipped: number;
  /** Number of stale entries removed */
  removed: number;
  /** Errors encountered (non-fatal) */
  errors: string[];
  /** Entries that were synced (for reporting) */
  entries: Array<{ id: string; title: string; action: 'created' | 'updated' | 'removed' }>;
}

// ─── Sync Config ───────────────────────────────────────────────────

/** Configuration for memory sync behavior */
export interface MemorySyncConfig {
  /** Max entries to sync (default: 50) */
  maxEntries: number;
  /** Max lines in the index file, e.g. MEMORY.md (default: 180, stays under 200-line limit) */
  maxIndexLines: number;
  /** Which memory types to include in sync */
  allowedTypes: Array<'user' | 'feedback' | 'project' | 'reference'>;
  /** Auto-remove entries older than N days (default: 90) */
  staleDays: number;
  /** Project path for scoping memories */
  projectPath: string;
}

/** Sensible defaults */
export const DEFAULT_SYNC_CONFIG: MemorySyncConfig = {
  maxEntries: 50,
  maxIndexLines: 180,
  allowedTypes: ['user', 'feedback', 'project', 'reference'],
  staleDays: 90,
  projectPath: '.',
};

// ─── Sync Manifest ─────────────────────────────────────────────────

/** Tracks what was synced for diffing and cleanup */
export interface SyncManifest {
  /** When the last sync ran */
  lastSyncedAt: number;
  /** Host that was synced to */
  host: string;
  /** Entries currently synced */
  entries: Array<{
    id: string;
    sourceId: string;
    contentHash: string;
    syncedAt: number;
    fileName: string;
  }>;
}

// ─── Memory Sync Adapter Interface ─────────────────────────────────

/** Core adapter interface — implement this for each AI host's memory system */
export interface MemorySyncAdapter {
  /** Host identifier (e.g., 'claude-code', 'opencode') */
  readonly host: string;

  /** Check if this host's memory system is available and writable */
  detectSupport(): boolean;

  /** Sync entries to the host's memory format. Idempotent. */
  sync(entries: MemorySyncEntry[], config: MemorySyncConfig): MemorySyncResult;

  /** Read the current sync manifest (what's already synced) */
  readManifest(): SyncManifest | null;

  /** Remove all synced entries from the host */
  clear(): MemorySyncResult;
}
