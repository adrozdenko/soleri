/**
 * VaultManager — orchestrates multiple vault instances across tiers.
 *
 * Each tier (agent, project, team) is a separate SQLite database with its own
 * FTS5 index. Search cascades across all connected tiers with priority weighting.
 *
 * Usage:
 *   const mgr = new VaultManager({ agentId: 'my-agent' });
 *   mgr.open('agent', '~/.my-agent/vault.db');
 *   mgr.open('project', '.soleri/vault.db');
 *   const results = mgr.search('pattern name');
 *   mgr.close();
 */

import { Vault, type SearchResult } from './vault.js';
import {
  TIER_WEIGHTS,
  type VaultTier,
  type VaultTierInfo,
  type VaultManagerConfig,
} from './vault-types.js';

// =============================================================================
// VAULT MANAGER
// =============================================================================

export class VaultManager {
  private vaults = new Map<VaultTier, { vault: Vault; path: string }>();
  private weights: Record<VaultTier, number>;
  private config: VaultManagerConfig;

  constructor(config: VaultManagerConfig) {
    this.config = config;
    this.weights = {
      ...TIER_WEIGHTS,
      ...config.weights,
    };
  }

  /**
   * Open a vault for the given tier.
   * If a vault is already open for this tier, it is closed first.
   */
  open(tier: VaultTier, path: string): Vault {
    // Close existing if re-opening
    const existing = this.vaults.get(tier);
    if (existing) {
      existing.vault.close();
    }

    const vault = new Vault(path);
    this.vaults.set(tier, { vault, path });
    return vault;
  }

  /**
   * Get the vault for a specific tier.
   * Throws if not connected.
   */
  getTier(tier: VaultTier): Vault {
    const entry = this.vaults.get(tier);
    if (!entry) {
      throw new Error(`Vault tier '${tier}' is not connected`);
    }
    return entry.vault;
  }

  /**
   * Check if a tier is connected.
   */
  hasTier(tier: VaultTier): boolean {
    return this.vaults.has(tier);
  }

  /**
   * Disconnect a specific tier.
   */
  disconnect(tier: VaultTier): boolean {
    const entry = this.vaults.get(tier);
    if (!entry) return false;
    entry.vault.close();
    this.vaults.delete(tier);
    return true;
  }

  /**
   * Search across all connected tiers with priority weighting.
   *
   * Results from each tier are weighted by the tier's priority,
   * then merged and deduplicated (highest-priority entry wins).
   */
  search(query: string, limit = 20): SearchResult[] {
    const allResults: Array<SearchResult & { tier: VaultTier; weightedScore: number }> = [];

    for (const [tier, { vault }] of this.vaults) {
      const weight = this.weights[tier];
      const results = vault.search(query);
      for (const r of results) {
        allResults.push({
          ...r,
          tier,
          weightedScore: r.score * weight,
        });
      }
    }

    // Deduplicate: keep highest-weighted version of each entry
    const seen = new Map<string, (typeof allResults)[number]>();
    for (const r of allResults) {
      const existing = seen.get(r.entry.id);
      if (!existing || r.weightedScore > existing.weightedScore) {
        seen.set(r.entry.id, r);
      }
    }

    // Sort by weighted score descending, take top N
    const merged = Array.from(seen.values());
    merged.sort((a, b) => b.weightedScore - a.weightedScore);

    return merged.slice(0, limit).map((r) => ({
      entry: r.entry,
      score: r.weightedScore,
    }));
  }

  /**
   * Get info about all tiers (connected or not).
   */
  listTiers(): VaultTierInfo[] {
    const allTiers: VaultTier[] = ['agent', 'project', 'team'];
    return allTiers.map((tier) => {
      const entry = this.vaults.get(tier);
      if (!entry) {
        return { tier, path: '', connected: false, entryCount: 0 };
      }
      const stats = entry.vault.stats();
      return {
        tier,
        path: entry.path,
        connected: true,
        entryCount: stats.totalEntries,
      };
    });
  }

  /** Number of connected tiers. */
  get size(): number {
    return this.vaults.size;
  }

  /** Get the underlying config. */
  getConfig(): VaultManagerConfig {
    return this.config;
  }

  /**
   * Close all connected vaults.
   */
  close(): void {
    for (const { vault } of this.vaults.values()) {
      vault.close();
    }
    this.vaults.clear();
  }
}
