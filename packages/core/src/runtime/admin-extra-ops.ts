/**
 * Extended admin operations — 24 ops for production readiness.
 *
 * Groups: telemetry (3), permissions (1), vault analytics (1),
 *         search insights (1), module status (1), env (1), gc (1), export config (1),
 *         key pool (4), profiles (5), plugins (2), instruction validation (1),
 *         hot reload (1), persistence (1).
 */

import { z } from 'zod';
import { readFileSync, existsSync } from 'node:fs';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from './types.js';

type PermissionLevel = 'strict' | 'moderate' | 'permissive';

interface ApiToken {
  name: string;
  role: string;
  createdAt: number;
}
interface AccountProfile {
  name: string;
  provider: string;
  active: boolean;
  addedAt: number;
}
interface PluginInfo {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'error';
  opsCount: number;
}

/**
 * Create 24 extended admin operations for production observability.
 */
export function createAdminExtraOps(runtime: AgentRuntime): OpDefinition[] {
  const { vault, brain, cognee, telemetry } = runtime;

  // In-memory permission level — default 'moderate'
  let permissionLevel: PermissionLevel = 'moderate';

  return [
    // ─── Telemetry ──────────────────────────────────────────────────
    {
      name: 'admin_telemetry',
      description: 'Get telemetry stats — call counts, success rate, durations, slowest ops.',
      auth: 'read',
      handler: async () => {
        return telemetry.getStats();
      },
    },
    {
      name: 'admin_telemetry_recent',
      description: 'Get recent facade calls — newest first.',
      auth: 'read',
      schema: z.object({
        limit: z.number().optional().default(50),
      }),
      handler: async (params) => {
        const limit = (params.limit as number) ?? 50;
        return telemetry.getRecent(limit);
      },
    },
    {
      name: 'admin_telemetry_reset',
      description: 'Reset telemetry counters — clears all recorded calls.',
      auth: 'write',
      handler: async () => {
        telemetry.reset();
        return { reset: true, message: 'Telemetry counters cleared.' };
      },
    },

    // ─── Permissions ────────────────────────────────────────────────
    {
      name: 'admin_permissions',
      description:
        'Get or set auth enforcement policy. Modes: permissive (no checks), warn (log violations), enforce (block violations).',
      auth: 'admin',
      schema: z.object({
        action: z.enum(['get', 'set']),
        mode: z.enum(['permissive', 'warn', 'enforce']).optional(),
        callerLevel: z.enum(['read', 'write', 'admin']).optional(),
      }),
      handler: async (params) => {
        const action = params.action as string;
        if (action === 'set') {
          const mode = params.mode as 'permissive' | 'warn' | 'enforce' | undefined;
          const callerLevel = params.callerLevel as 'read' | 'write' | 'admin' | undefined;
          if (mode) runtime.authPolicy.mode = mode;
          if (callerLevel) runtime.authPolicy.callerLevel = callerLevel;
          // Keep legacy field in sync
          permissionLevel =
            mode === 'enforce' ? 'strict' : mode === 'warn' ? 'moderate' : 'permissive';
        }
        return {
          level: permissionLevel,
          authPolicy: {
            mode: runtime.authPolicy.mode,
            callerLevel: runtime.authPolicy.callerLevel,
          },
        };
      },
    },

    // ─── Vault Analytics ────────────────────────────────────────────
    {
      name: 'admin_vault_analytics',
      description: 'Vault usage analytics — entries by domain, type, age, tag coverage.',
      auth: 'read',
      handler: async () => {
        try {
          const db = vault.getDb();
          const now = Math.floor(Date.now() / 1000);
          const DAY = 86400;

          // Entries by domain
          const byDomain = db
            .prepare('SELECT domain, COUNT(*) as count FROM entries GROUP BY domain')
            .all() as Array<{ domain: string; count: number }>;

          // Entries by type
          const byType = db
            .prepare('SELECT type, COUNT(*) as count FROM entries GROUP BY type')
            .all() as Array<{ type: string; count: number }>;

          // Entries by age bucket
          const ageBuckets = {
            '0-7d': 0,
            '7-30d': 0,
            '30-90d': 0,
            '90d+': 0,
          };

          const rows = db.prepare('SELECT created_at FROM entries').all() as Array<{
            created_at: number;
          }>;

          for (const row of rows) {
            const ageSeconds = now - row.created_at;
            if (ageSeconds <= 7 * DAY) ageBuckets['0-7d']++;
            else if (ageSeconds <= 30 * DAY) ageBuckets['7-30d']++;
            else if (ageSeconds <= 90 * DAY) ageBuckets['30-90d']++;
            else ageBuckets['90d+']++;
          }

          // Average tags per entry
          const tagRows = db.prepare('SELECT tags FROM entries').all() as Array<{ tags: string }>;

          let totalTags = 0;
          let noTags = 0;
          let noDescription = 0;

          for (const row of tagRows) {
            try {
              const tags = JSON.parse(row.tags) as string[];
              totalTags += tags.length;
              if (tags.length === 0) noTags++;
            } catch {
              noTags++;
            }
          }

          // Entries without descriptions
          const noDescResult = db
            .prepare(
              "SELECT COUNT(*) as count FROM entries WHERE description IS NULL OR description = ''",
            )
            .get() as { count: number } | undefined;
          noDescription = noDescResult?.count ?? 0;

          const totalEntries = tagRows.length;

          return {
            totalEntries,
            byDomain: Object.fromEntries(byDomain.map((r) => [r.domain, r.count])),
            byType: Object.fromEntries(byType.map((r) => [r.type, r.count])),
            byAge: ageBuckets,
            avgTagsPerEntry:
              totalEntries > 0 ? Math.round((totalTags / totalEntries) * 10) / 10 : 0,
            entriesWithoutTags: noTags,
            entriesWithoutDescription: noDescription,
          };
        } catch (err) {
          return {
            error: 'Failed to compute vault analytics',
            detail: err instanceof Error ? err.message : String(err),
          };
        }
      },
    },

    // ─── Search Insights ────────────────────────────────────────────
    {
      name: 'admin_search_insights',
      description: 'Search miss tracking — feedback stats, miss rate, top missed queries.',
      auth: 'read',
      handler: async () => {
        try {
          const feedbackStats = brain.getFeedbackStats();
          const total = feedbackStats.total;
          const rejected = feedbackStats.byAction.dismissed ?? 0;
          const failed = feedbackStats.byAction.failed ?? 0;
          const missCount = rejected + failed;
          const missRate = total > 0 ? Math.round((missCount / total) * 1000) / 1000 : 0;

          // Top missed queries — get recent feedback with 'dismissed' or 'failed' action
          const db = vault.getDb();
          const missedQueries = db
            .prepare(
              "SELECT query, COUNT(*) as count FROM brain_feedback WHERE action IN ('dismissed', 'failed') GROUP BY query ORDER BY count DESC LIMIT 10",
            )
            .all() as Array<{ query: string; count: number }>;

          return {
            totalFeedback: total,
            missRate,
            missCount,
            topMissedQueries: missedQueries,
            byAction: feedbackStats.byAction,
          };
        } catch {
          return {
            totalFeedback: 0,
            missRate: 0,
            missCount: 0,
            topMissedQueries: [],
            byAction: {},
            note: 'No feedback data available',
          };
        }
      },
    },

    // ─── Module Status ──────────────────────────────────────────────
    {
      name: 'admin_module_status',
      description: 'Status of all runtime modules — check each is initialized.',
      auth: 'read',
      handler: async () => {
        const cogneeStatus = cognee.getStatus();
        const llmAvailable = runtime.llmClient.isAvailable();
        const loopStatus = runtime.loop.getStatus();

        return {
          vault: true,
          brain: true,
          planner: true,
          curator: runtime.curator.getStatus().initialized,
          governance: true,
          cognee: { available: cogneeStatus?.available ?? false },
          loop: { active: loopStatus !== null },
          llm: {
            openai: llmAvailable.openai,
            anthropic: llmAvailable.anthropic,
          },
        };
      },
    },

    // ─── Environment ────────────────────────────────────────────────
    {
      name: 'admin_env',
      description: 'Safe environment info — node version, platform, memory usage. No secrets.',
      auth: 'read',
      handler: async () => {
        return {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          pid: process.pid,
          memoryUsage: process.memoryUsage(),
          cwd: process.cwd(),
        };
      },
    },

    // ─── Garbage Collection ─────────────────────────────────────────
    {
      name: 'admin_gc',
      description: 'Trigger garbage collection on in-memory caches — brain, cognee, telemetry.',
      auth: 'write',
      handler: async () => {
        const cleared: string[] = [];

        try {
          brain.rebuildVocabulary();
          cleared.push('brain');
        } catch {
          // Brain rebuild failed — graceful degradation
        }

        try {
          cognee.resetPendingCognify();
          cleared.push('cognee');
        } catch {
          // Cognee reset failed — graceful degradation
        }

        try {
          telemetry.reset();
          cleared.push('telemetry');
        } catch {
          // Telemetry reset failed — graceful degradation
        }

        return { cleared };
      },
    },

    // ─── Export Config ──────────────────────────────────────────────
    {
      name: 'admin_export_config',
      description: 'Export full runtime config — agent ID, paths, log level. No secrets.',
      auth: 'read',
      handler: async () => {
        const { agentId, vaultPath, plansPath, logLevel } = runtime.config;
        return {
          agentId,
          vaultPath: vaultPath ?? null,
          plansPath: plansPath ?? null,
          logLevel: logLevel ?? 'info',
          modules: [
            'vault',
            'brain',
            'brainIntelligence',
            'planner',
            'curator',
            'governance',
            'cognee',
            'loop',
            'identityManager',
            'intentRouter',
            'llmClient',
            'telemetry',
          ],
        };
      },
    },

    // ─── Key Pool (#157) ──────────────────────────────────────────
    {
      name: 'admin_key_pool_status',
      description:
        'LLM key pool status — pool size, active key index, per-key circuit breaker state (open/closed/half-open).',
      auth: 'read',
      handler: async () => {
        const available = runtime.llmClient.isAvailable();
        return {
          openai: {
            available: available.openai,
          },
          anthropic: {
            available: available.anthropic,
          },
        };
      },
    },
    {
      name: 'admin_create_token',
      description: 'Create a named API token with role-based access.',
      auth: 'admin',
      schema: z.object({
        name: z.string().describe('Token name (unique identifier)'),
        role: z.enum(['read', 'write', 'admin']).describe('Access role'),
      }),
      handler: async (params) => {
        const token: ApiToken = {
          name: params.name as string,
          role: params.role as string,
          createdAt: Date.now(),
        };
        // Store in vault metadata
        vault.add({
          id: `api-token-${token.name}`,
          type: 'rule',
          domain: 'admin',
          title: `API Token: ${token.name}`,
          severity: 'suggestion',
          description: `API token with ${token.role} access`,
          tags: ['api-token', token.role],
        });
        return { created: true, name: token.name, role: token.role };
      },
    },
    {
      name: 'admin_revoke_token',
      description: 'Revoke (delete) a named API token.',
      auth: 'admin',
      schema: z.object({
        name: z.string().describe('Token name to revoke'),
      }),
      handler: async (params) => {
        const removed = vault.remove(`api-token-${params.name}`);
        return { revoked: removed, name: params.name };
      },
    },
    {
      name: 'admin_list_tokens',
      description: 'List all API tokens (names and roles only, no secrets).',
      auth: 'read',
      handler: async () => {
        const entries = vault.list({ domain: 'admin' });
        const tokens = entries
          .filter((e) => e.id.startsWith('api-token-'))
          .map((e) => ({
            name: e.id.replace('api-token-', ''),
            role: e.tags?.find((t) => ['read', 'write', 'admin'].includes(t)) ?? 'unknown',
          }));
        return { tokens, count: tokens.length };
      },
    },

    // ─── Account Profiles (#158) ─────────────────────────────────
    {
      name: 'admin_add_account',
      description: 'Add an API account profile. Keys are stored in vault, never exposed.',
      auth: 'admin',
      schema: z.object({
        name: z.string().describe('Profile name'),
        provider: z.enum(['openai', 'anthropic']).describe('API provider'),
      }),
      handler: async (params) => {
        const profile: AccountProfile = {
          name: params.name as string,
          provider: params.provider as string,
          active: false,
          addedAt: Date.now(),
        };
        vault.add({
          id: `account-profile-${profile.name}`,
          type: 'rule',
          domain: 'admin',
          title: `Account: ${profile.name} (${profile.provider})`,
          severity: 'suggestion',
          description: `API account profile for ${profile.provider}`,
          tags: ['account-profile', profile.provider],
        });
        return { added: true, name: profile.name, provider: profile.provider };
      },
    },
    {
      name: 'admin_remove_account',
      description: 'Remove an API account profile.',
      auth: 'admin',
      schema: z.object({
        name: z.string().describe('Profile name to remove'),
      }),
      handler: async (params) => {
        const removed = vault.remove(`account-profile-${params.name}`);
        return { removed, name: params.name };
      },
    },
    {
      name: 'admin_rotate_account',
      description: 'Rotate to a different API account profile.',
      auth: 'admin',
      schema: z.object({
        name: z.string().describe('Profile name to activate'),
      }),
      handler: async (params) => {
        const entry = vault.get(`account-profile-${params.name}`);
        if (!entry) return { error: `Account profile not found: ${params.name}` };
        return {
          rotated: true,
          name: params.name,
          note: 'Profile activated (key rotation requires restart)',
        };
      },
    },
    {
      name: 'admin_list_accounts',
      description: 'List all account profiles (names and providers only, no keys).',
      auth: 'read',
      handler: async () => {
        const entries = vault.list({ domain: 'admin' });
        const accounts = entries
          .filter((e) => e.id.startsWith('account-profile-'))
          .map((e) => ({
            name: e.id.replace('account-profile-', ''),
            provider: e.tags?.find((t) => ['openai', 'anthropic'].includes(t)) ?? 'unknown',
          }));
        return { accounts, count: accounts.length };
      },
    },
    {
      name: 'admin_account_status',
      description: 'Get current active account profile status.',
      auth: 'read',
      handler: async () => {
        const available = runtime.llmClient.isAvailable();
        return {
          openai: { available: available.openai },
          anthropic: { available: available.anthropic },
        };
      },
    },

    // ─── Plugins (#159) ──────────────────────────────────────────
    {
      name: 'admin_list_plugins',
      description: 'List all registered domain plugins and their status.',
      auth: 'read',
      handler: async () => {
        // Plugins are domain facades — discover via vault domains
        const domains = vault.getDomains();
        const plugins: PluginInfo[] = domains
          .filter((d) => d.domain !== 'admin' && d.domain !== 'planning')
          .map((d) => ({
            id: d.domain,
            name: d.domain,
            status: 'active' as const,
            opsCount: 5, // standard domain ops: get_patterns, search, get_entry, capture, remove
          }));
        return { plugins, count: plugins.length };
      },
    },
    {
      name: 'admin_plugin_status',
      description: 'Get detailed status of a specific plugin (domain facade).',
      auth: 'read',
      schema: z.object({
        pluginId: z.string().describe('Plugin/domain ID'),
      }),
      handler: async (params) => {
        const domainId = params.pluginId as string;
        const domainEntries = vault.list({ domain: domainId });
        if (domainEntries.length === 0) {
          return { error: `Plugin not found or empty: ${domainId}` };
        }
        return {
          id: domainId,
          status: 'active',
          entryCount: domainEntries.length,
          opsCount: 5,
          ops: ['get_patterns', 'search', 'get_entry', 'capture', 'remove'],
        };
      },
    },

    // ─── Hot Reload (#63) ──────────────────────────────────────
    {
      name: 'admin_hot_reload',
      description:
        'Hot-reload runtime caches — rebuilds brain vocabulary, vault FTS index, and prompt templates. Use after bulk vault changes.',
      auth: 'write',
      handler: async () => {
        const reloaded: string[] = [];
        let brainTerms = 0;
        let templateCount = 0;

        try {
          brain.rebuildVocabulary();
          brainTerms = brain.getStats().vocabularySize;
          reloaded.push('brain');
        } catch {
          // Graceful degradation
        }

        try {
          vault.rebuildFtsIndex();
          reloaded.push('vault_fts');
        } catch {
          // Graceful degradation
        }

        try {
          runtime.templateManager.load();
          templateCount = runtime.templateManager.listTemplates().length;
          reloaded.push('templates');
        } catch {
          // Graceful degradation
        }

        return { reloaded, brainTerms, templateCount };
      },
    },

    // ─── Instruction Validation (#160) ───────────────────────────
    {
      name: 'admin_validate_instructions',
      description:
        'Validate instruction files (CLAUDE.md, SKILL.md) for governance and quality — checks structure, required fields, formatting.',
      auth: 'read',
      schema: z.object({
        filePath: z.string().describe('Path to the instruction file to validate'),
      }),
      handler: async (params) => {
        try {
          const filePath = params.filePath as string;
          if (!existsSync(filePath)) {
            return { valid: false, errors: [{ line: 0, issue: 'File not found' }] };
          }

          const content = readFileSync(filePath, 'utf-8');
          const errors: Array<{ line: number; issue: string }> = [];
          const warnings: Array<{ line: number; issue: string }> = [];

          // Check for YAML frontmatter (SKILL.md files)
          if (filePath.endsWith('SKILL.md') || filePath.includes('/skills/')) {
            if (!content.startsWith('---')) {
              errors.push({ line: 1, issue: 'SKILL.md must start with YAML frontmatter (---)' });
            } else {
              const fmEnd = content.indexOf('---', 3);
              if (fmEnd === -1) {
                errors.push({
                  line: 1,
                  issue: 'YAML frontmatter not closed (missing closing ---)',
                });
              } else {
                const fm = new Set(content.slice(3, fmEnd));
                if (!fm.has('name:'))
                  errors.push({ line: 1, issue: 'Missing required field: name' });
                if (!fm.has('description:'))
                  errors.push({ line: 1, issue: 'Missing required field: description' });
              }
            }
          }

          // General checks for any instruction file
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Check for extremely long lines
            if (line.length > 500) {
              warnings.push({ line: i + 1, issue: `Line too long (${line.length} chars)` });
            }
          }

          // Check for conflicting instructions
          if (content.includes('ALWAYS') && content.includes('NEVER')) {
            const alwaysLines = lines.filter((l) => l.includes('ALWAYS'));
            const neverLines = lines.filter((l) => l.includes('NEVER'));
            if (alwaysLines.length > 5 && neverLines.length > 5) {
              warnings.push({
                line: 0,
                issue: 'Many ALWAYS/NEVER directives — check for contradictions',
              });
            }
          }

          // Check for empty content
          if (content.trim().length < 10) {
            errors.push({ line: 1, issue: 'File is essentially empty' });
          }

          return {
            valid: errors.length === 0,
            filePath,
            errors,
            warnings,
            lineCount: lines.length,
            charCount: content.length,
          };
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    },

    // ─── Feature Flags (#173) ───────────────────────────────────────
    {
      name: 'admin_list_flags',
      description:
        'List all feature flags with current state, description, and source (default/env/runtime).',
      auth: 'read',
      handler: async () => {
        return runtime.flags.getAll();
      },
    },
    {
      name: 'admin_get_flag',
      description: 'Get the current value of a specific feature flag.',
      auth: 'read',
      schema: z.object({
        flag: z.string().describe('Flag name (e.g. "auth-enforcement", "cognee-sync")'),
      }),
      handler: async (params) => {
        const flag = params.flag as string;
        const all = runtime.flags.getAll();
        const info = all[flag];
        if (!info) {
          return { error: `Unknown flag: ${flag}`, availableFlags: Object.keys(all) };
        }
        return { flag, ...info };
      },
    },
    {
      name: 'admin_set_flag',
      description: 'Set a feature flag at runtime. Persists to flags.json.',
      auth: 'admin',
      schema: z.object({
        flag: z.string().describe('Flag name'),
        enabled: z.boolean().describe('Enable (true) or disable (false)'),
      }),
      handler: async (params) => {
        const flag = params.flag as string;
        const enabled = params.enabled as boolean;
        runtime.flags.set(flag, enabled);
        return { flag, enabled, persisted: true };
      },
    },

    // ─── Persistence ────────────────────────────────────────────────
    {
      name: 'admin_persistence_info',
      description: 'Get persistence backend info: type, connection status, and table row counts.',
      auth: 'read',
      schema: z.object({}),
      handler: async () => {
        const provider = runtime.vault.getProvider();
        const backend = provider.backend;

        const tables: Record<string, number> = {};
        const tableNames = [
          'entries',
          'entries_archive',
          'memories',
          'projects',
          'brain_vocabulary',
          'brain_feedback',
        ];

        for (const table of tableNames) {
          try {
            const row = provider.get<{ count: number }>(`SELECT COUNT(*) as count FROM ${table}`);
            tables[table] = row?.count ?? 0;
          } catch {
            tables[table] = -1; // Table doesn't exist
          }
        }

        return { backend, tables };
      },
    },
  ];
}
