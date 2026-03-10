/**
 * Vault Types — tier definitions and multi-vault configuration.
 */

// =============================================================================
// VAULT TIERS
// =============================================================================

/** Vault tier — determines search priority and default path. */
export type VaultTier = 'agent' | 'project' | 'team';

/** Priority weights for search result merging (higher = ranked first). */
export const TIER_WEIGHTS: Record<VaultTier, number> = {
  agent: 1.0,
  project: 0.8,
  team: 0.6,
};

// =============================================================================
// VAULT MANAGER CONFIG
// =============================================================================

/** Configuration for a single vault tier. */
export interface VaultTierConfig {
  tier: VaultTier;
  /** Path to the SQLite database file. */
  path: string;
}

/** Configuration for VaultManager. */
export interface VaultManagerConfig {
  /** Agent identifier (used for default path: ~/.{agentId}/vault.db) */
  agentId: string;
  /** Override default paths per tier. */
  tiers?: VaultTierConfig[];
  /** Custom priority weights (overrides TIER_WEIGHTS). */
  weights?: Partial<Record<VaultTier, number>>;
}

// =============================================================================
// VAULT TIER INFO
// =============================================================================

/** Runtime info about a connected vault tier. */
export interface VaultTierInfo {
  tier: VaultTier;
  path: string;
  connected: boolean;
  entryCount: number;
}
