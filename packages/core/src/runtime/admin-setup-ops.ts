/**
 * Admin setup operations — 4 ops for agent self-installation.
 *
 * inject_claude_md: Inject agent sections into CLAUDE.md
 * admin_setup_global: Install hooks + skills + settings.json lifecycle hooks
 * admin_setup_project: Project-level hook management (analyze/cleanup/install)
 * admin_check_persistence: Diagnostic — check plan/task/check storage status
 *
 * Ported from Salvador MCP. Key adaptations:
 *   - Runtime-config-driven (no vault manifest dependency)
 *   - Agent-scoped markers for multi-agent coexistence
 *   - OpDefinition[] pattern (not standalone tool files)
 */

import { z } from 'zod';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  unlinkSync,
  statSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from './types.js';
import {
  agentPlansPath as getAgentPlansPath,
  agentVaultPath as getAgentVaultPath,
} from '../paths.js';
import {
  hasSections,
  removeSections,
  injectAtPosition,
  buildInjectionContent,
  injectEngineRulesBlock,
  removeEngineRulesFromGlobal,
} from './claude-md-helpers.js';
import { discoverSkills, syncSkillsToClaudeCode } from '../skills/sync-skills.js';

// ─── Helpers ──────────────────────────────────────────────────────────

/** Find CLAUDE.md in a project — checks root and .claude/ */
function findClaudeMdPath(projectPath: string): string | null {
  const candidates = [join(projectPath, 'CLAUDE.md'), join(projectPath, '.claude', 'CLAUDE.md')];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

/** Read settings.json from ~/.claude/ */
function readSettingsJson(): Record<string, unknown> {
  const settingsPath = join(homedir(), '.claude', 'settings.json');
  if (!existsSync(settingsPath)) return {};
  try {
    return JSON.parse(readFileSync(settingsPath, 'utf-8'));
  } catch {
    return {};
  }
}

/** Write settings.json to ~/.claude/ */
function writeSettingsJson(settings: Record<string, unknown>): void {
  const settingsPath = join(homedir(), '.claude', 'settings.json');
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

/** Get file info for persistence diagnostic */
function getFileInfo(path: string): { exists: boolean; size: number; items: number } {
  if (!existsSync(path)) {
    return { exists: false, size: 0, items: 0 };
  }
  try {
    const stat = statSync(path);
    const content = JSON.parse(readFileSync(path, 'utf-8'));
    const items = countPersistedItems(content);
    return { exists: true, size: stat.size, items };
  } catch {
    return { exists: true, size: 0, items: -1 };
  }
}

function countPersistedItems(content: unknown): number {
  if (Array.isArray(content)) return content.length;
  if (!content || typeof content !== 'object') return 0;

  const data = content as Record<string, unknown>;
  if (Array.isArray(data.plans)) return data.plans.length;
  if (data.items && typeof data.items === 'object') return Object.keys(data.items).length;
  if (Array.isArray(data.contexts)) return data.contexts.length;
  return 0;
}

function extractActivePlans(content: unknown): Array<{ id: string; status: string }> {
  if (!content || typeof content !== 'object') return [];

  const plans = Array.isArray((content as Record<string, unknown>).plans)
    ? ((content as Record<string, unknown>).plans as unknown[])
    : null;
  if (plans) {
    return plans.flatMap((plan) => {
      if (!plan || typeof plan !== 'object') return [];
      const p = plan as Record<string, unknown>;
      const id = typeof p.id === 'string' ? p.id : null;
      const lifecycle =
        typeof p.lifecycleStatus === 'string'
          ? p.lifecycleStatus
          : typeof p.status === 'string'
            ? p.status
            : null;
      if (!id || (lifecycle !== 'executing' && lifecycle !== 'reconciling')) return [];
      return [{ id, status: lifecycle }];
    });
  }

  const items = (content as Record<string, unknown>).items;
  if (!items || typeof items !== 'object') return [];

  return Object.entries(items).flatMap(([id, plan]) => {
    if (!plan || typeof plan !== 'object') return [];
    const p = plan as Record<string, unknown>;
    const lifecycle =
      typeof p.lifecycleStatus === 'string'
        ? p.lifecycleStatus
        : typeof p.status === 'string'
          ? p.status
          : null;
    if (lifecycle !== 'executing' && lifecycle !== 'reconciling') return [];
    return [{ id, status: lifecycle }];
  });
}

/** Discover hookify rule files in a directory */
function discoverHookifyFiles(dir: string): Array<{ name: string; path: string }> {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.startsWith('hookify.') && f.endsWith('.local.md'))
    .map((f) => ({ name: f, path: join(dir, f) }));
}

// discoverSkills imported from '../skills/sync-skills.js'

// ─── Deep Equality Helper ─────────────────────────────────────────────

/** Recursively compare two values by structure, independent of key insertion order. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(objB, key)) return false;
    if (!deepEqual(objA[key], objB[key])) return false;
  }
  return true;
}

// ─── Settings.json Hook Merging ───────────────────────────────────────

interface SettingsHook {
  type: 'prompt' | 'agent' | 'command';
  prompt?: string;
  command?: string;
  timeout?: number;
}

interface SettingsHookGroup {
  matcher: string;
  hooks: SettingsHook[];
}

/**
 * Build a shell command that checks if the agent's MCP server is configured
 * in the current project's .mcp.json before emitting an instruction.
 * This ensures hooks are globally safe — they no-op in projects without the agent.
 */
function buildConditionalHookCommand(agentId: string, instruction: string): string {
  // Escape single quotes in instruction for safe shell embedding
  const escaped = instruction.replace(/'/g, "'\\''");
  return `root=$(git rev-parse --show-toplevel 2>/dev/null || echo "."); if grep -qF '"${agentId}"' "$root/.mcp.json" 2>/dev/null; then echo '${escaped}'; fi`;
}

/** Default lifecycle hooks for any Soleri agent */
function getDefaultLifecycleHooks(agentId: string): Record<string, SettingsHookGroup[]> {
  const marker = `mcp__${agentId}__${agentId}_`;

  return {
    SessionStart: [
      {
        matcher: '',
        hooks: [
          {
            type: 'command',
            command: buildConditionalHookCommand(
              agentId,
              `Call ${marker}admin op:admin_health to verify agent is ready. Do not show the result unless there are errors.`,
            ),
            timeout: 5000,
          },
        ],
      },
      {
        matcher: '',
        hooks: [
          {
            type: 'command',
            command: `echo 'SESSION_START: Invoke the ${agentId}-mode skill now to load full routing context and command reference.'`,
            timeout: 5,
          },
        ],
      },
    ],
    PreCompact: [
      {
        matcher: '',
        hooks: [
          {
            type: 'command',
            command: buildConditionalHookCommand(
              agentId,
              `First, call ${marker}plan op:plan_close_stale params:{ olderThanMs: 0 } to auto-close any plans still in non-terminal states. Then call ${marker}memory op:session_capture with a brief summary of the current session before context is compacted. Include any auto-closed plan IDs in the summary.`,
            ),
            timeout: 10000,
          },
        ],
      },
    ],
    Stop: [
      {
        matcher: '',
        hooks: [
          {
            type: 'command',
            command: buildConditionalHookCommand(
              agentId,
              `First, call ${marker}plan op:plan_close_stale params:{ olderThanMs: 0 } to auto-close any plans still in non-terminal states. Then call ${marker}memory op:session_capture with a structured summary of what was accomplished, including any auto-closed plan IDs. Finally check ${marker}loop op:loop_status — if a loop is active, remind the user.`,
            ),
            timeout: 10000,
          },
        ],
      },
    ],
  };
}

/** Check if a hook group belongs to this agent by inspecting prompts for the marker */
function isAgentHookGroup(group: SettingsHookGroup, agentId: string): boolean {
  const marker = `mcp__${agentId}__${agentId}_`;
  const skillMarker = `${agentId}-mode skill`;
  return group.hooks.some(
    (h) =>
      (h.prompt && (h.prompt.includes(marker) || h.prompt.includes(skillMarker))) ||
      (h.command && (h.command.includes(marker) || h.command.includes(skillMarker))),
  );
}

/** Merge agent hooks into settings.json hooks object */
function mergeSettingsHooks(
  currentHooks: Record<string, SettingsHookGroup[]>,
  agentId: string,
): {
  hooks: Record<string, SettingsHookGroup[]>;
  installed: string[];
  updated: string[];
  skipped: string[];
} {
  const defaults = getDefaultLifecycleHooks(agentId);
  const merged = { ...currentHooks };
  const installed: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];

  for (const [event, groups] of Object.entries(defaults)) {
    if (!merged[event]) {
      merged[event] = groups;
      installed.push(event);
      continue;
    }

    // Remove all existing agent-owned groups, keep non-agent hooks
    const nonAgentGroups = merged[event].filter((g) => !isAgentHookGroup(g, agentId));
    const existingAgentGroups = merged[event].filter((g) => isAgentHookGroup(g, agentId));

    if (deepEqual(existingAgentGroups, groups)) {
      skipped.push(event);
    } else if (existingAgentGroups.length === 0) {
      merged[event] = [...nonAgentGroups, ...groups];
      installed.push(event);
    } else {
      // Replace all agent groups with current defaults
      merged[event] = [...nonAgentGroups, ...groups];
      updated.push(event);
    }
  }

  return { hooks: merged, installed, updated, skipped };
}

/**
 * Auto-sync lifecycle hooks into ~/.claude/settings.json at engine startup.
 * Idempotent — skips hooks already present, updates stale ones.
 * Returns a summary of what was installed, updated, or skipped.
 */
export function syncHooksToClaudeSettings(agentId: string): {
  installed: string[];
  updated: string[];
  skipped: string[];
  error?: string;
} {
  try {
    const settings = readSettingsJson();
    const currentHooks = (settings.hooks ?? {}) as Record<string, SettingsHookGroup[]>;
    const { hooks, installed, updated, skipped } = mergeSettingsHooks(currentHooks, agentId);
    if (installed.length > 0 || updated.length > 0) {
      writeSettingsJson({ ...settings, hooks });
    }
    return { installed, updated, skipped };
  } catch (err) {
    // Non-fatal — hooks will be installed on next run or via admin_setup_global
    return {
      installed: [],
      updated: [],
      skipped: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Op Definitions ───────────────────────────────────────────────────

/**
 * Create 4 admin setup operations.
 */
export function createAdminSetupOps(runtime: AgentRuntime): OpDefinition[] {
  const { config } = runtime;

  return [
    // ─── inject_claude_md ──────────────────────────────────────────
    {
      name: 'admin_inject_claude_md',
      description:
        'Inject agent sections into a project or global CLAUDE.md. Idempotent — updates existing sections or adds new ones.',
      auth: 'write',
      schema: z.object({
        projectPath: z.string().describe('Project path (use "." for current directory)'),
        includeIntegration: z
          .boolean()
          .optional()
          .default(true)
          .describe('Include integration section with tools table'),
        createIfMissing: z
          .boolean()
          .optional()
          .default(false)
          .describe('Create CLAUDE.md if not found'),
        position: z
          .enum(['start', 'end', 'after-title'])
          .optional()
          .default('after-title')
          .describe('Where to inject (default: after first heading)'),
        dryRun: z.boolean().optional().default(false).describe('Preview changes without writing'),
        global: z
          .boolean()
          .optional()
          .default(false)
          .describe('Inject into ~/.claude/CLAUDE.md instead of project'),
      }),
      handler: async (params) => {
        const projectPath = resolve(params.projectPath as string);
        const includeIntegration = params.includeIntegration as boolean;
        const createIfMissing = params.createIfMissing as boolean;
        const position = params.position as 'start' | 'end' | 'after-title';
        const dryRun = params.dryRun as boolean;
        const isGlobal = params.global as boolean;

        // Determine target path
        const targetPath = isGlobal
          ? join(homedir(), '.claude', 'CLAUDE.md')
          : findClaudeMdPath(projectPath);

        if (!targetPath && !createIfMissing) {
          return {
            action: 'error',
            error: 'CLAUDE.md not found',
            searchedPaths: [
              join(projectPath, 'CLAUDE.md'),
              join(projectPath, '.claude', 'CLAUDE.md'),
            ],
            hint: 'Set createIfMissing: true to create one',
          };
        }

        const filePath = targetPath ?? join(projectPath, 'CLAUDE.md');
        const existingContent = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';

        // Inject engine rules only for project-level injection (NOT global)
        let contentWithEngineRules = existingContent;
        if (!isGlobal && config.agentDir) {
          const enginePath = join(config.agentDir, 'instructions', '_engine.md');
          if (existsSync(enginePath)) {
            const engineRulesContent = readFileSync(enginePath, 'utf-8');
            contentWithEngineRules = injectEngineRulesBlock(existingContent, engineRulesContent);
          }
        }

        // Build injection content
        const injectionContent = buildInjectionContent(config, { includeIntegration });

        // Check if already injected
        if (hasSections(contentWithEngineRules, config.agentId)) {
          // Update existing sections
          const stripped = removeSections(contentWithEngineRules, config.agentId);
          const updated = injectAtPosition(stripped, injectionContent, position);

          if (dryRun) {
            return { action: 'would_update', path: filePath, preview: injectionContent };
          }

          mkdirSync(dirname(filePath), { recursive: true });
          writeFileSync(filePath, updated);
          return { action: 'updated', path: filePath, agentId: config.agentId };
        }

        // New injection
        let result: string;
        if (contentWithEngineRules) {
          result = injectAtPosition(contentWithEngineRules, injectionContent, position);
        } else {
          // Create new file with title
          const projectName = projectPath.split('/').pop() ?? 'Project';
          result = `# ${projectName}\n\n${injectionContent}\n`;
        }

        if (dryRun) {
          return { action: 'would_inject', path: filePath, preview: injectionContent };
        }

        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(filePath, result);
        return {
          action: existingContent ? 'injected' : 'created',
          path: filePath,
          agentId: config.agentId,
        };
      },
    },

    // ─── setup_global ──────────────────────────────────────────────
    {
      name: 'admin_setup_global',
      description:
        'Install global agent configuration — hookify rules to ~/.claude/, skills to ~/.claude/skills/, lifecycle hooks to settings.json. Dry-run by default.',
      auth: 'admin',
      schema: z.object({
        install: z.boolean().describe('Set true to install, false for dry-run preview'),
        hooksOnly: z
          .boolean()
          .optional()
          .default(false)
          .describe('Only install hookify rules, skip settings.json and skills'),
        settingsJsonOnly: z
          .boolean()
          .optional()
          .default(false)
          .describe('Only install settings.json lifecycle hooks'),
        skillsOnly: z
          .boolean()
          .optional()
          .default(false)
          .describe('Only install skills to ~/.claude/skills/'),
      }),
      handler: async (params) => {
        const install = params.install as boolean;
        const hooksOnly = params.hooksOnly as boolean;
        const settingsJsonOnly = params.settingsJsonOnly as boolean;
        const skillsOnly = params.skillsOnly as boolean;

        const globalClaudeDir = join(homedir(), '.claude');

        // Discover what's available — prefer dataDir, fall back to agentDir
        const agentDataDir = config.dataDir ?? config.agentDir;
        const hookifySourceDirs = agentDataDir ? [join(agentDataDir, '.claude')] : [];
        const skillsSourceDirs = agentDataDir ? [join(agentDataDir, 'skills')] : [];

        // 1. Hookify rules analysis
        const hookifyResults = {
          installed: [] as string[],
          skipped: [] as string[],
          failed: [] as string[],
        };
        if (!settingsJsonOnly && !skillsOnly) {
          for (const sourceDir of hookifySourceDirs) {
            const rules = discoverHookifyFiles(sourceDir);
            for (const rule of rules) {
              const targetPath = join(globalClaudeDir, rule.name);
              if (existsSync(targetPath)) {
                hookifyResults.skipped.push(rule.name);
              } else if (install) {
                try {
                  mkdirSync(globalClaudeDir, { recursive: true });
                  copyFileSync(rule.path, targetPath);
                  hookifyResults.installed.push(rule.name);
                } catch {
                  hookifyResults.failed.push(rule.name);
                }
              } else {
                hookifyResults.installed.push(rule.name); // would install
              }
            }
          }
        }

        // 2. Skills — use shared sync (same logic as engine startup)
        let skillsResults: {
          installed: string[];
          updated: string[];
          skipped: string[];
          failed: string[];
        };
        if (!hooksOnly && !settingsJsonOnly) {
          if (install) {
            const agentName =
              runtime.persona?.name ??
              config.agentId.charAt(0).toUpperCase() + config.agentId.slice(1);
            skillsResults = syncSkillsToClaudeCode(skillsSourceDirs, agentName, { global: true });
          } else {
            // Dry run — just discover what would be synced
            const skills = discoverSkills(skillsSourceDirs);
            skillsResults = {
              installed: skills.map((s) => s.name),
              updated: [],
              skipped: [],
              failed: [],
            };
          }
        } else {
          skillsResults = { installed: [], updated: [], skipped: [], failed: [] };
        }

        // 3. Settings.json lifecycle hooks
        const settingsResults = {
          installed: [] as string[],
          updated: [] as string[],
          skipped: [] as string[],
        };
        if (!hooksOnly && !skillsOnly) {
          const currentSettings = readSettingsJson();
          const currentHooks = (currentSettings.hooks ?? {}) as Record<string, SettingsHookGroup[]>;
          const merged = mergeSettingsHooks(currentHooks, config.agentId);

          settingsResults.installed = merged.installed;
          settingsResults.updated = merged.updated;
          settingsResults.skipped = merged.skipped;

          if (install && (merged.installed.length > 0 || merged.updated.length > 0)) {
            currentSettings.hooks = merged.hooks;
            writeSettingsJson(currentSettings);
          }
        }

        // 4. Self-healing: strip engine rules from global files if present
        const selfHealing = { engineRulesRemoved: false, agentsMdEngineRulesRemoved: false };
        if (install) {
          const globalClaudeMdPath = join(globalClaudeDir, 'CLAUDE.md');
          if (existsSync(globalClaudeMdPath)) {
            const result = removeEngineRulesFromGlobal(readFileSync(globalClaudeMdPath, 'utf-8'));
            if (result.removed) {
              writeFileSync(globalClaudeMdPath, result.cleaned, 'utf-8');
              selfHealing.engineRulesRemoved = true;
            }
          }

          const globalAgentsMdPath = join(homedir(), '.config', 'opencode', 'AGENTS.md');
          if (existsSync(globalAgentsMdPath)) {
            const result = removeEngineRulesFromGlobal(readFileSync(globalAgentsMdPath, 'utf-8'));
            if (result.removed) {
              writeFileSync(globalAgentsMdPath, result.cleaned, 'utf-8');
              selfHealing.agentsMdEngineRulesRemoved = true;
            }
          }
        }

        return {
          dryRun: !install,
          agentId: config.agentId,
          hookifyRules: hookifyResults,
          skills: skillsResults,
          settingsJson: settingsResults,
          selfHealing,
          ...(install
            ? {
                message: selfHealing.engineRulesRemoved
                  ? 'Global setup complete (engine rules removed from global CLAUDE.md)'
                  : 'Global setup complete',
              }
            : { message: 'Dry run — pass install: true to apply' }),
        };
      },
    },

    // ─── setup_project ─────────────────────────────────────────────
    {
      name: 'admin_setup_project',
      description:
        'Project hook management — analyze, cleanup duplicates, or install agent hooks. Analysis mode by default.',
      auth: 'write',
      schema: z.object({
        projectPath: z.string().describe('Project root path'),
        cleanup: z
          .boolean()
          .optional()
          .default(false)
          .describe('Remove project hooks that already exist globally'),
        install: z
          .boolean()
          .optional()
          .default(false)
          .describe('Install agent hooks to the project'),
      }),
      handler: async (params) => {
        const projectPath = resolve(params.projectPath as string);
        const cleanup = params.cleanup as boolean;
        const install = params.install as boolean;

        if (!existsSync(projectPath)) {
          return { error: 'PROJECT_NOT_FOUND', path: projectPath };
        }

        const globalClaudeDir = join(homedir(), '.claude');
        const projectClaudeDir = join(projectPath, '.claude');

        // Discover existing hooks
        const globalHookify = discoverHookifyFiles(globalClaudeDir);
        const projectHookify = discoverHookifyFiles(projectClaudeDir);
        const globalNames = new Set(globalHookify.map((h) => h.name));

        // Find duplicates (project hooks that also exist globally)
        const duplicates = projectHookify.filter((h) => globalNames.has(h.name));

        // Analyze mode (default)
        if (!cleanup && !install) {
          return {
            mode: 'analyze',
            projectPath,
            globalHooks: globalHookify.length,
            projectHooks: projectHookify.length,
            duplicates: duplicates.map((d) => d.name),
            recommendations:
              duplicates.length > 0
                ? [`${duplicates.length} project hook(s) duplicate global hooks — consider cleanup`]
                : ['No duplicates found — hooks are clean'],
          };
        }

        // Cleanup mode — remove duplicates
        if (cleanup) {
          const removed: string[] = [];
          for (const dup of duplicates) {
            try {
              unlinkSync(dup.path);
              removed.push(dup.name);
            } catch {
              // Skip failures silently
            }
          }
          return {
            mode: 'cleanup',
            projectPath,
            removed,
            remaining: projectHookify.length - removed.length,
          };
        }

        // Install mode — copy agent hooks to project
        if (install) {
          const installed: string[] = [];
          const skipped: string[] = [];

          // Copy hookify rules (skip ones already installed globally)
          const agentDataDir = config.dataDir;
          if (agentDataDir) {
            const sourceRules = discoverHookifyFiles(join(agentDataDir, '.claude'));
            for (const rule of sourceRules) {
              const targetPath = join(projectClaudeDir, rule.name);
              if (globalNames.has(rule.name)) {
                skipped.push(`${rule.name} (exists globally)`);
              } else if (existsSync(targetPath)) {
                skipped.push(`${rule.name} (exists in project)`);
              } else {
                try {
                  mkdirSync(projectClaudeDir, { recursive: true });
                  copyFileSync(rule.path, targetPath);
                  installed.push(rule.name);
                } catch {
                  // Skip failures
                }
              }
            }
          }

          return {
            mode: 'install',
            projectPath,
            installed,
            skipped,
          };
        }

        return { error: 'INVALID_MODE' };
      },
    },

    // ─── check_persistence ─────────────────────────────────────────
    {
      name: 'admin_check_persistence',
      description:
        'Check agent persistence status — storage directory, plan/task/check files, and active plan lifecycle states.',
      auth: 'read',
      handler: async () => {
        const { agentId, plansPath, vaultPath } = config;
        const plansFile = plansPath ?? getAgentPlansPath(agentId);
        const vaultFile = vaultPath ?? getAgentVaultPath(agentId);
        const storageDir = dirname(plansFile);
        const storageDirExists = existsSync(storageDir);

        // Check plan storage
        const plansInfo = getFileInfo(plansFile);

        // Check vault
        const vaultExists = existsSync(vaultFile);
        let vaultSize = 0;
        if (vaultExists) {
          try {
            vaultSize = statSync(vaultFile).size;
          } catch {
            // Ignore
          }
        }

        // Determine status
        let status: string;
        if (vaultExists && plansInfo.exists) {
          status = 'PERSISTENCE_ACTIVE';
        } else if (storageDirExists) {
          status = 'PERSISTENCE_CONFIGURED_BUT_INCOMPLETE';
        } else {
          status = 'NO_STORAGE_DIRECTORY';
        }

        // Check for active plans
        const activePlans: Array<{ id: string; status: string }> = [];
        if (plansInfo.exists) {
          try {
            const plansData = JSON.parse(readFileSync(plansFile, 'utf-8'));
            activePlans.push(...extractActivePlans(plansData));
          } catch {
            // Parse error — not critical
          }
        }

        const recommendation =
          activePlans.length > 0
            ? `${activePlans.length} plan(s) need attention — call plan_reconcile or plan_complete_lifecycle`
            : status === 'PERSISTENCE_ACTIVE'
              ? 'All good — persistence is active and no orphaned plans'
              : status === 'NO_STORAGE_DIRECTORY'
                ? `Storage directory not found at ${storageDir} — it will be created on first use`
                : 'Storage directory exists but some files are missing — they will be created on first use';

        return {
          agentId,
          storageDirectory: { path: storageDir, exists: storageDirExists },
          files: {
            plans: { path: plansFile, ...plansInfo },
            vault: { path: vaultFile, exists: vaultExists, sizeBytes: vaultSize },
          },
          status,
          activePlans,
          recommendation,
        };
      },
    },
  ];
}
