/**
 * Admin / infrastructure operations — 11 ops for agent self-management.
 *
 * These ops let agents introspect their own health, configuration, and
 * runtime state. No new modules needed — uses existing runtime parts.
 */

import { readFileSync, statSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from './types.js';
import { ENGINE_MODULE_MANIFEST } from '../engine/module-manifest.js';
import { discoverSkills } from '../skills/sync-skills.js';

/**
 * Emit a one-time deprecation warning when legacy `_allOps` injection is used.
 * Resets per-process — intended to surface during development/CI, not spam logs.
 */
let _allOpsDeprecationWarned = false;
function warnAllOpsDeprecation(): void {
  if (_allOpsDeprecationWarned) return;
  _allOpsDeprecationWarned = true;
  try {
    console.warn(
      '[soleri-deprecation] admin_tool_list `_allOps` injection is deprecated. ' +
        "Use scope:'all' instead — it reads from the live runtime registry and requires no injection.",
    );
  } catch {
    /* non-fatal */
  }
}

/**
 * Test-only hook to reset the one-shot deprecation warning flag.
 * Exported solely for unit tests — do not call from production code.
 * @internal
 */
export function __resetAllOpsDeprecationWarning(): void {
  _allOpsDeprecationWarned = false;
}

/**
 * Canonical list of admin ops. Kept as a module-level constant so both the
 * admin-only fallback and the scope:'all' enumeration reference the same source.
 */
const ADMIN_OPS: readonly string[] = [
  'admin_health',
  'admin_tool_list',
  'admin_config',
  'admin_vault_size',
  'admin_uptime',
  'admin_version',
  'admin_reset_cache',
  'admin_diagnostic',
] as const;

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
  const { vault, brain, brainIntelligence, llmClient, curator, packInstaller } = runtime;

  return [
    // ─── Health ──────────────────────────────────────────────────────
    {
      name: 'admin_health',
      description: 'Comprehensive agent health check — vault, LLM, brain, skills, hooks status.',
      auth: 'read',
      handler: async () => {
        const vaultStats = vault.stats();
        const llmAvailable = llmClient.isAvailable();
        const brainStats = brain.getStats();
        const curatorStatus = curator.getStatus();

        // Skills: agent-level + pack-level
        const agentDir = runtime.config.agentDir;
        const agentSkillsDirs = agentDir ? [join(agentDir, 'skills')] : [];
        const agentSkills = discoverSkills(agentSkillsDirs);
        const packs = packInstaller.list();
        const packSkills = packs.flatMap((p) => p.skills);
        const allSkillNames = [...agentSkills.map((s) => s.name), ...packSkills];

        // Hooks: pack-level
        const packHooks = packs.flatMap((p) => p.hooks);

        // Tier breakdown
        const tierCounts = { default: 0, community: 0, premium: 0 };
        for (const pk of packs) {
          const t = (pk.manifest as { tier?: string })?.tier ?? 'community';
          if (t in tierCounts) tierCounts[t as keyof typeof tierCounts]++;
        }

        return {
          status: 'ok',
          vault: { entries: vaultStats.totalEntries, domains: Object.keys(vaultStats.byDomain) },
          llm: llmAvailable,
          brain: {
            vocabularySize: brainStats.vocabularySize,
            feedbackCount: brainStats.feedbackCount,
          },
          curator: { initialized: curatorStatus.initialized },
          skills: {
            count: allSkillNames.length,
            agent: agentSkills.map((s) => s.name),
            packs: packSkills,
          },
          hooks: {
            count: packHooks.length,
            packs: packHooks,
          },
          packTiers: tierCounts,
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
      description:
        "List available ops. Defaults to admin-scoped. Pass scope:'all' for the live runtime registry (ground truth), scope:'manifest' for the ENGINE_MODULE_MANIFEST summary (key ops only).",
      auth: 'read',
      handler: async (params) => {
        const verbose = params.verbose === true;
        const scope = typeof params.scope === 'string' ? params.scope : undefined;

        // Internal injection path (DEPRECATED) — the facade builder historically
        // passed a fully-registered ops list via `_allOps`. The live
        // runtime.opsRegistry now makes this redundant. We still honor the
        // param for back-compat with existing callers, but warn once.
        const rawAllOps = params._allOps;
        if (Array.isArray(rawAllOps)) {
          warnAllOpsDeprecation();
          const allOps = rawAllOps as Array<{
            name: string;
            description: string;
            auth: string;
          }>;
          if (verbose) {
            return {
              count: allOps.length,
              scope: 'all-registered',
              source: "_allOps injection (DEPRECATED — use scope:'all')",
              ops: allOps.map((op) => ({
                name: op.name,
                description: op.description,
                auth: op.auth,
              })),
            };
          }
          const grouped: Record<string, string[]> = {};
          for (const op of allOps) {
            const parts = op.name.split('_');
            const facade = parts.length > 1 ? parts[0] : 'core';
            if (!grouped[facade]) grouped[facade] = [];
            grouped[facade].push(op.name);
          }
          return {
            count: allOps.length,
            scope: 'all-registered',
            source: "_allOps injection (DEPRECATED — use scope:'all')",
            ops: grouped,
            routing: buildRoutingHints(),
          };
        }

        // Live runtime registry — ground truth. Populated during registerEngine().
        if (scope === 'all') {
          const registry = runtime.opsRegistry;
          if (!registry) {
            return {
              count: 0,
              scope: 'all',
              source: 'registry not initialized (runtime bypassed registerEngine)',
              hint: "Runtimes created without registerEngine() have no ops registry. Fall back to scope:'manifest' for the static summary.",
              ops: {},
              routing: buildRoutingHints(),
            };
          }
          if (verbose) {
            const allOps = registry.list();
            return {
              count: allOps.length,
              scope: 'all',
              source: 'runtime.opsRegistry (live — every op registered via registerEngine)',
              facadeCount: registry.facadeCount(),
              ops: allOps.map((op) => ({
                name: op.name,
                description: op.description,
                auth: op.auth,
                facade: op.facade,
              })),
            };
          }
          const grouped = registry.byFacade();
          return {
            count: registry.count(),
            scope: 'all',
            source: 'runtime.opsRegistry (live — every op registered via registerEngine)',
            facadeCount: registry.facadeCount(),
            ops: grouped,
            routing: buildRoutingHints(),
          };
        }

        // Manifest summary — key ops per facade from ENGINE_MODULE_MANIFEST.
        // Faster (no runtime dependency), but abbreviated (max 4 ops per facade).
        // Use for forge templates, docs, or when you want a curated surface.
        if (scope === 'manifest') {
          const grouped: Record<string, string[]> = {};
          for (const mod of ENGINE_MODULE_MANIFEST) {
            grouped[mod.suffix] = [...mod.keyOps];
          }
          grouped.admin = [...ADMIN_OPS];
          const count = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0);
          return {
            count,
            scope: 'manifest',
            source:
              'ENGINE_MODULE_MANIFEST (curated key ops per facade — summary view, not every registered op)',
            facadeCount: Object.keys(grouped).length,
            ops: grouped,
            routing: buildRoutingHints(),
          };
        }

        // Default — admin-only fallback. Clear hint, no misleading "_allOps" prompt.
        return {
          count: ADMIN_OPS.length,
          scope: 'admin-only',
          hint: "Pass scope:'all' for live runtime ops, or scope:'manifest' for the curated summary.",
          ops: { admin: [...ADMIN_OPS] },
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

    // ─── Operator Context ───────────────────────────────────────────
    {
      name: 'operator_context_inspect',
      description:
        'Inspect the full operator context profile — expertise, corrections, interests, patterns.',
      auth: 'read',
      handler: async () => {
        const store = runtime.operatorContextStore;
        if (!store) {
          return { available: false, message: 'Operator context not configured' };
        }
        return { available: true, ...store.inspect() };
      },
    },
    {
      name: 'operator_context_delete',
      description: 'Delete a specific item from the operator context profile.',
      auth: 'write',
      handler: async (params) => {
        const store = runtime.operatorContextStore;
        if (!store) {
          return { deleted: false, message: 'Operator context not configured' };
        }
        const type = params.type as string;
        const id = params.id as string;
        const deleted = store.deleteItem(type as Parameters<typeof store.deleteItem>[0], id);
        if (deleted) {
          return { deleted: true, type, id };
        }
        return { deleted: false, message: 'Item not found' };
      },
    },

    // ─── Subagent Orphan Reaping ────────────────────────────────────
    {
      name: 'admin_reap_orphans',
      description:
        'Detect and clean up orphaned subagent processes. Returns reaped PIDs and task IDs.',
      auth: 'admin',
      handler: async () => {
        const dispatcher = runtime.subagentDispatcher;
        const results = dispatcher.reapOrphans();
        return {
          reaped: results.reaped.length,
          tasks: results.reaped,
          alive: results.alive,
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

        // 7. Skills — check discovered vs registered in .claude/skills/
        try {
          const agentDir = runtime.config.agentDir;
          const skillsDirs = agentDir ? [join(agentDir, 'skills')] : [];
          const agentSkills = discoverSkills(skillsDirs);
          const installedPacks = packInstaller.list();
          const packSkillCount = installedPacks.reduce((sum, p) => sum + p.skills.length, 0);
          const totalSkills = agentSkills.length + packSkillCount;

          // Check registration status in .claude/skills/
          const claudeSkillsDir = join(homedir(), '.claude', 'skills');
          let registeredCount = 0;
          let brokenCount = 0;
          const unregistered: string[] = [];

          if (existsSync(claudeSkillsDir)) {
            try {
              const registered = readdirSync(claudeSkillsDir, { withFileTypes: true });
              registeredCount = registered.length;
              for (const entry of registered) {
                if (entry.isSymbolicLink()) {
                  try {
                    statSync(join(claudeSkillsDir, entry.name));
                  } catch {
                    brokenCount++;
                  }
                }
              }
            } catch {
              // Can't read .claude/skills/ — skip registration check
            }
          }

          for (const skill of agentSkills) {
            const skillRegisteredDir = join(claudeSkillsDir, skill.name);
            if (!existsSync(skillRegisteredDir)) {
              unregistered.push(skill.name);
            }
          }

          const hasIssues = unregistered.length > 0 || brokenCount > 0;
          // Warn only when agentDir is set but no skills exist anywhere (local OR global)
          const hasAnySkills = totalSkills > 0 || registeredCount > 0;
          const skillStatus = !hasAnySkills && agentDir ? 'warn' : hasIssues ? 'warn' : 'ok';
          const detail = [
            `${totalSkills} discovered (${agentSkills.length} agent, ${packSkillCount} pack)`,
            `${registeredCount} registered in .claude/skills/`,
            ...(unregistered.length > 0
              ? [`${unregistered.length} unregistered: ${unregistered.join(', ')}`]
              : []),
            ...(brokenCount > 0 ? [`${brokenCount} broken links`] : []),
          ].join(' — ');

          checks.push({ name: 'skills', status: skillStatus, detail });
        } catch (err) {
          checks.push({
            name: 'skills',
            status: 'error',
            detail: err instanceof Error ? err.message : String(err),
          });
        }

        // 8. Hooks
        try {
          const installedPacks = packInstaller.list();
          const packHookCount = installedPacks.reduce((sum, p) => sum + p.hooks.length, 0);
          checks.push({
            name: 'hooks',
            status: 'ok',
            detail: `${packHookCount} hooks from ${installedPacks.length} packs`,
          });
        } catch (err) {
          checks.push({
            name: 'hooks',
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
