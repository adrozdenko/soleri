/**
 * Memory sync facade ops — wire sync adapters into the memory facade.
 *
 * Ops: memory_sync_to_host, memory_sync_status, memory_sync_clear
 */

import { z } from 'zod';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../../runtime/types.js';
import { createMemorySyncAdapter, detectSyncHost, DEFAULT_SYNC_CONFIG } from './index.js';
import { selectEntriesForSync } from './sync-strategy.js';
import type { MemorySyncConfig } from './types.js';
import type { VaultMemory, VaultEntry } from './sync-strategy.js';

/**
 * Compute the Claude Code memory directory for a project path.
 *
 * Claude Code uses: ~/.claude/projects/{path-with-dashes}/memory/
 * where slashes in the absolute path are replaced with dashes.
 *
 * Example: /Users/foo/projects/bar → -Users-foo-projects-bar
 */
function claudeCodeMemoryDir(projectPath: string): string {
  const absPath = resolve(projectPath);
  const hash = absPath.replace(/\//g, '-');
  return join(homedir(), '.claude', 'projects', hash, 'memory');
}

/**
 * Compute the host-specific memory path.
 */
function resolveMemoryPath(projectPath: string, host: string): string {
  if (host === 'opencode') {
    return resolve(projectPath);
  }
  return claudeCodeMemoryDir(projectPath);
}

/**
 * Create memory sync ops for the memory facade.
 */
export function createMemorySyncOps(runtime: AgentRuntime): OpDefinition[] {
  const { vault } = runtime;

  return [
    {
      name: 'memory_sync_to_host',
      description:
        'Sync vault memories to the host auto-memory system (Claude Code MEMORY.md or OpenCode context). ' +
        'Vault remains the source of truth — host memory is a hot cache for zero-cost context loading.',
      auth: 'write',
      schema: z.object({
        host: z
          .enum(['claude-code', 'opencode'])
          .optional()
          .describe('Target host (auto-detected if omitted)'),
        projectPath: z.string().optional().default('.'),
        dryRun: z
          .boolean()
          .optional()
          .default(false)
          .describe('Preview what would be synced without writing'),
        maxEntries: z.number().optional().describe('Override max entries to sync'),
        staleDays: z.number().optional().describe('Override stale cutoff in days'),
      }),
      handler: async (params) => {
        const projectPath = resolve((params.projectPath as string) ?? '.');
        const host = (params.host as string) ?? detectSyncHost();
        const memoryPath = resolveMemoryPath(projectPath, host);

        // Build config with overrides
        const config: MemorySyncConfig = {
          ...DEFAULT_SYNC_CONFIG,
          projectPath,
          maxEntries: (params.maxEntries as number) ?? DEFAULT_SYNC_CONFIG.maxEntries,
          staleDays: (params.staleDays as number) ?? DEFAULT_SYNC_CONFIG.staleDays,
        };

        // Gather memories from vault
        const rawMemories = vault.listMemories({
          projectPath,
          limit: config.maxEntries * 2, // Fetch extra for filtering
        });

        // Gather user-facing vault entries
        const allEntries = vault.list({ tags: ['user-facing'], limit: 50 });
        const vaultEntries: VaultEntry[] = allEntries.map((e) => ({
          id: e.id,
          type: e.type,
          domain: e.domain,
          title: e.title,
          description: e.description ?? '',
          tags: e.tags ?? [],
          severity: e.severity ?? 'suggestion',
          createdAt: Date.now(), // IntelligenceEntry doesn't track createdAt — treat as fresh
          archivedAt: null,
        }));

        // Select entries via strategy
        const memories: VaultMemory[] = rawMemories.map((m) => ({
          id: m.id,
          type: m.type as 'session' | 'lesson' | 'preference',
          context: m.context ?? '',
          summary: m.summary ?? '',
          projectPath: m.projectPath ?? projectPath,
          createdAt: m.createdAt ?? Date.now(),
          topics: m.topics ?? [],
          archivedAt: m.archivedAt ?? null,
        }));

        const entries = selectEntriesForSync(memories, vaultEntries, config);

        if (params.dryRun) {
          return {
            dryRun: true,
            host,
            memoryPath,
            wouldSync: entries.length,
            entries: entries.map((e) => ({
              id: e.id,
              type: e.type,
              title: e.title,
              sourceTable: e.sourceTable,
            })),
          };
        }

        // Create adapter and sync
        const adapter = createMemorySyncAdapter(memoryPath, host as 'claude-code' | 'opencode');

        if (!adapter.detectSupport()) {
          return {
            success: false,
            error: `Host memory system not available at ${memoryPath}. Directory may not exist.`,
            host,
          };
        }

        const result = adapter.sync(entries, config);

        return {
          success: true,
          host,
          memoryPath,
          ...result,
        };
      },
    },

    {
      name: 'memory_sync_status',
      description:
        'Show current sync status — what is synced, when last synced, and any drift between vault and host.',
      auth: 'read',
      schema: z.object({
        host: z
          .enum(['claude-code', 'opencode'])
          .optional()
          .describe('Target host (auto-detected if omitted)'),
        projectPath: z.string().optional().default('.'),
      }),
      handler: async (params) => {
        const projectPath = resolve((params.projectPath as string) ?? '.');
        const host = (params.host as string) ?? detectSyncHost();
        const memoryPath = resolveMemoryPath(projectPath, host);

        const adapter = createMemorySyncAdapter(memoryPath, host as 'claude-code' | 'opencode');

        if (!adapter.detectSupport()) {
          return {
            host,
            memoryPath,
            supported: false,
            synced: false,
            message: 'Host memory directory does not exist.',
          };
        }

        const manifest = adapter.readManifest();

        if (!manifest) {
          return {
            host,
            memoryPath,
            supported: true,
            synced: false,
            message: 'No sync has been performed yet.',
          };
        }

        // Check for drift — compare manifest entries against current vault state
        const currentMemories = vault.listMemories({
          projectPath,
          limit: 100,
        });
        const currentIds = new Set(currentMemories.map((m) => m.id));
        const staleEntries = manifest.entries.filter((e) => !currentIds.has(e.sourceId));

        return {
          host,
          memoryPath,
          supported: true,
          synced: true,
          lastSyncedAt: new Date(manifest.lastSyncedAt).toISOString(),
          entriesSynced: manifest.entries.length,
          staleEntries: staleEntries.length,
          drift: staleEntries.length > 0,
          driftDetails:
            staleEntries.length > 0
              ? staleEntries.map((e) => ({ id: e.id, sourceId: e.sourceId }))
              : undefined,
        };
      },
    },

    {
      name: 'memory_sync_clear',
      description:
        'Remove all synced entries from the host memory system. Vault data is not affected.',
      auth: 'write',
      schema: z.object({
        host: z
          .enum(['claude-code', 'opencode'])
          .optional()
          .describe('Target host (auto-detected if omitted)'),
        projectPath: z.string().optional().default('.'),
      }),
      handler: async (params) => {
        const projectPath = resolve((params.projectPath as string) ?? '.');
        const host = (params.host as string) ?? detectSyncHost();
        const memoryPath = resolveMemoryPath(projectPath, host);

        const adapter = createMemorySyncAdapter(memoryPath, host as 'claude-code' | 'opencode');

        if (!adapter.detectSupport()) {
          return {
            success: false,
            error: `Host memory system not available at ${memoryPath}.`,
            host,
          };
        }

        const result = adapter.clear();

        return {
          success: true,
          host,
          memoryPath,
          ...result,
        };
      },
    },
  ];
}
