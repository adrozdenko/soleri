/**
 * Soleri path constants — single source of truth for all data locations.
 *
 * Default layout:
 *   ~/.soleri/              ← SOLERI_HOME (shared vault, global config)
 *   ~/.soleri/{agentId}/    ← agent home (vault, plans, keys, flags, templates)
 *
 * Legacy fallback:
 *   If ~/.soleri/{agentId}/vault.db doesn't exist but ~/.{agentId}/vault.db does,
 *   the old path is used and a migration warning is emitted once per process.
 *   Run `soleri agent migrate <agentId>` to move data to the new location.
 *
 * Override with SOLERI_HOME env var or explicit paths in agent.yaml → engine.vault.
 */

import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';

/** Root directory for all Soleri data. Default: ~/.soleri/ */
export const SOLERI_HOME = process.env.SOLERI_HOME ?? join(homedir(), '.soleri');

// ─── Legacy fallback ────────────────────────────────────────────────

/** Tracks which paths have already emitted a migration warning (once per process). */
const _warned = new Set<string>();

/** Tracks which agents used legacy fallback paths (for update notification). */
const _legacyAgents = new Set<string>();

/** Returns true if the given agent is using legacy paths via fallback. */
export function usedLegacyFallback(agentId: string): boolean {
  return _legacyAgents.has(agentId);
}

/**
 * Legacy agent home: ~/.{agentId}/ (pre-v8 layout).
 * Exported for use by the migration command.
 */
export function legacyAgentHome(agentId: string): string {
  return join(homedir(), `.${agentId}`);
}

/**
 * If the new path doesn't exist but the legacy path does, return legacy + warn.
 * Otherwise return the new path (even if it doesn't exist yet — it will be created).
 */
function resolveWithFallback(newPath: string, legacyPath: string, agentId: string): string {
  if (existsSync(newPath)) return newPath;
  if (!existsSync(legacyPath)) return newPath;

  // Legacy data found — use it, warn once, track for update notification
  _legacyAgents.add(agentId);
  const key = `${agentId}:${legacyPath}`;
  if (!_warned.has(key)) {
    _warned.add(key);
    console.error(
      `[soleri] Using legacy path: ${legacyPath}\n` +
        `[soleri] Run "soleri agent migrate ${agentId}" to move data to ${newPath}`,
    );
  }
  return legacyPath;
}

// ─── Public API ─────────────────────────────────────────────────────

/** Agent-specific data directory: ~/.soleri/{agentId}/ */
export function agentHome(agentId: string): string {
  return join(SOLERI_HOME, agentId);
}

/** Agent vault database path (with legacy fallback). */
export function agentVaultPath(agentId: string): string {
  const newPath = join(agentHome(agentId), 'vault.db');
  const legacyPath = join(legacyAgentHome(agentId), 'vault.db');
  return resolveWithFallback(newPath, legacyPath, agentId);
}

/** Agent plans store (with legacy fallback). */
export function agentPlansPath(agentId: string): string {
  const newPath = join(agentHome(agentId), 'plans.json');
  const legacyPath = join(legacyAgentHome(agentId), 'plans.json');
  return resolveWithFallback(newPath, legacyPath, agentId);
}

/** Agent keys file (with legacy fallback). */
export function agentKeysPath(agentId: string): string {
  const newPath = join(agentHome(agentId), 'keys.json');
  const legacyPath = join(legacyAgentHome(agentId), 'keys.json');
  return resolveWithFallback(newPath, legacyPath, agentId);
}

/** Agent templates directory (with legacy fallback). */
export function agentTemplatesDir(agentId: string): string {
  const newPath = join(agentHome(agentId), 'templates');
  const legacyPath = join(legacyAgentHome(agentId), 'templates');
  return resolveWithFallback(newPath, legacyPath, agentId);
}

/** Agent feature flags (with legacy fallback). */
export function agentFlagsPath(agentId: string): string {
  const newPath = join(agentHome(agentId), 'flags.json');
  const legacyPath = join(legacyAgentHome(agentId), 'flags.json');
  return resolveWithFallback(newPath, legacyPath, agentId);
}

/** Agent knowledge directory for browsable markdown sync. */
export function agentKnowledgeDir(agentId: string): string {
  return join(agentHome(agentId), 'knowledge');
}

/** Shared vault path: ~/.soleri/vault.db (cross-agent intelligence) */
export function sharedVaultPath(): string {
  return join(SOLERI_HOME, 'vault.db');
}
