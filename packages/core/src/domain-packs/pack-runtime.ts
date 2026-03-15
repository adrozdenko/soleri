/**
 * PackRuntime — the subset of AgentRuntime available to domain packs.
 *
 * Domain packs receive this via onActivate(runtime). It exposes only what
 * packs need: vault search, project registry, and session store.
 * Packs should NOT depend on the full AgentRuntime interface.
 */

import type { Vault } from '../vault/vault.js';

/**
 * Minimal project context for token resolution.
 * Matches the shape of ProjectRegistry entries.
 */
export interface PackProjectContext {
  id: string;
  name: string;
  path: string;
  colors?: {
    [scale: string]: {
      scale: Record<string, string>;
      base: string;
    };
  };
  semanticTokens?: Record<string, string>;
}

/**
 * Session check for tool chaining (contrast → component create).
 */
export interface PackCheckContext {
  id: string;
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
}

/**
 * The runtime interface domain packs receive via onActivate.
 *
 * Designed for graceful degradation: packs work without runtime
 * (simplified mode), but gain full power when connected.
 */
export interface PackRuntime {
  /** Vault for knowledge search and capture */
  vault: Vault;

  /** Get a registered project by ID (for token resolution) */
  getProject(projectId: string): PackProjectContext | undefined;

  /** List all registered projects */
  listProjects(): Array<{ id: string; name: string; path: string }>;

  /** Create a session check (for tool chaining) */
  createCheck(type: string, data: Record<string, unknown>): string;

  /** Validate a session check */
  validateCheck(checkId: string, expectedType: string): PackCheckContext | null;

  /** Validate and consume a session check (single-use) */
  validateAndConsume(checkId: string, expectedType: string): PackCheckContext | null;
}

/**
 * Create a PackRuntime from an AgentRuntime.
 *
 * This adapter extracts the subset of runtime that packs need,
 * avoiding tight coupling to the full AgentRuntime interface.
 */
export function createPackRuntime(runtime: {
  vault: Vault;
  projectRegistry: {
    getProject(id: string): PackProjectContext | undefined;
    listProjects(): Array<{ id: string; name: string; path: string }>;
  };
  sessionStore?: {
    createCheck(type: string, data: Record<string, unknown>): string;
    validateCheck(id: string, type: string): PackCheckContext | null;
    validateAndConsume(id: string, type: string): PackCheckContext | null;
  };
}): PackRuntime {
  return {
    vault: runtime.vault,
    getProject: (id) => runtime.projectRegistry.getProject(id),
    listProjects: () => runtime.projectRegistry.listProjects(),
    createCheck: (type, data) => {
      if (!runtime.sessionStore) throw new Error('Session store not available');
      return runtime.sessionStore.createCheck(type, data);
    },
    validateCheck: (id, type) => {
      if (!runtime.sessionStore) return null;
      return runtime.sessionStore.validateCheck(id, type);
    },
    validateAndConsume: (id, type) => {
      if (!runtime.sessionStore) return null;
      return runtime.sessionStore.validateAndConsume(id, type);
    },
  };
}
