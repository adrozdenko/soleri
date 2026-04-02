/**
 * Builds the pre-flight manifest for session_start responses.
 * Extracted as a pure function for testability.
 */

import type { PreflightManifest } from './types.js';

export interface PreflightInput {
  /** Facade definitions: array of { name, ops: Array<{ name, description }> } */
  facades: Array<{
    name: string;
    ops: Array<{ name: string; description: string }>;
  }>;
  /** Skill names installed for this agent */
  skills: string[];
  /** Plans currently in executing state */
  executingPlans: Array<{ id: string; objective: string; status: string }>;
  /** Whether the vault is connected */
  vaultConnected?: boolean;
  /** Vault stats */
  vaultStats: {
    totalEntries: number;
    byDomain: Record<string, number>;
  };
}

export function buildPreflightManifest(input: PreflightInput): PreflightManifest {
  const tools: PreflightManifest['tools'] = [];
  for (const facade of input.facades) {
    for (const op of facade.ops) {
      tools.push({ facade: facade.name, op: op.name, description: op.description });
    }
  }

  const activePlans = input.executingPlans.map((p) => ({
    planId: p.id,
    title: p.objective,
    status: p.status,
  }));

  const domains = Object.keys(input.vaultStats.byDomain);

  return {
    tools,
    skills: input.skills,
    activePlans,
    vaultSummary: {
      entryCount: input.vaultStats.totalEntries,
      connected: input.vaultConnected ?? true,
      domains,
    },
  };
}
