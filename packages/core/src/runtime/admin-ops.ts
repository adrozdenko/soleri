/**
 * Admin / infrastructure operations — 8 ops for agent self-management.
 *
 * These ops let agents introspect their own health, configuration, and
 * runtime state. No new modules needed — uses existing runtime parts.
 */

import { readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from './types.js';
import { ENGINE_MODULE_MANIFEST } from '../engine/module-manifest.js';

/**
 * Resolve the @soleri/core package.json version.
 * Walks up from this file's directory to find the closest package.json.
 */
function getCoreVersion(): string {
  try {
    // __dirname equivalent for ESM
    const thisDir = dirname(fileURLToPath(import.meta.url));
    // Walk up until we find package.json
    let dir = thisDir;
    for (let i = 0; i < 5; i++) {
      try {
        const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'));
        return pkg.version ?? 'unknown';
      } catch {
        dir = dirname(dir);
      }
    }
  } catch {
    // Fallback — import.meta.url may not be available in some test envs
  }
  return 'unknown';
}

/**
 * Create admin/infrastructure operations for an agent runtime.
 *
 * Groups: health (1–2), introspection (4), diagnostics (2), mutation (1).
 */
export function createAdminOps(runtime: AgentRuntime): OpDefinition[] {
  const { vault, brain, brainIntelligence, llmClient, curator } = runtime;

  return [
    // ─── Health ──────────────────────────────────────────────────────
    {
      name: 'admin_health',
      description: 'Comprehensive agent health check — vault, LLM, brain status.',
      auth: 'read',
      handler: async () => {
        const vaultStats = vault.stats();
        const llmAvailable = llmClient.isAvailable();
        const brainStats = brain.getStats();
        const curatorStatus = curator.getStatus();

        return {
          status: 'ok',
          vault: { entries: vaultStats.totalEntries, domains: Object.keys(vaultStats.byDomain) },
          llm: llmAvailable,
          brain: {
            vocabularySize: brainStats.vocabularySize,
            feedbackCount: brainStats.feedbackCount,
          },
          curator: { initialized: curatorStatus.initialized },
        };
      },
    },

    // ─── Context Health ────────────────────────────────────────────
    {
      name: 'context_health',
      description:
        'Check context window health — estimated fill, tool call count, and recommendation.',
      auth: 'read',
      handler: async () => {
        return runtime.contextHealth.check();
      },
    },

    // ─── Introspection ───────────────────────────────────────────────
    {
      name: 'admin_tool_list',
      description: 'List all available ops with descriptions and auth levels.',
      auth: 'read',
      handler: async (params) => {
        const verbose = params.verbose === true;
        // The caller can pass in the full ops list via `_allOps` (injected by
        // the facade builder). If not provided, we return only admin ops.
        const allOps = params._allOps as
          | Array<{ name: string; description: string; auth: string }>
          | undefined;
        if (allOps) {
          if (verbose) {
            return {
              count: allOps.length,
              ops: allOps.map((op) => ({
                name: op.name,
                description: op.description,
                auth: op.auth,
              })),
            };
          }
          // Group by facade prefix, truncate descriptions to 120 chars
          const grouped: Record<string, string[]> = {};
          for (const op of allOps) {
            const parts = op.name.split('_');
            const facade = parts.length > 1 ? parts[0] : 'core';
            if (!grouped[facade]) grouped[facade] = [];
            grouped[facade].push(op.name);
          }
          return {
            count: allOps.length,
            ops: grouped,
            routing: buildRoutingHints(),
          };
        }
        // Fallback — just describe admin ops
        return {
          count: 8,
          ops: {
            admin: [
              'admin_health',
              'admin_tool_list',
              'admin_config',
              'admin_vault_size',
              'admin_uptime',
              'admin_version',
              'admin_reset_cache',
              'admin_diagnostic',
            ],
          },
          routing: buildRoutingHints(),
        };
      },
    },
    {
      name: 'admin_config',
      description: 'Get current runtime configuration — agentId, paths, log level.',
      auth: 'read',
      handler: async () => {
        const { agentId, vaultPath, plansPath, dataDir, logLevel } = runtime.config;
        return {
          agentId,
          vaultPath: vaultPath ?? null,
          plansPath: plansPath ?? null,
          dataDir: dataDir ?? null,
          logLevel: logLevel ?? 'info',
        };
      },
    },
    {
      name: 'admin_vault_size',
      description:
        'Get vault database file size on disk (bytes). Returns null for in-memory vaults.',
      auth: 'read',
      handler: async () => {
        const dbPath = runtime.config.vaultPath;
        if (!dbPath || dbPath === ':memory:') {
          return { path: ':memory:', sizeBytes: null, sizeHuman: 'in-memory' };
        }
        try {
          const stat = statSync(dbPath);
          const sizeBytes = stat.size;
          const sizeHuman = formatBytes(sizeBytes);
          return { path: dbPath, sizeBytes, sizeHuman };
        } catch {
          return { path: dbPath, sizeBytes: null, sizeHuman: 'file not found' };
        }
      },
    },
    {
      name: 'admin_uptime',
      description: 'Time since runtime creation — seconds and human-readable.',
      auth: 'read',
      handler: async () => {
        const uptimeMs = Date.now() - runtime.createdAt;
        const uptimeSec = Math.floor(uptimeMs / 1000);
        return {
          createdAt: new Date(runtime.createdAt).toISOString(),
          uptimeMs,
          uptimeSec,
          uptimeHuman: formatUptime(uptimeSec),
        };
      },
    },
    {
      name: 'admin_version',
      description: 'Package version info for @soleri/core and Node.js.',
      auth: 'read',
      handler: async () => {
        return {
          core: getCoreVersion(),
          node: process.version,
          platform: process.platform,
          arch: process.arch,
        };
      },
    },

    // ─── Mutation ────────────────────────────────────────────────────
    {
      name: 'admin_reset_cache',
      description: 'Clear all caches — brain vocabulary. Forces fresh data on next access.',
      auth: 'write',
      handler: async () => {
        brain.rebuildVocabulary();

        return {
          cleared: ['brain_vocabulary'],
          brainVocabularySize: brain.getStats().vocabularySize,
        };
      },
    },

    // ─── Diagnostics ─────────────────────────────────────────────────
    {
      name: 'admin_diagnostic',
      description: 'Run diagnostic checks and return a comprehensive report.',
      auth: 'read',
      handler: async () => {
        const checks: Array<{ name: string; status: 'ok' | 'warn' | 'error'; detail: string }> = [];

        // 1. Vault connectivity
        try {
          const stats = vault.stats();
          checks.push({
            name: 'vault',
            status: 'ok',
            detail: `${stats.totalEntries} entries across ${Object.keys(stats.byDomain).length} domains`,
          });
        } catch (err) {
          checks.push({
            name: 'vault',
            status: 'error',
            detail: err instanceof Error ? err.message : String(err),
          });
        }

        // 2. Brain vocabulary
        try {
          const brainStats = brain.getStats();
          const status = brainStats.vocabularySize > 0 ? 'ok' : 'warn';
          checks.push({
            name: 'brain_vocabulary',
            status,
            detail: `${brainStats.vocabularySize} terms, ${brainStats.feedbackCount} feedback entries`,
          });
        } catch (err) {
          checks.push({
            name: 'brain_vocabulary',
            status: 'error',
            detail: err instanceof Error ? err.message : String(err),
          });
        }

        // 3. Brain intelligence
        try {
          const intStats = brainIntelligence.getStats();
          checks.push({
            name: 'brain_intelligence',
            status: 'ok',
            detail: `${intStats.strengths} strengths, ${intStats.sessions} sessions`,
          });
        } catch (err) {
          checks.push({
            name: 'brain_intelligence',
            status: 'error',
            detail: err instanceof Error ? err.message : String(err),
          });
        }

        // 4. LLM key pools
        const llmStatus = llmClient.isAvailable();
        checks.push({
          name: 'llm_openai',
          status: llmStatus.openai ? 'ok' : 'warn',
          detail: llmStatus.openai ? 'Keys available' : 'No keys configured',
        });
        checks.push({
          name: 'llm_anthropic',
          status: llmStatus.anthropic ? 'ok' : 'warn',
          detail: llmStatus.anthropic ? 'Keys available' : 'No keys configured',
        });

        // 6. Curator
        try {
          const curatorStatus = curator.getStatus();
          checks.push({
            name: 'curator',
            status: curatorStatus.initialized ? 'ok' : 'error',
            detail: curatorStatus.initialized ? 'Initialized' : 'Not initialized',
          });
        } catch (err) {
          checks.push({
            name: 'curator',
            status: 'error',
            detail: err instanceof Error ? err.message : String(err),
          });
        }

        const errorCount = checks.filter((c) => c.status === 'error').length;
        const warnCount = checks.filter((c) => c.status === 'warn').length;
        const overall = errorCount > 0 ? 'unhealthy' : warnCount > 0 ? 'degraded' : 'healthy';

        return {
          overall,
          checks,
          summary: `${checks.length} checks: ${checks.length - errorCount - warnCount} ok, ${warnCount} warn, ${errorCount} error`,
        };
      },
    },
  ];
}

// ─── Helpers ────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Build a flat routing map from ENGINE_MODULE_MANIFEST intentSignals.
 * Keys are natural-language phrases, values are `{suffix}.{op}` paths.
 */
function buildRoutingHints(): Record<string, string> {
  const routing: Record<string, string> = {};
  for (const mod of ENGINE_MODULE_MANIFEST) {
    if (mod.intentSignals) {
      for (const [phrase, op] of Object.entries(mod.intentSignals)) {
        routing[phrase] = `${mod.suffix}.${op}`;
      }
    }
  }
  return routing;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return `${minutes}m ${secs}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return `${hours}h ${mins}m`;
  const days = Math.floor(hours / 24);
  const hrs = hours % 24;
  return `${days}d ${hrs}h`;
}
